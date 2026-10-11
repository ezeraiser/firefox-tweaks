# Firefox / bellek araştırması (Ekim 2026)

Soru: Helium'daki bellek özelliklerini (arka plan sekme kırpma, sekme dondurma) Firefox'u
forklayıp onda da yapabilir miydik, ve "içerik kaybolmadan bellekten düşürme" gerçekçi mi?
Bu dosya o konuşmanın sonuçlarını ve ölçümlerini tutar. Karar verilmiş bir Firefox fork'u
**yok**; amaç, aynı soruyu tekrar sormak gerekirse sıfırdan başlamamak.

**Güncel durum (sonradan):** Fork yapılmadı, bellek özellikleri **profildeki userChrome betikleriyle**
Firefox 158'de (taşınabilir kurulum, `Mozilla\UserData\Ezer1`) uygulandı ve ölçüldü, bkz. §7-§9.
§1-§6 ilk araştırmadır; §7'den sonrası uygulama ve sonraki ölçümlerdir.

Ölçüm makinesi: Windows 11, 24 GB RAM, sayfa dosyası 24 GB (kullanılan ~4 GB),
**Windows bellek sıkıştırması KAPALI** (`Get-MMAgent`: `MemoryCompression : False`).

## 1. Üç ayrı mekanizma (karıştırılmamalı)

| Mekanizma | Bellekten gerçekten gider mi | Sayfa içeriği |
|---|---|---|
| Boşaltma / discard (Firefox `TabUnloader`, Chrome Memory Saver) | Evet, tamamen | **Kaybolur**; sekme seçilince baştan yüklenir (kaydırma/form durumu geri gelir) |
| Dondurma (Chrome `FreezingPolicy`) | Kendiliğinden düşmez, yalnızca işi durdurur | Korunur |
| Çalışma kümesi kırpma (`EmptyWorkingSet` / `SetProcessWorkingSetSize`) | **Hayır**: RAM'den bekleme listesine / sayfa dosyasına gider | Korunur |

Çalışma kümesi (Görev Yöneticisi "Bellek") düşer, **özel bellek ve sistem taahhüdü (commit)
düşmez**. Diske bağlı kod sayfaları (DLL) yeniden diskten okunur, yazma yok; özel veri ise
sıkıştırma kapalıysa **sayfa dosyasına yazılır**. İçeriği koruyup bellekten tamamen atmak
fiziken mümkün değil: canlı durum ya bellekte (RAM/sayfa dosyası) durur ya da silinir.
Bellekten gerçekten düşürebilen tek içerik-koruyan yol: yeniden üretilebilir şeyleri atmak
(çöp, önbellek, çözülmüş görseller, JIT kodu).

Karar (kullanıcı): sıkıştırma kapalıysa kırpma sayfa dosyasına yazsın, bunun için ayrıca bir
şey yapılmayacak.

**Düzeltme (sonradan):** "Dondurma bellek azaltmaz" satırı Firefox için **ölçülmeden** yazılmıştı.
Chromium'da dondurma ölçülebilir bellek kazandırdı (8 yapay sekmede renderer belleği ~190 -> ~150 MB,
CLAUDE.md `tab-freezing-settings`); mekanizmanın nereden geldiğini kaynakta doğrulamadık. Firefox'ta
zamanlayıcıyı askıya almak tek başına belleği küçültmedi, kazancı dondurmadan sonra yapılan
GC/CC/heap-minimize adımı verdi (§7.3).

## 2. Firefox kodunda bugün ne var (kaynak okuyarak, `mozilla-firefox/firefox` main)

- `dom/ipc/ProcessPriorityManager.cpp`: arka plan süreçlerin **yalnızca CPU önceliğini**
  değiştirir (`hal/windows/WindowsProcessPriority.cpp`: `SetPriorityClass` idle/below-normal,
  `SetProcessInformation` ile EcoQoS). Düşürme gecikmeli (`...backgroundGracePeriodMS`).
  **`EmptyWorkingSet`, `SetProcessWorkingSetSize`, bellek önceliği çağrısı yok** (bu iki
  dosyada doğrulandı; ağacın geri kalanını tarayamadık, Searchfox araması aracımızla çalışmadı).
- `TabUnloader` (Firefox 93+): Windows'ta boş commit alanı (`ullAvailPageFile`) azalınca en az
  kullanılan sekmeleri boşaltır; ses/PiP/WebRTC sekmeler hariç, sabitlenmişler geriye.
  Pref: `browser.tabs.unloadOnLowMemory`. Zamana bağlı bir politika **değil**, bellek baskısına bağlı.
- Dondurma: bfcache için `nsGlobalWindowInner::Freeze/Thaw` ve worker dondurma var (eski
  hata kayıtları: Bug 1178721, 1717765). "Gizli sekmeyi dondur, periyodik uyandır" için
  hazır bir politika yok; "dondurulamaz" nedenlerini, son kullanılan listesini ve uyandırmayı
  sıfırdan yazmak gerekir. Güncel kodda doğrulanmadı.
