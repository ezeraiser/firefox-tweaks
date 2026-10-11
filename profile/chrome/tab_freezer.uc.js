// tab_freezer.uc.js - Gizli sekmelerin zamanlayıcılarını dondurur (içerik KORUNUR)
// Chrome'daki "tab freezing" mantığının Firefox karşılığı: uzun süre gizli kalan sekmenin
// setTimeout/setInterval'ları askıya alınır, belli aralıklarla kısa süre uyandırılır,
// sekmeye dönünce hemen devam eder.
//
// UYARI: Bellek (commit) AZALTMAZ. CPU uyanmalarını ve bellek geri dolmasını azaltır.
// WebSocket / fetch / worker'lar çalışmaya devam eder; yalnızca sayfanın zamanlayıcıları durur.
// Yan dosya gerekmez: içerik tarafı bir çerçeve betiği (frame script) olarak gömülüdür.
(function() {
    'use strict';

    if (window.TabFreezer) return;
    if (typeof gBrowser === 'undefined') return;

    // ===========================================
    // AYARLAR
    // ===========================================
    const CONFIG = {
        // ------------------------------------------------------------------
        // 1) NE ZAMAN DONDURULSUN?
        // ------------------------------------------------------------------

        /**
         * Bir sekmeden ayrıldıktan (başka sekmeye geçtikten) kaç saniye sonra o sekme dondurulsun?
         * "Dondurmak" = sayfanın zamanlayıcıları (setTimeout/setInterval) durdurulur; sayfa içeriği ve
         * durumu aynen kalır. Çok küçük (0-1) yaparsanız sekmeler arasında hızlı gidip gelirken gereksiz
         * dondurup çözer. 2-5 mantıklıdır.
         */
        FREEZE_AFTER_SECONDS: 2,

        /**
         * En son kullandığınız kaç GİZLİ sekme DONDURULMASIN? Örneğin 1: hemen önceki sekmeniz her zaman
         * canlı kalır (geri dönmek hızlı olur). 0: ayrıldığınız her sekme dondurulur.
         * Helium'daki "hiç dondurulmayan son kullanılan sekme sayısı" ayarının karşılığı.
         */
        PROTECTED_RECENT_TABS: 0,

        /**
         * Kontrol aralığı (saniye). Betik sekmelerin durumuna bu sıklıkla bakar (ayrıca sekme
         * değişiminde hemen bakar). Değiştirmenize gerek yok.
         */
        CHECK_INTERVAL_SECONDS: 3,

        /**
         * true: Ses çalan, Picture-in-Picture (küçük video) açık olan veya ekran/kamera paylaşan sekmelere
         * dokunulmaz (müzik/video durmasın diye). false yapmanız önerilmez.
         */
        SKIP_ACTIVE_MEDIA_TABS: true,

        /**
         * true: Sabitlenmiş (pinned) sekmeleri dondurma. false: sabitlenmişler de diğerleri gibi donar.
         */
        SKIP_PINNED_TABS: false,

        // ------------------------------------------------------------------
        // 1b) DERİN UYKU (tarayıcının tamamı uzun süre kullanılmazsa)
        // ------------------------------------------------------------------

        /**
         * Hiçbir pencerede hiçbir sekme görünür DEĞİLSE (pencere küçültülmüş / başka pencerenin altında)
         * ve bu durum kaç DAKİKA sürerse "derin uyku" başlasın? Derin uykuda bütün sekmeler dondurulur:
         * seçili sekme, korunan son sekmeler (PROTECTED_RECENT_TABS) ve muaf siteler (EXEMPT_HOSTS) dahil.
         * TEK İSTİSNA: ses çalan / Picture-in-Picture / ekran paylaşan sekmeler ve şu an yüklenmekte olanlar
         * (bunlar donarsa müzik/video durur ya da sayfa yarım yüklenir). Pencereyi geri açınca her şey
         * anında çözülür. 0 = derin uyku kapalı.
         * NOT: Derin uyku bitmeden, küçültülmüş pencerede seçili olan sekme DONDURULMAZ (5 dk dolunca donar).
         */
        DEEP_SLEEP_AFTER_MINUTES: 600,

        // ------------------------------------------------------------------
        // 2) DONDURULMUŞ SEKME UYANDIRILSIN MI?
        // ------------------------------------------------------------------

        /**
         * Donmuş bir sekmeyi kaç saniyede bir kısa süreliğine uyandır? Bazı siteler arka planda ara sıra
         * çalışmak ister (bildirim, senkron). 0 = HİÇ uyandırma, yalnızca sekmeye geçince çözülür
         * (Helium'daki "dondurulmuş sekmeleri uyandır: hiç" ayarı).
         */
        WAKE_INTERVAL_SECONDS: 0,

        /**
         * (Sadece WAKE_INTERVAL_SECONDS 0'dan büyükse) uyanık kalma süresi, saniye.
         */
        WAKE_DURATION_SECONDS: 5,

        // ------------------------------------------------------------------
        // 3) DONDURMADAN SONRA BELLEK TEMİZLİĞİ (çöp toplama)
        // ------------------------------------------------------------------

        /**
         * true: Bir sekme dondurulunca, YALNIZCA o sekmenin sürecinde "belleği temizle" komutu çalışır
         * (GC + CC + heap-minimize). Sayfa içeriği silinmez, yalnızca çöp (kullanılmayan bellek) atılır;
         * bellek GERÇEKTEN düşer. Süreç başka bir görünür/ses çalan sekmeyle paylaşılıyorsa o sekme
         * yavaşlamasın diye atlanır. Ölçüm: çöp biriken sayfada 231 -> 35 MB, taze sayfalarda %5-8.
         */
        RECLAIM_ON_FREEZE: true,

        /**
         * true: Aşağıdaki muaf sitelerde (EXEMPT_HOSTS) zamanlayıcı DONDURULMAZ ama bellek temizliği
         * (GC+CC) yine yapılır. Temizlik sitenin çalışmasını bozmaz (WebSocket/bildirim sürer).
         */
        RECLAIM_EXEMPT_HOSTS: true,

        // ------------------------------------------------------------------
        // 4) DONDURULMAYACAK SİTELER
        // ------------------------------------------------------------------

        /**
         * Bu sitelerin sekmeleri HİÇ dondurulmaz (alt alan adları da dahil: "google.com" yazarsanız
         * mail.google.com da kapsanır). Sohbet, e-posta, toplantı ve canlı bağlantılı siteler buraya girer,
         * çünkü zamanlayıcıları durursa bağlantı koparabilir veya bildirim gelmeyebilir.
         * Kendi sitelerinizi buraya ekleyebilirsiniz.
         */
        EXEMPT_HOSTS: [
           
        ],

        // ------------------------------------------------------------------
        // 5) GÜNLÜK
        // ------------------------------------------------------------------

        /**
         * true: Yaptığı işleri (dondurma, çözme, bellek temizliği) chrome\memlog.txt dosyasına yazar.
         * Çalışıp çalışmadığını bu dosyadan anlarsınız. Hatalar bu ayardan bağımsız HER ZAMAN yazılır.
         */
        ENABLE_LOGGING: true
    };

    // Günlük: <profil>\chrome\memlog.txt (ENABLE_LOGGING). Hatalar her zaman yazılır.
    const TAG = 'TabFreezer';
    let logPath = null, logBytes = 0;
    try { logPath = PathUtils.join(PathUtils.profileDir, 'chrome', 'memlog.txt'); } catch (e) {}
    function fileLog(level, args) {
        try {
            if (!logPath) return;
            const text = args.map(a => (a && a.stack) ? a.stack : (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
            const line = `${new Date().toISOString()} [${TAG}${level === 'E' ? ' ERROR' : ''}] ${text}
`;
            logBytes += line.length;
            if (logBytes > 400000) { logBytes = 0; IOUtils.move(logPath, logPath + '.old').catch(() => {}); }
            IOUtils.writeUTF8(logPath, line, { mode: 'appendOrCreate' }).catch(() => {});
        } catch (e) {}
    }
    const log = (...a) => { if (CONFIG.ENABLE_LOGGING) { console.log('[' + TAG + ']', ...a); fileLog('I', a); } };
    const logErr = (...a) => { console.error('[' + TAG + ']', ...a); fileLog('E', a); };

    // ===========================================
    // İÇERİK SÜRECİ TARAFI (çerçeve betiği)
    // ===========================================
    // content.windowUtils.suspendTimeouts(): sayfa + alt pencerelerinin setTimeout/setInterval
    // sayaçlarını askıya alır. innerWindowId kontrolü: sayfa gezinirse yeni belge askıda olmaz,
    // eski askıyı yanlışlıkla "çözmeye" çalışmayalım.
    const FRAME_SCRIPT = `
        let frozenId = 0;
        addMessageListener('TabFreezer:Freeze', () => {
            try {
                const id = content.windowGlobalChild.innerWindowId;
                if (frozenId === id) return;
                if (frozenId) frozenId = 0;
                content.windowUtils.suspendTimeouts();
                frozenId = id;
            } catch (e) { Cu.reportError('TabFreezer freeze: ' + e); }
        });
        addMessageListener('TabFreezer:Reclaim', () => {
            try {
                Cu.forceGC();
                Cu.forceCC();
                Cu.forceGC();
                // about:memory "Minimize memory usage" ile aynı bildirim, ama yalnızca bu süreçte
                Services.obs.notifyObservers(null, 'memory-pressure', 'heap-minimize');
            } catch (e) { Cu.reportError('TabFreezer reclaim: ' + e); }
        });
        addMessageListener('TabFreezer:Unfreeze', () => {
            try {
                if (frozenId && frozenId === content.windowGlobalChild.innerWindowId) {
                    content.windowUtils.resumeTimeouts();
                }
            } catch (e) { Cu.reportError('TabFreezer unfreeze: ' + e); }
            frozenId = 0;
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
    function hostExempt(host) {
        return CONFIG.EXEMPT_HOSTS.some(h => host === h || host.endsWith('.' + h));
    }

    /**
     * Sekme dondurulabilir mi? (dondurma adayı değilse neden döner).
     * deep=true (derin uyku): muaf siteler ve "seçili sekme" kuralı yok sayılır; yalnızca
     * medya (ses/PiP/paylaşım), yükleniyor ve (ayara göre) sabitlenmiş sekmeler hariç tutulur.
     */
    function ineligibleReason(tab, deep = false) {
        const br = tab.linkedBrowser;
        if (!br || !br.browsingContext) return 'discarded';
        if (br.docShellIsActive) return 'visible';
        if (tab.hasAttribute('busy')) return 'busy';
        if (CONFIG.SKIP_PINNED_TABS && tab.pinned) return 'pinned';
        if (CONFIG.SKIP_ACTIVE_MEDIA_TABS) {
            if (tab.soundPlaying || tab.hasAttribute('soundplaying')) return 'audio';
            if (tab.hasAttribute('pictureinpicture')) return 'pip';
            if (tab.hasAttribute('sharing')) return 'sharing';
        }
        let uri;
        try { uri = br.currentURI; } catch (e) { return 'nouri'; }
        if (!uri || !(uri.schemeIs('http') || uri.schemeIs('https'))) return 'scheme';
        if (deep) return null;
        // Küçültülmüş pencerede seçili sekme, derin uyku başlayana kadar donmaz
        if (tab.selected && CONFIG.DEEP_SLEEP_AFTER_MINUTES > 0) return 'selected';
        let host = '';
        try { host = uri.host; } catch (e) { return 'nohost'; }
        if (hostExempt(host)) return 'exempt';
        return null;
    }

    // ----- Derin uyku: TÜM pencerelerde hiçbir sekme görünür değil mi? -----
    function allWindowsIdle() {
        const en = Services.wm.getEnumerator('navigator:browser');
        let wins = 0;
        while (en.hasMoreElements()) {
            const w = en.getNext();
            if (w.closed || !w.gBrowser) continue;
            wins++;
            for (const t of w.gBrowser.tabs) {
                const b = t.linkedBrowser;
                if (b && b.browsingContext && b.docShellIsActive) return false;
            }
        }
        return wins > 0;
    }
    let idleSince = 0, deepActive = false;

    function send(tab, name) {
        try { tab.linkedBrowser.messageManager.sendAsyncMessage('TabFreezer:' + name); return true; }
        catch (e) { logErr('mesaj hatası', name, e); return false; }
    }

    // tab -> {hiddenSince, frozenAt, wakeAt, frozen, reclaimed}
    const state = new WeakMap();
    let activePids = new Set(); // görünür / meşgul / medya sekmelerin süreçleri (her tick'te yenilenir)

    function pidOf(tab) {
        try { return tab.linkedBrowser.browsingContext.currentWindowGlobal.domProcess.osPid; }
        catch (e) { return 0; }
    }

    /** GC + CC + heap-minimize, yalnızca bu sekmenin içerik sürecinde. Süreç aktif bir sekmeyle paylaşılıyorsa atlanır. */
    function reclaimTab(tab) {
        const st = state.get(tab) || {};
        const pid = pidOf(tab);
        if (pid && activePids.has(pid)) { log('reclaim atlandı (süreç paylaşılıyor):', tab.label); return false; }
        send(tab, 'Reclaim');
        st.reclaimed = true; state.set(tab, st);
        log('GC/CC/minimize:', tab.label, pid);
        return true;
    }

    function freezeTab(tab) {
        const st = state.get(tab) || {};
        send(tab, 'Freeze');
        st.frozenAt = Date.now(); st.wakeAt = 0; st.frozen = true;
        state.set(tab, st);
        log('donduruldu:', tab.label);
        if (CONFIG.RECLAIM_ON_FREEZE && !st.reclaimed) reclaimTab(tab);
    }

    function unfreezeTab(tab, { keepHiddenSince = false } = {}) {
        const st = state.get(tab);
        if (!st || !st.frozen) return;
        send(tab, 'Unfreeze');
        st.frozen = false;
        if (!keepHiddenSince) st.hiddenSince = 0;
        state.set(tab, st);
        log('çözüldü:', tab.label);
    }

    // ===========================================
    // ANA DÖNGÜ
    // ===========================================
    async function tick(now = Date.now()) {
        if (window.closed) return { skipped: true };
        const res = { frozen: [], woken: [], refrozen: [], unfrozeVisible: [] };

        // Derin uyku: tüm pencerelerde hiçbir sekme görünmeden DEEP_SLEEP_AFTER_MINUTES geçti mi?
        const idle = allWindowsIdle();
        if (idle) { if (!idleSince) idleSince = now; } else { idleSince = 0; }
        const deep = CONFIG.DEEP_SLEEP_AFTER_MINUTES > 0 && idle && idleSince > 0 &&
                     now - idleSince >= CONFIG.DEEP_SLEEP_AFTER_MINUTES * 60000;
        if (deep !== deepActive) {
            deepActive = deep;
            log(deep ? `derin uyku BAŞLADI (${CONFIG.DEEP_SLEEP_AFTER_MINUTES} dk boşta): medya hariç her şey donduruluyor`
                     : 'derin uyku BİTTİ (görünür sekme var)');
        }
        res.deep = deep;

        {
            const hiddenTabs = [];
            const reasons = new Map();
            const pids = new Set();
            for (const tab of gBrowser.tabs) {
                const r = ineligibleReason(tab, deep);
                reasons.set(tab, r);
                if (r === 'visible' || r === 'busy' || r === 'audio' || r === 'pip' || r === 'sharing') {
                    const pid = pidOf(tab); if (pid) pids.add(pid);
                }
            }
            activePids = pids;
            res.reclaimed = [];
            for (const tab of gBrowser.tabs) {
                const reason = reasons.get(tab);
                const st = state.get(tab) || {};
                if (reason === 'exempt' && CONFIG.RECLAIM_EXEMPT_HOSTS) {
                    // Zamanlayıcıyı dondurma (derin uyku bittiyse dondurulmuş muaf sekmeyi çöz), ama gizli kalınca bir kez GC/CC yap
                    if (st.frozen) unfreezeTab(tab, { keepHiddenSince: true });
                    if (!st.hiddenSince) { st.hiddenSince = now; state.set(tab, st); }
                    if (!st.reclaimed && now - st.hiddenSince >= CONFIG.FREEZE_AFTER_SECONDS * 1000) {
                        if (reclaimTab(tab)) res.reclaimed.push(tab.label);
                    }
                    continue;
                }
                if (reason) {
                    // Görünür/meşgul/medya: donmuşsa hemen çöz, sayaç sıfırla
                    if (st.frozen) { unfreezeTab(tab); res.unfrozeVisible.push(tab.label); }
                    st.hiddenSince = 0; st.reclaimed = false; state.set(tab, st);
                    continue;
                }
                if (!st.hiddenSince) { st.hiddenSince = now; state.set(tab, st); }
                hiddenTabs.push({ tab, st });
            }
            // En son kullanılan N gizli sekmeyi koru
            hiddenTabs.sort((a, b) => (b.tab.lastAccessed || 0) - (a.tab.lastAccessed || 0));
            // Derin uykuda korunan sekme yok; normalde en son kullanılan N gizli sekme canlı kalır
            const protectedSet = new Set(deep ? [] : hiddenTabs.slice(0, CONFIG.PROTECTED_RECENT_TABS).map(x => x.tab));

            for (const { tab, st } of hiddenTabs) {
                if (protectedSet.has(tab)) {
                    if (st.frozen) unfreezeTab(tab, { keepHiddenSince: true });
                    continue;
                }
                if (!st.frozen) {
                    // Derin uykuda gecikme beklenmez (zaten dakikalardır boşta)
                    if (deep || now - st.hiddenSince >= CONFIG.FREEZE_AFTER_SECONDS * 1000) {
                        freezeTab(tab); res.frozen.push(tab.label);
                    }
                    continue;
                }
                // Donmuş: periyodik uyandır / tekrar dondur
                if (st.wakeAt) {
                    if (now - st.wakeAt >= CONFIG.WAKE_DURATION_SECONDS * 1000) {
                        freezeTab(tab); res.refrozen.push(tab.label);
                    }
                } else if (CONFIG.WAKE_INTERVAL_SECONDS > 0 &&
                           now - st.frozenAt >= CONFIG.WAKE_INTERVAL_SECONDS * 1000) {
                    unfreezeTab(tab, { keepHiddenSince: true });
                    const s2 = state.get(tab); s2.wakeAt = now; state.set(tab, s2);
                    res.woken.push(tab.label);
                }
            }
        }
        return res;
    }

    // Sekmeye dönüldüğünde beklemeden çöz
    function onTabSelect(e) {
        const tab = e.target;
        const st = state.get(tab);
        if (st && st.frozen) unfreezeTab(tab);
        const st2 = state.get(tab);
        if (st2) { st2.hiddenSince = 0; st2.reclaimed = false; state.set(tab, st2); }
        // Ayrılan sekmeyi beklemeden değerlendir
        window.setTimeout(() => { tick().catch(e => logErr('tick hatası', e)); },
                          CONFIG.FREEZE_AFTER_SECONDS * 1000 + 200);
    }

    // Pencere küçültülüp geri açılınca / öne gelince beklemeden değerlendir (derin uykudan hemen çık).
    // Sekmelerin "görünür" durumu pencere olayından kısa süre sonra güncellenir; bu yüzden iki kez bakılır.
    function onWindowWake() {
        for (const ms of [100, 700]) {
            window.setTimeout(() => { tick().catch(e => logErr('tick hatası', e)); }, ms);
        }
    }
    const WAKE_EVENTS = ['sizemodechange', 'activate', 'focus'];

    let timer = null;
    function start() {
        if (timer) return;
        WAKE_EVENTS.forEach(ev => window.addEventListener(ev, onWindowWake));
        gBrowser.tabContainer.addEventListener('TabSelect', onTabSelect);
        timer = window.setInterval(() => { tick().catch(e => logErr('tick hatası', e)); },
                                   CONFIG.CHECK_INTERVAL_SECONDS * 1000);
        fileLog('I', [`yüklendi: dondurmaGecikmesi=${CONFIG.FREEZE_AFTER_SECONDS}s korunanSon=${CONFIG.PROTECTED_RECENT_TABS} uyandırma=${CONFIG.WAKE_INTERVAL_SECONDS}s derinUyku=${CONFIG.DEEP_SLEEP_AFTER_MINUTES}dk günlük=${CONFIG.ENABLE_LOGGING}`]);
    }

    function stop() {
        if (timer) { window.clearInterval(timer); timer = null; }
        try { gBrowser.tabContainer.removeEventListener('TabSelect', onTabSelect); } catch (e) {}
        try { WAKE_EVENTS.forEach(ev => window.removeEventListener(ev, onWindowWake)); } catch (e) {}
        // Pencere kapanırken dondurulmuş sekmeleri çöz
        try { for (const tab of gBrowser.tabs) unfreezeTab(tab); } catch (e) {}
        delete window.TabFreezer;
    }

    window.addEventListener('unload', stop, { once: true });
    window.TabFreezer = { CONFIG, tick, freezeTab, unfreezeTab, reclaimTab, pidOf, state, start, stop };
    start();
})();
