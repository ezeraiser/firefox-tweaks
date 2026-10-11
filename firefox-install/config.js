// skip 1st line
lockPref('xpinstall.signatures.required', false);
lockPref('extensions.install_origins.enabled', false);

try {
    pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
} catch(e) {}

// ============================================================================
// LOAD .UC.JS FILES DIRECTLY - NO EVENTS, SIMPLE APPROACH
// ============================================================================

try {
    const Cc = Components.classes;
    const Ci = Components.interfaces;
    const Cu = Components.utils;

    // Get chrome directory
    const chromedir = Services.dirsvc.get('UChrm', Ci.nsIFile);
    
    // Get all files in chrome directory
    const files = chromedir.directoryEntries.QueryInterface(Ci.nsISimpleEnumerator);
    const scripts = [];
    
    while (files.hasMoreElements()) {
        const file = files.getNext().QueryInterface(Ci.nsIFile);
        
        // Skip directories
        if (file.isDirectory()) {
            continue;
        }
        
        // Collect .uc.js files
        if (/\.uc\.js$/i.test(file.leafName)) {
            scripts.push(file);
        }
    }
    
    // Sort scripts by name
    scripts.sort((a, b) => a.leafName.localeCompare(b.leafName));
    
    // Log findings
    Cu.reportError(`[config.js] Found ${scripts.length} .uc.js files in chrome/`);

    // Only the real browser window has gBrowser etc. - injecting into every
    // chrome:/about: window (dialogs, prompts, popups...) caused spurious
    // "gBrowser is not defined" errors and duplicate re-inits.
    const BROWSER_URL = "chrome://browser/content/browser.xhtml";

    function loadScriptsIntoWindow(win) {
        if (win.__ucjsLoaded) return;
        win.__ucjsLoaded = true;
        for (let script of scripts) {
            try {
                const uri = Services.io.newFileURI(script).spec;
                ChromeUtils.compileScript(uri).then((compiledScript) => {
                    compiledScript.executeInGlobal(win);
                    Cu.reportError(`[config.js] ✓ Loaded: ${script.leafName}`);
                }).catch((ex) => {
                    Cu.reportError(`[config.js] ✗ Failed: ${script.leafName}: ${ex}`);
                });
            } catch (ex) {
                Cu.reportError(`[config.js] ✗ Error: ${script.leafName}: ${ex}`);
            }
        }
    }

    // A freshly-opened chrome window briefly reports href=about:blank with
    // readyState=complete for its placeholder document, before it navigates
    // to browser.xhtml - so window "load"/readyState checks fire too early.
    // "browser-delayed-startup-finished" instead fires exactly once per
    // browser window, after gBrowser/CustomizableUI are fully initialized.
    if (scripts.length > 0) {
        const windowMediator = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

        // Already-open browser windows (e.g. restored session)
        let windowEnum = windowMediator.getEnumerator(null);
        while (windowEnum.hasMoreElements()) {
            const win = windowEnum.getNext();
            if (win && win.location && win.location.href === BROWSER_URL && win.gBrowser) {
                loadScriptsIntoWindow(win);
            }
        }

        // Every browser window as it finishes starting up
        Services.obs.addObserver((win) => {
            loadScriptsIntoWindow(win);
        }, 'browser-delayed-startup-finished');
    }
    
} catch (ex) {
    Cu.reportError(`[config.js] Error: ${ex}`);
}

// ============================================================================
// BROWSER PREFERENCES
// ============================================================================

lockPref('toolkit.telemetry.enabled', false);
lockPref('security.enterprise_roots.enabled', false);

pref('browser.preferences.experimental.hidden', true);
pref('browser.sessionstore.restore_pinned_tabs_on_demand', true);
pref('browser.sessionstore.restore_on_demand', true);
pref('browser.newtab.preload', false);
pref('network.modulepreload', false);
pref('network.stricttransportsecurity.preloadlist', false);
pref('browser.tabs.crashReporting.sendReport', false);
pref('browser.tabs.tabmanager.enabled', false);

// TELEMETRY
pref('toolkit.coverage.endpoint.base', '');
pref('toolkit.telemetry.coverage.opt-out', true); 
pref('toolkit.coverage.opt-out', true);
pref('toolkit.telemetry.bhrPing.enabled', false);
pref('toolkit.telemetry.updatePing.enabled', false);
pref('toolkit.telemetry.firstShutdownPing.enabled', false);
pref('toolkit.telemetry.hybridContent.enabled', false);
pref('toolkit.telemetry.newProfilePing.enabled', false); 
pref('toolkit.telemetry.reportingpolicy.firstRun', false);
pref('toolkit.telemetry.shutdownPingSender.enabled', false);
pref('toolkit.telemetry.unified', false);
pref('toolkit.telemetry.archive.enabled', false);
pref('browser.newtabpage.activity-stream.feeds.telemetry', false);
pref('browser.newtabpage.activity-stream.telemetry', false);
pref('browser.newtabpage.activity-stream.telemetry.ut.events', false);
pref('browser.ping-centre.telemetry', false);
pref('devtools.onboarding.telemetry.logged', false);
pref('datareporting.healthreport.uploadEnabled', false);
pref('datareporting.policy.dataSubmissionEnabled', false);
pref('datareporting.sessions.current.clean', true);

pref('browser.contentblocking.report.lockwise.enabled', false);
pref('browser.contentblocking.report.monitor.enabled', false);
pref('browser.fixup.typo.scheme', false);
pref('browser.messaging-system.fxatoolbarbadge.enabled', false);
pref('browser.messaging-system.whatsNewPanel.enabled', false);
pref('extensions.fxmonitor.enabled', false);
pref('layout.css.text-decoration-skip-ink.enabled', false);
pref('media.mediacapabilities.from-database', false);
pref('security.certerrors.mitm.priming.enabled', false);
pref('security.certerrors.mitm.priming.endpoint', '');
pref('signon.generation.available', false);
pref('signon.generation.enabled', false);
pref('signon.management.page.breach-alerts.enabled', false);
pref('signon.management.page.breachAlertUrl', '');
pref('signon.management.page.enabled', false);
pref('browser.safebrowsing.provider.mozilla.updateURL', '');
pref('browser.safebrowsing.provider.mozilla.gethashURL', '');
pref('toolkit.datacollection.infoURL', '');
pref('toolkit.crashreporter.infoURL', '');

pref('network.dns.disableIPv6', true);
pref('network.proxy.socks_remote_dns', true);
pref('network.file.disable_unc_paths', true);
pref('network.gio.supported-protocols', '');

pref('accessibility.force_disabled', 1);
pref('beacon.enabled', true);
pref('browser.helperApps.deleteTempFileOnExit', true);
pref('browser.pagethumbnails.capturing_disabled', true);
pref('browser.uitour.enabled', false);
pref('browser.uitour.url', '');
pref('permissions.manager.defaultsUrl', '');
pref('webchannel.allowObject.urlWhitelist', '');
pref('network.protocol-handler.external.ms-windows-store', false);