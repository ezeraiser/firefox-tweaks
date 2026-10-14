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

## 2. Dikey sekme şeridi: dar ve sıkı

Daraltılmış şerit genişliği = `--vt-box + 2 × --vt-inline`; sekme satırı yüksekliği = `5px + --vt-box + 2 × --vt-block`.
Firefox varsayılanı şerit 50px, satır 41px. `--vt-box: 28px` iken ölçüm 42px / 33px; dosyadaki güncel değer 26px
(40px / 31px). Araç çubuğu yüksekliği (nav-bar) değişmez. Sıklığı değiştirmek için `userChrome.css` başındaki
üç sayı (`--vt-box`, `--vt-inline`, `--vt-block`) yeterli. Bu değişkenler yatay sekmeleri de etkiler; dikey sekme
kullanılmadığı durum için ayrı bir koruma konmadı.

## 3. Adres çubuğu

**Boyut:** Genişlik `--urlbar-w: 37vw` (alt sınır `--urlbar-min-w: 20vw`), `margin-inline: auto` ile ortalanır.
Yükseklik taban yüksekliğe (`--urlbar-base`, 28px) oranla büyür (`--urlbar-extra-ratio: 0.143`, yaklaşık +4px). Çubuğun
alt/üst boşluğu (Firefox'un 4px'i) büyüyen yüksekliğin yarısı kadar azalır, böylece araç çubuğunun toplam yüksekliği
değişmez. Önceki bir sürümde yalnızca yüksekliği artırmıştım, araç çubuğu da kalınlaşmıştı; istenen şey boşluğu
azaltmaktı. Her şey piksel yerine pencere ya da taban yüksekliğe oranlıdır.

**Yalnızca ana alan adı:**
- Firefox'ta hazır ayar yok (`trimURLs` yalnızca `http://` ve `www.` kısmını kırpar).
- `urlbar_domain.uc.js` konum değişince ana alan adını (`www.` olmadan) `data-host` özniteliği olarak yazar;
  `userChrome.css` bunu `::after` ile ortalı çizer. Adres çubuğunun değerine hiç dokunulmaz. Odaklanınca (tıklayınca) gerçek
  URL görünür.
- **Hata ve ders:** Gerçek metni `color: transparent` yapmak yetmedi. Firefox alt alan adını ve yolu (`gemini.` ve
  `/app?hl=tr`) ayrı bir "ikincil seçim" rengiyle boyuyor, o renk saydam olmuyor ve ortadaki alan adının iki yanında
  hayalet metin kalıyordu. `opacity: 0` tüm boyamayı gizliyor. Öznitelik de `.urlbar-input-container` öğesine yazılmalı
  (`attr()` `::after`'ın sahibinden okur).
- `about:` sayfalarında sayfa adı gösterilir (`about:config`; `#bölüm` gizli). `about:blank/newtab/home/privatebrowsing`
  ve `file:`, `moz-extension:` gibi şemalar olduğu gibi kalır.
- Ölçüldü: öznitelikler ve odak durumları. **Denenmedi:** arama sonuç sayfalarında (aranan kelime gizlenir) davranış,
  uzun alan adının düğmelerle çakışması.

## 4. Uzantı yöneticisi paneli

`docs/ext-manager-mock.html` mevcut paneli (soldaki) ve kompakt öneriyi (sağdaki, çalışır) yan yana gösterir.

**Tasarım kararları (onaylanan):** 300px panel; pencereler ve sağ tık menüsü aynı dilde; bildirim panelin içinde.

| Önce | Sonra |
|---|---|
| Gradient başlık, "Extensions" etiketi, yuvarlak arama + sıralama listesi | Tek satır: arama kutusu + üç simge (tümünü aç/kapat, sırala, diğer işlemler) |
| Satırda sürükleme tutacağı, büyük anahtar, sürüm, AÇIK/KAPALI etiketi | 32px satır: uzantı simgesi, ad, küçük anahtar; sürükleme ve eylemler yalnızca üstüne gelince |
| Altta iki renkli düğme satırı, emojiler | Alt satırda yalnızca "3 / 5 etkin" sayacı; işlemler menülerde |
| Modal pencerelerde gradient ve emoji | Firefox panel rengiyle sade diyalog; Esc ve dışına tıklama kapatır |
| Sağ altta gradient bildirim kutusu | Panelin/diyaloğun içinde küçük satır; hiçbiri açık değilse altta küçük bir satır |

**Uygulama notları**
- Mantık (alan adı kuralları, ayar saklama, tarayıcı entegrasyonu, uzantı ayarını açma zinciri) korundu; yalnızca
  arayüz yeniden yazıldı. Boyut büyük ölçüde değişmedi çünkü gömülü görseller zaten küçüktü (toplam 728 bayt); ölü kod,
  `console.log` satırları ve yorumlar kısaltıldı (52 KB'tan yaklaşık 48 KB'a).
- Stiller tek bir `<style>`; renkler Firefox'un panel ve giriş alanı değişkenlerinden türer, açık/koyu tema kendiliğinden
  uyar. Giriş alanları Firefox'un kendi `--input-*` ve odak değişkenlerini kullanır.
- Araç çubuğu düğmesinin simgesi Firefox'un kendi Uzantılar simgesi (`chrome://mozapps/skin/extensions/extension.svg`).
- Sırala ve Diğer işlemler Firefox'un yerel `menupopup`'ları (panelin dışına taşabilir).
- **Sabitlenmiş uzantının ayar düğmesi:** Uzantının kendi açılır penceresi bizim panelin altında/üstünde kalıyordu.
  Ölçüldü: ikisi aynı anda açık. İki ayrı açılır pencerenin sırasını z-index belirlemez; çözüm, ayarı açmadan önce kendi
  panelimizi kapatmak.

**Denenmedi:** gerçek profildeki uzantılarla görünüm, sürükle-bırak ile gerçek sıra değişimi, `title` tooltip'lerinin
panelde çıktığı, son iki değişikliğin (simge, arama kutusu kenarlığı) ekran görüntüsü.

## 5. Bellek betiği değişiklikleri (`tab_lifecycle.uc.js`)

- **Günlük kapalıyken dosyaya yazma:** `ENABLE_LOGGING: false` iken `memlog.txt`'ye yine satır düşüyordu (`yüklendi`,
  `durdu` ve hata kayıtları bayrağı atlıyordu). Kontrol günlük işlevinin kendisine taşındı; kapalıyken hiçbir şey
  yazılmaz, hatalar yalnızca Tarayıcı Konsolu'na gider.
- **Ses çalan sekmenin süreci:** Eskiden hiç kırpılmıyordu, ama müzik/video açıkken bellek en çok o süreçte kalıyordu.
  `TRIM_MEDIA_TAB_AFTER_HIDDEN_SECONDS` (10): Firefox arka plana gidince (hiçbir sayfa görünmüyor) bu kadar sonra bir kez;
  öne gelince sayaç sıfırlanır. `TRIM_MEDIA_TAB_EVERY_SECONDS` (60): arka planda kalırken tekrar aralığı. `0` yapınca
  özellik kapanır. **Gerçek ses/video ile denenmedi**, yalnızca söz dizimi ve mantık kontrol edildi.

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
