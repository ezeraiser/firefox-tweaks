# Firefox arayüz özelleştirmeleri: tasarım ve süreç

Bu belge, bellek betiklerinin (README) yanında yapılan **arayüz çalışmasını** anlatır: ne istendi, her parça nasıl
çalışıyor, neden öyle yapıldı, ne ölçüldü ve ne **denenmedi**. Hedef, Firefox'u (dikey sekmeler açık, Firefox 159,
Windows 11) Helium'daki kompakt görünüme yaklaştırmak ve uzantı yöneticisi panelini sadeleştirmekti.

Önemli bir ayrım: aşağıda "ölçüldü" yazan her şey geçici bir profilde çalıştırılıp okundu. "Ekranda görüldü" yazanlar
ekran görüntüsüyle bakıldı. Hiçbiri gerçek günlük profilde uzun süre kullanılarak sınanmadı.

## Dosyalar

| Dosya | Ne yapar |
|---|---|
| `profile/chrome/userChrome.css` | Yer imi çubuğunu alta taşır, dikey sekme şeridini sıkılaştırır, adres çubuğunu daraltıp ortalar, alan adı yer tutucusunu çizer |
| `profile/chrome/bookmarks_bottom.uc.js` | Sayfa alanının sol/sağ kenarını ölçüp CSS değişkenlerine yazar; dikey çubuğun altındaki düğmeleri yer imi çubuğuyla hizalar |
| `profile/chrome/urlbar_domain.uc.js` | Adres çubuğu odakta değilken yalnızca ana alan adını gösterir (tıklayınca tam URL) |
| `profile/chrome/ExtensionToggleManager.uc.js` | Yeniden tasarlanan uzantı yöneticisi paneli |
| `profile/chrome/tab_lifecycle.uc.js` | Günlük kapatma düzeltmesi ve ses çalan sekme için kırpma seçenekleri |
| `profile/user.js` | `toolkit.legacyUserProfileCustomizations.stylesheets = true` (userChrome.css'in yüklenmesi için) |
| `docs/ext-manager-mock.html` | Uzantı yöneticisinin önce/sonra mock'u (tarayıcıda açılır, çalışır) |
| `tools/firefox-marionette/shot_popup.ps1` | Açılır pencerenin ekran görüntüsünü, yalnızca test penceresi önde ise alır |

## 1. Yer imi çubuğu altta

**İstek:** Yer imi çubuğu pencerenin altında, dikey çubuğun bittiği yerden başlasın; alt ve üstünde küçük boşluk olsun.

**Nasıl çalışıyor**
- `#PersonalToolbar` `position: fixed` ile alta sabitlenir. Yüksekliği `--bm-h` (28px), alt boşluğu `--bm-gap` (4px).
- Sayfa alanı olan `#tabbrowser-tabbox`, `--bm-total` kadar kısaltılır (alttan `margin`). Dikey çubuk tam yükseklikte kalır,
  yalnızca sayfa alanı kısalır. Çubuk "yalnızca yeni sekmede göster" modunda gizliyse `:has()` ile boşluk bırakılmaz.
- Çubuğun sol/sağ kenarı sabit değildir: dikey çubuk açılıp kapanınca ya da sürüklenince sayfa alanı değişir.
  `bookmarks_bottom.uc.js` bir `ResizeObserver` ile `#tabbrowser-tabbox` kenarlarını ölçüp `--bm-left` / `--bm-right`
  değişkenlerine yazar. CSS çubuğu bu değişkenlerle konumlar.

**Yolda öğrenilenler (hepsi ölçüldü)**
- Bu Firefox sürümünde `#appcontent` yok; sayfa alanı `#tabbrowser-tabbox`. İlk sürüm var olmayan öğeyi arıyordu ve çubuk
  hiç düzgün görünmedi.
- **Görünür ama tıklanmıyordu.** `elementFromPoint` çubuğun ortasında `hbox#browser` döndürdü: araç kutusu (`z-index: 0`)
  `#browser` katmanlarının altında kalıyordu. Çözüm araç kutusuna `z-index: 3` vermek. 3 seçildi çünkü Firefox'un
  genişlemiş dikey çubuğu `4`: genişleyen dikey çubuk yer imi çubuğunu örtmeli, tersi olmamalı.
- **Durum çubuğu (bağlantı URL'si):** `#statuspanel` sayfa alanıyla aynı kutuda ve alttan ona yapışık. Sayfa alanı zaten
  kısaldığı için kendiliğinden çubuğun üstünde çıkar. İlk denemede ona ek bir kaldırma kuralı yazdım, bu URL kutusunu
  pencere altından 36px yerine 72px'e fırlattı. Kural kaldırıldı, dosyada bunun nedeni yorum olarak duruyor.
- **Dikey çubuğun altındaki düğmeler** (daraltılmışken "»", genişlemişken araç düğmeleri) yer imi çubuğunun satırıyla
  aynı hizada değildi. Merkezleri pencere altından ölçüldü: "»" 26px, araç düğmeleri satırı 20px, yer imi çubuğu 18px.
  Düğmeler kenar çubuğunun shadow DOM'unda; `::part()` CSS kuralı etki etmedi (ölçüldü), bu yüzden
  `bookmarks_bottom.uc.js` stili doğrudan shadow köküne `adoptedStyleSheets` ile ekler. Üçü de 18px'e oturdu.

**Yer imi çubuğu gizlenince alttaki boşluğun kalması (hata, düzeltildi):** "Yer imlerini gizle" denince çubuk gizleniyordu ama alttaki boşluk
ve arka plan kalıyordu. Sebep: Firefox çubuğu gizlerken `collapsed` özniteliğini **boş değerle** (`collapsed=""`) yazıyor, kurallarım ise
`:not([collapsed="true"])` arıyordu; boş değer bununla eşleşmediği için kural çubuğu gizliyken de zorla görünür tutuyordu. Kurallar
`:not([collapsed])` (özniteliğin yokluğu) olarak düzeltildi. Doğrulandı: "always" (çubuk 28px, boşluk 36px), "gizle" (çubuk 0px, boşluk
0px, sayfa alanı pencere altına kadar), "yalnızca yeni sekmede göster" (normal sayfada gizli ve boşluk yok, Yeni Sekme sayfasında görünür
ve boşluk var, normal sayfaya dönünce tekrar gizli).

**Üst çubuk otomatik gizleme (`userChrome.css`, sonda ayrı blok):** `#nav-bar` akışta kalır; gizliyken üst kenar boşluğu negatif
(`-(36px - --ah-trigger)`), yani yalnızca `--ah-trigger` (3px) kadar şerit görünür. Fare şeride gelince, adres çubuğuna odaklanınca (Ctrl+L)
ya da bir menü/panel açıkken boşluk 0 olur ve **sayfa çubuk yüksekliği kadar aşağı itilir** (üstüne binmez). Kapanış `--ah-close-delay`
(varsayılan 1s) kadar gecikmeyle olur, açılış gecikmesizdir. Yer imi çubuğu `#navigator-toolbox` içinde alta sabitli olduğundan toolbox'ın
kendisi gizlenmez, yalnızca `#nav-bar` hareket eder.
**Üç tuzak (hepsi ölçülerek bulundu):**
1. `#navigator-toolbox` varsayılan olarak `#browser`'ın ALTINDA kalır; z-index 3 yalnızca yer imleri görünürken uygulanıyordu. Gizliyken şerit
   fareyi hiç almıyordu (`elementsFromPoint(300,1)` -> `browser`). Toolbox'a her durumda `z-index:3` verildi (genişlemiş dikey çubuğun 4'ünün altında).
2. `:hover` kilidiyle yapılan test (`InspectorUtils.addPseudoClassLock`) hit-testing'i atlar; bu yüzden ilk sürüm "çalışıyor" göründü ama gerçek
   fare gelmiyordu. Doğrulama `elementsFromPoint` ile yapılmalı.
3. Firefox'un kendi `#nav-bar` kuralı `transition: opacity .2s` verir ve bizimkini ezer (hesaplanan özellik `opacity` çıkar, kapanış anında olur,
   gecikme işlemez). `transition` ve `transition-delay` bu yüzden `!important`.
