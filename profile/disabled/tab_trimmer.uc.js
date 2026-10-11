// tab_trimmer.uc.js - Arka plandaki süreçlerin çalışma kümesini (working set) kırpar
// Windows'ta EmptyWorkingSet (ctypes) kullanır. Sayfa içeriği KORUNUR: bellek sayfaları
// RAM'den çıkarılır, sekmeye dönünce gerektiğinde geri yüklenir. (Sıkıştırma kapalıysa sayfa dosyasına yazılır.)
// Günlük: <profil>\chrome\memlog.txt (ENABLE_LOGGING). Hatalar her zaman yazılır.
(function() {
    'use strict';

    if (window.TabTrimmer) return;
    if (typeof gBrowser === 'undefined') return;

    // ===========================================
    // AYARLAR
    // ===========================================
    const CONFIG = {
        // ------------------------------------------------------------------
        // 1) SEKME SÜREÇLERİNİN KIRPILMASI (arka plandaki sekmeler)
        // ------------------------------------------------------------------

        /**
         * Bir sekme (aslında onun süreci) kaç saniye boyunca ekranda görünmezse "arka planda" sayılıp
         * kırpılsın? Kırpma = sürecin RAM'deki sayfalarını diske/bekleme listesine taşır (içerik kaybolmaz).
         * Küçük değer (5-10): hemen kırpar, Görev Yöneticisi'nde daha az görünür ama sekmeler arasında
         *   gidip gelirken sayfa hataları artabilir. Büyük değer (60+): daha rahat geçiş, kırpma geç gelir.
         */
        HIDDEN_DELAY_SECONDS: 10,

        /**
         * Betik kaç saniyede bir durumu kontrol etsin? Düşük = daha hızlı tepki ama çok az daha fazla CPU.
         * 10 saniye idealdir; değiştirmenize gerek yok.
         */
        CHECK_INTERVAL_SECONDS: 15,

        /**
         * (Sadece TRIM_ONCE_PER_EPISODE kapalıyken geçerli.) Sekme hâlâ gizliyse kaç saniyede bir
         * tekrar kırpılsın? 0 = tekrar etme. Aşağıdaki TRIM_ONCE_PER_EPISODE açık olduğu sürece bu ayar kullanılmaz.
         */
        RETRIM_INTERVAL_SECONDS: 10,

        /**
         * true: Helium'daki gibi, her süreç gizli kaldığı her seferde YALNIZCA BİR KEZ kırpılır
         *   (sekmeyi açıp tekrar gizleyince yeniden kırpılır). Aktif kullanımda gereksiz kırpmayı önler.
         * false: RETRIM_INTERVAL_SECONDS ile sürekli tekrar kırpar (aktif kullanımda da).
         */
        TRIM_ONCE_PER_EPISODE: true,

        /**
         * true: Uzantı sürecini (uBlock Origin vb. uzantıların çalıştığı süreç) de kırpar.
         * Helium da uzantı sayfalarını kırpıyor. false yaparsanız uzantı süreci hep dolu kalır (~100+ MB).
         */
        TRIM_EXTENSION_PROCESS: true,

        /**
         * true: Ses çalan, Picture-in-Picture (küçük video penceresi) açık olan veya ekran/kamera paylaşan
         * sekmelerin süreçlerine dokunmaz (müzik/video donmasın diye). false yapmanız önerilmez.
         */
        SKIP_ACTIVE_MEDIA_TABS: true,

        // ------------------------------------------------------------------
        // 2) HİÇBİR SEKME GÖRÜNÜR DEĞİLKEN (pencere küçültülmüş / tamamen örtülmüş)
        // ------------------------------------------------------------------

        /**
         * true: Hiçbir sayfa ekranda görünmüyorsa (pencere küçültülmüş ya da başka pencerenin altında) ve
         * ses/video yoksa, ANA süreç ve GPU sürecini de kırpar (Helium'daki "tarayıcı arka plandayken de
         * belleği boşalt" seçeneğinin karşılığı). false: yalnızca sekme süreçleri kırpılır.
         */
        TRIM_ALL_WHEN_MINIMIZED: true,

        /**
         * Hiçbir sayfa görünmez olduktan kaç saniye sonra ana süreç + GPU kırpılsın?
         * Küçük = hızlı ama pencereyi hemen geri açarsanız boşuna kırpılmış olur. 10-60 mantıklı.
         */
        MINIMIZED_DELAY_SECONDS: 5,

        /**
         * (Sadece TRIM_ONCE_PER_EPISODE kapalıyken geçerli.) Ana süreç + GPU kaç saniyede bir tekrar kırpılsın?
         */
        MINIMIZED_RETRIM_SECONDS: 10,

        /**
         * ÖNEMLİ: Tamamen boşta (küçültülmüş) kalırken süreçler zamanla (arka plan işleri yüzünden) tekrar
         * şişer. Bu ayar, bu durumdayken BÜTÜN süreçleri (sekmeler, uzantı, ana, GPU) kaç saniyede bir
         * yeniden kırpacağını belirler. 120 = 2 dakikada bir. 0 = kapalı (yalnızca bir kez kırpılır, sonra
         * saatler içinde tekrar şişer). Yalnızca tamamen boştayken çalışır, siz kullanırken çalışmaz.
         * Küçük değer = bellek daha düşük kalır ama sayfa dosyasına daha sık yazılır.
         */
        RETRIM_WHEN_ALL_IDLE_SECONDS: 600,

        /**
         * true: Tamamen boştayken ana süreç + GPU'ya ek olarak geri kalan HER süreci de kırpar: ağ, ses/video
         * çözücü (RDD), depolama/yardımcı (utility) ve ön ayrılmış boş süreçler (toplam ~140 MB çalışma kümesi).
         * Helium bunlara dokunmuyor; siz istediğiniz için varsayılan true. Medya çalarken de çalışır (medya sekmesi hariç).
         */
        TRIM_HELPER_PROCESSES: true,

        /**
         * true: Ses çalan / Picture-in-Picture / ekran paylaşan bir sekme VARKEN bile (örn. YouTube'da müzik açık,
         * pencere küçültülmüş), "hiçbir sayfa görünmüyor" durumundaki kırpma ve tekrar kırpma DEVAM EDER;
         * yalnızca O MEDYA SEKMESİNİN SÜRECİ atlanır. Diğer sekmeler, uzantı, ana süreç, GPU ve yardımcı süreçler
         * kırpılır. false: medya çalarken boştaki kırpma tamamen durur (Helium'un davranışı; bellek zamanla şişer).
         * Not: PiP/ekran paylaşımı varsa görüntü işlendiği için GPU atlanır, yalnızca ses için GPU de kırpılır.
         */
        TRIM_OTHERS_WHILE_MEDIA_PLAYS: true,

        /**
         * true: Medya çalarken de boştaki "bellek temizliği" (GC+CC+heap-minimize) tüm süreçlere gönderilir.
         * UYARI: Bu bildirim medya sekmesinin sürecine de gider ve hariç tutulamaz (kısa duraklama olabilir).
         * false (önerilen): medya çalarken yalnızca ana süreçte GC/CC yapılır, medya sekmesine dokunulmaz.
         */
        RECLAIM_WHILE_MEDIA_PLAYS: false,

        // ------------------------------------------------------------------
        // 3) KIRPMADAN ÖNCE BELLEK TEMİZLİĞİ (çöp toplama)
        // ------------------------------------------------------------------

        /**
         * true: Tamamen boştayken, kırpmadan ÖNCE Firefox'a "belleği temizle" der (GC + CC + heap-minimize).
         * Kırpma belleği diske taşır, bu adım ise kullanılmayan belleği GERÇEKTEN serbest bırakır
         * (özel bellek/commit düşer). Helium'da yok; bizim eklememiz. Ölçümde -%26 özel bellek verdi.
         */
        RECLAIM_BEFORE_MINIMIZED_TRIM: true,

        /**
         * Temizlik komutundan sonra kırpmadan önce kaç saniye beklensin ki süreçler temizliği bitirsin?
         * 4 yeterli; değiştirmeyin.
         */
        RECLAIM_SETTLE_SECONDS: 4,

        /**
         * Pencere saatlerce boşta kalırsa temizlik kaç dakikada bir tekrarlansın? 30 = yarım saatte bir.
         * 0 = boşta kalma süresi boyunca yalnızca bir kez yapılır.
         */
        RECLAIM_REPEAT_MINUTES: 10,

        // ------------------------------------------------------------------
        // 4) GÜNLÜK (ne yaptığını görmek için)
        // ------------------------------------------------------------------

        /**
         * true: Yaptığı işleri (kırpma, temizlik, durum değişikliği) chrome\memlog.txt dosyasına yazar.
         * Çalışıp çalışmadığını bu dosyadan anlarsınız. Çok yer kaplamaz (400 KB'ta döner).
         * Hatalar bu ayardan bağımsız olarak HER ZAMAN yazılır.
         */
        ENABLE_LOGGING: true,

        /**
         * Kaç dakikada bir günlüğe "çalışıyorum" özet satırı yazsın (süreç sayısı, toplam özel bellek,
         * durum)? Betiğin canlı olduğunu görmek için. 0 = yazma.
         */
        HEARTBEAT_MINUTES: 10
    };

    // ===========================================
    // GÜNLÜK
    // ===========================================
    const TAG = 'TabTrimmer';
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
    const logErr = (...a) => { console.error('[' + TAG + ']', ...a); fileLog('E', a); };  // hatalar her zaman

    // ===========================================
    // WINDOWS API (ctypes)
    // ===========================================
    const PROCESS_SET_QUOTA = 0x0100;
    const PROCESS_QUERY_INFORMATION = 0x0400;

    let api = null;
    try {
        const { ctypes } = ChromeUtils.importESModule('resource://gre/modules/ctypes.sys.mjs');
        const lib = ctypes.open('kernel32.dll');
        api = {
            ctypes,
            lib,
            OpenProcess: lib.declare('OpenProcess', ctypes.winapi_abi,
                ctypes.voidptr_t, ctypes.uint32_t, ctypes.int32_t, ctypes.uint32_t),
            CloseHandle: lib.declare('CloseHandle', ctypes.winapi_abi,
                ctypes.int32_t, ctypes.voidptr_t),
            EmptyWorkingSet: lib.declare('K32EmptyWorkingSet', ctypes.winapi_abi,
                ctypes.int32_t, ctypes.voidptr_t)
        };
    } catch (e) {
        logErr('ctypes/kernel32 yüklenemedi, betik devre dışı:', e);
        return;
    }

    function trimPid(pid) {
        if (!pid || pid === Services.appinfo.processID && !trimmingParent) return false;
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

    // Ana süreç yalnızca "hepsi küçültüldü" yolunda kırpılır.
    let trimmingParent = false;

    // ===========================================
    // DURUM TOPLAMA
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

    function tabIsBusyOrMedia(tab) {
        if (tab.hasAttribute('busy')) return 'busy';
        if (!CONFIG.SKIP_ACTIVE_MEDIA_TABS) return null;
        if (tab.soundPlaying || tab.hasAttribute('soundplaying')) return 'audio';
        if (tab.hasAttribute('pictureinpicture')) return 'pip';
        if (tab.hasAttribute('sharing')) return 'sharing';
        return null;
    }

    /** pid -> {active, reason} haritası ve genel bilgiler. */
    function snapshot() {
        const procs = new Map();
        let anyMedia = false;
        const mediaKinds = new Set(); // 'audio' | 'pip' | 'sharing'
        let anyVisible = false; // ana süreçteki sayfalar (about:...) dahil, ekranda görünen herhangi bir sekme
        let mediaWhy = null;
        const wins = browserWindows();
        for (const win of wins) {
            for (const tab of win.gBrowser.tabs) {
                const br = tab.linkedBrowser;
                const bc = br && br.browsingContext;
                if (!bc) continue; // boşaltılmış / henüz yüklenmemiş sekme
                let reason = null;
                if (br.docShellIsActive) { reason = 'visible'; anyVisible = true; }
                else {
                    reason = tabIsBusyOrMedia(tab);
                    if (reason === 'audio' || reason === 'pip' || reason === 'sharing') { anyMedia = true; mediaKinds.add(reason); mediaWhy = mediaWhy || `${reason}:${(br.currentURI && br.currentURI.host) || '?'}`; }
                }
                let contexts;
                try { contexts = bc.getAllBrowsingContextsInSubtree(); } catch (e) { contexts = [bc]; }
                for (const c of contexts) {
                    let pid;
                    try { pid = c.currentWindowGlobal && c.currentWindowGlobal.domProcess &&
                                c.currentWindowGlobal.domProcess.osPid; } catch (e) {}
                    if (!pid || pid === Services.appinfo.processID) continue;
                    const cur = procs.get(pid) || { active: false, reason: null };
                    if (reason) { cur.active = true; cur.reason = cur.reason || reason; }
                    procs.set(pid, cur);
                }
            }
        }
        const allMinimized = wins.length > 0 && wins.every(w => w.windowState === w.STATE_MINIMIZED);
        const allIdle = wins.length > 0 && !anyVisible;
        return { procs, anyMedia, mediaKinds, mediaWhy, anyVisible, allIdle, allMinimized, windows: wins.length };
    }

    // ===========================================
    // ANA DÖNGÜ
    // ===========================================
    const hidden = new Map(); // pid -> {since, last}
    let minimized = { since: 0, last: 0 };
    let timer = null;
    let lastIdleState = null, lastHeartbeat = 0, trimCount = 0, lastTrimAt = 0;

    function isLeader() {
        const wins = browserWindows();
        return wins.length > 0 && wins[0] === window;
    }

    async function heartbeat(now, snap) {
        if (!CONFIG.HEARTBEAT_MINUTES || now - lastHeartbeat < CONFIG.HEARTBEAT_MINUTES * 60000) return;
        lastHeartbeat = now;
        let priv = '?', n = '?';
        try {
            const info = await ChromeUtils.requestProcInfo();
            n = 1 + info.children.length;
            priv = Math.round((info.memory + info.children.reduce((s, c) => s + c.memory, 0)) / 1048576);
        } catch (e) {}
        log(`çalışıyor: pencere=${snap.windows} süreç=${n} toplamÖzel=${priv}MB allIdle=${snap.allIdle} medya=${snap.anyMedia}${snap.mediaWhy ? '(' + snap.mediaWhy + ')' : ''} gizliTakip=${hidden.size} kırpmaSayısı=${trimCount} sonKırpma=${lastTrimAt ? Math.round((now - lastTrimAt) / 1000) + 'sn önce' : 'yok'}`);
    }

    async function tick(now = Date.now()) {
        if (window.closed || !isLeader()) return { skipped: true };
        const snap = snapshot();
        const result = { trimmed: [], trimmedTabs: [], trimmedExt: [], skippedActive: 0, minimizedTrim: [] };

        if (lastIdleState !== snap.allIdle || (snap.anyMedia && lastIdleState === true)) {
            log(`durum: allIdle=${snap.allIdle} medya=${snap.anyMedia}${snap.mediaWhy ? '(' + snap.mediaWhy + ')' : ''} minimized=${snap.allMinimized}`);
            lastIdleState = snap.allIdle;
        }
        // Medya (ses/PiP/paylaşım) yalnızca O SEKMENİN sürecini muaf tutar; geri kalan her süreç boştayken
        // kırpılmaya devam eder (TRIM_OTHERS_WHILE_MEDIA_PLAYS). Medya sekmesinin süreci aşağıda
        // candidates döngüsünde zaten `active` sayılıp atlanır.
        const idleOk = snap.allIdle && (!snap.anyMedia || CONFIG.TRIM_OTHERS_WHILE_MEDIA_PLAYS);
        const idleRetrim = CONFIG.RETRIM_WHEN_ALL_IDLE_SECONDS > 0 && idleOk;

        // 1) Sekme süreçleri (+ uzantı süreci: Helium'daki kExtension sayfaları gibi)
        // Not: Firefox tüm içerik süreçlerini "tab" türüyle başlattığı için uzantı sürecini
        // ChromeUtils.getAllDOMProcesses() ile remoteType === 'extension' olarak buluruz.
        const candidates = new Map(snap.procs);
        if (CONFIG.TRIM_EXTENSION_PROCESS) {
            try {
                for (const proc of ChromeUtils.getAllDOMProcesses()) {
                    if (proc.remoteType === 'extension' && proc.osPid && !candidates.has(proc.osPid)) {
                        candidates.set(proc.osPid, { active: false, reason: 'extension' });
                    }
                }
            } catch (e) { logErr('getAllDOMProcesses hatası', e); }
        }
        for (const [pid, p] of candidates) {
            if (p.active) { hidden.delete(pid); result.skippedActive++; continue; }
            let h = hidden.get(pid);
            if (!h) { h = { since: now, last: 0 }; hidden.set(pid, h); }
            if (now - h.since < CONFIG.HIDDEN_DELAY_SECONDS * 1000) continue;
            const due = h.last === 0 ||
                (idleRetrim && now - h.last >= CONFIG.RETRIM_WHEN_ALL_IDLE_SECONDS * 1000) ||
                (!CONFIG.TRIM_ONCE_PER_EPISODE && CONFIG.RETRIM_INTERVAL_SECONDS > 0 &&
                 now - h.last >= CONFIG.RETRIM_INTERVAL_SECONDS * 1000);
            if (!due) continue;
            if (trimPid(pid)) {
                h.last = now; result.trimmed.push(pid); trimCount++; lastTrimAt = now;
                (p.reason === 'extension' ? result.trimmedExt : result.trimmedTabs).push(pid);
            }
        }
        if (result.trimmed.length) {
            log(`kırpıldı: sekme süreci=${result.trimmedTabs.length} uzantı süreci=${result.trimmedExt.length}${idleRetrim ? ' (boşta tekrar kırpma)' : ''}`);
        }
        for (const pid of [...hidden.keys()]) if (!candidates.has(pid)) hidden.delete(pid);

        // 2) Hiçbir sayfa görünür değil: ana süreç + GPU + (isteğe bağlı) yardımcı/ön ayrılmış süreçler.
        //    Medya çalıyorsa bile yapılır; yalnızca medya sekmelerinin süreçleri atlanır.
        if (CONFIG.TRIM_ALL_WHEN_MINIMIZED && idleOk) {
            if (!minimized.since) minimized = { since: now, last: 0 };
            const waited = now - minimized.since >= CONFIG.MINIMIZED_DELAY_SECONDS * 1000;
            const due = minimized.last === 0 ||
                (idleRetrim && now - minimized.last >= CONFIG.RETRIM_WHEN_ALL_IDLE_SECONDS * 1000) ||
                (!CONFIG.TRIM_ONCE_PER_EPISODE &&
                 now - minimized.last >= CONFIG.MINIMIZED_RETRIM_SECONDS * 1000);
            if (waited && due) {
                try {
                    const reclaimDue = CONFIG.RECLAIM_BEFORE_MINIMIZED_TRIM && (!minimized.reclaimedAt ||
                        (CONFIG.RECLAIM_REPEAT_MINUTES > 0 && now - minimized.reclaimedAt >= CONFIG.RECLAIM_REPEAT_MINUTES * 60000));
                    if (reclaimDue) {
                        const CU = (typeof Cu !== 'undefined') ? Cu : Components.utils;
                        if (snap.anyMedia && !CONFIG.RECLAIM_WHILE_MEDIA_PLAYS) {
                            // 'memory-pressure' bildirimi TÜM süreçlere (medya sekmesininki dahil) gider ve
                            // hariç tutulamaz; bu yüzden medya çalarken yalnızca ana süreçte GC/CC yapılır.
                            CU.forceGC(); CU.forceCC();
                            log('boşta: medya çalıyor, yalnızca ana süreçte GC/CC (heap-minimize atlandı)');
                        } else {
                            CU.forceGC(); CU.forceCC(); CU.forceGC();
                            Services.obs.notifyObservers(null, 'memory-pressure', 'heap-minimize');
                            log('boşta: GC/CC/heap-minimize gönderildi');
                            // Çocuk süreçler GC'yi bitirsin, sonra kırp
                            await new Promise(r => window.setTimeout(r, CONFIG.RECLAIM_SETTLE_SECONDS * 1000));
                        }
                        minimized.reclaimedAt = now;
                        result.reclaimed = true;
                    }
                    const info = await ChromeUtils.requestProcInfo();
                    trimmingParent = true;
                    // Atlanacak süreçler: ses/PiP/paylaşım yapan veya görünür sekmelerin süreçleri.
                    const protectedPids = new Set([...snap.procs].filter(([, p]) => p.active).map(([pid]) => pid));
                    // PiP/ekran paylaşımında görüntü işlendiği için GPU da atlanır (yalnızca ses için kırpılır).
                    const keepGpu = snap.mediaKinds.has('pip') || snap.mediaKinds.has('sharing');
                    const pids = [info.pid, ...info.children
                        .filter(c => !protectedPids.has(c.pid))
                        .filter(c => c.type === 'gpu' ? !keepGpu : CONFIG.TRIM_HELPER_PROCESSES)
                        .map(c => c.pid)];
                    for (const pid of pids) if (trimPid(pid)) result.minimizedTrim.push(pid);
                    minimized.last = now; trimCount += result.minimizedTrim.length; lastTrimAt = now;
                    log(`boşta: ana süreç + GPU${CONFIG.TRIM_HELPER_PROCESSES ? ' + diğer süreçler' : ''} kırpıldı: ${result.minimizedTrim.length} süreç${snap.anyMedia ? ' (medya sekmesi atlandı: ' + snap.mediaWhy + ')' : ''}`);
                } catch (e) {
                    logErr('boşta kırpma hatası', e);
                } finally {
                    trimmingParent = false;
                }
            }
        } else {
            minimized = { since: 0, last: 0 };
        }
        await heartbeat(now, snap);
        return result;
    }

    function start() {
        if (timer) return;
        timer = window.setInterval(() => { tick().catch(e => logErr('tick hatası', e)); },
                                   CONFIG.CHECK_INTERVAL_SECONDS * 1000);
        // Günlük zorla açık: betiğin yüklendiği ve ayarları her zaman görünsün
        fileLog('I', [`yüklendi: pencere=${browserWindows().length} gizliGecikme=${CONFIG.HIDDEN_DELAY_SECONDS}s aralık=${CONFIG.CHECK_INTERVAL_SECONDS}s boştaYenidenKırp=${CONFIG.RETRIM_WHEN_ALL_IDLE_SECONDS}s günlük=${CONFIG.ENABLE_LOGGING}`]);
    }

    function stop() {
        if (timer) { window.clearInterval(timer); timer = null; }
        try { api.lib.close(); } catch (e) {}
        fileLog('I', ['durdu (pencere kapandı)']);
        delete window.TabTrimmer;
    }

    window.addEventListener('unload', stop, { once: true });
    window.TabTrimmer = { CONFIG, tick, snapshot, trimPid, hidden, start, stop };
    start();
})();
