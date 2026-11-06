// tab_lifecycle.uc.js - Sekme yaşam döngüsü: uyku -> derin uyku -> kırpma -> boşaltma (TEK dosya, TEK saat)
//
// tab_freezer + tab_trimmer + tab_discarder betiklerinin yerine geçer. Üçü ayrı saatlerle çalışıp birbirini
// bilmediği için çakışıyordu; burada her sekmenin tek bir zaman çizelgesi var. Bu betiği kullanırken o üç
// betik chrome klasöründe OLMAMALI (ikisi birden çalışırsa aynı sekmeyi iki kez dondurup kırparlar).
//
// ZAMAN ÇİZELGESİ (her sekme için, sekme GÖRÜNMEZ OLDUĞU anı 0 sayarak; süreler CONFIG'de değişir):
//    0 sn   Sekmeden ayrıldınız (başka sekmeye geçtiniz ya da pencere küçüldü).
//    2 sn   1) UYKU: sayfanın zamanlayıcıları durdurulur (içerik korunur). Uykuda kısa aralıklarla uyanabilir.
//           2) O sekmenin sürecinde GC + CC + heap-minimize (çöp toplama, bellek GERÇEKTEN düşer).
//   60 sn   3) DERİN UYKU: artık hiç uyandırılmaz.
//           4) Bellek ilk temizlikten beri belirgin büyüdüyse bir kez daha GC + CC + heap-minimize.
//  +60 sn   5) ANA SÜREÇ + GPU kırpılır (derin uykudan 60 sn sonra; yalnızca hiçbir sayfa görünmüyorsa).
//  180 sn   6) O sekmenin süreci kırpılır (working set: sayfalar RAM'den çıkar, içerik kalır).
//  900 sn   7) Sekme BOŞALTILIR (discard): süreç kapanır, bellek tamamen serbest kalır; tıklayınca yeniden yüklenir.
//  + Pencere küçültülünce (hiçbir sayfa görünmüyorsa) "genel küçültme" SIRASI: 1) hemen genel GC/CC/memory temizliği (kırpma YOK),
//    2) tüm sekmeler uykuya, 3) derin uykuya girer (yukarıdaki çizelge, seçili sekme dahil), 4) EN SONDA tüm süreçler kırpılır;
//    boşta kaldıkça periyodik tekrar (önce temizlik, sonra kırpma).
//
// MUAFİYETLER: Ses/video/PiP/paylaşım yapan sekmeler ve yüklenmekte olanlar zincirin HİÇBİR adımına girmez
// (ses çalan sekmenin süreci yalnızca hiçbir sayfa görünmezken TRIM_MEDIA_TAB_AFTER_HIDDEN_SECONDS sonra, sonra TRIM_MEDIA_TAB_EVERY_SECONDS'ta bir kırpılır). Sabitlenmiş sekmeler yalnızca boşaltılmaz. Süreci görünür/medya sekmeyle paylaşılan
// sekmede süreç düzeyindeki adımlar (GC, kırpma, boşaltma) atlanır, ki aktif sekme yavaşlamasın.
//
// Günlük: <profil>\chrome\memlog.txt (ENABLE_LOGGING). Kapalıyken dosyaya HİÇBİR şey yazılmaz (hatalar yalnızca Tarayıcı Konsolu'na gider).
(function() {
    'use strict';

    if (window.TabLifecycle) return;
    if (typeof gBrowser === 'undefined') return;

    // ===========================================
    // AYARLAR - TETİKLENME SIRASINA GÖRE
    // ===========================================
    //
    // ZİNCİR HARİTASI (ok = "bunu tetikler"). Süreler, sekmenin GÖRÜNMEZ OLDUĞU anı 0 sayar:
    //
    //   [0 Temel]  TICK_SECONDS saniyede bir bakılır; SKIP_ACTIVE_MEDIA_TABS ile medya sekmeleri zincirden çıkarılır.
    //        |
    //        v   sekmeden ayrılınca (başka sekmeye geçince ya da pencere küçülünce)
    //   [1 UYKU]        SLEEP_AFTER_SECONDS (2 sn)  --> zamanlayıcılar durur (SLEEP_EXEMPT_HOSTS hariç)
    //        |                                          + RECLAIM_ON_SLEEP: o sekmenin sürecinde GC/CC/memory
    //        |                                          + SLEEP_WAKE_INTERVAL/DURATION: uykuda kısa uyanmalar
    //        v
    //   [2 DERİN UYKU]  DEEP_SLEEP_AFTER_SECONDS (60 sn) --> artık hiç uyanmaz
    //        |                                          + DEEP_RECLAIM_IF_GROWN_MB: bellek büyüdüyse 2. GC/CC/memory
    //        |
    //        +--> [3 ANA SÜREÇ + GPU]  MAIN_GPU_TRIM_AFTER_DEEP_SECONDS (+60 sn), MAIN_GPU_MIN_INTERVAL_SECONDS (300 sn)
    //        v                         (yalnızca hiçbir sayfa görünmüyorsa)
    //   [4 SEKME KIRPMA]  TAB_TRIM_AFTER_SECONDS (180 sn) --> o sekmenin süreci kırpılır
    //        |
    //        v
    //   [5 BOŞALTMA]      DISCARD_AFTER_SECONDS (900 sn) --> sekme boşaltılır (DISCARD_* kuralları geçerse)
    //
    //   [6 GENEL KÜÇÜLTME] pencere küçülünce (hiçbir sayfa görünmüyorsa), yukarıdaki zincirle BİRLİKTE:
    //        MINIMIZE_RECLAIM_AFTER_SECONDS (3 sn): hemen genel GC/CC/memory (kırpma YOK)
    //          --> sekmeler [1 UYKU] ve [2 DERİN UYKU] adımlarından geçer (seçili sekme dahil)
    //          --> DEEP_SLEEP_AFTER_SECONDS + MINIMIZE_TRIM_AFTER_DEEP_SECONDS (60+10 sn): TÜM süreçler kırpılır
    //          --> MINIMIZE_RETRIM_MINUTES (10 dk): boşta kaldıkça önce temizlik, sonra kırpma tekrarlanır
    //        Kırpmanın kapsamı: PROCESS_ACTIONS (süreç sınıfı başına); medya varken: TRIM_OTHERS_WHILE_MEDIA_PLAYS.
    //
    //   Sekme tekrar görününce (ya da pencere geri açılınca) o sekmenin zinciri iptal olur, uyku çözülür, süre sıfırdan başlar.
    const CONFIG = {
        // ==================================================================
        // 0) TEMEL (zincirin hepsini etkiler)
        // ==================================================================

        /**
         * Betik kaç saniyede bir sekmelere baksın? Zincirdeki tüm sürelerin hassasiyetini belirler (1 = en çok 1 sn
         * sapma). Hafif bir iştir; değiştirmenize gerek yok.
         * TETİKLER: aşağıdaki her adımı (adımlar bu kontrolde süresi dolmuş mu diye bakılarak çalışır).
         */
        TICK_SECONDS: 5,

        /**
         * Her şey yerleştiğinde (hiçbir sayfa görünür değil ve tüm sekmeler derin uykuda/medya) kontrol bu kadar saniyede bir
         * yapılır; yapılacak yeni bir iş kalmadığı için 1 sn'lik döngü boşa çalışırdı. Pencere öne gelince, sekme seçilince
         * ya da yerleşmemiş bir sekme görülünce hemen TICK_SECONDS'a döner. 0 = bu davranış kapalı. Sınır: boşta tekrar
         * (ACTIVE_IDLE_REPEAT_MINUTES, MINIMIZE_RETRIM_MINUTES) en çok bu kadar saniye gecikir.
         */
        TICK_SETTLED_SECONDS: 60,

        /**
         * true: Ses çalan / Picture-in-Picture / ekran-kamera paylaşan sekmeler zincirin HİÇBİR adımına (uyku, GC,
         * kırpma, boşaltma) girmez ve süreçleri kırpılmaz. false yapmanız önerilmez (müzik/video kesilir).
         * ETKİLER: [1]-[6] hepsi.
         */
        SKIP_ACTIVE_MEDIA_TABS: true,

        // ==================================================================
        // 1) UYKU - sekmeden ayrıldıktan SLEEP_AFTER_SECONDS sonra
        // ==================================================================

        /**
         * Sekmeden ayrıldıktan kaç saniye sonra sekme uykuya geçsin? Uyku = setTimeout/setInterval durur, sayfa
         * içeriği ve durumu aynen kalır. Çok küçük (0-1) yaparsanız sekmeler arasında hızlı gidip gelirken gereksiz
         * dondurup çözer. 2-5 mantıklıdır.
         * TETİKLEYEN: sekmenin görünmez olması. TETİKLER: RECLAIM_ON_SLEEP (aynı anda), SLEEP_WAKE_* (uyanma döngüsü),
         * ve süre dolunca [2 DERİN UYKU].
         */
        SLEEP_AFTER_SECONDS: 1,

        /**
         * true: Sekme uykuya geçince O SEKMENİN sürecinde GC + CC + heap-minimize çalışır. Sayfa içeriği silinmez,
         * yalnızca çöp atılır; bellek GERÇEKTEN düşer. Süreç görünür/medya sekmeyle paylaşılıyorsa atlanır.
         * TETİKLEYEN: [1] uyku. TETİKLER: DEEP_RECLAIM_IF_GROWN_MB için bellek ölçümü (3 sn sonra "temizlik sonrası
         * bellek" kaydedilir).
         */
        RECLAIM_ON_SLEEP: true,

        /**
         * Uykudaki (henüz derin uykuya geçmemiş) sekme kaç saniyede bir kısa süre uyansın? Bazı siteler arka planda
         * ara sıra çalışmak ister. 0 = uykuda da hiç uyandırma. Derin uykuda uyandırma HİÇ yoktur.
         * TETİKLEYEN: [1] uyku. DURDURAN: [2] derin uyku.
         */
        SLEEP_WAKE_INTERVAL_SECONDS: 0,

        /** Uyanık kalma süresi (saniye). Yalnızca SLEEP_WAKE_INTERVAL_SECONDS > 0 ise kullanılır. */
        SLEEP_WAKE_DURATION_SECONDS: 0,

        /**
         * Bu sitelerin sekmeleri ASLA uyutulmaz (alt alan adları dahil: "google.com" yazarsanız mail.google.com da
         * kapsanır). Sohbet/e-posta/toplantı gibi arka planda bağlantı tutması gerekenler için. Bu sekmelerde yine de
         * bellek temizliği (GC/CC), kırpma ve (DISCARD_EXEMPT_HOSTS'ta değilse) boşaltma uygulanır.
         */
        SLEEP_EXEMPT_HOSTS: [],

        // ==================================================================
        // 2) DERİN UYKU - sekmeden ayrıldıktan DEEP_SLEEP_AFTER_SECONDS sonra
        // ==================================================================

        /**
         * Sekme kaç saniye görünmez kalınca derin uykuya geçsin? Derin uykuda sekme artık hiç uyandırılmaz.
         * TETİKLEYEN: sekmenin [1] uykudan sonra da görünmez kalması. TETİKLER: DEEP_RECLAIM_IF_GROWN_MB (ikinci
         * temizlik), [3] ana süreç + GPU sayacı (MAIN_GPU_TRIM_AFTER_DEEP_SECONDS) ve [6]'daki genel kırpma süresi.
         */
        DEEP_SLEEP_AFTER_SECONDS: 5,

        /**
         * Derin uykuya geçerken ikinci bellek temizliği yalnızca, sürecin belleği ilk temizlikten (RECLAIM_ON_SLEEP)
         * beri en az bu kadar MB büyüdüyse yapılır. Çünkü zamanlayıcılar durmuşken bellek pek büyümez ve her temizlik,
         * sekmeye dönünce JIT kodunu soğuk bırakıp ilk anı yavaşlatır. 0 = her zaman yap.
         * TETİKLEYEN: [2] derin uyku (RECLAIM_ON_SLEEP ölçümüyle kıyaslar).
         */
        DEEP_RECLAIM_IF_GROWN_MB: 30,

        // ==================================================================
        // 3) ANA SÜREÇ + GPU KIRPMA - derin uykudan MAIN_GPU_TRIM_AFTER_DEEP_SECONDS sonra
        // ==================================================================

        /**
         * Bir sekme derin uykuya girdikten kaç saniye sonra ana süreç + GPU kırpılsın? Tek bir sayaç vardır: sayaç
         * çalışırken başka bir sekmenin derin uykuya girmesi onu yeniden başlatmaz; dolunca kırpılır, sonraki derin
         * uyku yeni sayaç başlatır. Kırpma YALNIZCA hiçbir sayfa ekranda görünmüyorsa yapılır; siz bir sekmeyi
         * kullanırken ana süreç ve GPU kırpılırsa takılma olur, bu yüzden o durumda sayaç sessizce iptal edilir.
         * TETİKLEYEN: [2] derin uyku. Medya çalarken TRIM_OTHERS_WHILE_MEDIA_PLAYS'a bağlıdır.
         */
        MAIN_GPU_TRIM_AFTER_DEEP_SECONDS: 10,

        /** İki ana süreç + GPU kırpması arasında en az kaç saniye geçsin? (Sık sık kırpmayı önler; [6] genel kırpma da sayılır.) */
        MAIN_GPU_MIN_INTERVAL_SECONDS: 120,

        // ==================================================================
        // 4) SEKME SÜRECİ KIRPMA - sekmeden ayrıldıktan TAB_TRIM_AFTER_SECONDS sonra
        // ==================================================================

        /**
         * Sekme kaç saniye görünmez kalınca O SEKMENİN süreci kırpılsın (EmptyWorkingSet)? Sayfalar RAM'den çıkar,
         * içerik kaybolmaz. Süreç görünür/medya sekmeyle paylaşılıyorsa atlanır (30 sn sonra yeniden denenir).
         * 0 = kapalı. TETİKLEYEN: sekmenin [2] derin uykudan sonra da görünmez kalması (bellek önce temizlenmiş olur).
         */
        TAB_TRIM_AFTER_SECONDS: 10,

        // ==================================================================
        // 5) BOŞALTMA - sekmeden ayrıldıktan DISCARD_AFTER_SECONDS sonra
        // ==================================================================

        /**
         * Sekme kaç saniye görünmez kalınca boşaltılsın (discard)? Süreç kapanır, bellek gerçekten serbest kalır;
         * sekmeye tıklayınca sayfa yeniden yüklenir (kaydırma/form verisi geri gelir, canlı durum kaybolabilir).
         * 0 = boşaltma kapalı. Boşaltılan sekmenin zinciri biter; tekrar açılınca sıfırdan başlar.
         * TETİKLEYEN: [4] sekme kırpmadan sonra da sekmenin görünmez kalması. Aşağıdaki DISCARD_* kuralları süzer.
         */
        DISCARD_AFTER_SECONDS: 900,

        /** true: Sabitlenmiş sekmeler asla boşaltılmaz (uyku/kırpma yine uygulanır). */
        DISCARD_SKIP_PINNED: true,

        /** true: Yalnızca http/https sekmeler boşaltılır (about:, uzantı, dosya sayfalarına dokunulmaz). */
        DISCARD_ONLY_HTTP: true,

        /**
         * true: Süreci görünür/medya/yükleniyor bir sekmeyle paylaşılan sekme boşaltılmaz. Boşaltmak o süreci kapatmaz
         * (bellek kazanılmaz) ama sekmeyi boşuna yeniden yükletir. "Sürece zarar vermeyen" kuralı budur.
         */
        DISCARD_SKIP_SHARED_PROCESS: true,

        /**
         * Bu sitelerin sekmeleri HİÇ boşaltılmaz (alt alan adları dahil). Yarım kalmış yazı, sohbet, toplantı, canlı
         * akış gibi içeriği kaybolmaması gereken siteler. (Uyku/kırpma bunlara yine uygulanır.)
         */
        DISCARD_EXEMPT_HOSTS: [
            'chatgpt.com', 'openai.com', 'claude.ai', 'web.whatsapp.com', 'discord.com',
            'slack.com', 'teams.microsoft.com', 'teams.live.com', 'mail.google.com',
            'outlook.live.com', 'outlook.office.com', 'meet.google.com', 'web.telegram.org',
            'netflix.com', 'youtube.com', 'spotify.com', 'docs.google.com'
        ],

        /** true: HİÇBİR sekmeyi boşaltmaz, yalnızca "boşaltırdım" diye günlüğe yazar (deneme için). */
        DRY_RUN_DISCARD: false,

        // ==================================================================
        // 6) GENEL KÜÇÜLTME - hiçbir sayfa görünmüyorsa (pencere küçültüldü / tamamen örtüldü)
        // ==================================================================

        /**
         * true: Genel küçültme çalışır. Sıra: 1) MINIMIZE_RECLAIM_AFTER_SECONDS sonra genel GC/CC/memory (kırpma YOK),
         * 2) sekmeler uykuya ve 3) derin uykuya geçer (normal çizelge; küçültülen pencerede seçili sekme de "ayrılmış"
         * sayılır), 4) en sonda TÜM süreçler kırpılır. Kırpmayı en sona bırakmak, önce çöpün atılmasını ve sekmelerin
         * durmasını bekler; böylece kırpılan sayfalar hemen geri dolmaz.
         * TETİKLEYEN: hiçbir sayfanın görünmemesi. Pencere geri açılınca her şey iptal olur.
         */
        MINIMIZE_TRIM_ENABLED: true,

        /**
         * Hiçbir sayfa görünmez olduktan kaç saniye sonra genel bellek temizliği (GC/CC/heap-minimize) yapılsın?
         * Pencereyi hemen geri açarsanız boşuna temizlenmesin diye küçük bir bekleme vardır. Medya çalıyorsa yalnızca
         * ana süreçte GC/CC yapılır (memory-pressure bildirimi medya sekmesine de gider).
         * TETİKLEYEN: [6] küçültme. TETİKLER: sekmelerin [1] uykusu zaten kendi çizelgesiyle başlar.
         */
        MINIMIZE_RECLAIM_AFTER_SECONDS: 3,

        /**
         * Genel kırpma, DERİN UYKU süresi dolduktan kaç saniye sonra yapılsın? (Küçültme anından itibaren toplam
         * süre = DEEP_SLEEP_AFTER_SECONDS + bu ayar.) Önce tüm sekmeler uyur ve derin uykuya girer, sonra kırpılır.
         * TETİKLEYEN: [2] derin uyku süresinin dolması. TETİKLER: TRIM_* ayarlarının kapsamıyla tüm süreçlerin kırpılması.
         */
        MINIMIZE_TRIM_AFTER_DEEP_SECONDS: 10,

        /**
         * Boşta kalırken süreçler zamanla şişer. Kaç dakikada bir tekrar (önce genel GC/CC/memory, 4 sn sonra kırpma)
         * yapılsın? 0 = yalnızca bir kez. TETİKLEYEN: bir önceki genel kırpmadan bu kadar süre geçmesi.
         */
        MINIMIZE_RETRIM_MINUTES: 3,

        /**
         * true: Ses çalan bir sekme VARKEN de [3] ana süreç + GPU kırpması ve [6] genel küçültme devam eder; yalnızca
         * O MEDYA SEKMESİNİN SÜRECİ atlanır. PiP/ekran paylaşımı varsa GPU da atlanır (görüntü işleniyor). false: medya
         * çalarken bu iki adım tamamen durur.
         */
        TRIM_OTHERS_WHILE_MEDIA_PLAYS: true,

        /**
         * Ses çalan bir sekmenin SÜRECİ de kırpılsın: Firefox her arka plana gittiğinde (pencere küçültüldü ya da
         * tamamen örtüldü, hiçbir sayfa görünmüyor) bu kadar saniye bekledikten sonra BİR KEZ kırpılır; bir sayfa
         * tekrar görünürse (öne gelirseniz) sayaç sıfırlanır, sonraki arka plana gidişte yine bu kadar beklenir.
         * Varsayılan davranış medya sekmesinin sürecine hiç dokunmamaktı; ama müzik/video açıkken bellek en çok o
         * süreçte kalıyordu. Kırpılan sayfalar çalma sırasında gerekirse hemen RAM'e döner (yumuşak hata), yalnızca
         * kullanılmayan kısım dışarıda kalır. 0 = kapalı (eski davranış; TRIM_MEDIA_TAB_EVERY_SECONDS de işlemez).
         * PiP/ekran paylaşımı olan sekmeye dokunulmaz. Ses/görüntü takılırsa 0 yapın.
         * TETİKLEYEN: ses çalan sekme + hiçbir sayfanın görünmemesi. TETİKLER: TRIM_MEDIA_TAB_EVERY_SECONDS (tekrar).
         */
        TRIM_MEDIA_TAB_AFTER_HIDDEN_SECONDS: 3,

        /**
         * Arka planda kalmaya devam ederken medya sekmesinin süreci bu kadar saniyede bir TEKRAR kırpılsın
         * (süreç çalıştıkça sayfaları geri alıp şişer). 0 = tekrar yok, arka plana her gidişte yalnızca bir kez.
         * Öne gelip tekrar arkaya gidince döngü baştan başlar: önce TRIM_MEDIA_TAB_AFTER_HIDDEN_SECONDS beklenir.
         */
        TRIM_MEDIA_TAB_EVERY_SECONDS: 120,

        // ==================================================================
        // 7) AKIŞ - süreç sınıfı başına GC / CC / Minimize / Trim, TEK sıra, TEK kuyruk
        // ==================================================================
        //
        // Her süreç bir SINIFA girer; hangi işin hangi sınıfta yapılacağı PROCESS_ACTIONS tablosundadır.
        //   main            Firefox'un ana (parent) süreci
        //   tab_background  yalnızca gizli, medyasız, yüklenmeyen sekmelerin içerik süreci (PASİF sekme)
        //   tab_media       ses çalan / PiP / ekran paylaşan gizli sekmenin süreci
        //   tab_busy        yüklenmekte olan sekmenin süreci
        //   tab_active      EKRANDA GÖRÜNEN sekmeyi (ya da onunla süreç paylaşan sekmeyi) barındıran süreç (AKTİF sekme)
        //   gpu, rdd (medya çözücü), socket (ağ), utility (ses vb.), extension (uzantı süreci)
        //   spare           sekmesi olmayan boşta içerik süreci (önceden ayrılmış)
        //   other           yukarıdakilere girmeyen diğer süreçler (inference, gmplugin ...)
        //
        // Bir süreç birden çok sekme barındırıyorsa sınıfı en "korumalı" olandır: görünen > yüklenen > medya > gizli.
        //
        // İşler ve nereye uygulanabilir (uygulanamayan kombinasyonlar tabloda true olsa da yok sayılır):
        //   gc        çöp toplama     main (doğrudan), tab_* (o sürece mesajla)          -> diğerlerinde YOK
        //   cc        döngü toplama   main (doğrudan), tab_* (o sürece mesajla)          -> diğerlerinde YOK
        //   minimize  heap-minimize   tab_* (o sürece mesajla, hedefli); diğer tüm sınıflar yalnızca YAYIN ile
        //   trim      çalışma kümesi  her sınıf (süreç kimliğiyle, hedefli)
        // YAYIN: memory-pressure bildirimi TÜM süreçlere gider, tek bir sürece yöneltilemez. Bu yüzden yayın, yalnızca
        // o anda çalışan HİÇBİR sınıf "minimize: false" değilse gönderilir; aksi halde atlanır ve günlüğe yazılır.
        // Örnek: medya çalarken tab_media.minimize=false olduğundan yayın atlanır, medya süreci etkilenmez.
        //
        // AKIŞ: bir tetikleyici (uyku, derin uyku, sekme kırpma, genel küçültme, tekrar ...) hangi işlerin YAPILABİLECEĞİNİ
        // seçer; işlerin sırasını her zaman FLOW_ORDER belirler. Akışlar tek bir kuyrukta sırayla çalışır (iki akış asla iç
        // içe geçmez, birinin aşaması bitmeden diğerininki başlamaz). Her aşama, o aşamayı yapan süreçlerden onay gelene
        // (ya da zaman aşımına) kadar beklenir, aşamalar arasında FLOW_STAGE_GAP_MS boşluk bırakılır ve her aşamadan önce
        // süreç sınıfları YENİDEN belirlenir: kullanıcı bir sekmeye döndüyse o sürece dokunulmaz, "hiçbir sayfa görünmüyor"
        // koşulu bozulduysa genel akış durur.

        /**
         * Aşamaların sırası. Listede olmayan iş HİÇ yapılmaz (tüm sınıflarda kapalı). Örnek: ['gc','minimize','trim']
         * CC'yi kapatır; ['trim','gc'] önce kırpar sonra çöp toplar (önerilmez: kırpılan sayfalar GC ile geri dolar).
         * Önerilen sıra: gc -> cc -> minimize -> trim (önce çöp at, sonra bellek serbest bırak, en son RAM'den çıkar).
         */
        FLOW_ORDER: ['gc', 'cc', 'minimize', 'trim'],

        /** Aşamalar arası bekleme (ms). */
        FLOW_STAGE_GAP_MS: 300,

        /** Bir süreçten aşama onayı için en çok bekleme (ms); süreç yanıt vermezse akış bu kadar sonra devam eder. */
        FLOW_ACK_TIMEOUT_MS: 4000,

        /** Minimize YAYINI sonrası beklenecek süre (ms). Yayının bitiş onayı yoktur. */
        FLOW_BROADCAST_WAIT_MS: 3000,

        /** true: PiP ya da ekran paylaşımı varken GPU sürecine hiçbir iş uygulanmaz (görüntü işleniyor). */
        KEEP_GPU_WHILE_PIP_OR_SHARING: true,

        /**
         * 0 = kapalı. > 0: Firefox kullanılırken (bir sayfa görünür), bu kadar saniyede bir AKTİF sekmenin sürecine
         * PROCESS_ACTIONS.tab_active'te açık olan işler FLOW_ORDER sırasıyla uygulanır. Varsayılan tablo tab_active için
         * hepsini kapatır; yalnızca bilerek açarsanız anlamlıdır. Kullanırken kırpma/GC takılma yapabilir.
         */
        ACTIVE_FLOW_EVERY_SECONDS: 0,

        /**
         * Kullanıcı BOŞTAYKEN (pencere görünür ama fare/klavye bu kadar saniyedir hareketsiz) ana süreç ve GPU kırpılır;
         * 0 = kapalı. Sekme geçişi gibi meşgul anlarda DEĞİL, hareketsizken yapılır: etkileşim olmadığı için takılma görünmez ve
         * hareket gelince sayfalar çoğunlukla yumuşak hatayla (diskten okumadan) geri döner. Yalnızca PROCESS_ACTIONS'ta main/gpu
         * için trim açıksa çalışır (yalnızca kırpma; GC/CC/minimize bu yolda yok, yayın aktif sekmeyi de etkilerdi).
         * Atlanır: ses çalıyorsa, PiP/ekran paylaşımı varsa (GPU), görünür sekme yükleniyorsa. Sessiz çalan GÖRÜNÜR bir videoyu
         * ayırt edemez: o durumda GPU'yu kırpmak görüntüyü bozabilir, böyle kullanıyorsanız gpu.trim'i kapatın.
         * TETİKLEYEN: kullanıcının bu kadar saniye hareketsiz kalması (işletim sistemi düzeyinde boşta süresi).
         */
        ACTIVE_IDLE_SECONDS: 17,

        /**
         * Boşta kalma sürerse ana süreç + GPU kaç dakikada bir TEKRAR kırpılsın? 0 = her boşta oturumunda yalnızca bir kez
         * (hareket gelince oturum biter, bir sonraki boşta kalışta yeniden kırpılır).
         */
        ACTIVE_IDLE_REPEAT_MINUTES: 5,

        /**
         * Sınıf -> { gc, cc, minimize, trim }. Varsayılanlar eski davranışı korur: pasif sekme süreçlerinde dört iş de açık,
         * medya sekmesinde yalnızca trim (yalnızca arka planda, TRIM_MEDIA_TAB_* zamanlarıyla), aktif ve yüklenen
         * sekmelerde hiçbiri; ana süreç ve yardımcı süreçlerde ise hiçbir sayfa görünmüyorken uygulanır.
         */
        PROCESS_ACTIONS: {
            main:           { gc: true,  cc: true,  minimize: true,  trim: true  },
            tab_background: { gc: true,  cc: true,  minimize: true,  trim: true  },
            tab_media:      { gc: false, cc: false, minimize: false, trim: true  },
            tab_busy:       { gc: false, cc: false, minimize: false, trim: false },
            tab_active:     { gc: false, cc: false, minimize: false, trim: false },
            gpu:            { gc: false, cc: false, minimize: true,  trim: true  },
            rdd:            { gc: false, cc: false, minimize: true,  trim: true  },
            socket:         { gc: false, cc: false, minimize: true,  trim: true  },
            utility:        { gc: false, cc: false, minimize: true,  trim: true  },
            extension:      { gc: false, cc: false, minimize: true,  trim: true  },
            spare:          { gc: false, cc: false, minimize: true,  trim: true  },
            other:          { gc: false, cc: false, minimize: true,  trim: true  }
        },

        // ==================================================================
        // 8) GÜNLÜK
        // ==================================================================

        /** true: Yaptığı işleri ve hataları chrome\memlog.txt dosyasına yazar. false: dosyaya hiçbir şey yazılmaz (hatalar yalnızca Tarayıcı Konsolu'na gider). */
        ENABLE_LOGGING: false,

        /** Kaç dakikada bir günlüğe "çalışıyorum" özet satırı yazılsın? 0 = yazma. */
        HEARTBEAT_MINUTES: 0
    };

    // ===========================================
    // GÜNLÜK
    // ===========================================
    const TAG = 'TabLifecycle';
    let logPath = null, logBytes = 0;
    try { logPath = PathUtils.join(PathUtils.profileDir, 'chrome', 'memlog.txt'); } catch (e) {}
    function fileLog(level, args) {
        try {
            if (!logPath || !CONFIG.ENABLE_LOGGING) return;
            const text = args.map(a => (a && a.stack) ? a.stack : (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
            const line = `${new Date().toISOString()} [${TAG}${level === 'E' ? ' ERROR' : ''}] ${text}\n`;
            logBytes += line.length;
            if (logBytes > 400000) { logBytes = 0; IOUtils.move(logPath, logPath + '.old').catch(() => {}); }
            IOUtils.writeUTF8(logPath, line, { mode: 'appendOrCreate' }).catch(() => {});
        } catch (e) {}
    }
    const log = (...a) => { if (CONFIG.ENABLE_LOGGING) { console.log('[' + TAG + ']', ...a); fileLog('I', a); } };
    const logErr = (...a) => { console.error('[' + TAG + ']', ...a); fileLog('E', a); };

    // ===========================================
    // WINDOWS API (ctypes): çalışma kümesi kırpma
    // ===========================================
    const PROCESS_SET_QUOTA = 0x0100;
    const PROCESS_QUERY_INFORMATION = 0x0400;
    let api = null;
    try {
        const { ctypes } = ChromeUtils.importESModule('resource://gre/modules/ctypes.sys.mjs');
        const lib = ctypes.open('kernel32.dll');
        api = {
            lib,
            OpenProcess: lib.declare('OpenProcess', ctypes.winapi_abi,
                ctypes.voidptr_t, ctypes.uint32_t, ctypes.int32_t, ctypes.uint32_t),
            CloseHandle: lib.declare('CloseHandle', ctypes.winapi_abi, ctypes.int32_t, ctypes.voidptr_t),
            EmptyWorkingSet: lib.declare('K32EmptyWorkingSet', ctypes.winapi_abi, ctypes.int32_t, ctypes.voidptr_t)
        };
    } catch (e) {
        logErr('ctypes/kernel32 yüklenemedi, betik devre dışı:', e);
        return;
    }

    function trimPid(pid, allowParent = false) {
        if (!pid || (pid === Services.appinfo.processID && !allowParent)) return false;
        let handle = null;
        try {
            handle = api.OpenProcess(PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION, 0, pid);
            if (handle.isNull()) return false;
            return api.EmptyWorkingSet(handle) !== 0;
        } catch (e) {
            logErr('trim hatası', pid, e);
            return false;
        } finally {
            try { if (handle && !handle.isNull()) api.CloseHandle(handle); } catch (e) {}
        }
    }

    // ===========================================
    // İÇERİK SÜRECİ TARAFI (çerçeve betiği)
    // ===========================================
    // suspendTimeouts: sayfa + alt pencerelerinin setTimeout/setInterval sayaçlarını askıya alır.
    // innerWindowId kontrolü: sayfa gezinirse yeni belge askıda olmaz, eski askıyı yanlışlıkla çözmeyelim.
    const FRAME_SCRIPT = `
        let frozenId = 0;
        addMessageListener('TabLifecycle:Freeze', () => {
            try {
                const id = content.windowGlobalChild.innerWindowId;
                if (frozenId === id) return;
                content.windowUtils.suspendTimeouts();
                frozenId = id;
            } catch (e) { Cu.reportError('TabLifecycle freeze: ' + e); }
        });
        addMessageListener('TabLifecycle:Unfreeze', () => {
            try {
                if (frozenId && frozenId === content.windowGlobalChild.innerWindowId) {
                    content.windowUtils.resumeTimeouts();
                }
            } catch (e) { Cu.reportError('TabLifecycle unfreeze: ' + e); }
            frozenId = 0;
        });
        // Aşamalar ayrı mesajlardır (akış motoru sırayı belirler); her biri bitince onay gönderir.
        const stage = (name, fn) => addMessageListener('TabLifecycle:' + name, m => {
            try { fn(); } catch (e) { Cu.reportError('TabLifecycle ' + name + ': ' + e); }
            sendAsyncMessage('TabLifecycle:Ack', { id: m.data && m.data.id });
        });
        stage('Gc', () => Cu.forceGC());
        stage('Cc', () => Cu.forceCC());
        // about:memory "Minimize memory usage" ile aynı bildirim, ama yalnızca bu süreçte
        stage('Minimize', () => Services.obs.notifyObservers(null, 'memory-pressure', 'heap-minimize'));
    `;
    try {
        window.messageManager.loadFrameScript(
            'data:application/javascript;charset=utf-8,' + encodeURIComponent(FRAME_SCRIPT), true);
    } catch (e) {
        logErr('çerçeve betiği yüklenemedi, betik devre dışı:', e);
        return;
    }

    // ===========================================
    // YARDIMCILAR
    // ===========================================
    function browserWindows() {
        const out = [];
        const en = Services.wm.getEnumerator('navigator:browser');
        while (en.hasMoreElements()) {
            const w = en.getNext();
            if (!w.closed && w.gBrowser) out.push(w);
        }
        return out;
    }
    function isLeader() {
        const wins = browserWindows();
        return wins.length > 0 && wins[0] === window;
    }
    function hostMatches(list, host) {
        return !!host && list.some(h => host === h || host.endsWith('.' + h));
    }
    function hostOf(tab) {
        try { return tab.linkedBrowser.currentURI.host || ''; } catch (e) { return ''; }
    }
    function isHttp(tab) {
        try { const u = tab.linkedBrowser.currentURI; return !!u && (u.schemeIs('http') || u.schemeIs('https')); }
        catch (e) { return false; }
    }
    function mediaKind(tab) {
        if (tab.soundPlaying || tab.hasAttribute('soundplaying')) return 'audio';
        if (tab.hasAttribute('pictureinpicture')) return 'pip';
        if (tab.hasAttribute('sharing')) return 'sharing';
        return null;
    }
    /** Sekme aktif (zincire girmez) ise nedenini döner: visible | busy | audio | pip | sharing. */
    function activeReason(tab) {
        const br = tab.linkedBrowser;
        if (br.docShellIsActive) return 'visible';
        if (tab.hasAttribute('busy')) return 'busy';
        if (CONFIG.SKIP_ACTIVE_MEDIA_TABS) return mediaKind(tab);
        return null;
    }
    function pidOf(tab) {
        try { return tab.linkedBrowser.browsingContext.currentWindowGlobal.domProcess.osPid; }
        catch (e) { return 0; }
    }
    function label(tab) {
        return `${hostOf(tab) || '?'} | ${String(tab.label || '').slice(0, 40)}`;
    }

    /**
     * Tüm pencerelerin anlık görüntüsü: pid -> {active}, medya türleri, hiçbir sayfa görünüyor mu.
     * Süreç düzeyindeki işler (GC, kırpma, boşaltma) bunu kullanır; bir sürecin herhangi bir sekmesi aktifse
     * o sürece dokunulmaz.
     */
    function snapshotAll() {
        const procs = new Map();
        const mediaKinds = new Set();
        let mediaWhy = null, anyVisible = false, wins = 0;
        const list = browserWindows();
        for (const win of list) {
            wins++;
            for (const tab of win.gBrowser.tabs) {
                const br = tab.linkedBrowser;
                const bc = br && br.browsingContext;
                if (!bc) continue;
                let reason = null;
                if (br.docShellIsActive) { reason = 'visible'; anyVisible = true; }
                else if (tab.hasAttribute('busy')) reason = 'busy';
                else if (CONFIG.SKIP_ACTIVE_MEDIA_TABS) {
                    reason = mediaKind(tab);
                    if (reason) { mediaKinds.add(reason); mediaWhy = mediaWhy || `${reason}:${(br.currentURI && br.currentURI.host) || '?'}`; }
                }
                let contexts;
                try { contexts = bc.getAllBrowsingContextsInSubtree(); } catch (e) { contexts = [bc]; }
                for (const c of contexts) {
                    let pid;
                    try { pid = c.currentWindowGlobal && c.currentWindowGlobal.domProcess && c.currentWindowGlobal.domProcess.osPid; } catch (e) {}
                    if (!pid || pid === Services.appinfo.processID) continue;
                    const cur = procs.get(pid) || { active: false, visible: false, busy: false, media: false, tab: null };
                    if (reason) cur.active = true;
                    if (reason === 'visible') cur.visible = true; else if (reason === 'busy') cur.busy = true; else if (reason) cur.media = true;
                    if (!cur.tab) cur.tab = tab;
                    procs.set(pid, cur);
                }
            }
        }
        const anyMedia = mediaKinds.size > 0;
        return { procs, mediaKinds, anyMedia, mediaWhy, anyVisible,
                 allIdle: wins > 0 && !anyVisible, windows: wins };
    }
    // Her tick'te en fazla bir kez, yalnızca süreç düzeyinde bir karar gerekirse hesaplanır.
    let snapCache = null;
    const snap = () => snapCache || (snapCache = snapshotAll());

    /** Hafif durum (yalnızca öznitelikler): hiçbir sayfa görünüyor mu, medya var mı. Her tick çağrılır. */
    function quickState() {
        let wins = 0, anyVisible = false, anyMedia = false;
        for (const win of browserWindows()) {
            wins++;
            for (const tab of win.gBrowser.tabs) {
                const br = tab.linkedBrowser;
                if (!br || !br.browsingContext) continue;
                if (br.docShellIsActive) anyVisible = true;
                else if (CONFIG.SKIP_ACTIVE_MEDIA_TABS && mediaKind(tab)) anyMedia = true;
            }
        }
        return { allIdle: wins > 0 && !anyVisible, anyMedia, windows: wins };
    }

    function send(tab, name) {
        try { tab.linkedBrowser.messageManager.sendAsyncMessage('TabLifecycle:' + name); return true; }
        catch (e) { logErr('mesaj hatası', name, e); return false; }
    }

    // ===========================================
    // AKIŞ MOTORU: süreç sınıfı başına GC / CC / Minimize / Trim (ayrıntı: CONFIG > 7) AKIŞ)
    // ===========================================
    const CU = (typeof Cu !== 'undefined') ? Cu : Components.utils;
    // İşletim sistemi düzeyinde kullanıcı boşta süresi (ms); denemeler için g.idleOverride ile değiştirilebilir
    const idleService = Cc['@mozilla.org/widget/useridleservice;1'].getService(Ci.nsIUserIdleService);
    const getIdleMs = () => (g.idleOverride != null ? g.idleOverride : idleService.idleTime);

    // Aşama onayları: içerik süreci işi bitirince 'TabLifecycle:Ack' gönderir; mesaj sekmenin penceresine gelir.
    let ackSeq = 0;
    const acks = new Map();
    window.messageManager.addMessageListener('TabLifecycle:Ack', msg => {
        const done = acks.get(msg.data && msg.data.id);
        if (done) done();
    });
    function sendWait(tab, name) {
        return new Promise(resolve => {
            const id = ++ackSeq;
            let timer = 0;
            const done = () => { acks.delete(id); window.clearTimeout(timer); resolve(); };
            timer = window.setTimeout(done, CONFIG.FLOW_ACK_TIMEOUT_MS);
            acks.set(id, done);
            try { tab.linkedBrowser.messageManager.sendAsyncMessage('TabLifecycle:' + name, { id }); }
            catch (e) { logErr('mesaj hatası', name, e); done(); }
        });
    }
    // Mesaj, sekmenin kendi penceresinin kayıt defteriyle beklenir (çok pencerede onay o pencereye gelir).
    function sendWaitVia(tab, name) {
        const w = tab.ownerGlobal;
        const t = w && w.TabLifecycle;
        return t && t.sendWait ? t.sendWait(tab, name) : Promise.resolve();
    }

    const isTabClass = cls => cls.startsWith('tab_');
    // Bir işin bir sınıfta nasıl yapılacağı: 'direct' (bu süreçte), 'message' (o sürece mesajla), 'broadcast', 'pid' ya da null (yok)
    function capability(cls, stage) {
        if (stage === 'trim') return 'pid';
        if (cls === 'main') return stage === 'minimize' ? 'broadcast' : 'direct';
        if (isTabClass(cls)) return 'message';
        return stage === 'minimize' ? 'broadcast' : null;
    }
    function actionOn(cls, stage) {
        const row = CONFIG.PROCESS_ACTIONS && CONFIG.PROCESS_ACTIONS[cls];
        return !!(row && row[stage] && capability(cls, stage));
    }

    /** Tüm süreçleri sınıflara ayırır (her aşamadan önce yeniden çağrılır). */
    async function classify() {
        const s = snapshotAll();
        const info = await ChromeUtils.requestProcInfo();
        const list = [{ pid: info.pid, cls: 'main', type: 'parent', tab: null }];
        for (const c of info.children) {
            const p = s.procs.get(c.pid);
            let cls;
            if (p) cls = p.visible ? 'tab_active' : p.busy ? 'tab_busy' : p.media ? 'tab_media' : 'tab_background';
            else if (['gpu', 'rdd', 'socket', 'utility', 'extension'].includes(c.type)) cls = c.type;
            else if (/^(web|file|privileged|withCoopCoep|preallocated|inference)/.test(c.type || '')) cls = 'spare';
            else cls = 'other';
            list.push({ pid: c.pid, cls, type: c.type, tab: p ? p.tab : null });
        }
        return { list, snap: s };
    }

    /**
     * Tek bir akışı çalıştırır. opts: { reason, stages (yapılabilecek işler; sıra FLOW_ORDER'dan gelir),
     * pids (yalnızca bu süreçler) | classes (yalnızca bu sınıflar), needIdle (hiçbir sayfa görünürken çalışma) }.
     * Sonuç: { counts, pids (iş uygulanan süreçler), protectedPids (sınıfı korunduğu için atlananlar) }.
     */
    async function runFlow(o) {
        const stages = CONFIG.FLOW_ORDER.filter(s => o.stages.includes(s));
        const res = { counts: {}, pids: new Set(), protectedPids: new Set(), notes: [] };
        log(`AKIŞ başladı (${o.reason}): ${stages.join(' > ')}`);
        let first = true;
        for (const stage of stages) {
            if (!first) await new Promise(r => window.setTimeout(r, CONFIG.FLOW_STAGE_GAP_MS));
            first = false;
            const { list, snap: s } = await classify();
            const idle = quickState().allIdle;
            // Kullanıcı-boşta akışı: her aşamadan önce hâlâ hareketsiz mi diye bak, hareket geldiyse dur
            const userIdle = !!o.userIdleMs && getIdleMs() >= o.userIdleMs;
            if (o.userIdleMs && !userIdle) { res.notes.push('kullanıcı hareket etti, akış durdu'); log(`AKIŞ durdu (${o.reason}): kullanıcı hareket etti, aşama: ${stage}`); break; }
            if (o.needIdle && !idle) { res.notes.push('sayfa görünür oldu, akış durdu'); log(`AKIŞ durdu (${o.reason}): bir sayfa görünür oldu, aşama: ${stage}`); break; }
            const keepGpu = CONFIG.KEEP_GPU_WHILE_PIP_OR_SHARING && (s.mediaKinds.has('pip') || s.mediaKinds.has('sharing'));
            const scoped = list.filter(t => (!o.pids || o.pids.has(t.pid)) && (!o.classes || o.classes.has(t.cls)));
            for (const t of scoped) if (t.cls === 'tab_active' || t.cls === 'tab_busy') res.protectedPids.add(t.pid);
            // Sayfa görünürken ana/yardımcı süreçlere (sekme dışı sınıflara) dokunulmaz: kullanırken takılma olur (kullanıcı boştaysa istisna).
            const targets = scoped.filter(t => actionOn(t.cls, stage) && !(t.cls === 'gpu' && keepGpu) && (idle || userIdle || isTabClass(t.cls)));
            if (!targets.length) { log(`  aşama ${stage}: hedef yok`); continue; }
            const by = {};
            let n = 0;
            const mark = t => { n++; res.pids.add(t.pid); by[t.cls] = (by[t.cls] || 0) + 1; };

            if (stage === 'gc' || stage === 'cc') {
                const jobs = [];
                for (const t of targets) {
                    if (capability(t.cls, stage) === 'direct') {
                        try { stage === 'gc' ? CU.forceGC() : CU.forceCC(); mark(t); } catch (e) { logErr(stage + ' hatası', e); }
                    } else if (t.tab) { jobs.push(sendWaitVia(t.tab, stage === 'gc' ? 'Gc' : 'Cc')); mark(t); }
                }
                await Promise.all(jobs);
            } else if (stage === 'minimize') {
                const jobs = [];
                const wantBroadcast = [];
                for (const t of targets) {
                    if (capability(t.cls, stage) === 'message') { if (t.tab) { jobs.push(sendWaitVia(t.tab, 'Minimize')); mark(t); } }
                    else wantBroadcast.push(t);
                }
                await Promise.all(jobs);
                if (wantBroadcast.length) {
                    // Yayın herkese gider: minimize'ı kapalı bir sınıf çalışıyorsa gönderme (onu etkilememek için)
                    const blockers = [...new Set(list.filter(t => !actionOn(t.cls, 'minimize') && !(t.cls === 'gpu' && keepGpu)).map(t => t.cls))];
                    if (blockers.length) { res.notes.push('yayın atlandı'); log(`  yayın atlandı (minimize kapalı sınıf çalışıyor: ${blockers.join(', ')})`); }
                    else {
                        Services.obs.notifyObservers(null, 'memory-pressure', 'heap-minimize');
                        wantBroadcast.forEach(mark);
                        await new Promise(r => window.setTimeout(r, CONFIG.FLOW_BROADCAST_WAIT_MS));
                    }
                }
            } else if (stage === 'trim') {
                for (const t of targets) if (trimPid(t.pid, t.cls === 'main')) { mark(t); g.trimCount++; }
            }
            res.counts[stage] = n;
            log(`  aşama ${stage}: ${n} süreç ${JSON.stringify(by)}`);
        }
        log(`AKIŞ bitti (${o.reason})`);
        return res;
    }

    // Akışlar tüm pencerelerde TEK kuyrukta sırayla çalışır (lider pencerenin kuyruğu).
    let flowChain = Promise.resolve();
    function queueFlow(o) {
        const p = flowChain.then(() => runFlow(o)).catch(e => { logErr('akış hatası', e); return { counts: {}, pids: new Set(), protectedPids: new Set(), notes: ['hata'] }; });
        flowChain = p;
        return p;
    }
    function flow(o) {
        const lead = browserWindows()[0];
        const t = lead && lead.TabLifecycle;
        return (t && t.queueFlow ? t.queueFlow : queueFlow)(o);
    }

    // ===========================================
    // SEKME DURUM MAKİNESİ
    // ===========================================
    // tab -> {hiddenSince, slept, suspended, frozenAt, wakeAt, reclaimedAt, baseMem, deep, trimmed,
    //         trimRetryAt, discardRetryAt, shared}
    const state = new WeakMap();

    function freezeTab(tab, st, now) {
        if (st.suspended) return;
        if (send(tab, 'Freeze')) { st.suspended = true; st.frozenAt = now; st.wakeAt = 0; }
    }
    function unfreezeTab(tab, st) {
        if (!st.suspended) return;
        send(tab, 'Unfreeze');
        st.suspended = false;
    }
    /** Sekme tekrar aktif oldu / boşaltıldı: her şeyi çöz ve zinciri baştan başlat. */
    function resetTab(tab, why) {
        const st = state.get(tab);
        if (!st) return;
        const hadWork = st.suspended || st.slept || st.deep || st.trimmed;
        unfreezeTab(tab, st);
        state.delete(tab);
        if (hadWork) log(`çözüldü/sıfırlandı (${why}):`, label(tab));
    }

    async function processMemory(pid) {
        try {
            const info = await ChromeUtils.requestProcInfo();
            const c = info.children.find(x => x.pid === pid);
            return c ? c.memory : null;
        } catch (e) { return null; }
    }

    /** GC + CC + Minimize (FLOW_ORDER sırasıyla, PROCESS_ACTIONS'a göre) yalnızca bu sekmenin sürecinde. */
    function reclaimTab(tab, st, now, why) {
        const pid = pidOf(tab);
        if (!pid) return false;
        flow({ reason: `${why}: ${label(tab)}`, stages: ['gc', 'cc', 'minimize'], pids: new Set([pid]) }).then(r => {
            if (!r.pids.has(pid)) return;   // süreç korumalı sınıftaydı (aktif/medya/yüklenen) ya da işler kapalı
            st.reclaimedAt = Date.now();
            // Temizlik bittikten sonra bellek ölçülür; derin uykudaki ikinci temizlik bununla kıyaslar.
            window.setTimeout(async () => { const m = await processMemory(pid); if (m != null) st.baseMem = m; }, 3000);
        });
        return true;
    }

    function sleepTab(tab, st, now) {
        st.slept = true;
        const http = isHttp(tab);
        if (http && !hostMatches(CONFIG.SLEEP_EXEMPT_HOSTS, hostOf(tab))) {
            freezeTab(tab, st, now);
            log(`UYKU (${CONFIG.SLEEP_AFTER_SECONDS}sn):`, label(tab));
        } else {
            log('uyku atlandı (muaf/http değil), yalnızca bellek temizliği:', label(tab));
        }
        if (CONFIG.RECLAIM_ON_SLEEP && http) reclaimTab(tab, st, now, 'uyku');
    }

    async function deepSleepTab(tab, st, now) {
        st.deep = true;
        const http = isHttp(tab);
        if (http && !hostMatches(CONFIG.SLEEP_EXEMPT_HOSTS, hostOf(tab))) {
            freezeTab(tab, st, now);   // uyanık anındaysa tekrar dondur
            st.wakeAt = 0;
        }
        log(`DERİN UYKU (${CONFIG.DEEP_SLEEP_AFTER_SECONDS}sn):`, label(tab));
        noteDeepSleep(now);
        if (!http) return;
        // Adım 4: yalnızca bellek ilk temizlikten beri belirgin büyüdüyse
        if (st.reclaimedAt && now - st.reclaimedAt < 10000) return;   // az önce temizlendi
        const pid = pidOf(tab);
        if (CONFIG.DEEP_RECLAIM_IF_GROWN_MB > 0 && st.baseMem && pid) {
            const m = await processMemory(pid);
            if (m != null) {
                const grownMB = (m - st.baseMem) / 1048576;
                if (grownMB < CONFIG.DEEP_RECLAIM_IF_GROWN_MB) {
                    log(`derin uyku temizliği atlandı (bellek ${grownMB.toFixed(1)}MB büyüdü < ${CONFIG.DEEP_RECLAIM_IF_GROWN_MB}):`, label(tab));
                    return;
                }
            }
        }
        if (state.get(tab) === st && !tab.linkedBrowser.docShellIsActive) reclaimTab(tab, st, Date.now(), 'derin uyku');
    }

    function trimTab(tab, st, now) {
        const br = tab.linkedBrowser;
        let contexts;
        try { contexts = br.browsingContext.getAllBrowsingContextsInSubtree(); } catch (e) { contexts = [br.browsingContext]; }
        const pids = new Set();
        for (const c of contexts) {
            let pid;
            try { pid = c.currentWindowGlobal && c.currentWindowGlobal.domProcess && c.currentWindowGlobal.domProcess.osPid; } catch (e) {}
            if (pid && pid !== Services.appinfo.processID) pids.add(pid);
        }
        st.trimmed = true;   // akış bitene kadar yeniden başlatma
        flow({ reason: `sekme kırpma (${CONFIG.TAB_TRIM_AFTER_SECONDS}sn): ${label(tab)}`, stages: ['trim'], pids }).then(r => {
            if (!r.pids.size && r.protectedPids.size) {
                st.trimmed = false;
                st.trimRetryAt = Date.now() + 30000;
                log('kırpma ertelendi (süreç aktif/yüklenen sekmeyle paylaşılıyor):', label(tab));
            }
        });
    }

    function discardTab(tab, st, now) {
        const why = (() => {
            if (tab.hasAttribute('pending')) return 'zaten boşaltılmış';
            if (CONFIG.DISCARD_SKIP_PINNED && tab.pinned) return 'sabitlenmiş';
            if (CONFIG.DISCARD_ONLY_HTTP && !isHttp(tab)) return 'http değil';
            if (hostMatches(CONFIG.DISCARD_EXEMPT_HOSTS, hostOf(tab))) return 'muaf site';
            if (CONFIG.DISCARD_SKIP_SHARED_PROCESS) {
                const pid = pidOf(tab);
                const p = pid && snap().procs.get(pid);
                if (p && p.active) return 'süreç aktif sekmeyle paylaşılıyor';
            }
            return null;
        })();
        if (why) { st.discardRetryAt = now + 60000; if (!st.discardSkipLogged) { st.discardSkipLogged = true; log(`boşaltma atlandı (${why}):`, label(tab)); } return; }
        const lbl = label(tab);
        if (CONFIG.DRY_RUN_DISCARD) { st.discardRetryAt = now + 60000; log('DENEME: boşaltırdım ->', lbl); return; }
        let ok = false;
        try { ok = gBrowser.discardBrowser(tab); } catch (e) { logErr('discardBrowser hatası', lbl, e); }
        if (ok) { log(`BOŞALTILDI (${CONFIG.DISCARD_AFTER_SECONDS}sn) ->`, lbl); state.delete(tab); }
        else { st.discardRetryAt = now + 60000; log('Firefox boşaltmayı reddetti (kaydedilmemiş değişiklik/seçili sekme olabilir) ->', lbl); }
    }

    // Ses çalan (gizli) sekmenin süreci: arka plana gidince TRIM_MEDIA_TAB_AFTER_HIDDEN_SECONDS sonra bir kez, sonra
    // TRIM_MEDIA_TAB_EVERY_SECONDS'ta bir. pid -> son kırpma zamanı; idleSince = hiçbir sayfa görünmez olduğu an
    // (görünür sayfa varken 0, yani her öne gelişte sayaç sıfırlanır).
    const mediaTrimAt = new Map();
    let idleSince = 0;
    function updateIdle(now) {
        if (quickState().allIdle) { if (!idleSince) idleSince = now; }
        else idleSince = 0;
    }
    function trimMediaTabProcess(tab, now) {
        const after = CONFIG.TRIM_MEDIA_TAB_AFTER_HIDDEN_SECONDS * 1000;
        if (!(after > 0) || !idleSince || now - idleSince < after) return;
        const pid = pidOf(tab);
        if (!pid) return;
        const last = mediaTrimAt.get(pid) || 0;
        const every = CONFIG.TRIM_MEDIA_TAB_EVERY_SECONDS * 1000;
        if (last >= idleSince && !(every > 0 && now - last >= every)) return;   // bu arka plan oturumunda yapıldı
        mediaTrimAt.set(pid, now);
        flow({ reason: 'medya sekmesi: ' + label(tab), stages: ['trim'], pids: new Set([pid]), needIdle: true });
    }

    function processTab(tab, now) {
        const br = tab.linkedBrowser;
        let st = state.get(tab);
        if (!br || !br.browsingContext) { if (st) state.delete(tab); return; }   // boşaltılmış sekme
        const reason = activeReason(tab);
        if (reason) {
            if (st) resetTab(tab, `aktif: ${reason}`);
            if (reason === 'audio') trimMediaTabProcess(tab, now);
            return;
        }
        if (!st) { st = { hiddenSince: now }; state.set(tab, st); }
        const age = now - st.hiddenSince;

        // 1-2) Uyku + o sekmenin süreci için bellek temizliği
        if (!st.slept && age >= CONFIG.SLEEP_AFTER_SECONDS * 1000) sleepTab(tab, st, now);

        // Uykudaki sekmeyi kısa süre uyandır / tekrar dondur (yalnızca derin uykudan önce)
        if (st.slept && !st.deep && CONFIG.SLEEP_WAKE_INTERVAL_SECONDS > 0 && st.frozenAt) {
            if (st.wakeAt) {
                if (now - st.wakeAt >= CONFIG.SLEEP_WAKE_DURATION_SECONDS * 1000) { st.suspended = false; freezeTab(tab, st, now); }
            } else if (st.suspended && now - st.frozenAt >= CONFIG.SLEEP_WAKE_INTERVAL_SECONDS * 1000) {
                unfreezeTab(tab, st); st.wakeAt = now;
            }
        }

        // 3-4) Derin uyku
        if (!st.deep && age >= CONFIG.DEEP_SLEEP_AFTER_SECONDS * 1000) {
            if (!st.slept) sleepTab(tab, st, now);
            deepSleepTab(tab, st, now).catch(e => logErr('derin uyku hatası', e));
        }

        // 6) Sekme süreci kırpma
        if (CONFIG.TAB_TRIM_AFTER_SECONDS > 0 && !st.trimmed && age >= CONFIG.TAB_TRIM_AFTER_SECONDS * 1000 &&
            (!st.trimRetryAt || now >= st.trimRetryAt)) trimTab(tab, st, now);

        // 7) Boşaltma
        if (CONFIG.DISCARD_AFTER_SECONDS > 0 && age >= CONFIG.DISCARD_AFTER_SECONDS * 1000 &&
            (!st.discardRetryAt || now >= st.discardRetryAt)) discardTab(tab, st, now);
    }

    // ===========================================
    // GLOBAL ADIMLAR (yalnızca lider pencere): ana süreç + GPU, genel küçültme
    // ===========================================
    const g = { armedAt: 0, idleTrimmedAt: 0, lastActive: 0, lastMainGpu: 0, minSince: 0, minLast: 0, minReclaimed: false, trimCount: 0, lastHeartbeat: 0 };

    /** Bir sekme derin uykuya girdi: sayaç çalışmıyorsa başlat (çalışıyorsa yeniden başlatma). */
    function noteDeepSleep(now) {
        const lead = browserWindows()[0];
        const t = lead && lead.TabLifecycle;
        if (t && t.armMainGpu) t.armMainGpu(now);
    }
    function armMainGpu(now) {
        if (!g.armedAt) { g.armedAt = now; log(`ana süreç+GPU sayacı başladı (${CONFIG.MAIN_GPU_TRIM_AFTER_DEEP_SECONDS}sn)`); }
    }

    function anyVisibleTabBusy() {
        for (const win of browserWindows()) {
            const tab = win.gBrowser.selectedTab;
            if (tab && tab.hasAttribute('busy')) return true;
        }
        return false;
    }

    let globalBusy = false;
    async function globalStep(now) {
        if (globalBusy) return;
        globalBusy = true;
        try {
            const q = quickState();
            const mediaOk = !q.anyMedia || CONFIG.TRIM_OTHERS_WHILE_MEDIA_PLAYS;

            // 5) Derin uykudan sonra ana süreç + GPU (yalnızca bu iki sınıf, yalnızca kırpma)
            if (g.armedAt && now - g.armedAt >= CONFIG.MAIN_GPU_TRIM_AFTER_DEEP_SECONDS * 1000) {
                g.armedAt = 0;
                if (!q.allIdle) log('ana süreç+GPU kırpması iptal: bir sayfa görünür (kullanırken kırpılmaz)');
                else if (!mediaOk) log('ana süreç+GPU kırpması iptal: medya çalıyor');
                else if (now - g.lastMainGpu < CONFIG.MAIN_GPU_MIN_INTERVAL_SECONDS * 1000) log('ana süreç+GPU kırpması atlandı: yakın zamanda yapıldı');
                else {
                    g.lastMainGpu = now;
                    await flow({ reason: 'ana süreç + GPU (derin uyku sonrası)', stages: ['trim'], classes: new Set(['main', 'gpu']), needIdle: true });
                }
            }

            // Genel küçültme: hiçbir sayfa görünür değil
            if (CONFIG.MINIMIZE_TRIM_ENABLED && q.allIdle && mediaOk) {
                if (!g.minSince) { g.minSince = now; g.minLast = 0; g.minReclaimed = false; log('hiçbir sayfa görünmüyor: genel küçültme başladı'); }
                const age = now - g.minSince;
                // 1) hemen genel bellek temizliği (kırpma yok)
                if (!g.minReclaimed && age >= CONFIG.MINIMIZE_RECLAIM_AFTER_SECONDS * 1000) {
                    g.minReclaimed = true;
                    await flow({ reason: 'genel temizlik (küçültme)', stages: ['gc', 'cc', 'minimize'], needIdle: true });
                }
                // 2-3) uyku ve derin uyku sekme çizelgesinde kendiliğinden olur; 4) en sonda kırpma
                const trimAfter = (CONFIG.DEEP_SLEEP_AFTER_SECONDS + CONFIG.MINIMIZE_TRIM_AFTER_DEEP_SECONDS) * 1000;
                const due = g.minLast === 0
                    ? age >= trimAfter
                    : (CONFIG.MINIMIZE_RETRIM_MINUTES > 0 && now - g.minLast >= CONFIG.MINIMIZE_RETRIM_MINUTES * 60000);
                if (due) {
                    // İlk kırpmadan önce temizlik zaten yapıldı; tekrarlarda dört iş de FLOW_ORDER sırasıyla çalışır.
                    const repeat = g.minLast !== 0;
                    g.lastMainGpu = g.minLast = now;
                    await flow({ reason: repeat ? 'genel temizlik + kırpma (boşta tekrar)' : 'genel kırpma (küçültme)',
                                 stages: repeat ? ['gc', 'cc', 'minimize', 'trim'] : ['trim'], needIdle: true });
                }
            } else if (g.minSince) {
                g.minSince = 0; g.minLast = 0; g.minReclaimed = false;
            }

            // Aktif sekmenin süreci için isteğe bağlı periyodik akış (varsayılan kapalı)
            if (CONFIG.ACTIVE_FLOW_EVERY_SECONDS > 0 && !q.allIdle && now - g.lastActive >= CONFIG.ACTIVE_FLOW_EVERY_SECONDS * 1000) {
                g.lastActive = now;
                await flow({ reason: 'aktif sekme süreci', stages: CONFIG.FLOW_ORDER, classes: new Set(['tab_active']) });
            }

            // Kullanıcı boşta (pencere görünür, hareketsiz): ana süreç + GPU kırpılır
            if (CONFIG.ACTIVE_IDLE_SECONDS > 0 && !q.allIdle) {
                const need = CONFIG.ACTIVE_IDLE_SECONDS * 1000;
                if (getIdleMs() < need) g.idleTrimmedAt = 0;   // kullanıcı etkin: yeni boşta oturumu için sıfırla
                else if (!q.anyMedia && !anyVisibleTabBusy()) {
                    const repeat = CONFIG.ACTIVE_IDLE_REPEAT_MINUTES * 60000;
                    const due = !g.idleTrimmedAt || (repeat > 0 && now - g.idleTrimmedAt >= repeat);
                    if (due) {
                        g.idleTrimmedAt = now;
                        await flow({ reason: `kullanıcı boşta (${CONFIG.ACTIVE_IDLE_SECONDS}sn): ana süreç + GPU`, stages: ['trim'], classes: new Set(['main', 'gpu']), userIdleMs: need });
                    }
                }
            }
        } catch (e) { logErr('global adım hatası', e); }
        finally { globalBusy = false; }
    }

    async function heartbeat(now) {
        if (!CONFIG.HEARTBEAT_MINUTES || now - g.lastHeartbeat < CONFIG.HEARTBEAT_MINUTES * 60000) return;
        g.lastHeartbeat = now;
        let priv = '?', n = '?';
        try {
            const info = await ChromeUtils.requestProcInfo();
            n = 1 + info.children.length;
            priv = Math.round((info.memory + info.children.reduce((s, c) => s + c.memory, 0)) / 1048576);
        } catch (e) {}
        const q = quickState();
        log(`çalışıyor: pencere=${q.windows} süreç=${n} toplamÖzel=${priv}MB boşta=${q.allIdle} medya=${q.anyMedia} kırpmaSayısı=${g.trimCount}`);
    }

    // ===========================================
    // ANA DÖNGÜ
    // ===========================================
    async function tick(now = Date.now()) {
        if (window.closed) return { skipped: true };
        snapCache = null; updateIdle(now);
        for (const tab of gBrowser.tabs) {
            try { processTab(tab, now); } catch (e) { logErr('sekme hatası', label(tab), e); }
        }
        if (isLeader()) { await globalStep(now); await heartbeat(now); }
        setTickRate(isSettled());
        return { ok: true };
    }

    /** Görünür sayfa yok ve her sekme derin uykuda (ya da medya/boşaltılmış): yeni sekme işi çıkmaz, yavaş kontrol yeter. */
    function isSettled() {
        if (!(CONFIG.TICK_SETTLED_SECONDS > 0) || !quickState().allIdle) return false;
        for (const win of browserWindows()) {
            for (const tab of win.gBrowser.tabs) {
                const br = tab.linkedBrowser;
                if (!br || !br.browsingContext) continue;   // boşaltılmış
                if (br.docShellIsActive || tab.hasAttribute('busy')) return false;
                if (CONFIG.SKIP_ACTIVE_MEDIA_TABS && mediaKind(tab)) continue;
                const st = win.TabLifecycle && win.TabLifecycle.state.get(tab);
                if (!st || !st.deep) return false;
            }
        }
        return true;
    }

    // Sekmeye dönüldüğünde beklemeden çöz
    function onTabSelect(e) {
        setTickRate(false);
        resetTab(e.target, 'sekmeye dönüldü');
        // Ayrılan sekmenin süresi hemen başlasın
        const prev = e.detail && e.detail.previousTab;
        if (prev && prev.linkedBrowser && !state.get(prev)) state.set(prev, { hiddenSince: Date.now() });
    }
    // Pencere küçültülüp geri açılınca / öne gelince beklemeden değerlendir (sekmelerin "görünür" durumu
    // pencere olayından kısa süre sonra güncellenir; bu yüzden iki kez bakılır).
    function onWindowWake() {
        setTickRate(false);
        for (const ms of [100, 700]) window.setTimeout(() => { tick().catch(e => logErr('tick hatası', e)); }, ms);
    }
    const WAKE_EVENTS = ['sizemodechange', 'activate', 'focus'];

    let timer = null, slow = false;
    function setTickRate(settled) {
        if (!timer || window.closed || settled === slow) return;
        slow = settled;
        window.clearInterval(timer);
        timer = window.setInterval(() => { tick().catch(e => logErr('tick hatası', e)); }, (settled ? CONFIG.TICK_SETTLED_SECONDS : CONFIG.TICK_SECONDS) * 1000);
        log(settled ? `her şey yerleşti: kontrol ${CONFIG.TICK_SETTLED_SECONDS}sn'de bir` : `kontrol ${CONFIG.TICK_SECONDS}sn'de bire döndü`);
    }
    function start() {
        if (timer) return;
        WAKE_EVENTS.forEach(ev => window.addEventListener(ev, onWindowWake));
        gBrowser.tabContainer.addEventListener('TabSelect', onTabSelect);
        timer = window.setInterval(() => { tick().catch(e => logErr('tick hatası', e)); }, CONFIG.TICK_SECONDS * 1000);
        fileLog('I', [`yüklendi: uyku=${CONFIG.SLEEP_AFTER_SECONDS}s derin=${CONFIG.DEEP_SLEEP_AFTER_SECONDS}s anaGPU=+${CONFIG.MAIN_GPU_TRIM_AFTER_DEEP_SECONDS}s sekmeKırpma=${CONFIG.TAB_TRIM_AFTER_SECONDS}s boşaltma=${CONFIG.DISCARD_AFTER_SECONDS}s günlük=${CONFIG.ENABLE_LOGGING}`]);
    }
    function stop() {
        if (timer) { window.clearInterval(timer); timer = null; slow = false; }
        try { gBrowser.tabContainer.removeEventListener('TabSelect', onTabSelect); } catch (e) {}
        try { WAKE_EVENTS.forEach(ev => window.removeEventListener(ev, onWindowWake)); } catch (e) {}
        // Pencere kapanırken uyuyan sekmeleri çöz
        try { for (const tab of gBrowser.tabs) { const st = state.get(tab); if (st) unfreezeTab(tab, st); } } catch (e) {}
        try { api.lib.close(); } catch (e) {}
        fileLog('I', ['durdu (pencere kapandı)']);
        delete window.TabLifecycle;
    }

    window.addEventListener('unload', stop, { once: true });
    window.TabLifecycle = { CONFIG, tick, state, g, armMainGpu, snapshotAll, quickState, trimPid, queueFlow, sendWait, classify, start, stop };
    start();
})();