**Denenmedi:** gerçek fare imleci, açık bir menüyle fare çıkınca davranış, tam ekran. **Bilinen sınır:** pencere düğmeleri ve sürükleme
alanı da nav-bar içinde olduğundan gizliyken üst şerit dışında erişilemez; açılıp kapanırken sayfa 33px kayar. Kapatmak için bloğun tamamı silinir.

## 5. Bellek betiği değişiklikleri (`tab_lifecycle.uc.js`)

- **Yerleşince seyrek kontrol (`TICK_SETTLED_SECONDS`, 60):** Ana döngü (`TICK_SECONDS`, 1 sn) hiç durmuyordu. Ölçüm: tick başına maliyet
  ~1-2 ms (~%0,3 CPU), yani asıl sorun değil, ama iş kalmayınca boşa çalışıyordu. Hiçbir sayfa görünür değilken ve tüm sekmeler derin uykudayken
  (medya sekmeleri sayılmaz, boşaltılmışlar atlanır) aralık 60 sn'ye çıkar; pencere olayı (`sizemodechange/activate/focus`), sekme seçimi ya da
  yerleşmemiş bir sekme görülünce hemen 1 sn'ye döner. `0` = kapalı. Bedel: boşta tekrar kırpmalar (dakika cinsinden) en çok 60 sn geç.
  Küçültme -> yerleşme -> geri açma akışı 5 sn'lik denemeyle doğrulandı. **Düzenli 10 sn'lik CPU sıçramasının nedeni bu betik çıkmadı**
  (betik kapalıyken de görülen patlamalar Firefox'a ait; betiğe ait olanlar yalnızca sekmeler arka plana düştükten sonraki ilk dakikada).
- **Günlük kapalıyken dosyaya yazma:** `ENABLE_LOGGING: false` iken `memlog.txt`'ye yine satır düşüyordu (`yüklendi`,
  `durdu` ve hata kayıtları bayrağı atlıyordu). Kontrol günlük işlevinin kendisine taşındı; kapalıyken hiçbir şey
  yazılmaz, hatalar yalnızca Tarayıcı Konsolu'na gider.
