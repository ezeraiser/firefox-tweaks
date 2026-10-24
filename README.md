# Firefox-Tweaks

Firefox'u fork'lamadan (profildeki userChrome betikleri + birkaç ayarla) bellek kullanımını azaltmak için
yaptığımız her şey: çalışan betikler, ayarlar, yükleyici, ölçüm araçları ve ayrıntılı rapor.
Bu klasör Helium (Chromium) derlemesinden **bağımsızdır**; repoda yalnızca saklanıyor.

Test edilen sürüm: Firefox 158 (bellek ölçümleri) ve 159 (arayüz çalışması), Windows 11, taşınabilir kurulum. Ayrıntılı ölçümler ve nedenler:
[Firefox.md](Firefox.md).

## Klasör haritası

| Yol | Ne işe yarar | Nereye konur |
|---|---|---|
| `firefox-install/config.js` | Autoconfig yükleyicisi: profildeki `chrome\*.uc.js` betiklerini her tarayıcı penceresinde çalıştırır. İçinde ayrıca telemetri vb. tercihler var. | Firefox kurulum klasörü (`firefox.exe`'nin yanı) |
| `firefox-install/defaults/pref/config-prefs.js` | `config.js`'i etkinleştirir (`general.config.filename`, `sandbox_enabled=false`). | `<Firefox>\defaults\pref\` |
| `profile/user.js` | Profil ayarları: `gfx.webrender.max-shared-surface-size = 1024` (GPU belleği) ve `toolkit.legacyUserProfileCustomizations.stylesheets = true` (`userChrome.css`'in yüklenmesi için). | Profil klasörü (`prefs.js`'in yanı) |
| `profile/chrome/tab_lifecycle.uc.js` | **Tek dosya, tek zaman çizelgesi:** uyku (2 sn) -> derin uyku (60 sn) -> ana süreç+GPU kırpma (+60 sn, yalnızca hiçbir sayfa görünmüyorsa) -> sekme kırpma (120 sn) -> boşaltma (900 sn) + pencere küçültünce genel küçültme. Aşağıdaki üç eski betiğin yerine geçer. | `<profil>\chrome\` |
| `profile/disabled/tab_trimmer.uc.js`, `tab_freezer.uc.js`, `tab_discarder.uc.js` | **Eski, ayrı betikler (kullanmayın).** `tab_lifecycle.uc.js` ile aynı anda çalışırsa aynı sekmeyi iki kez dondurup kırparlar. | - |
| `profile/disabled/memory_cleaner.uc.js` | **Devre dışı**: eski GC/CC betiği. Canlı profilden çıkarıldı (ana süreçte GC+CC ölçümde fayda vermedi, yalnızca ~20 ms takılma ekliyordu). | (kopyalanmaz) |
| `profile/chrome/userChrome.css` + `bookmarks_bottom.uc.js` | **Arayüz:** yer imi çubuğu altta (dikey çubuğun bittiği yerden; gizlenince ya da "yalnızca yeni sekmede" kipinde boşluğu da kalkar), dar ve sıkı dikey sekme şeridi, daraltılmış/ortalı adres çubuğu, **üst çubuğun otomatik gizlenmesi** (fare üstteki ince şeride gelince ya da Ctrl+L ile açılır; sonda ayrı blok, silinerek kapatılır). Ayarlar dosyanın başındaki `--bm-*`, `--vt-*`, `--urlbar-*` değişkenleri. Ayrıntı: [docs/UI-Tasarim.md](docs/UI-Tasarim.md). | `<profil>\chrome\` |
| `profile/chrome/bookmark_host_tag.uc.js` | Yer imi düğmelerine alan adını `data-bm-host` olarak yazar; userChrome.css koyu temada tek renkli simgeleri (GitHub vb.) buna göre ters çevirir. | `<profil>\chrome\` |
| `profile/chrome/urlbar_domain.uc.js` | Adres çubuğu odakta değilken yalnızca ana alan adı (ortalı); tıklayınca tam URL. `about:` sayfalarında sayfa adı. Adres çubuğunun değerine dokunmaz. Ayrıntı: [docs/UI-Tasarim.md](docs/UI-Tasarim.md). | `<profil>\chrome\` |
| `profile/chrome/ExtensionToggleManager.uc.js` | Uzantı yöneticisi paneli (araç çubuğu düğmesi: sol tık panel, orta tık tümünü aç/kapat, sağ tık menü). Kompakt, simge tabanlı 300px arayüz; Firefox'un panel renklerine ve tooltip'lerine uyar. Mock: [docs/ext-manager-mock.html](docs/ext-manager-mock.html). Ayrıntı: [docs/UI-Tasarim.md](docs/UI-Tasarim.md). | `<profil>\chrome\` |
| `profile/chrome/translate.uc.js` | Sağ tık menüsünden **çeviri, servis seçilebilir (DeepL ya da Google)**: "Seçili metni çevir" (sonuç küçük panelde, seçimin yanında), "Sayfayı çevir" / "Orijinal sayfayı göster" ve "Çeviri servisi" alt menüsü (seçim anında kaydedilir). Sayfaya hiçbir dinleyici eklemez (resmi DeepL uzantısının çift tıkla sayfa başına atlama gibi bozulmaları buradan gelir). **Resmi API anahtarı gerekir:** `about:config` > `extensions.translate-lite.deeplApiKey` / `googleApiKey` (anahtarlar `prefs.js`'te kalır, depoya girmez). Ayarlar: `provider`, `targetLang`, `maxChars`; dosya başındaki `SETTINGS` bloğu: dil algılama (`showDetected`, `autoSwapSameLang`, `swapTarget`, `requireConfident`) ve Google sonucunda çift tıkla alternatif çeviri (`wordAlternatives`, `alternativeUnit`: cümle ya da virgül bazlı; resmi olmayan uç nokta). Sonuç panelinde kaynak/hedef dil seçicileri ve algılanan dil ("Otomatik · EN") görünür. Kota dolarsa öbür servise otomatik geçer (`autoFallback`). Anahtar yoksa seçili metin: Google için ekran dışı gizli tarayıcıda Google Translate sitesi açılıp çıkan çeviri okunur ve kendi panelimizde gösterilir (engel/CAPTCHA aşılmaya çalışılmaz, görünür panele düşer); DeepL için sitesi seçimin yanında küçük bir panelde açılır (`webMode`: auto/hidden/panel/tab); Google için sayfa, Google'ın web çeviri hizmetinde (translate.goog) açılır. Ayrıntı: [docs/UI-Tasarim.md](docs/UI-Tasarim.md) bölüm 10. | `<profil>\chrome\` |
| `docs/UI-Tasarim.md` | Arayüz çalışmasının tasarımı ve süreci: her parçanın nasıl çalıştığı, ölçümler, yolda öğrenilenler, denenmeyenler. | - |
| `Firefox.md` | Tüm araştırma, ölçümler, tuzaklar, açık işler. | - |
| `tools/firefox-marionette/` | Firefox'u geçici profille açıp içeriden ölçen/sınayan araçlar (Marionette) ve `shot_popup.ps1` (yalnızca test penceresi önde ise açılır pencerenin ekran görüntüsü). | - |
| `tools/chromium-speedometer-drm/` | Chromium/Helium/Edge tarafında kullanılan Speedometer, DRM yetenek probu ve JS bellek temizleme araçları. | - |

Betikler, Firefox yeniden başlatılınca yüklenir. Kullandığımız profil: `...\Mozilla\UserData\Ezer1`.
`Ezer - Kopya` profilinde eski bir `memory_cleaner` kaldı.

## Arayüz özelleştirmeleri (kısaca)

Bellek betiklerinin yanında Firefox'un arayüzü de Helium'daki kompakt görünüme yaklaştırıldı: yer imi çubuğu altta,
dar dikey sekme şeridi, ortalı ve alçak adres çubuğu, yalnızca ana alan adı gösterimi ve yeniden tasarlanan uzantı
yöneticisi paneli. Her parçanın çalışma şekli, ölçümler, yolda yapılan hatalar ve **denenmeyenler**
[docs/UI-Tasarim.md](docs/UI-Tasarim.md) içinde. Kurulum için bu dosyaları profilin `chrome\` klasörüne
kopyalamak ve `user.js`'i profile almak yeterli.

## Kurulum (sıfırdan)

1. `firefox-install\config.js` dosyasını Firefox'un kurulum klasörüne, `firefox-install\defaults\pref\config-prefs.js`
   dosyasını `<Firefox>\defaults\pref\` altına kopyalayın. (Firefox güncellenince bu dosyalar silinirse yeniden kopyalayın.)
2. `profile\user.js` dosyasını profil klasörüne, `profile\chrome\*.uc.js` dosyalarını profildeki `chrome\` klasörüne
   (yoksa oluşturun) kopyalayın.
3. (İsteğe bağlı) Crash reporter'ı kapatmak için bir kez:
   `[Environment]::SetEnvironmentVariable("MOZ_CRASHREPORTER_DISABLE", "1", "User")` (PowerShell). Ayrıntı: `docs/UI-Tasarim.md` bölüm 9.
4. Firefox'u kapatıp açın.
5. Doğrulama: `chrome\memlog.txt` oluşmalı ve her betik için bir `yüklendi:` satırı içermeli. Olmazsa
   `Ctrl+Shift+J` (Tarayıcı Konsolu) açıp `[config.js] ✓ Loaded: ...` / `✗ Failed: ...` satırlarına bakın.

## Betikler ve kilit ayarlar

Her betiğin en üstündeki `CONFIG` bloğundaki **her ayarın** Türkçe açıklaması var. Öne çıkanlar:

| Betik | Ayar | Canlı değer | Anlamı |
|---|---|---|---|
| tab_trimmer | `HIDDEN_DELAY_SECONDS` | 10 | Sekme süreci bu kadar sn görünmezse kırpılır |
| tab_trimmer | `TRIM_ALL_WHEN_MINIMIZED` / `MINIMIZED_DELAY_SECONDS` | açık / 5 | Hiçbir sayfa görünmezse ana süreç + GPU (+ diğer süreçler) kırpılır |
| tab_trimmer | `RETRIM_WHEN_ALL_IDLE_SECONDS` | 600 | Tamamen boştayken tüm süreçleri bu aralıkla yeniden kırp (saatlerce boştayken şişmeyi önler) |
| tab_trimmer | `TRIM_HELPER_PROCESSES` | açık | Boştayken veri çözücü (RDD), ağ, yardımcı (utility) ve ön ayrılmış süreçler de kırpılır |
| tab_trimmer | `TRIM_OTHERS_WHILE_MEDIA_PLAYS` | açık | **Ses/PiP/paylaşım varken bile** boştaki kırpma sürer; yalnızca o medya sekmesinin süreci atlanır |
| tab_lifecycle | `ACTIVE_IDLE_SECONDS` / `ACTIVE_IDLE_REPEAT_MINUTES` | 17 / 5 | Kullanıcı **boştayken** (pencere görünür, fare/klavye 17 sn hareketsiz) ana süreç + GPU kırpılır; hareket gelince durur, ses/PiP/yüklenen sekme varken atlanır (0: kapalı) |
| tab_lifecycle | `PROCESS_ACTIONS` / `FLOW_ORDER` | sınıf tablosu / `gc, cc, minimize, trim` | **Süreç sınıfı başına** (ana, pasif sekme, medya, yüklenen, aktif sekme, GPU, rdd, ağ, yardımcı, uzantı, boşta, diğer) ayrı `gc`, `cc`, `minimize`, `trim` bayrakları; işlerin sırası `FLOW_ORDER`, tüm akışlar tek kuyrukta ve onaylı aşamalarla çalışır. Ayrıntı: [docs/UI-Tasarim.md](docs/UI-Tasarim.md) bölüm 5 |
| tab_lifecycle | `TRIM_MEDIA_TAB_AFTER_HIDDEN_SECONDS` / `TRIM_MEDIA_TAB_EVERY_SECONDS` | 10 / 60 | Ses çalan sekmenin süreci: Firefox arka plana gidince (hiçbir sayfa görünmüyor) 10 sn sonra bir kez, sonra 60 sn'de bir kırpılır; öne gelince sayaç sıfırlanır (0: kapalı). **Denenmedi** (gerçek medya ile) |
| tab_trimmer | `RECLAIM_WHILE_MEDIA_PLAYS` | kapalı | Medya çalarken "memory-pressure" bildirimi gönderilmez (medya sekmesinin sürecine de gider, hariç tutulamaz); yalnızca ana süreçte GC/CC |
| tab_trimmer | `RECLAIM_BEFORE_MINIMIZED_TRIM` / `RECLAIM_REPEAT_MINUTES` | açık / 10 | Kırpmadan önce GC+CC+heap-minimize (gerçek bellek düşüşü) |
| tab_trimmer | `TRIM_EXTENSION_PROCESS` | açık | uBlock vb. uzantı sürecini de kırp |
| tab_freezer | `FREEZE_AFTER_SECONDS` | 2 | Sekmeden ayrıldıktan sonra donma gecikmesi |
| tab_freezer | `PROTECTED_RECENT_TABS` | 0 (betik varsayılanı 1) | Dondurulmayan son kullanılan sekme sayısı |
| tab_freezer | `DEEP_SLEEP_AFTER_MINUTES` | 600 (betik varsayılanı 5) | **Derin uyku:** hiçbir pencerede hiçbir sekme bu kadar dk görünmezse medya (ses/PiP/paylaşım) ve yükleniyor olanlar HARİÇ her sekme donar (seçili, korunan, muaf siteler dahil); pencere açılınca anında çözülür. 0: kapalı. 600 pratikte kapalı |
| tab_freezer | `WAKE_INTERVAL_SECONDS` | 0 | Donmuşu periyodik uyandırma (0: yalnızca sekmeye geçince çöz) |
| tab_freezer | `RECLAIM_ON_FREEZE` | açık | Donan sekmenin kendi sürecinde GC/CC |
| tab_freezer | `EXEMPT_HOSTS` | **boş** (betik varsayılanı sohbet/posta/medya siteleri) | Dondurulmayacak siteler. Derin uykuda yok sayılır |
| tab_discarder | `DISCARD_AFTER_MINUTES` | 10 (betik varsayılanı 30) | Bu kadar dk gizli kalan sekme boşaltılır (içerik yeniden yüklenir) |
| tab_discarder | `KEEP_RECENT_TABS` | 0 (betik varsayılanı 2) | Boşaltılmayan son kullanılan sekme sayısı |
| tab_discarder | `EXEMPT_HOSTS` | sohbet/posta/medya siteleri + docs.google.com | Boşaltılmayacak siteler |
| tab_discarder | `DRY_RUN` | false | true: boşaltmaz, yalnızca günlüğe "boşaltırdım" yazar (ilk deneme için) |
| hepsi | `ENABLE_LOGGING` | true | `chrome\memlog.txt`'ye yazar (400 KB'ta döner); false ise dosyaya hiçbir şey yazılmaz (hatalar da yalnızca Tarayıcı Konsolu'na) |

**Medya ilkesi (her betikte aynı):** ses çalan, Picture-in-Picture olan ya da ekran/kamera paylaşan bir sekme yalnızca **kendi
sürecini** muaf tutar; başka hiçbir süreci/işi durdurmaz. (Kırpıcıda bu önceden genel bir kapıydı, 2026-10-09'da düzeltildi,
bkz. Firefox.md §14.)

`user.js`: `gfx.webrender.max-shared-surface-size` 2048 -> 1024. Ölçümde GPU süreci özel belleği 228 -> 165-191 MB,
Speedometer'da fark yok.

## Günlüğü okuma (`chrome\memlog.txt`)

- `yüklendi:` her betik açılışta bir kez (ayarlarıyla).
- `çalışıyor:` 10 dk'da bir: pencere/süreç sayısı, toplam özel bellek, `allIdle` (hiçbir sayfa görünür değil mi),
  medya var mı (`medya=true(ses:site)` ise ana süreç/GPU kırpılmaz), kırpma sayısı, son kırpma ne zaman.
- `kırpıldı: sekme süreci=N uzantı süreci=M` kırpma turu; `boşta: GC/CC/heap-minimize gönderildi` ve
  `boşta: ana süreç + GPU kırpıldı`; `BOŞALTILDI -> site | başlık`; `donduruldu:` / `GC/CC/minimize:`.
- Hatalar `[Betik ERROR]` ile. Bir betik hiç `yüklendi` satırı yazmadıysa yüklenmemiştir.

## Geri alma

- Tek bir özelliği kapatmak: ilgili `.uc.js` dosyasını `chrome\` klasöründen çıkarın (ya da adını `.uc.js` dışına çevirin).
- GPU ayarı: `user.js` içindeki satırı silin ve (varsa) `about:config`'ten `gfx.webrender.max-shared-surface-size`'ı sıfırlayın.
- Hepsi: `chrome\` klasöründeki betikleri kaldırın ya da `config.js`'i silin.

## Bilmeniz gerekenler (ölçümlerden)

- **Kırpma** çalışma kümesini (Görev Yöneticisi "Bellek") küçültür; **özel bellek/commit'i düşürmez**, sayfalar
  diske gider (bu makinede Windows bellek sıkıştırması kapalı). `about:processes` özel belleği gösterir, o sütun kırpmayla düşmez.
- Gerçek düşüş GC/CC/heap-minimize ve sekme boşaltmadan gelir. Boşaltma içeriği yeniden yükletir.
- Süreçler boştayken zamanla geri dolar (ana süreç ~1 dk'da +30 MB, saatlerde yüzlerce MB), bu yüzden periyodik yeniden kırpma var.
- Dondurma için `loadFrameScript` kullanılıyor (JSWindowActor denendi, çalışmadı); Firefox ileride bu mekanizmayı kaldırırsa yeniden yazılmalı.
- Ölçülmeyenler: uzun ömürlü sekmelerde GC kazancı, çizim akıcılığı (`max-shared-surface-size`), RAM baskısı altında geri dönüş gecikmesi,
  günlerce kararlılık, çok pencere. Ayrıntı: `Firefox.md` §11-12.
- `browser.cache.memory.capacity` ve `browser.sessionhistory.max_total_viewers` denendi, fark çıkmadı (değiştirilmedi).

## Ölçüm araçları (kısaca)

`tools\firefox-marionette\launch.ps1 -PrefsFile <dosya> -Port <port> -Tag <ad> [-FirefoxExe <yol>]` geçici bir profille Firefox'u
`--marionette --remote-allow-system-access` ile açar (`chrome\` altına betik koymak için `FF_CHROME_SRC` ortam değişkeni
kullanılır, `;` ile ayrılmış dosya yolları). `mn.mjs <port> <betik.js>` Marionette üzerinden tarayıcı içinde (chrome bağlamı)
betik çalıştırır; `mncmd.mjs` tek komut (örn. `Addon:Install`), `mnspeed.mjs` Speedometer 3.1'i çalıştırıp puanı okur;
`kill.ps1 -Tag <ad>` yalnızca o geçici örneği kapatıp profilini siler. `r3.js` GPU süreci bellek dökümü, `r1.js` örnek sekmeleri
açar, `p2.js`/`r4.js` süreç listesi, `z2.js` boşaltıcı denemesi, `srv2.mjs` yerel çöp-üreten test sayfası sunucusu.
Chromium/Helium/Edge tarafı: `speedo.mjs` + `batch.sh` Speedometer A/B koşuları, `drm.mjs` DRM yetenek probu,
`purge.mjs` `Memory.forciblyPurgeJavaScriptMemory`. Araçlar geçici ortam içindir; yollar (ör. Firefox/Helium kurulum
klasörü) kendi makinenize göre düzenlenmelidir.
