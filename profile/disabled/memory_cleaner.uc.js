// memory_cleaner.uc.js - Advanced Firefox Memory Cleaner with Full Implementation
(function() {
    'use strict';

    // ===========================================
    // CONFIGURATION - DETAYLI AYARLAR
    // ===========================================
    const CONFIG = {
        // ========== CLEANUP MODLARı ==========

        /**
         * GC (Garbage Collection) - Bellek temizleme
         * true: Aktif | false: Deaktif
         * Açıklama: Kullanılmayan objeleri bellekten temizler
         * Impact: Orta seviye (~30-50 MB)
         */
        ENABLE_GC: true,

        /**
         * CC (Cycle Collection) - Döngüsel referansları temizleme
         * true: Aktif | false: Deaktif
         * Açıklama: Birbirine referans veren objeleri temizler
         * Impact: Orta seviye (~20-40 MB)
         */
        ENABLE_CC: true,

        /**
         * Minimize Memory Usage - Bellekleri minimize et
         * true: Aktif | false: Deaktif
         * Açıklama: Firefox'un agresif bellek optimizasyonu
         * Impact: Yüksek (~50-100 MB)
         * UYARI: Gri ekran sorununa neden olabilir!
         */
        ENABLE_MINIMIZE: false,

        // ========== TETIKLEME MODLARı ==========

        /**
         * Tab Trigger Mode
         * 0: Deaktif - Hiçbir şey yapmaz
         * 1: Tab açılış/kapanış ile otomatik temizlik
         * 2: Sadece tab kapanışında temizlik
         * Açıklama: Sekmeler açılıp kapandığında bellek temizlensin mi?
         */
        TAB_TRIGGER_MODE: 2,

        /**
         * AUTO_INTERVAL_SECONDS - Otomatik temizlik aralığı
         * 0: Deaktif - Timer'ı kapatır
         * >0: Belirtilen saniye aralığında otomatik temizlik
         * Örnekler: 60, 120, 300 (5 dakika), 600 (10 dakika)
         * Açıklama: Belirtilen aralıkta otomatik bellek temizlemesi yap
         * Performance Tip: 600s+ önerilidir (çok sık temizlik gri ekran sorununa yol açar!)
         */
        AUTO_INTERVAL_SECONDS: 600,

        /**
         * TAB_EVENT_DELAY - Tab event'lerinden sonra bekleme süresi (ms)
         * Örnek değerler: 500, 1000, 2000, 3000
         * Açıklama: Tab açılıp kapandıktan sonra kaç ms bekleyip temizlik yapalım
         * Daha yüksek = Daha stabil ama daha yavaş
         */
        TAB_EVENT_DELAY: 1500,

        /**
         * ENABLE_STARTUP_CLEANUP - Firefox başlangıcında temizlik
         * true: Aktif | false: Deaktif
         * Açıklama: Firefox açıldığında 5 saniye sonra bir temizlik yap
         */
        ENABLE_STARTUP_CLEANUP: false,

        // ========== LOGGER & DEBUG ==========

        /**
         * ENABLE_LOGGING - Detaylı konsol logları
         * true: Aktif - Konsol'da her işlem görülecek
         * false: Deaktif - Sessiz çalışma, hata varsa uyar
         * Açıklama: Debugging için logları görmek ister misin?
         * Performance Impact: Düşük (~5ms per operation)
         */
        ENABLE_LOGGING: false,

        /**
         * LOG_MEMORY_STATS - Bellek istatistiklerini loglama
         * true: Aktif | false: Deaktif
         * Açıklama: Her temizlikten sonra bellek miktarını göster (ağır)
         * Only works if ENABLE_LOGGING is true
         */
        LOG_MEMORY_STATS: false
    };

    // ===========================================
    // STATS & STATE
    // ===========================================
    let stats = {
        total: 0,
        gc_success: 0,
        cc_success: 0,
        minimize_success: 0
    };

    // ===========================================
    // LOGGING FUNCTION
    // ===========================================
    function log(msg) {
        if (CONFIG.ENABLE_LOGGING) {
            console.log(`[MemoryCleaner] ${msg}`);
        }
    }

    // ===========================================
    // CORE CLEANUP FUNCTION
    // ===========================================
    function doCleanup(trigger) {
        stats.total++;
        let success = 0;

        // ========== GC - Garbage Collection ==========
        if (CONFIG.ENABLE_GC) {
            try {
                if (typeof Components !== 'undefined') {
                    Components.utils.forceGC();
                    stats.gc_success++;
                    success++;
                } else if (typeof Cu !== 'undefined' && Cu.forceGC) {
                    Cu.forceGC();
                    stats.gc_success++;
                    success++;
                } else if (typeof window.gc === 'function') {
                    window.gc();
                    stats.gc_success++;
                    success++;
                }
            } catch (e) {
                log(`GC Error: ${e.message}`);
            }
        }

        // ========== CC - Cycle Collection ==========
        if (CONFIG.ENABLE_CC) {
            try {
                if (typeof Components !== 'undefined') {
                    Components.utils.forceCC();
                    stats.cc_success++;
                    success++;
                } else if (typeof Cu !== 'undefined' && Cu.forceCC) {
                    Cu.forceCC();
                    stats.cc_success++;
                    success++;
                } else if (typeof window.CC === 'function') {
                    window.CC();
                    stats.cc_success++;
                    success++;
                }
            } catch (e) {
                log(`CC Error: ${e.message}`);
            }
        }

        // ========== Minimize Memory Usage ==========
        if (CONFIG.ENABLE_MINIMIZE) {
            try {
                if (typeof Components !== 'undefined') {
                    const mgr = Components.classes["@mozilla.org/memory-reporter-manager;1"]
                        .getService(Components.interfaces.nsIMemoryReporterManager);
                    if (mgr && mgr.minimizeMemoryUsage) {
                        mgr.minimizeMemoryUsage(function() {});
                        stats.minimize_success++;
                        success++;
                    }
                } else if (typeof window.minimizeMemoryUsage === 'function') {
                    window.minimizeMemoryUsage();
                    stats.minimize_success++;
                    success++;
                }
            } catch (e) {
                log(`Minimize Error: ${e.message}`);
            }
        }

        log(`Cleanup (${trigger}): ${success} işlem | Total: ${stats.total} | GC: ${stats.gc_success} | CC: ${stats.cc_success} | Minimize: ${stats.minimize_success}`);
    }

    // ===========================================
    // INITIALIZATION
    // ===========================================

    // Validate config
    if (!gBrowser) {
        console.error('[MemoryCleaner] gBrowser bulunamadı! Userscript ortamında değil misin?');
        return;
    }

    log(`Memory Cleaner Başlatılıyor...`);
    log(`Config: GC=${CONFIG.ENABLE_GC}, CC=${CONFIG.ENABLE_CC}, Minimize=${CONFIG.ENABLE_MINIMIZE}`);

    // ========== TAB TRIGGER SETUP ==========
    if (CONFIG.TAB_TRIGGER_MODE === 1) {
        // Mode 1: Tab açılış + kapanış
        gBrowser.tabContainer.addEventListener('TabOpen', function(event) {
            const tabCount = gBrowser.tabs.length;
            log(`Tab Açıldı (${tabCount} total), ${CONFIG.TAB_EVENT_DELAY}ms sonra temizlik...`);

            setTimeout(() => {
                doCleanup('tab_open');
            }, CONFIG.TAB_EVENT_DELAY);
        }, false);

        gBrowser.tabContainer.addEventListener('TabClose', function(event) {
            setTimeout(() => {
                const tabCount = gBrowser.tabs.length;
                log(`Tab Kapandı (${tabCount} total), ${CONFIG.TAB_EVENT_DELAY}ms sonra temizlik...`);

                setTimeout(() => {
                    doCleanup('tab_close');
                }, CONFIG.TAB_EVENT_DELAY);
            }, 100);
        }, false);

        log(`Tab Trigger Mode 1 Aktif (Open + Close)`);

    } else if (CONFIG.TAB_TRIGGER_MODE === 2) {
        // Mode 2: Sadece tab kapanış
        gBrowser.tabContainer.addEventListener('TabClose', function(event) {
            setTimeout(() => {
                const tabCount = gBrowser.tabs.length;
                log(`Tab Kapandı (${tabCount} total), ${CONFIG.TAB_EVENT_DELAY}ms sonra temizlik...`);

                setTimeout(() => {
                    doCleanup('tab_close');
                }, CONFIG.TAB_EVENT_DELAY);
            }, 100);
        }, false);

        log(`Tab Trigger Mode 2 Aktif (Close Only)`);

    } else {
        log(`Tab Trigger Deaktif (Mode 0)`);
    }

    // ========== AUTO INTERVAL SETUP ==========
    if (CONFIG.AUTO_INTERVAL_SECONDS > 0) {
        const intervalMs = CONFIG.AUTO_INTERVAL_SECONDS * 1000;
        setInterval(function() {
            doCleanup('timer');
        }, intervalMs);

        log(`Auto Timer Aktif: ${CONFIG.AUTO_INTERVAL_SECONDS}s aralığı`);
    } else {
        log(`Auto Timer Deaktif`);
    }

    // ========== STARTUP CLEANUP ==========
    if (CONFIG.ENABLE_STARTUP_CLEANUP) {
        setTimeout(function() {
            log(`Startup Cleanup Ã‡alışıyor...`);
            doCleanup('startup');
        }, 5000);
    }

    // ========== FINAL STARTUP MESSAGE ==========
    if (typeof Components === 'undefined') {
        console.error('[MemoryCleaner] âš ï¸  Components API bulunamadı!');
    } else {
        log(`Memory Cleaner Hazır!`);
        log(`Stats: Toplam=${stats.total}, GC=${stats.gc_success}, CC=${stats.cc_success}, Minimize=${stats.minimize_success}`);
    }

})();