- **Ses çalan sekmenin süreci:** Eskiden hiç kırpılmıyordu, ama müzik/video açıkken bellek en çok o süreçte kalıyordu.
  `TRIM_MEDIA_TAB_AFTER_HIDDEN_SECONDS`: Firefox arka plana gidince (hiçbir sayfa görünmüyor) bu kadar sonra bir kez;
  öne gelince sayaç sıfırlanır. `TRIM_MEDIA_TAB_EVERY_SECONDS`: arka planda kalırken tekrar aralığı. `0` yapınca
  özellik kapanır. **Gerçek ses/video ile denenmedi**, ses durumu bir öznitelikle benzetilerek sınandı.

### Süreç sınıfı başına akış (GC / CC / Minimize / Trim)

Önceki sürümde kırpma kararları tetikleyicilerin içine dağılmıştı (sekme kırpma, ana süreç+GPU, genel küçültme, medya) ve
`TRIM_HELPER_PROCESSES` / `TRIM_EXTENSION_PROCESS` gibi birkaç genel bayrak vardı. GC, CC ve minimize ise tek bir blok
olarak ("Reclaim") çalışıyordu. Şimdi hepsi **tek bir akış motorundan** geçer:

1. **Süreç sınıfları.** Her süreç bir sınıfa girer: `main`, `tab_background` (pasif sekme), `tab_media`, `tab_busy`
   (yükleniyor), `tab_active` (görünen sekme ya da onunla süreç paylaşan), `gpu`, `rdd`, `socket`, `utility`, `extension`,
   `spare` (sekmesiz boşta süreç), `other`. Süreç birden çok sekme barındırıyorsa en korumalı olan kazanır
   (görünen > yüklenen > medya > gizli). Sınıflar her aşamadan önce yeniden belirlenir.
2. **Dört iş, sınıf başına ayrı bayrak.** `PROCESS_ACTIONS[sınıf] = { gc, cc, minimize, trim }`. Uygulanabilirlik
   teknik olarak sınırlıdır: `gc` ve `cc` yalnızca `main` (doğrudan) ve sekme sınıflarında (o sürece mesajla) vardır;
   `minimize` sekme sınıflarında hedeflidir, diğer sınıflarda yalnızca **yayın** (memory-pressure bildirimi) iledir ve
   tek bir sürece yöneltilemez; `trim` her sınıfta süreç kimliğiyle hedefli yapılır. Uygulanamayan kombinasyon tabloda
   `true` olsa da yok sayılır.
3. **Yayın kuralı.** Yayın herkese gittiği için, o anda çalışan herhangi bir sınıfın `minimize` değeri `false` ise
   yayın gönderilmez (günlüğe yazılır). Örnek: ses çalarken `tab_media.minimize=false` olduğu için yayın atlanır.
4. **Tek sıra.** Tetikleyiciler yalnızca hangi işlerin yapılabileceğini seçer; sırayı her zaman `FLOW_ORDER`
   (varsayılan `gc, cc, minimize, trim`) belirler, listede olmayan iş hiç çalışmaz.
5. **Tek kuyruk, onaylı aşamalar.** Akışlar tüm pencerelerde tek kuyrukta sırayla çalışır, iç içe geçmez. İçerik süreci
   her aşamayı bitirince onay gönderir; bir sonraki aşama onay (ya da zaman aşımı) sonrası `FLOW_STAGE_GAP_MS` boşlukla
   başlar. Her aşamadan önce sınıflar yeniden belirlenir: kullanıcı bir sekmeye döndüyse o sürece dokunulmaz, "hiçbir
   sayfa görünmüyor" koşulu bozulduysa genel akış durur. Sayfa görünürken sekme dışı sınıflara (ana süreç, GPU ...)
   hiç dokunulmaz.