- Uzantılar tek süreci paylaşır (`dom.ipc.processCount.extension`, varsayılan 1). Uzantı başına
  ayrı OS süreci standart değil; yapılsa bile her süreç taban belleğini getirir, toplam artar.
  `about:processes` satırı genişletilince süreç içi dökümü gösterir.

## 3. Ölçümler

### 3.1 Firefox, ilk açılış (`about:processes`, ekran görüntüsü)
GPU 325 MB, ana süreç 320 MB, uzantılar 161 MB, RDD 23, about 22, ayrılmış 20, utility 10,
ağ 8 = **~889 MB** (hiç sekme içeriği süreci yok). Karşılaştırma: bizim Chromium'da boşta
GPU ~136 MB, tarayıcı ~69 MB.

### 3.2 `EmptyWorkingSet` Firefox'un tüm süreçlerine (PowerShell, dışarıdan)
Çalışma kümesi (MB), 8 süreç. **Boşta kontrolü** yapılan koşu (10 sn'de 0.36 sn CPU):

| Süreç | önce | +1 sn | +15 sn | +60 sn |
|---|---|---|---|---|
| ana süreç | 373 | 27 | 56 | **132** (geri doluyor) |
| sekmeler, GPU, RDD, utility, socket | 2-82 | 1-3 | 1-3 | **1-5** (geri dolmuyor) |
| toplam | 581 | 37 | 69 | 147 |

Sistem boş RAM 5369 -> 5959 MB. **Özel bellek (795 -> 786) ve commit (22746 -> 22664) değişmedi.**
İlk koşu (Firefox kullanılırken) kirliydi: sekme açılması/medya yüzünden toplamlar anlamsız,
yalnızca boştaki süreçler okunabilir. Not: "önce" değerleri taze değil (3 dk önceki kırpmadan sonra).

Sonuç: boştaki süreçler (sekme, GPU, yardımcılar) kırpılınca 1-5 MB'a iner ve **dolmaz**;
ana süreç boştayken bile geri dolar, bu yüzden yalnızca "tüm pencereler gizli" iken ve
aralıklı kırpılmalı (Chromium `browser_when_hidden` mantığı).

### 3.3 Edge ile "JS belleğini boşalt" deneyi (geçici profil, 6 site, 11 renderer)
`Memory.forciblyPurgeJavaScriptMemory` (CDP) sonrası renderer özel belleği **536 -> 526 MB
(~%2)**; yalnızca bir renderer anlamlı düştü. Ardından kırpma: renderer çalışma kümesi
**985 -> 23 MB**, özel bellek aynı (527). Sekmeler taze (<1 dk) olduğu için biriken çöp azdı;
yaşlı/ağır SPA'larla **test edilmedi**. Sadece V8 yığını boşaltıldı, Blink görsel önbelleği /
PartitionAlloc / atılabilir bellek ölçülmedi (gerçek bellek baskısı bunları da temizler).
Edge'di, Helium değil.

## 4. Chromium kaynağında bulunanlar (155.0.8059.39)

- `RenderProcessHostImpl::OnMemoryPressure` bellek baskısını renderer'a **yalnızca Android ve
  CastOS'ta** iletiyor (`TODO: tüm platformlarda aç`). **Masaüstü Windows'ta renderer'lara
  tarayıcıdan bellek baskısı gitmiyor.**
- Renderer tarafı platformdan bağımsız hazır: `ChildThreadImpl::OnMemoryPressureFromBrowserReceived`
  -> `MemoryPressureListenerRegistry::NotifyMemoryPressure` -> `BlinkIsolatesPressureListener`
  -> V8 `MemoryPressureNotification` (özellik `kForwardMemoryPressureToBlinkIsolates`, varsayılan açık;
  görünür renderer'da kritik seviye orta seviyeye indirilir). `OnReleaseMemory` yolunu kimin
  tetiklediğini tam izlemedik.
- DevTools `Memory.simulatePressureNotification` yalnızca **tarayıcı sürecinde** simüle eder
  (kod yorumu), renderer'a ulaşmaz; ölçüm için işe yaramaz.
  `Memory.forciblyPurgeJavaScriptMemory` ise renderer tarafında (`InspectorMemoryAgent`:
  `ForciblyPurgeV8Memory` + `isolate->MemoryPressureNotification(kCritical)`).
- Mevcut Helium politikaları: `background_tab_trim_policy.*`, `tab_freezing_prefs_applier.*`
  (`patches/ezer/`). Chromium'un `memory_saver_mode_policy` (discard) de ağaçta.

## 5. Sonuçlar ve açık işler

- Firefox fork'unda: kırpma (ProcessPriorityManager yanına, tüm süreçler için) kolay;
  dondurma ayrı ve büyük iş; UI özellikleri (dikey sekme, kenar çubuğu) Firefox'ta zaten yerleşik
  veya JS/CSS düzeyinde, Chromium'dan ucuz. Motor farkı (SpiderMonkey/Gecko), eklenti ve site
  uyumluluğu ürün kararıdır. Karar verilmedi.
- Helium'a "kırpmadan önce renderer'a bellek baskısı gönder" adımı eklenebilir (Windows'ta
  eksik halka: tarayıcı -> renderer gönderimi). Kazanç **kanıtlanmadı**: taze sekmelerde ~%2.
  Karar için ucuz testler: (a) yaşlı/ağır SPA sekmeleriyle tekrar, (b) `OnMemoryPressure`
  gönderimini açan küçük yerel değişiklikle gerçek bellek baskısı yolunu ölçmek (yerel derleme gerekir).
- Küçük, ucuz iyileştirme: gizli pencere süresince **ana süreci aralıklı yeniden kırpmak**
  (Firefox'ta ana süreç 60 sn'de 27 -> 132 MB doldu; Chromium politikası bir kez kırpıyor ise aynısı olur).
- "Uygulama boyutu" (disk) sorusu ayrı bir konu ve bu bellek çalışmasıyla ilgisi yok: `xul.dll`
  gibi dosyaların boyutu derleme bayrakları (LTO, `-Os`, hata ayıklama bilgisi) ve bileşenlerle
  ilgili; kaynak zayıf, rakam doğrulanmadı. Asıl ilgi RAM'di.

## 6. Yöntem (tekrar için)

Her sürece `EmptyWorkingSet` (psapi, PowerShell `Add-Type` P/Invoke), önce/sonra
`WorkingSet64`, `PrivateMemorySize64`, `Win32_OperatingSystem` boş RAM ve taahhüt; **önce
10 sn'lik CPU ile boşta kontrolü**. Chromium/Edge için CDP: tarayıcıyı `--remote-debugging-port`
ve ayrı `--user-data-dir` ile açıp Node 25'in yerleşik `WebSocket`'iyle her `page` hedefine
`Memory.forciblyPurgeJavaScriptMemory`. Süreç türü komut satırından (`--type=`,
Firefox'ta `-contentproc ... <tür>`). Betikler geçici, repoda değil.

## 7. Uygulanan çözüm: profil betikleri (fork yok)

Konum: `...\Browsers\Mozilla\UserData\Ezer1\chrome\*.uc.js`. Yükleyici: `Firefox\config.js` (autoconfig,
`general.config.sandbox_enabled=false`); `chrome/` içindeki her `*.uc.js` her tarayıcı penceresinin küresel
ortamında (`gBrowser`, `Services`, `ChromeUtils`) çalıştırılır. `*.sys.mjs` yan dosyaları yüklenmez. Betikler
**repoda değil**, yalnızca profilde. `Ezer - Kopya` profilinde eski `memory_cleaner` kaldı. Değişiklikler
Firefox yeniden başlatılınca yüklenir.

### 7.1 `memory_cleaner.uc.js` (temizlendi)
Çıkarılanlar (varsayılanda kapalıydılar ama riskliydiler): `QuotaManager.clear()` (**tüm site depolamasını**
siler), `sessionStorage.clear()` + `win.gc` (oturumları bozar, `win.gc` zaten tanımsız), `gfxInfo.reset()`
(var olduğu doğrulanmadı, sessiz no-op). Kalan: GC/CC/Minimize (+ sekme kapanışı/zamanlayıcı).

### 7.2 `tab_trimmer.uc.js` (Helium `BackgroundTabTrimPolicy` ile hizalı)
Çalışma kümesini `EmptyWorkingSet` ile kırpar (ctypes, `K32EmptyWorkingSet`; `ctypes` Firefox'ta hâlâ var).
Politika, Helium'unkine göre:
- Gizli süreç (görünür sekmesi, ses/PiP/paylaşımı/yüklemesi yok) 10 sn sonra kırpılır, **her gizli dönemde
  bir kez** (`TRIM_ONCE_PER_EPISODE`).
- "Hiçbir sayfa görünür değil + medya yok" iken (küçültme/örtülme) 10 sn sonra **yalnızca ana süreç + GPU**
  kırpılır; ağ/rdd/utility dokunulmaz (`TRIM_HELPER_PROCESSES: false`). Tetikleyici pencere durumu değil,
  `docShellIsActive`'in hiçbir yerde true olmaması (`allIdle`).
- **Uzantı süreci** de kırpılır (`TRIM_EXTENSION_PROCESS`): Helium `kExtension` sayfalarını kırpıyor. Firefox'ta
  tüm içerik süreçleri komut satırında `tab` türüyle başlar, bu yüzden uzantı süreci
  `ChromeUtils.getAllDOMProcesses()` ile `remoteType === 'extension'` olarak bulunur. İlk sürümde atlanmıştı:
  küçültülmüş Firefox'ta 123 MB'lık bir süreç kalıyordu (Helium'la fark buydu).
- Helium'da **olmayan** ek: kırpmadan önce ana süreçte `forceGC; forceCC; memory-pressure heap-minimize`
  (`RECLAIM_BEFORE_MINIMIZED_TRIM`, çocuk süreçlere de yayılır, 4 sn bekler).

Ölçümler:

| Sınama | Sonuç |
|---|---|
| Gizli sekme süreçleri (kendi zamanlayıcısı) | 57-80 MB -> 1 MB; 20 sn sonra 9-12 MB; seçili sekme dokunulmadı |
| Küçültülünce, ilk sürüm (tüm süreçler) | toplam çalışma kümesi ~875 -> 37 MB; ana süreç 30 sn'de 127 MB'a, GPU 161 MB'a geri doldu |
| Küçültülünce, GC + kırpma (4 site) | özel bellek 1150 -> 923 -> **853 MB** (-%26), çalışma kümesi 1666 -> 55 -> 115 MB |
| Helium tarzı (yalnızca ana + GPU) | ana 414 -> 24 MB, GPU 256 -> 0 MB; yardımcılara dokunulmadı; çok sonraki 2. tur tekrar kırpmadı |
| Kırpılmış sekmeye dönüş gecikmesi (`TabSwitchDone`, 16 geçiş) | medyan **25,3 ms** (kırpılmamış) / **26,4 ms** (kırpılmış); 24 GB RAM, sayfalar bekleme listesinde. RAM'i az makinede ölçülmedi |
| Uzantı süreci (80 MB tutan test uzantısı) | eski kod 116 -> 115 MB (kırpılmadı); yeni kod 12 MB, geri dolmadı |

Kullanıcı ayarları (Helium Ayarlar > Bellek ekran görüntüsünden): bekleme 10 sn, "tarayıcı arka plandayken de
boşalt" açık, dondur açık, son kullanılan 1 sekme korunur, dondurulmuşu uyandırma yok.

### 7.3 `tab_freezer.uc.js` (dondurma + sekme bazlı GC)
Pasif sekme (2 sn sonra; ses/PiP/paylaşım/yükleme yoksa, en son kullanılan 1 gizli sekme hariç):
1. `content.windowUtils.suspendTimeouts()` ile sayfanın `setTimeout/setInterval` sayaçları askıya alınır.
2. Aynı sekmenin **kendi içerik sürecinde** `Cu.forceGC(); Cu.forceCC(); Cu.forceGC(); memory-pressure
   heap-minimize`. Çerçeve betiği o sürecin içinde çalıştığı için yalnızca o sekmeyi etkiler (ana süreçten
   `Cu.forceGC()` yalnızca ana süreci temizler). Süreç görünür/medya sekmesiyle paylaşılıyorsa atlanır.
3. Sekme seçilince `TabSelect` ile hemen çözülür; sayfa yeniden yüklenmez.

Muaf siteler (`EXEMPT_HOSTS`: ChatGPT, Slack, Gmail, YouTube, Netflix...) dondurulmaz ama yine de GC/CC alır
(WebSocket/fetch/worker zamanlayıcıdan bağımsız çalışır, dondurma keepalive'ı bozabilir).

**Mekanizma:** `loadFrameScript(data:..., true)` + `sendAsyncMessage`. **JSWindowActor ile denendi, çalışmadı**:
`getActor` her kayıt biçiminde (`remoteTypes`, `matches`, `parent`+`child`) `NotSupportedError: ... doesn't match
remote type 'webIsolated=http://127.0.0.1'` verdi, nedeni çözülmedi. Çerçeve betiği eski bir mekanizma, Firefox
ileride kaldırabilir. Fission'da başka süreçteki iframe'lerin zamanlayıcıları dondurulmaz.

| Sınama | Sonuç |
|---|---|
| Sayaç sayfası | dondurulunca sabit (n=8), çözülünce kaldığı yerden (yakalamaya çalışmadan) devam |
| Otomatik akış | 3 sn gizli -> A,B donar, en son kullanılan C korunur; ~14 sn sonra kısa uyanma, yeniden donma |
| Sekmeye dönüş | anında çözülür, aynı `innerWindowId` ve aynı pid, sekme boşaltılmaz |
| GC/CC/minimize, dondurma sonrası eklenince (özel bellek) | çöp üreten yapay sayfa **231 -> 35 MB**; Wikipedia 80 -> 74, MDN 41 -> 38, HN 30 -> 28 (taze sayfalar, %5-8); 24 sn sonra geri dolmadı |

Gerçek, uzun ömürlü sekmelerde (uzun sohbet, Gmail, GitHub) kazanç **ölçülmedi**.

### 7.4 Bellek baskısı sinyalinin kapsamı (ana süreçten, ölçüldü)
4 gerçek site, özel bellek (MB): başlangıç 1190 -> yalnızca ana süreçte GC+CC+heap-minimize **1015** (ana 325->283,
sekmeler 539->421, uzantı 56->47, GPU 246->240) -> `child-mmu-request` 995 -> `minimizeMemoryUsage` 992. Yani ana
süreçteki tek `memory-pressure` bildirimi **çocuk süreçlere de yayılıyor** (Firefox ön ayrılmış boş süreçleri de
kapattı), ama **GPU neredeyse hiç düşmüyor** (246 -> 237). Bu sinyal görünür sekmeyi de etkiler (çözülmüş görseller
atılır, gri ekran riski): bu yüzden sekme bazlı kullanıldı, tümü yalnızca küçültülmüşken.

## 8. GPU süreci: neden Firefox'ta fazla, ne azaltıyor

Aynı sayfalarla ölçüm (canlı): Firefox GPU özel bellek **281 MB** (ortak GPU bel. 194 MB), Helium **159 MB** (72 MB).
İkisi de aynı adaptörde (Intel UHD tümleşik; NVIDIA kullanılmıyor), yani sürücü farkı değil.

GPU süreci raporu (`getReports`, 1920x1080, 4 site): WebRender dokuları ≈ **125 MB** = doku önbelleği (atlas) 37,
render hedefleri 32, resim karoları 26, derinlik hedefleri 17, swap chain 9, staging 2,5. Gerisi sürücü/DLL yığınları.

| Yapılandırma | GPU süreci özel bellek (MB) |
|---|---|
| Kullanıcı gfx ayarları (`layers.acceleration.force-enabled`, kısmi sunum, görüntü önbelleği 100 MB) | 228 |
| Varsayılanlar (yukarıdakiler olmadan) | 227 (**fark yok**) |
| `gfx.webrender.compositor=false` | 216 |
| `gfx.webrender.software=true` | 195 (toplam Firefox 1359 -> 1340; CPU'ya yük, önerilmez) |
| `layers.gpu-process.enabled=false` | süreç yok, toplam 1341 (-%1,4, çökme yalıtımı kaybolur) |
| `gfx.webrender.picture-tile-width/height=256` | 220 |
| `gfx.webrender.compositor.surface-pool-size=5` | 227 (etkisiz) |
| **`gfx.webrender.max-shared-surface-size`** 1536 / 1024 / 512 (varsayılan 2048) | 204 / **165 ve 191** (iki ölçüm) / 178 |

**Uygulandı:** `Ezer1\user.js` -> `user_pref("gfx.webrender.max-shared-surface-size", 1024);` (WebRender dokuları
126 -> 65-95 MB). Speedometer 3.1 (Firefox 158, otomatik): varsayılan 18,4 / 18,9, 1024 ile 18,9 / 19,0 (fark yok).
**Ölçülmedi:** çizim akıcılığı (kaydırma, büyük bulanıklık/filtre), 4K ekran. Tekrarlarda 1024 değeri 26 MB oynadı,
kazanç bir aralık olarak okunmalı. Ayar listesi kaynağı: `modules/libpref/init/StaticPrefList.yaml` (`gfx.*` bölümü).

## 9. Ek: Helium'da Netflix (aynı oturumda çıktı, çözülmedi)

Hata zinciri (resmî Firefox'ta sorun yok; Helium'da):
1. `M7701-1003`: Widevine CDM yoktu. Profilde `User Data\WidevineCdm` **boştu**: Helium bileşen güncellemelerini
   kendi servisine yönlendiriyor (`helium/core/component-updates.patch`, `ShouldAccessComponentUpdateService`,
   `kHeliumUpdateFetchingEnabled` opt-in), Widevine (`oimompecagnajdejgnnjijobebaeigek`) izin listesinde. Geçici
   çözüm: CDM 4.10.3050.1 Edge kurulumundan `WidevineCdm\4.10.3050.1\` altına kopyalandı (imza geçerli, Google LLC).
2. `M7111-1957-205064` ("oturum süresi doldu"), sonra `E100 / 1044` ("anında izleme için mevcut değil").
   `requestMediaKeySystemAccess` probu: Widevine L3 (`SW_SECURE_CRYPTO/DECODE`) Edge ile **aynı**, ama **PlayReady yok**
   ve **E-AC-3 desteklenmiyor** (Edge'de var). `chrome.exe.sig` / `chrome.dll.sig` (Widevine ana uygulama doğrulaması)
   Chrome ve Edge'de var, Helium'da **yok**; yalnızca lisanslı dağıtıcılara verilir, imza ikiliye özel, kopyalanamaz.
   Ana sayfa önizlemeleri (şifresiz AV1 1080p) sorunsuz oynuyor; sorun korumalı oynatmada. `media-internals`'ta
   `/watch` oynatıcısı hiç görünmedi. En güçlü şüphe lisans doğrulaması reddi, **kanıtlanmadı**. Ayırıcı test:
   ungoogled-chromium'da aynı başlık. Bu çözülmedi.

## 10. Yöntem eklemeleri (geçici ortamlar, repoda değil)

- **Marionette**: `firefox -no-remote -profile <geçici> --marionette --remote-allow-system-access`; chrome bağlamı
  için `--remote-allow-system-access` şart. İstemci: Node `net` ile `len:json` çerçeveleri (`WebDriver:NewSession`,
  `Marionette:SetContext chrome`, `WebDriver:ExecuteScript`). Sandbox'ta `Services` yok (`win.Services`), üst düzeyde
  `await` yok (`Promise`/`async` işlevi döndür), betik süresi `WebDriver:SetTimeouts {script: ...}`, uzantı
  `Addon:Install {path, temporary:true}`. Geçici profilin `chrome/` klasörüne betik konarak yüklenir.
- Süreç eşlemesi: `tab.linkedBrowser.browsingContext.currentWindowGlobal.domProcess.osPid`, alt çerçeveler için
  `getAllBrowsingContextsInSubtree()`; tür için `ChromeUtils.getAllDOMProcesses()[].remoteType`; süreç listesi
  `ChromeUtils.requestProcInfo()`. Bellek dökümü: `nsIMemoryReporterManager.getReports(...)` (süreç adı `GPU ...`).
- **`about:processes` özel belleği (commit) gösterir**; çalışma kümesi kırpması o sütunu düşürmez. Kırpma etkisi için
  Görev Yöneticisi / `WorkingSet64`'e bakın, `PrivateMemorySize64` sabit kalır.
- Gizli sekme zamanlayıcıları Firefox'ta zaten saniyede ~1'e kısılır (sayaç sayfasında gözlendi).
- Speedometer otomasyonu: `WebDriver:Navigate` `https://browserbench.org/Speedometer3.1/?startAutomatically`, içerik
  bağlamında `#result-number` yoklanır; mutlak puanlar elle ölçülenden düşük, yalnızca aynı parti içinde karşılaştırın.

## 11. Açık işler / ölçülmeyenler

- Uzun ömürlü sekmelerde (uzun sohbet, Gmail) GC/CC kazancı; çizim akıcılığı (`max-shared-surface-size`); RAM baskısı
  altında kırpılmış sekmeye dönüş gecikmesi; betiklerin çok günlük kararlılığı (ilk günler `ENABLE_LOGGING: true`).
- Çok pencere ve "başka pencere tamamen örtüyor" durumunda `allIdle` davranışı doğrulanmadı.
- JSWindowActor hatası (§7.3) çözülmedi; çerçeve betiği Firefox'un ileri sürümünde kalkarsa dondurma yeniden yazılmalı.
- Helium'da Netflix (§9).

## 13. Derin uyku (`tab_freezer.uc.js`, 2026-10-09)

İstek: tüm Firefox N dk (varsayılan **5**, ayarlanabilir) kullanılmazsa her şeyi küçült ve dondur, tek muaf ses/video.
Dondurma süreçleri **durdurmaz**: yalnızca sayfaların zamanlayıcılarını askıya alır (süreç, ağ, GC çalışır). Süreci
işletim sistemi düzeyinde durdurmak (`NtSuspendProcess`) denenmedi: ana süreç yanıt beklerken kilitlenme, GPU/uzantı
sürecinin durması riskleri var.

**Davranış** (`DEEP_SLEEP_AFTER_MINUTES`): her pencerede hiçbir sekme `docShellIsActive` değilse sayaç başlar; süre dolunca
medya (ses/PiP/paylaşım) ve yüklenen sekmeler hariç tüm http(s) sekmeleri donar, **korunan son sekme (`PROTECTED_RECENT_TABS`),
muaf siteler (`EXEMPT_HOSTS`) ve küçültülmüş penceredeki seçili sekme dahil**. Derin uyku başlamadan, küçültülmüş pencerede
seçili sekme artık hemen donmaz (önceden 2 sn sonra donuyordu). Pencere küçültme/geri açma/odak olaylarında (`sizemodechange`,
`activate`, `focus`) 0,1 ve 0,7 sn'de yeniden değerlendirilir, yani geri açınca beklemeden çözülür (önceden en fazla 3 sn).
Ayrıca muaf bir sekme dondurulmuşsa ve artık muafsa çözülür (önceki sürümde GC yolu çözmeden `continue` ediyordu).

**Sınama** (geçici profil, sayaç sayfaları, derin uyku 12 sn'ye indirilmiş): görünür pencerede korunan/normal kurallar
doğru; küçültüldükten ~5 sn sonra seçili ve muaf sekmeler canlı; ~19 sn sonra seçili + muaf sekmeler **donmuş**, `soundplaying`
işaretli sekme **canlı**; pencere geri açılınca 2,5 sn içinde hepsi çözüldü. Günlükte `derin uyku BAŞLADI` / `BİTTİ` satırları.
Çözülme gecikmesinin kesin değeri ölçülmedi (≤2,5 sn). Gerçek ses çalan sekmeyle denenmedi (öznitelik elle işaretlendi).

**Not:** Canlı `tab_freezer.uc.js`'te kullanıcı `PROTECTED_RECENT_TABS: 0` ve boş `EXEMPT_HOSTS` yapmış (betik varsayılanları 1 ve
sohbet/posta/medya listesi); bu sürümde korundu.

## 12. Uzun süre boşta kalan Firefox: bulgu ve ikinci tur (2026-10-09)

**Gözlem (canlı):** Firefox 2 saatten fazla küçültülmüş durumdayken toplam çalışma kümesi **908 MB** (ana 238, sekme
süreçleri 174/163/83/60, GPU 109); Görev Yöneticisi "Bellek" (özel çalışma kümesi) 586 MB. Tek seferlik elle kırpma:
16 MB (+5 sn) -> 24 (+30 sn) -> 57 MB (+90 sn). Yani kırpılan süreçler dakikalar içinde yavaş yavaş doluyor, saatler
içinde yüzlerce MB'a çıkıyor; **"dönem başına bir kez kırp" (Helium paritesi) uzun boşta kalmada kalıcı kazanç
vermiyor**. Betiğin o oturumda çalışıp çalışmadığı bilinmiyordu (günlük yoktu) -> günlük eklendi.

**Değişiklikler (3 betik, hepsinde her ayarın başında Türkçe açıklama):**
- `memlog.txt` günlüğü (`<profil>\chrome\memlog.txt`, 400 KB'ta döner): her betik yüklenince ayarlarıyla bir satır,
  işlemler (özet satırlar), 10 dk'da bir `çalışıyor` satırı (süreç sayısı, toplam özel bellek, allIdle, medya). Hatalar
  `ENABLE_LOGGING`'den bağımsız her zaman yazılır (önceden sessizce yutuluyordu).
- `tab_trimmer`: `RETRIM_WHEN_ALL_IDLE_SECONDS: 120` (yalnızca tamamen boştayken tüm süreçleri 2 dk'da bir yeniden kırp),
  `RECLAIM_REPEAT_MINUTES: 30` (GC'yi de yarım saatte bir tekrarla). Aktif kullanımda hâlâ "bir kez".
- **Yeni `tab_discarder.uc.js`** (Helium "Bellek Tasarrufu" karşılığı, ayrı betik): `gBrowser.discardBrowser(tab)` ile
  30 dk gizli kalan sekmeyi boşaltır (gerçek bellek düşer, içerik yeniden yüklenir). Seçili, sabitli, ses/PiP/paylaşım,
  yüklenen, http(s) olmayan, muaf site (ChatGPT, Slack, Gmail, YouTube, Netflix, docs.google.com...) ve son 2 kullanılan
  sekmelere dokunmaz; Firefox kaydedilmemiş değişiklikte boşaltmayı kendisi reddeder. `DRY_RUN` ile önce yalnızca günlüğe yazdırılabilir.

**Sınama (geçici profil, 3 betik birlikte):** üçü de yüklendi ve günlüğe yazdı; boşaltıcı 3 gizli sekmeyi boşalttı (seçili ve
son kullanılan 1 korundu), boşaltılmış sekmeye geçince aynı adres yeniden yüklendi; boştayken tekrar kırpma her turda
sekme+uzantı süreçlerini ve ana+GPU'yu yeniden kırptı. Canlı Firefox'ta **henüz doğrulanmadı**: betikler yeniden başlatmada yüklenir.

**C (önbellek ayarları) ölçüldü, fark yok:** `browser.cache.memory.capacity` (sizde 128000 KB) ve
`browser.sessionhistory.max_total_viewers` (geri/ileri önbelleği): 3'er koşuda ana süreç özel belleği 320/296/314 MB
(128 MB, varsayılan) ve 282/319/311 MB (32 MB, 2 görüntüleyici); toplamlar süreç sayısına göre 1096-1832 MB arasında
savruldu, tutarlı etki yok. **Değiştirilmedi.**

## 14. Medya ilkesi düzeltmesi: "yalnızca medya sekmesinin süreci muaf" (2026-10-09)

**Sorun (canlı günlükten kanıtlı):** YouTube'da müzik çalarken (`durum: allIdle=true medya=true(audio:www.youtube.com)`),
~5 dk boyunca hiç `boşta: GC/CC/heap-minimize` ya da `boşta: ana süreç + GPU kırpıldı` satırı yazılmadı. Nedeni
`tab_trimmer.uc.js`'te "tamamen boşta" dalının ve boştaki tekrar kırpmanın (`RETRIM_WHEN_ALL_IDLE_SECONDS`) tamamının
`!snap.anyMedia` genel koşuluna bağlı olmasıydı (Helium'un `AllPagesIdle` mantığından taşınmıştı). Ses çalan tek bir sekme
bütün Firefox'un boşta bakımını kapatıyordu; ana süreç (~376 MB), GPU (~179 MB), uzantı ve diğer süreçler şişti.
Denetim: `tab_freezer` ve `tab_discarder`'ın medya muafiyeti zaten **sekme bazlıydı** (doğru), yalnızca kırpıcıda genel kapı vardı.

**Düzeltme (`tab_trimmer`):** `TRIM_OTHERS_WHILE_MEDIA_PLAYS` (açık): medya varken de boştaki kırpma/tekrar kırpma sürer;
medya sekmesinin süreci (`snap.procs[...].active`) atlanır. `TRIM_HELPER_PROCESSES` artık açık: ana + GPU + RDD, ağ, yardımcı,
ön ayrılmış süreçler (medya sekmesi hariç) kırpılır. PiP/ekran paylaşımı varsa GPU atlanır (görüntü işleniyor), yalnızca sesli
medyada GPU de kırpılır. `RECLAIM_WHILE_MEDIA_PLAYS` (kapalı): `memory-pressure` yayını **medya sekmesinin sürecine de gider
ve hariç tutulamaz**; bu yüzden medya çalarken yalnızca ana süreçte GC/CC yapılır, çocuk süreçlere bildirim gönderilmez.

**Sınama** (geçici profil; 127.0.0.1 = "ses çalıyor" işaretli medya sekmesi, `localhost` ve `127.0.0.2` = normal gizli sekmeler;
her biri ayrı süreç; pencere küçültülmüş): günlükte tekrarlı `boşta: medya çalıyor, yalnızca ana süreçte GC/CC` ve
`boşta: ana süreç + GPU + diğer süreçler kırpıldı: 12 süreç (medya sekmesi atlandı: audio:127.0.0.1)`; normal sekmeler, GPU,
RDD, ağ, yardımcı ve ön ayrılmış süreçlerin hepsi 0 MB, medya sekmesinin süreci kırpılmadı (11 MB, kendi zamanlayıcısıyla).
**Ölçülmedi:** gerçek ses akışında (kırpmanın ses sunucusunun bulunduğu süreçte takılma yapıp yapmadığı), kırpmanın
medya sırasında RDD/utility ses çözücülerinde sayfa hatası yaratıp yaratmadığı. Gerçek YouTube ile denenmedi (`soundplaying`
öznitelik elle işaretlendi).

**Diğer:** `memory_cleaner.uc.js` canlı profilden çıkarıldı (ana süreçte `forceGC+forceCC` ölçümde kazanç vermedi: 323 -> 320 MB;
sekme kapatma sonrası 278 vs 281 MB; her çağrı ~20 ms bloke), projede `profile/disabled/` altında. Canlı değerler (kullanıcı
düzenlemeleri): `DEEP_SLEEP_AFTER_MINUTES: 600` (pratikte kapalı), `DISCARD_AFTER_MINUTES: 10`, `KEEP_RECENT_TABS: 0`,
`RETRIM_WHEN_ALL_IDLE_SECONDS: 600`, `MINIMIZED_DELAY_SECONDS: 5`, freezer `EXEMPT_HOSTS` boş.

**Helium tarafı (aynı ilke, 2026-10-09):** `BackgroundTabTrimPolicy`'deki aynı genel kapı (`AllPagesIdle()` sesli sayfayı da
"meşgul" sayıyordu, tekrar kırpma yoktu, yardımcı süreçler hiç kırpılmıyordu) düzeltildi: yalnızca sesli sekmenin süreci muaf,
PiP/yakalama varken tarayıcı+GPU bekler, boştayken `repeat_seconds` ile tekrar kırpma, `helper_processes` (utility süreçleri
sesli sayfa varken atlanır, çünkü ses servisi onlardan ayırt edilemiyor) ve üç yeni Ayarlar > Performans öğesi. **Derlenmedi,
yalnızca tüm ezer serisinin kesin uygulanmasıyla ve başlıkların okunmasıyla doğrulandı**; CI derlemesi ve gerçek oturum gerekir.

## 14. Birleşik yaşam döngüsü betiği: `tab_lifecycle.uc.js` (2026-10-11)

Üç ayrı betik (trimmer/freezer/discarder) kendi saatleriyle çalışıp birbirini bilmediği için çakışıyordu; yerine tek dosya, sekme başına tek zaman çizelgesi (görünmez olduğu andan): 2 sn uyku + o sekmenin sürecinde GC/CC/heap-minimize, 60 sn derin uyku (uyanma yok; ikinci GC yalnızca bellek ilk temizlikten beri `DEEP_RECLAIM_IF_GROWN_MB` kadar büyüdüyse), derin uykudan 60 sn sonra ana süreç+GPU kırpma (tek global sayaç, çalışırken yenisi kurulmaz; yalnızca hiçbir sayfa görünmüyorsa, aksi halde sessizce iptal; iki kırpma arası en az 300 sn), 180 sn sekme süreci kırpma, 300 sn boşaltma. Pencere küçülünce seçili sekme de 'ayrılmış' sayılır ve 5 sn sonra genel küçültme (tüm süreçler) çalışır, 10 dk'da bir tekrar. Medya/yükleniyor sekmeler zincirin hiçbir adımına girmez; sabitlenmiş sekmeler yalnızca boşaltılmaz; süreci görünür/medya sekmeyle paylaşılan sekmede süreç düzeyindeki adımlar atlanır.

**Sınama (kısaltılmış süreler, geçici profil, `tools/firefox-marionette/lc_test.js` ve `lc_test2.js`):** uyku +2 sn, derin uyku +10 sn, sekme kırpma +16 sn, boşaltma +24 sn zaman çizelgesine uydu; uykuda 5 sn'de bir kısa uyanma çalıştı; derin uykuda uyanma yok; ana süreç+GPU kırpması bir sayfa görünürken iptal edildi; ikinci GC bellek 0,2 MB büyüyünce (eşik 0,5) atlandı; pencere küçülünce 12 süreç kırpıldı ve seçili sekmenin zinciri başladı; geri açınca çözüldü. **Sınanmadı:** gerçek ses/video (medya muafiyeti), birden çok pencere (lider mantığı), sabitlenmiş sekme, uzun süreli gerçek kullanım. Canlı profile henüz alınmadı: o üç eski betik chrome klasöründen çıkarılıp `tab_lifecycle.uc.js` konmalı.
