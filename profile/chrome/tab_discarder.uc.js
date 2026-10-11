// tab_discarder.uc.js - Uzun süre kullanılmayan sekmeleri BOŞALTIR (Helium'daki "Bellek Tasarrufu" karşılığı)
//
// Boşaltma (discard) = sekmenin süreci tamamen kapatılır, bellek GERÇEKTEN serbest kalır (özel bellek /
// commit düşer). Sekme sekme çubuğunda durur; ona tıklayınca sayfa YENİDEN YÜKLENİR (kaydırma konumu ve
// form verisi Firefox'un oturum kaydından geri gelir, ama sayfanın canlı durumu - örn. yarım kalmış bir
// oyun, kaydedilmemiş yazı - kaybolabilir).
//
// Bu yüzden: ses/video çalan, sabitlenmiş, yükleniyor olan ve aşağıdaki muaf sitelerdeki sekmelere
// dokunulmaz; ayrıca sayfa "kaydedilmemiş değişiklik var" diyorsa Firefox boşaltmayı kendisi reddeder.
//
// Günlük: <profil>\chrome\memlog.txt (ENABLE_LOGGING). Hatalar her zaman yazılır.
(function() {
    'use strict';

    if (window.TabDiscarder) return;
    if (typeof gBrowser === 'undefined') return;

    // ===========================================
    // AYARLAR
    // ===========================================
    const CONFIG = {
        // ------------------------------------------------------------------
        // 1) NE ZAMAN BOŞALTILSIN?
        // ------------------------------------------------------------------

        /**
         * Bir sekme kaç DAKİKA boyunca hiç görünmezse boşaltılsın? (Sekme aktif olmadığı süre.)
         * Küçük değer (5-10): bellek daha çok kazanılır ama sekmelere dönünce yeniden yükleme sık olur.
         * Büyük değer (60+): daha güvenli, daha az kazanç. 30 dengelidir.
         * Aktif sekme (seçili olan) HİÇBİR ZAMAN boşaltılmaz.
         */
        DISCARD_AFTER_MINUTES: 10,

        /**
         * En son kullandığınız kaç gizli sekme BOŞALTILMASIN? 0: ayrıldığınız hiçbir sekme için koruma yok.
         * Örn. 3 yaparsanız son kullandığınız 3 sekme süre dolsa bile açık kalır.
         */
        KEEP_RECENT_TABS: 0,

        /**
         * Betik kaç saniyede bir sekmelere bakar? 60 yeterli; değiştirmenize gerek yok.
         */
        CHECK_INTERVAL_SECONDS: 60,

        // ------------------------------------------------------------------
        // 2) NELER BOŞALTILMASIN?
        // ------------------------------------------------------------------

        /**
         * true: Sabitlenmiş (pinned) sekmeler asla boşaltılmaz. Genelde mail/takvim/sohbet gibi önemli
         * sekmeler sabitlenir; true bırakmanız önerilir.
         */
        SKIP_PINNED_TABS: true,

        /**
         * true: Ses çalan, Picture-in-Picture (küçük video penceresi) açık olan veya ekran/kamera
         * paylaşan sekmelere dokunulmaz. false yapmanız önerilmez (müzik kesilir).
         */
        SKIP_ACTIVE_MEDIA_TABS: true,

        /**
         * true: Yalnızca http/https adresli normal web sayfaları boşaltılabilir; about:..., uzantı
         * sayfaları, dosya (file:) gibi sekmelere dokunulmaz. true bırakın.
         */
        ONLY_HTTP_TABS: true,

        /**
         * Bu sitelerin sekmeleri HİÇ boşaltılmaz (alt alan adları dahil: "google.com" yazarsanız
         * mail.google.com da kapsanır). Yarım kalmış yazı, sohbet, toplantı, canlı akış gibi içeriği
         * kaybolmaması gereken siteler buraya girer. Kendi sitelerinizi ekleyebilirsiniz.
         */
        EXEMPT_HOSTS: [
            'chatgpt.com', 'openai.com', 'claude.ai', 'web.whatsapp.com', 'discord.com',
            'slack.com', 'teams.microsoft.com', 'teams.live.com', 'mail.google.com',
            'outlook.live.com', 'outlook.office.com', 'meet.google.com', 'web.telegram.org',
            'netflix.com', 'youtube.com', 'spotify.com', 'docs.google.com'
        ],

        // ------------------------------------------------------------------
        // 3) DENEME VE GÜNLÜK
        // ------------------------------------------------------------------

        /**
         * true: HİÇBİR sekmeyi boşaltmaz, yalnızca "şu sekmeyi boşaltırdım" diye günlüğe yazar.
         * Betiği ilk kez denerken neyi boşaltacağını görmek için kullanın.
         */
        DRY_RUN: false,

        /**
         * true: Yaptığı işleri (hangi sekme boşaltıldı, neden atlandı) chrome\memlog.txt dosyasına yazar.
         * Hatalar bu ayardan bağımsız HER ZAMAN yazılır.
         */
        ENABLE_LOGGING: true
    };

    // ===========================================
    // GÜNLÜK
    // ===========================================
    const TAG = 'TabDiscarder';
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
    // YARDIMCILAR
    // ===========================================
    function hostExempt(host) {
        return CONFIG.EXEMPT_HOSTS.some(h => host === h || host.endsWith('.' + h));
    }

    /** Sekme boşaltılamazsa nedenini döner, boşaltılabilirse null. (Görünürlük hariç.) */
    function skipReason(tab) {
        const br = tab.linkedBrowser;
        if (!br) return 'yok';
        if (tab.hasAttribute('pending')) return 'zaten-boşaltılmış';
        if (tab.selected) return 'seçili';
        if (br.docShellIsActive) return 'görünür';
        if (tab.hasAttribute('busy')) return 'yükleniyor';
        if (CONFIG.SKIP_PINNED_TABS && tab.pinned) return 'sabitlenmiş';
        if (CONFIG.SKIP_ACTIVE_MEDIA_TABS) {
            if (tab.soundPlaying || tab.hasAttribute('soundplaying')) return 'ses';
            if (tab.hasAttribute('pictureinpicture')) return 'pip';
            if (tab.hasAttribute('sharing')) return 'paylaşım';
        }
        let uri;
        try { uri = br.currentURI; } catch (e) { return 'adres-yok'; }
        if (CONFIG.ONLY_HTTP_TABS && !(uri && (uri.schemeIs('http') || uri.schemeIs('https')))) return 'http-değil';
        let host = '';
        try { host = uri.host; } catch (e) { host = ''; }
        if (host && hostExempt(host)) return 'muaf-site';
        return null;
    }

    // ===========================================
    // ANA DÖNGÜ
    // ===========================================
    const hiddenSince = new WeakMap(); // sekme -> gizli kalmaya başladığı an
    let timer = null, discardedCount = 0;

    async function tick(now = Date.now()) {
        if (window.closed) return { skipped: true };
        const result = { discarded: [], wouldDiscard: [], kept: 0 };
        const limit = CONFIG.DISCARD_AFTER_MINUTES * 60000;
        const candidates = [];

        for (const tab of gBrowser.tabs) {
            const reason = skipReason(tab);
            if (reason) { hiddenSince.delete(tab); continue; }
            if (!hiddenSince.has(tab)) hiddenSince.set(tab, now);
            if (now - hiddenSince.get(tab) >= limit) candidates.push(tab);
        }

        // En son kullanılan N sekmeyi koru
        candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
        const protectedTabs = new Set(candidates.slice(0, CONFIG.KEEP_RECENT_TABS));

        for (const tab of candidates) {
            if (protectedTabs.has(tab)) { result.kept++; continue; }
            const label = `${(tab.linkedBrowser.currentURI && tab.linkedBrowser.currentURI.host) || '?'} | ${tab.label}`;
            if (CONFIG.DRY_RUN) {
                result.wouldDiscard.push(label);
                log('DENEME: boşaltırdım ->', label);
                continue;
            }
            let ok = false;
            try { ok = gBrowser.discardBrowser(tab); } catch (e) { logErr('discardBrowser hatası', label, e); }
            if (ok) { discardedCount++; result.discarded.push(label); hiddenSince.delete(tab); log('BOŞALTILDI ->', label); }
            else log('Firefox boşaltmayı reddetti (kaydedilmemiş değişiklik olabilir) ->', label);
        }
        return result;
    }

    function start() {
        if (timer) return;
        timer = window.setInterval(() => { tick().catch(e => logErr('tick hatası', e)); },
                                   CONFIG.CHECK_INTERVAL_SECONDS * 1000);
        fileLog('I', [`yüklendi: süre=${CONFIG.DISCARD_AFTER_MINUTES}dk korunanSon=${CONFIG.KEEP_RECENT_TABS} sabitliAtla=${CONFIG.SKIP_PINNED_TABS} deneme=${CONFIG.DRY_RUN} günlük=${CONFIG.ENABLE_LOGGING}`]);
    }

    function stop() {
        if (timer) { window.clearInterval(timer); timer = null; }
        delete window.TabDiscarder;
    }

    window.addEventListener('unload', stop, { once: true });
    window.TabDiscarder = { CONFIG, tick, skipReason, start, stop };
    start();
})();