6. **Diğer ayarlar.** `KEEP_GPU_WHILE_PIP_OR_SHARING` (PiP/paylaşım varken GPU'ya iş yok), `ACTIVE_FLOW_EVERY_SECONDS`
   (aktif sekme sürecine isteğe bağlı periyodik akış, varsayılan kapalı). `TRIM_HELPER_PROCESSES` ve
   `TRIM_EXTENSION_PROCESS` kaldırıldı; yerlerini tablodaki `socket/rdd/utility/gpu/spare/other` ve `extension` satırları aldı.

**Kullanıcı boşta kırpması (`ACTIVE_IDLE_SECONDS`, varsayılan 17):** Ana süreç ve GPU yalnızca sayfalar görünmüyorken (pencere küçük/örtülü)
kırpılıyordu. Kullanırken de belleği kırpmak için sekme geçişi gibi meşgul anlar yerine **kullanıcı hareketsizken** kırpılır: pencere
görünür, ama işletim sistemi düzeyinde boşta süresi (`nsIUserIdleService`) ≥ 17 sn. Yalnızca kırpma (GC/CC/minimize yok: yayın aktif sekmeyi
de etkilerdi) ve yalnızca `main`/`gpu` için; `PROCESS_ACTIONS`'ta o sınıfın `trim` bayrağı kapalıysa atlanır. Boşta oturumu başına bir kez,
hareket gelince oturum biter; hâlâ boştaysa `ACTIVE_IDLE_REPEAT_MINUTES` (5, 0 = tekrar yok) sonra yeniden. Akış her aşamadan önce hâlâ
hareketsiz mi diye bakar, hareket geldiyse durur. Atlanır: ses çalıyorsa, PiP/ekran paylaşımı varsa (GPU), görünür sekme yükleniyorsa.
Sessiz çalan GÖRÜNÜR bir video ayırt edilemez: böyle kullanıyorsanız `gpu.trim`'i kapatın. **Ölçüldü:** ana süreç çalışma kümesi 311 → 21 MB,
GPU 229 → 0 MB; sonra ana süreç kullanımla ~80 MB'a döndü (kazanç geçici). **Denenmedi:** hareket sonrası ilk tıklamadaki gecikme
(gerçek kullanımda hissedilir mi), uzun süreli kullanım.

**Denendi (geçici profil, yerel HTTP sitesiyle, süreç sınıfları gerçek):** sınıflandırma (13 süreç: ana, GPU, rdd, ağ,
yardımcı, uzantı, 3 boşta, 1 aktif, 3 pasif); pasif süreçte dört işin `FLOW_ORDER` sırasıyla çalışması; aktif sürecin
korunması; bir bayrak kapatılınca o işin atlanması; sıra değişince ve işler listeden çıkarılınca davranış; iki akışın iç
içe geçmemesi; sayfa görünürken ana/yardımcı sınıflara dokunulmaması; pencere küçükken tüm sınıfların işlenmesi
(`gc`/`cc` ana + 4 pasif, `minimize` 13, `trim` 10); ses durumu (öznitelikle benzetildi) `tab_media` sınıfına alınıp
yayının atlanması; PiP durumunda GPU'nun atlanması; akış sürerken pencere öne gelince akışın durması; gerçek
zamanlayıcı zinciri (uyku, derin uyku, sekme kırpma) ve aktif sekmeyle süreç paylaşılınca kırpmanın ertelenmesi; onayların
gerçekten gelmesi (3 aşama 252 ms). **Denenmedi:** gerçek ses/video ve gerçek PiP, `spare` süreçlerinin kırpılması
(testte `minimize` sayıldı ama `trim` sayısına girmedi, süreç o arada değişmiş olabilir), uzun süreli günlük kullanım,
bellek üzerindeki etkinin ölçümü.

## 6. Test yöntemi

- Geçici bir Firefox profili açılır (`tools/firefox-marionette/launch.ps1`); autoconfig `*.uc.js` dosyalarını yükler.
- Bu Firefox sürümünde Marionette ayrıcalıklı betik çalıştırmayı reddetti. Onun yerine küçük bir yoklama betiği
  (`uc.js`) pencere içinde açılışta çalışıp ölçtüğü değerleri `IOUtils` ile bir JSON dosyasına yazdı
  (`getBoundingClientRect`, `elementFromPoint`, `getComputedStyle`, açılır pencere durumları).
- Uzantı yöneticisi için 4 örnek geçici uzantı (`AddonManager.installTemporaryAddon`) kuruldu; biri araç çubuğuna
  sabitlenip ayar düğmesi akışı denendi.
- Ekran görüntüsü yalnızca test penceresi önde ise ve yakalama alanı o pencerenin içindeyse alınır
  (`shot_popup.ps1`). Bir kez bu koruma olmadan alınan görüntüde başka bir uygulama (toplantı penceresi) çıkmıştı;
  görüntü silindi ve koruma eklendi.

## 7. Araştırma ve bulgular

**Profil ayarlarının yavaşlık analizi** (kod okuyarak; etkileri ölçülmedi). En güçlü şüpheliler:
`dom.ipc.processCount`/`.webIsolated` = 1 (varsayılan 8/4), bfcache kapalı (`max_total_viewers` = 0), disk önbelleği kapalı,
spekülatif bağlantı ve prefetch kapalı (`speculative-parallel-limit` = 0, DNS prefetch kapalı), `security.OCSP.require`,
`privacy.fingerprintingProtection`, `gfx.webrender.max-partial-present-rects` = 0, `image.mem.surfacecache.max_size_kb`
= 100 MB, `gc_high_frequency_time_limit_ms` = 350. Bunlardan GPU ile ilgili üçünü (kısmi yeniden çizim, compositor
güncelleme alanları, `layers.acceleration.force-enabled`) varsayılana alıp GPU kullanımına bakmak değişiklik göstermedi.

**Video sırasında GPU kullanımı (Görev Yöneticisi, "Video Processing"):** Firefox %4,0, Helium %1,6, ama videolar
1080p ve 720p'ydi; çözünürlük ve PiP boyutu farkı karşılaştırmayı geçersiz kılar. Araştırma:
[Bugzilla 1721702](https://bugzilla.mozilla.org/show_bug.cgi?id=1721702) (Firefox'un video sırasında Chrome'dan daha çok GPU
kullandığı, hâlâ açık, kök neden doğrulanmamış), [Bugzilla 1569767](https://bugzilla.mozilla.org/show_bug.cgi?id=1569767)
(Intel'de YouTube GPU kullanımı, DirectComposition ile büyük ölçüde düzeldi),
[Mozilla Connect](https://connect.mozilla.org/t5/discussions/gpu-usage-fix-for-youtube-playback-on-windows-11/td-p/20754)
(Windows 11 animasyon efektleri kapatılınca GPU düşmüş; sayfa açılamadı, yalnızca arama özetinden okundu, kanıt zayıf),
süper çözünürlük ayarları
([1](https://connect.mozilla.org/t5/ideas/add-firefox-support-for-rtx-video-super-resolution/idi-p/26995/page/5),
[2](https://forums.guru3d.com/threads/firefox-now-fully-supports-rtx-hdr-rtx-video-super-resolution-%E2%80%9Cvsr%E2%80%9D.452333/))
NVIDIA odaklı. Bu makinede Firefox WebRender ve DirectComposition'ı kullanılabilir, kara listede değil olarak görüyor.
**Sonuç: net bir neden bulunamadı.** Önerilen ölçüm: aynı kalite, aynı codec, aynı PiP boyutu, Windows animasyon efektleri
açık/kapalı.

**Picture-in-Picture her seferinde yeniden boyutlanıyor:** Firefox PiP boyutunu `xulstore.json` içinde saklıyor
(`picture-in-picture`: sol/üst/genişlik/yükseklik). Bu profilde kayıtlı değer 1466×824 gibi büyüktü; Firefox PiP'yi önce
varsayılan (ekranın en çok üçte biri genişlik, dörtte biri yükseklik) boyutta açıp kayıtlı boyuta/videonun oranına
ayarlıyor. Çözüm: istenen boyuta getirip kapatmak ya da Firefox kapalıyken o kaydı silmek. **Uygulanmadı.**

**Bellek kırpma ve disk:** Çalışma kümesini boşaltmak sayfaları RAM'den çıkarır; temiz sayfalar "standby", kirli sayfalar
"modified" listesine gider ve pagefile'a hemen değil, Windows kendi zamanında yazar. Geri dönüşte yumuşak hata çoğu zaman
diske gitmez; sayfa başka iş için kullanıldıysa sert hata (disk okuma) olur. Ölçmek için:
`typeperf "\Memory\Pages Output/sec" "\Memory\Pages Input/sec" -si 2`.

**YouTube'da kaldığı yerden devam etmemesi:** Sebep bulunmadı. Kapanışta çerez silinmiyor, YouTube sekmeleri boşaltılmıyor.
Aday nedenler: Google hesabına giriş ve izleme geçmişi, uBlock/içerik engelleme, aynı sekmenin yenilenmesi ile yeni sekme farkı.

## 8. Kurulum ve geri alma

1. README'deki kurulumu yapın (autoconfig dosyaları, `user.js`, `chrome\*.uc.js`).
2. `userChrome.css` ve yeni `*.uc.js` dosyalarını profilin `chrome\` klasörüne kopyalayın; Firefox'u yeniden başlatın.
3. Tek bir parçayı kapatmak: ilgili dosyayı `chrome\` klasöründen çıkarın.
   - Yer imi çubuğu altta: `userChrome.css`'in ilgili bölümünü silin (ya da dosyayı çıkarın), `bookmarks_bottom.uc.js`'i çıkarın.
   - Alan adı gösterimi: `urlbar_domain.uc.js`'i çıkarın (CSS tek başına bir şey değiştirmez, `data-host` olmadan çalışmaz).
4. Ayarlar (`--bm-*`, `--vt-*`, `--urlbar-*`) `userChrome.css`'in başındadır; sayı değiştirip yeniden başlatmak yeterli.

## 9. Ana profildeki ayarların kaydı (`about:config`)

`about:config` değişiklikleri depodaki dosyalarda değil, profilin `prefs.js` dosyasında tutulur; bu yüzden aşağıdaki liste
canlı profilden (`Ezer1`) okunan bir **anlık görüntüdür**. `prefs.js` depoya kopyalanmadı: içinde cihaz/istemci
kimlikleri, geliştirici araçları geçmişi ve oturumla ilgili başka veriler var. Bu ayarlar `user.js`'e de yazılmadı, çünkü
`user.js` her açılışta değeri sabitler ve `about:config`'ten sıfırlamayı etkisiz kılar.

**Profilde şu an kayıtlı olan ve varsayılandan farklı performans/bellek ayarları**

| Ayar | Değer | Varsayılan (bu kurulumda okunan ya da bilinen) |
|---|---|---|
| `browser.cache.disk.enable` | false | true |
| `browser.cache.memory.capacity` | 128000 | otomatik |
| `browser.sessionhistory.max_total_viewers` | 0 | -1 |
| `browser.sessionhistory.max_entries` | 5 | 50 |
| `browser.places.speculativeConnect.enabled` | false | true |
| `browser.startup.preXulSkeletonUI` | false | true |
| `dom.ipc.processCount` | 1 | 8 |
| `dom.ipc.processPrelaunch.fission.number` | 1 | - |
| `network.http.speculative-parallel-limit` | 0 | 20 |
| `network.prefetch-next` / `network.dns.disablePrefetch` | false / true | true / false |
| `network.modulepreload`, `network.stricttransportsecurity.preloadlist` | false | true |
| `network.http.max-connections` | 300 | 900 |
| `security.OCSP.require` | true | false |
| `security.tls.enable_0rtt_data` | false | true |
| `image.mem.surfacecache.max_size_kb` / `image.mem.animated.decode_on_demand.threshold_kb` | 102400 / 4096 | çok daha büyük |
| `media.memory_cache_max_size` | 65536 | - |
| `gfx.webrender.max-shared-surface-size` | 1024 | 2048 (aynı zamanda `user.js`'te) |
| `gfx.canvas.remote.use-canvas-translator-event` | false | - |
| `privacy.spoof_english` | 1 | 0 |
| `sidebar.animation.expand-on-hover.duration-ms` / `.delay-duration-ms` | 100 / 100 | 400 / 200 |
| `sidebar.visibility`, `sidebar.verticalTabs` | expand-on-hover, true | always-show, false |
| `toolkit.legacyUserProfileCustomizations.stylesheets` / `.userChrome.js.enabled` | true / true | false |

**Bu çalışma sırasında `prefs.js`'te vardı, artık yok (varsayılana döndürüldü):**
`privacy.fingerprintingProtection`, `gfx.webrender.max-partial-present-rects`, `gfx.webrender.compositor.max-update-rects`,
`layers.acceleration.force-enabled`, `javascript.options.mem.gc_high_frequency_time_limit_ms` (350) ve
`dom.ipc.processCount.webIsolated` (1). Bunlardan ilk dördü GPU/parmak izi şüphelerini elemek için sıfırlandı; sonuç
değişmedi (bkz. bölüm 7). Son ikisinin neden sıfırlandığına dair bir not yok; yalnızca dosyada görünmedikleri için buraya
yazıldı.

**Ortam değişkeni (Windows kullanıcı düzeyi, `about:config` değil)**

Crash reporter'ı ve `crashhelper` sürecini başlatmamak için (canlı profilde denendi: değişkenden sonra `crashhelper` hiç başlamıyor), Firefox'u tamamen kapatıp PowerShell'de bir kez çalıştırın:

```powershell
[Environment]::SetEnvironmentVariable("MOZ_CRASHREPORTER_DISABLE", "1", "User")
```

Bir pref değildir, `user.js`/uc.js ile verilemez: Firefox açılırken okunur, betikler ise sonra çalışır. Tüm Mozilla uygulamalarını
(örn. Thunderbird) etkiler; çökmelerde dump/rapor oluşmaz. Geri almak için:
`[Environment]::SetEnvironmentVariable("MOZ_CRASHREPORTER_DISABLE", $null, "User")`.

Tam bir geri yükleme için profili yedeklemek gerekir; bu liste yalnızca neyin değiştiğini hatırlatır.

## 10. Sağ tık çevirisi: DeepL ya da Google (`translate.uc.js`)

**İstek:** Firefox'un yerleşik çevirisi (yerel modeller) beğenilmedi; DeepL kullanılsın. Resmi DeepL uzantısı sitelerde
bozulma yapıyordu (bir paragrafa çift tıklayınca sayfa başa atlıyordu). Sonra servis DeepL ya da Google arasında
dinamik seçilebilsin istendi.

**Neden yerleşik çeviri değil:** Firefox'un yerleşik çevirisi tamamen cihazda çalışır; `browser.translations.*` ayarlarında
servis adresi ya da anahtar seçeneği yoktur.

**Tasarım**
- Sağ tık menüsünde dört madde, "Denetle" grubunun sonunda, kendi ayracı olmadan: "Seçili metni çevir", "Sayfayı çevir",
  "Orijinal sayfayı göster" ve "Çeviri servisi" alt menüsü (DeepL / Google, radyo). Etiketler seçili servisin adını taşır
  (örn. "Sayfayı Google ile çevir"); anahtar yoksa "(web)" eklenir, çünkü servisin web sitesine gidilecektir.
- **Servisler birer modül:** her biri `translate(metinler)`, istek sınırları (DeepL en çok 45 metin / 60 bin karakter, Google
  100 metin / 15 bin karakter), anahtarsız yedekler ve hata iletileri tanımlar. DeepL: `POST /v2/translate`, başlık
  `Authorization: DeepL-Auth-Key`. Google: Cloud Translation Basic (v2) `POST /language/translate/v2`, başlık `X-Goog-Api-Key`,
  `format: text` (HTML kaçışı yok). Hedef dil DeepL kodu biçiminde tutulur (TR, EN-US, ZH-HANS ...) ve Google'a çevrilir
  (EN-US -> en, ZH-HANS -> zh-CN).
- **Sayfaya olay dinleyicisi eklenmez.** Çerçeve betiği yalnızca mesajla çalışır; tek istisna gezinmeyi anlamak için `pagehide`
  gözlemidir. Sayfa çevirisi görünür ve çevrilebilir metin düğümlerini (`script/style/code/pre/textarea`, `translate="no"`,
  `.notranslate`, gizli öğeler, yalnızca rakam/noktalama olanlar hariç) toplar, servis sınırlarına uygun istekler hâlinde gönderir
  ve sonucu aynı düğümlere yazar. Düğümlerin kendisi korunur, yalnızca metin değişir; sayfanın dinleyicileri ve düzeni bozulmaz.
  Orijinal metin saklanır, "Orijinal sayfayı göster" geri koyar.
- Seçili metin çevirisi küçük bir panelde, **seçimin hemen altında** (altı dar ise üstünde) açılır; başlıkta servis adı ve hedef dil,
  kopyala ve kapat simgeleri. Konum, seçimin görünür alandaki satır kutularından alınır; metin kutusu içindeki seçimde konum
  alınamaz, panel üstte ortada açılır.
- **Ayarlar** (`about:config` > `extensions.translate-lite.*`): `provider` (deepl | google), `targetLang` (varsayılan TR),
  `deeplApiKey` (`:fx` ile bitiyorsa ücretsiz plan), `googleApiKey`, `deeplEndpoint` / `googleEndpoint` (boşsa resmi adres),
  `maxChars` (sayfa başına karakter sınırı, kota koruması, varsayılan 40000). Anahtarlar profilin `prefs.js` dosyasında kalır,
  **depoya girmez**. Önceki sürümün `extensions.deepl-lite.*` değerleri ilk çalışmada bir kez taşınır.
- **Kota dolunca otomatik geçiş** (`autoFallback`, varsayılan açık): seçili servisin kotası dolarsa (DeepL 456; Google 429 ya da kota/oran
  sınırı hatası) öbür servise **kalıcı** geçilir ve istek orada tekrarlanır; seçimi istediğiniz zaman "Çeviri servisi" menüsünden geri alırsınız.
  Öbür serviste anahtar yoksa onun web yolu kullanılır. Bu geçiş istek başına en çok bir kez yapılır (döngü yok).
- **Web paneli** (`webMode: panel`; DeepL anahtarsız yolu, ya da Google engel görünce): anahtar yokken seçili metin için servisin kendi sitesi, seçimin
  yanında küçük bir panelde (gömülü tarayıcı) gösterilir. Sayfa içeriği okunmaz ya da kazınmaz. Paneldeki sayfaya yalnızca üst kısmı
  gizleyen bir stil eklenir (logo, menüler, giriş, çeviri türü sekmeleri) ve ana içerik ölçülerek yukarı çekilir; başka sekmelerde ve
  servisin kendi sitesinde hiçbir şey değişmez. Bu en iyi çabadır: servislerin sayfa yapısı değişirse üst kısım görünür kalabilir.
  Panel kapanınca tarayıcı atılır. "Sekmede aç" simgesi aynı adresi sekmede açar.
- **Anahtar yoksa (resmi siteler):** seçili metin için DeepL'in web çevirmeni ya da Google Translate sitesi, metin hazır dolu
  olarak yeni sekmede açılır. Sayfa çevirisi için Google'ın kendi web çeviri hizmeti (`translate.goog`) kullanılır: sayfa o
  adreste yeniden açılır, oturum gerektiren sayfalarda çalışmaz. DeepL'in anahtarsız sayfa yolu yoktur.

**Gizli web motoru (Google, anahtarsız, `webMode: auto` varsayılan):** Seçili metin için Google Translate SİTESİ ekran dışı, gizli bir
tarayıcıda (-10000px) normal adresiyle (metin hazır dolu) açılır, çevirinin çıktığı alan sayfadan okunur ve sonuç kendi panelimizde
(başlık "Google (web) · otomatik -> TR") gösterilir. Yani site kullanılır, yalnızca ekranda gösterilmez. Kurallar:
- Her seçimde tek istek, sırayla (tek tarayıcı); aynı tarayıcı yeniden kullanılır (ilk çeviri ~3,5 sn, sonrakiler ~2,5 sn); boşta 30 sn
  sonra tarayıcı atılır (içerik süreci bellek tutmasın). Metin 4000 karakterle sınırlı (adres uzunluğu).
- Sayfa yapısına bağlıdır: çeviri `span.ryNqvb` öğelerinin kapsayıcısından (`span.HwtZe`) okunur. Google bu yapıyı değiştirirse
  okuma boş döner, 18 sn sonra zaman aşımı olur ve görünür panele düşülür.
- **Engel aşılmaya çalışılmaz.** Sayfa `google.com/sorry` ya da reCAPTCHA gösterirse gizli motor bırakılır, görünür panel açılır
  (doğrulamayı kullanıcı kendisi geçebilir) ve 10 dakika boyunca gizli motor denenmez.
- Yalnızca seçili metin içindir. Sayfa çevirisi (çok sayıda parça) bu yolla yapılmaz.
- **Önemli:** Bu, sitenin otomatik okunmasıdır (API değil). Google'ın hizmet koşulları otomatik erişimi kısıtlayabilir; bu yolun
  uygunluğu ve sürekliliği garanti değildir (denemelerde `translate.google.com/m` adresi doğrulama sayfasına düştü, bu yüzden
  kullanılmadı). Koşullardan ve kesintiden bağımsız olmak için resmi API anahtarı (`googleApiKey`) kullanılmalıdır.
- `webMode: hidden` yalnızca gizli motoru kullanır (hata olursa panele düşmez); `panel` siteyi görünür panelde gösterir; `tab` yeni sekme.
  DeepL için gizli motor yoktur (siteyi görünür panelde gösterir).

**Anahtarsız (resmi API'siz) çeviri neden yok:** Resmi DeepL uzantısı DeepL'in kendi web arka ucunu kullanır; Google için de
belgesiz, ücretsiz bir uç nokta (`client=gtx`) yaygın olarak kullanılır. Üçüncü taraf bir betiğin bu belgesiz uç noktalara
bağlanması servislerin kullanım koşullarının dışındadır, hız sınırına ve IP engeline takılır ve her an bozulabilir. Bu yüzden
resmi API'ler ve servislerin kendi web siteleri seçildi. DeepL API anahtarı ücretsiz çeviri hesabından ayrı bir plandır
(DeepL API Free); Google Cloud Translation anahtarı için bir Google Cloud projesi ve faturalandırma hesabı gerekir (aylık
ücretsiz kota var). Plan ve kayıt koşullarını servislerin sitelerinden kontrol edin.

**Denendi** (gerçek servislere değil, yerel sahte DeepL ve Google sunucularına; yani gerçek servislere istek ATILMADI):
iki servisle sayfa çevirisi (yalnızca görünür/çevrilebilir metinler gitti, 6 parça), sayfa yapısı korunarak yazıldı ve
"orijinali göster" birebir geri verdi; servis değişince doğru uç noktaya ve doğru dil koduna (EN-US -> en) gidildi; seçili
metin paneli servis adını ve hedef dili gösterdi; yanlış anahtarda hata iletisi; anahtarsız yedekler (DeepL web adresi,
Google Translate sitesi, translate.goog adresinin biçimi); menü etiketleri, radyo işareti ve menü sırası. **Denenmedi:**
gerçek DeepL ve Google yanıtları ve kota davranışı, `translate.goog` ile gerçek sayfa açılması, tek sayfalı uygulamalar
ve çok büyük sayfalar.

**Bilinen sınırlar:** Sayfa çevirisi tek seferliktir; sonradan gelen içerik çevrilmez. Kalın/bağlantı gibi satır içi
öğelerle bölünmüş cümleler parça parça çevrilir, servis cümlenin tamamını görmediği için kalite düşebilir. Düğümleri
koruyup bağlamı artırmak mümkün ama henüz yapılmadı.
