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
//  300 sn   7) Sekme BOŞALTILIR (discard): süreç kapanır, bellek tamamen serbest kalır; tıklayınca yeniden yüklenir.
//  + Pencere küçültülünce "genel küçültme": birkaç sn sonra tüm süreçler kırpılır, boşta kaldıkça periyodik tekrar.
//
// MUAFİYETLER: Ses/video/PiP/paylaşım yapan sekmeler ve yüklenmekte olanlar zincirin HİÇBİR adımına girmez
// (süreçleri de kırpılmaz). Sabitlenmiş sekmeler yalnızca boşaltılmaz. Süreci görünür/medya sekmeyle paylaşılan
// sekmede süreç düzeyindeki adımlar (GC, kırpma, boşaltma) atlanır, ki aktif sekme yavaşlamasın.
//
// Günlük: <profil>\chrome\memlog.txt (ENABLE_LOGGING). Hatalar her zaman yazılır.
(function() {
    'use strict';

    if (window.TabLifecycle) return;
    if (typeof gBrowser === 'undefined') return;

    // ===========================================
    // AYARLAR (süreler "sekme görünmez olduktan sonra" geçen saniyedir)
    // ===========================================
    const CONFIG = {
        // ------------------------------------------------------------------
        // 1) UYKU (adım 1-2)
        // ------------------------------------------------------------------

        /**
         * Sekmeden ayrıldıktan kaç saniye sonra sekme uykuya geçsin? Uyku = setTimeout/setInterval durur,
         * sayfa içeriği ve durumu aynen kalır. Çok küçük (0-1) yaparsanız sekmeler arasında hızlı gidip
         * gelirken gereksiz dondurup çözer. 2-5 mantıklıdır.
         */
        SLEEP_AFTER_SECONDS: 2,

        /**
         * Uykudaki (henüz derin uykuya geçmemiş) sekme kaç saniyede bir kısa süre uyansın? Bazı siteler arka
         * planda ara sıra çalışmak ister. 0 = uykuda da hiç uyandırma. Derin uykuda uyandırma HİÇ yoktur.
         */
        SLEEP_WAKE_INTERVAL_SECONDS: 20,

        /** Uyanık kalma süresi (saniye). Yalnızca SLEEP_WAKE_INTERVAL_SECONDS > 0 ise kullanılır. */
        SLEEP_WAKE_DURATION_SECONDS: 2,

        /**
         * Bu sitelerin sekmeleri ASLA uyutulmaz (alt alan adları dahil: "google.com" yazarsanız mail.google.com da
         * kapsanır). Sohbet/e-posta/toplantı gibi arka planda bağlantı tutması gerekenler için. Bu sekmelerde
         * yine de bellek temizliği (GC/CC) ve kırpma yapılır; bunlar siteyi bozmaz.
         */
        SLEEP_EXEMPT_HOSTS: [],

        /**
         * true: Sekme uykuya geçince O SEKMENİN sürecinde GC + CC + heap-minimize çalışır (adım 2). Sayfa içeriği
         * silinmez, yalnızca çöp atılır. Süreç görünür/medya sekmeyle paylaşılıyorsa atlanır.
         */
        RECLAIM_ON_SLEEP: true,

        // ------------------------------------------------------------------
        // 2) DERİN UYKU (adım 3-4)
        // ------------------------------------------------------------------

        /** Sekme kaç saniye görünmez kalınca derin uykuya geçsin? (Artık hiç uyandırılmaz.) */
        DEEP_SLEEP_AFTER_SECONDS: 60,

        /**
         * Derin uykuya geçerken ikinci bellek temizliği (adım 4) yalnızca, sürecin belleği ilk temizlikten (adım 2)
         * beri en az bu kadar MB büyüdüyse yapılır. Çünkü zamanlayıcılar durmuşken bellek pek büyümez ve her
         * temizlik, sekmeye dönünce JIT kodunu soğuk bırakıp ilk anı yavaşlatır. 0 = her zaman yap.
         */
        DEEP_RECLAIM_IF_GROWN_MB: 8,

        // ------------------------------------------------------------------
        // 3) ANA SÜREÇ + GPU KIRPMA (adım 5)
        // ------------------------------------------------------------------

        /**
         * Bir sekme derin uykuya girdikten kaç saniye sonra ana süreç + GPU kırpılsın? Tek bir sayaç vardır: sayaç
         * çalışırken başka bir sekmenin derin uykuya girmesi onu yeniden başlatmaz. Sayaç dolunca kırpma YALNIZCA
         * hiçbir sayfa ekranda görünmüyorsa (pencere küçük/örtülü) yapılır; siz bir sekmeyi kullanırken ana süreç ve
         * GPU kırpılırsa takılma olur, bu yüzden o durumda sayaç sessizce iptal edilir.
         */
        MAIN_GPU_TRIM_AFTER_DEEP_SECONDS: 60,

        /** İki ana süreç + GPU kırpması arasında en az kaç saniye geçsin? (Sık sık kırpmayı önler.) */
        MAIN_GPU_MIN_INTERVAL_SECONDS: 300,

        // ------------------------------------------------------------------
        // 4) SEKME SÜRECİ KIRPMA (adım 6)
        // ------------------------------------------------------------------

        /**
         * Sekme kaç saniye görünmez kalınca O SEKMENİN süreci kırpılsın (EmptyWorkingSet)? Sayfalar RAM'den
         * çıkar, içerik kaybolmaz. Süreç görünür/medya sekmeyle paylaşılıyorsa atlanır. 0 = kapalı.
         */
        TAB_TRIM_AFTER_SECONDS: 180,

        // ------------------------------------------------------------------
        // 5) BOŞALTMA (adım 7)
        // ------------------------------------------------------------------

        /**
         * Sekme kaç saniye görünmez kalınca boşaltılsın (discard)? Süreç kapanır, bellek gerçekten serbest kalır;
         * sekmeye tıklayınca sayfa yeniden yüklenir (kaydırma/form verisi geri gelir, canlı durum kaybolabilir).
         * 0 = boşaltma kapalı.
         */
        DISCARD_AFTER_SECONDS: 300,

        /** true: Sabitlenmiş sekmeler asla boşaltılmaz (uyku/kırpma yine uygulanır). */
        DISCARD_SKIP_PINNED: true,

        /** true: Yalnızca http/https sekmeler boşaltılır (about:, uzantı, dosya sayfalarına dokunulmaz). */
        DISCARD_ONLY_HTTP: true,

        /**
         * true: Süreci görünür/medya/yükleniyor bir sekmeyle paylaşılan sekme boşaltılmaz. Boşaltmak o süreci
         * kapatmaz (bellek kazanılmaz) ama sekmeyi boşuna yeniden yükletir. "Sürece zarar vermeyen" kuralı budur.
         */
        DISCARD_SKIP_SHARED_PROCESS: true,

        /**
         * Bu sitelerin sekmeleri HİÇ boşaltılmaz (alt alan adları dahil). Yarım kalmış yazı, sohbet, toplantı,
         * canlı akış gibi içeriği kaybolmaması gereken siteler. (Uyku/kırpma bunlara yine uygulanır.)
         */
        DISCARD_EXEMPT_HOSTS: [
            'chatgpt.com', 'openai.com', 'claude.ai', 'web.whatsapp.com', 'discord.com',
            'slack.com', 'teams.microsoft.com', 'teams.live.com', 'mail.google.com',
            'outlook.live.com', 'outlook.office.com', 'meet.google.com', 'web.telegram.org',
            'netflix.com', 'youtube.com', 'spotify.com', 'docs.google.com'
        ],

        /** true: HİÇBİR sekmeyi boşaltmaz, yalnızca "boşaltırdım" diye günlüğe yazar (deneme için). */
        DRY_RUN_DISCARD: false,

        // ------------------------------------------------------------------
        // 6) GENEL KÜÇÜLTME ADIMI (pencere küçültülünce / tamamen örtülünce)
        // ------------------------------------------------------------------

        /**
         * true: Hiçbir sayfa görünmüyorsa (pencere küçültüldü) TÜM süreçler (ana, GPU, yardımcı, uzantı ve
         * gizli sekme süreçleri) kırpılır ve boşta kaldıkça periyodik tekrarlanır. Küçültülen pencerede seçili
         * sekme de "ayrılmış" sayılır: kendi zaman çizelgesi (uyku, derin uyku...) başlar.
         */
        MINIMIZE_TRIM_ENABLED: true,

        /** Hiçbir sayfa görünmez olduktan kaç saniye sonra genel kırpma başlasın? */
        MINIMIZE_TRIM_AFTER_SECONDS: 5,

        /**
         * Boşta kalırken süreçler zamanla şişer. Kaç dakikada bir tekrar (önce global GC/CC, sonra kırpma)
         * yapılsın? 0 = yalnızca bir kez.
         */
        MINIMIZE_RETRIM_MINUTES: 10,

        /** true: Genel kırpmada ağ/ses/depolama gibi yardımcı süreçler de kırpılır. false: yalnızca ana + GPU + sekmeler. */
        TRIM_HELPER_PROCESSES: true,

        /** true: Uzantı sürecini (uBlock vb.) de kırpar. */
        TRIM_EXTENSION_PROCESS: true,

        /**
         * true: Ses çalan bir sekme VARKEN de genel küçültme ve derin uyku sonrası kırpma devam eder; yalnızca O
         * MEDYA SEKMESİNİN SÜRECİ atlanır. PiP/ekran paylaşımı varsa GPU da atlanır (görüntü işleniyor).
         */
        TRIM_OTHERS_WHILE_MEDIA_PLAYS: true,

        /** true: Ses çalan / PiP / ekran-kamera paylaşan sekmeler zincirin hiçbir adımına girmez. Önerilir. */
        SKIP_ACTIVE_MEDIA_TABS: true,

        // ------------------------------------------------------------------
        // 7) ZAMANLAMA VE GÜNLÜK
        // ------------------------------------------------------------------

        /** Betik kaç saniyede bir sekmelere baksın? 1 = süre hassasiyeti 1 sn. Hafif bir iştir. */
        TICK_SECONDS: 1,

        /** true: Yaptığı işleri chrome\memlog.txt dosyasına yazar. Hatalar bu ayardan bağımsız HER ZAMAN yazılır. */
        ENABLE_LOGGING: true,

        /** Kaç dakikada bir günlüğe "çalışıyorum" özet satırı yazılsın? 0 = yazma. */
        HEARTBEAT_MINUTES: 10
    };

    // ===========================================
    // GÜNLÜK
    // ===========================================
    const TAG = 'TabLifecycle';
    let logPath = null, logBytes = 0;
    try { logPath = PathUtils.join(PathUtils.profileDir, 'chrome', 'memlog.txt'); } catch (e) {}
    function fileLog(level, args) {
        try {
            if (!logPath) return;
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
        addMessageListener('TabLifecycle:Reclaim', () => {
            try {
                Cu.forceGC();
                Cu.forceCC();
                Cu.forceGC();
                // about:memory "Minimize memory usage" ile aynı bildirim, ama yalnızca bu süreçte
                Services.obs.notifyObservers(null, 'memory-pressure', 'heap-minimize');
            } catch (e) { Cu.reportError('TabLifecycle reclaim: ' + e); }
        });
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
                    const cur = procs.get(pid) || { active: false };
                    if (reason) cur.active = true;
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

    /** GC + CC + heap-minimize, yalnızca bu sekmenin içerik sürecinde. Süreç aktif bir sekmeyle paylaşılıyorsa atlanır. */
    function reclaimTab(tab, st, now, why) {
        const pid = pidOf(tab);
        if (pid) {
            const p = snap().procs.get(pid);
            if (p && p.active) { log(`bellek temizliği atlandı (süreç paylaşılıyor, ${why}):`, label(tab)); return false; }
        }
        if (!send(tab, 'Reclaim')) return false;
        st.reclaimedAt = now;
        log(`GC/CC/minimize (${why}):`, label(tab), pid);
        // Temizlik bittikten sonra bellek ölçülür; derin uykudaki ikinci temizlik bununla kıyaslar.
        if (pid) window.setTimeout(async () => { const m = await processMemory(pid); if (m != null) st.baseMem = m; }, 3000);
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
        const s = snap();
        const pids = new Set();
        let shared = false;
        for (const c of contexts) {
            let pid;
            try { pid = c.currentWindowGlobal && c.currentWindowGlobal.domProcess && c.currentWindowGlobal.domProcess.osPid; } catch (e) {}
            if (!pid || pid === Services.appinfo.processID) continue;
            const p = s.procs.get(pid);
            if (p && p.active) { shared = true; continue; }
            pids.add(pid);
        }
        if (shared && !pids.size) {
            st.trimRetryAt = now + 30000;
            log('kırpma ertelendi (süreç aktif sekmeyle paylaşılıyor):', label(tab));
            return;
        }
        let n = 0;
        for (const pid of pids) if (trimPid(pid)) n++;
        st.trimmed = true;
        log(`SEKME KIRPMA (${CONFIG.TAB_TRIM_AFTER_SECONDS}sn): ${n} süreç:`, label(tab));
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

    function processTab(tab, now) {
        const br = tab.linkedBrowser;
        let st = state.get(tab);
        if (!br || !br.browsingContext) { if (st) state.delete(tab); return; }   // boşaltılmış sekme
        const reason = activeReason(tab);
        if (reason) { if (st) resetTab(tab, `aktif: ${reason}`); return; }
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
    const g = { armedAt: 0, lastMainGpu: 0, minSince: 0, minLast: 0, trimCount: 0, lastHeartbeat: 0 };

    /** Bir sekme derin uykuya girdi: sayaç çalışmıyorsa başlat (çalışıyorsa yeniden başlatma). */
    function noteDeepSleep(now) {
        const lead = browserWindows()[0];
        const t = lead && lead.TabLifecycle;
        if (t && t.armMainGpu) t.armMainGpu(now);
    }
    function armMainGpu(now) {
        if (!g.armedAt) { g.armedAt = now; log(`ana süreç+GPU sayacı başladı (${CONFIG.MAIN_GPU_TRIM_AFTER_DEEP_SECONDS}sn)`); }
    }

    async function trimMainAndGpu(s, now, why) {
        const info = await ChromeUtils.requestProcInfo();
        const keepGpu = s.mediaKinds.has('pip') || s.mediaKinds.has('sharing');
        const pids = [info.pid, ...info.children.filter(c => c.type === 'gpu' && !keepGpu).map(c => c.pid)];
        let n = 0;
        for (const pid of pids) if (trimPid(pid, true)) n++;
        g.lastMainGpu = now; g.trimCount += n;
        log(`ANA SÜREÇ + GPU kırpıldı (${why}): ${n} süreç${keepGpu ? ' (GPU atlandı: görüntü işleniyor)' : ''}${s.anyMedia ? ' (medya sekmesi atlandı: ' + s.mediaWhy + ')' : ''}`);
    }

    async function minimizeTrim(s, now, repeat) {
        const CU = (typeof Cu !== 'undefined') ? Cu : Components.utils;
        if (repeat) {
            // Boşta uzun süre kalındıysa önce global bellek temizliği
            if (s.anyMedia) {
                // 'memory-pressure' TÜM süreçlere (medya sekmesininki dahil) gider; medya çalarken yalnızca ana süreçte GC/CC
                CU.forceGC(); CU.forceCC();
                log('genel küçültme: medya çalıyor, yalnızca ana süreçte GC/CC');
            } else {
                CU.forceGC(); CU.forceCC(); CU.forceGC();
                Services.obs.notifyObservers(null, 'memory-pressure', 'heap-minimize');
                log('genel küçültme: GC/CC/heap-minimize gönderildi');
                await new Promise(r => window.setTimeout(r, 4000));
            }
        }
        const info = await ChromeUtils.requestProcInfo();
        const protectedPids = new Set([...s.procs].filter(([, p]) => p.active).map(([pid]) => pid));
        const keepGpu = s.mediaKinds.has('pip') || s.mediaKinds.has('sharing');
        const isContent = t => t === 'gpu' || /^(web|extension|file|privileged|inference)/.test(t || '');
        const kids = info.children.filter(c => !protectedPids.has(c.pid))
            .filter(c => c.type === 'gpu' ? !keepGpu : (CONFIG.TRIM_HELPER_PROCESSES || isContent(c.type)))
            .filter(c => c.type !== 'extension' || CONFIG.TRIM_EXTENSION_PROCESS);
        let n = 0;
        for (const pid of [info.pid, ...kids.map(c => c.pid)]) if (trimPid(pid, true)) n++;
        g.lastMainGpu = now; g.minLast = now; g.trimCount += n;
        log(`GENEL KÜÇÜLTME: ${n} süreç kırpıldı${s.anyMedia ? ' (medya sekmesi atlandı: ' + s.mediaWhy + ')' : ''}`);
    }

    let globalBusy = false;
    async function globalStep(now) {
        if (globalBusy) return;
        globalBusy = true;
        try {
            const q = quickState();
            const mediaOk = !q.anyMedia || CONFIG.TRIM_OTHERS_WHILE_MEDIA_PLAYS;

            // 5) Derin uykudan sonra ana süreç + GPU
            if (g.armedAt && now - g.armedAt >= CONFIG.MAIN_GPU_TRIM_AFTER_DEEP_SECONDS * 1000) {
                g.armedAt = 0;
                if (!q.allIdle) log('ana süreç+GPU kırpması iptal: bir sayfa görünür (kullanırken kırpılmaz)');
                else if (!mediaOk) log('ana süreç+GPU kırpması iptal: medya çalıyor');
                else if (now - g.lastMainGpu < CONFIG.MAIN_GPU_MIN_INTERVAL_SECONDS * 1000) log('ana süreç+GPU kırpması atlandı: yakın zamanda yapıldı');
                else await trimMainAndGpu(snapshotAll(), now, 'derin uyku sonrası');
            }

            // Genel küçültme: hiçbir sayfa görünür değil
            if (CONFIG.MINIMIZE_TRIM_ENABLED && q.allIdle && mediaOk) {
                if (!g.minSince) { g.minSince = now; g.minLast = 0; log('hiçbir sayfa görünmüyor: genel küçültme sayacı başladı'); }
                const due = g.minLast === 0
                    ? now - g.minSince >= CONFIG.MINIMIZE_TRIM_AFTER_SECONDS * 1000
                    : (CONFIG.MINIMIZE_RETRIM_MINUTES > 0 && now - g.minLast >= CONFIG.MINIMIZE_RETRIM_MINUTES * 60000);
                if (due) await minimizeTrim(snapshotAll(), now, g.minLast !== 0);
            } else if (g.minSince) {
                g.minSince = 0; g.minLast = 0;
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
        snapCache = null;
        for (const tab of gBrowser.tabs) {
            try { processTab(tab, now); } catch (e) { logErr('sekme hatası', label(tab), e); }
        }
        if (isLeader()) { await globalStep(now); await heartbeat(now); }
        return { ok: true };
    }

    // Sekmeye dönüldüğünde beklemeden çöz
    function onTabSelect(e) {
        resetTab(e.target, 'sekmeye dönüldü');
        // Ayrılan sekmenin süresi hemen başlasın
        const prev = e.detail && e.detail.previousTab;
        if (prev && prev.linkedBrowser && !state.get(prev)) state.set(prev, { hiddenSince: Date.now() });
    }
    // Pencere küçültülüp geri açılınca / öne gelince beklemeden değerlendir (sekmelerin "görünür" durumu
    // pencere olayından kısa süre sonra güncellenir; bu yüzden iki kez bakılır).
    function onWindowWake() {
        for (const ms of [100, 700]) window.setTimeout(() => { tick().catch(e => logErr('tick hatası', e)); }, ms);
    }
    const WAKE_EVENTS = ['sizemodechange', 'activate', 'focus'];

    let timer = null;
    function start() {
        if (timer) return;
        WAKE_EVENTS.forEach(ev => window.addEventListener(ev, onWindowWake));
        gBrowser.tabContainer.addEventListener('TabSelect', onTabSelect);
        timer = window.setInterval(() => { tick().catch(e => logErr('tick hatası', e)); }, CONFIG.TICK_SECONDS * 1000);
        fileLog('I', [`yüklendi: uyku=${CONFIG.SLEEP_AFTER_SECONDS}s derin=${CONFIG.DEEP_SLEEP_AFTER_SECONDS}s anaGPU=+${CONFIG.MAIN_GPU_TRIM_AFTER_DEEP_SECONDS}s sekmeKırpma=${CONFIG.TAB_TRIM_AFTER_SECONDS}s boşaltma=${CONFIG.DISCARD_AFTER_SECONDS}s günlük=${CONFIG.ENABLE_LOGGING}`]);
    }
    function stop() {
        if (timer) { window.clearInterval(timer); timer = null; }
        try { gBrowser.tabContainer.removeEventListener('TabSelect', onTabSelect); } catch (e) {}
        try { WAKE_EVENTS.forEach(ev => window.removeEventListener(ev, onWindowWake)); } catch (e) {}
        // Pencere kapanırken uyuyan sekmeleri çöz
        try { for (const tab of gBrowser.tabs) { const st = state.get(tab); if (st) unfreezeTab(tab, st); } } catch (e) {}
        try { api.lib.close(); } catch (e) {}
        fileLog('I', ['durdu (pencere kapandı)']);
        delete window.TabLifecycle;
    }

    window.addEventListener('unload', stop, { once: true });
    window.TabLifecycle = { CONFIG, tick, state, g, armMainGpu, snapshotAll, quickState, trimPid, start, stop };
    start();
})();
