// Küçültme sırası: genel GC/CC -> uyku -> derin uyku -> genel kırpma
const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
const win = wm.getMostRecentWindow('navigator:browser');
const L = win.TabLifecycle; const C = L.CONFIG;
Object.assign(C, { SLEEP_AFTER_SECONDS: 2, DEEP_SLEEP_AFTER_SECONDS: 10, MINIMIZE_RECLAIM_AFTER_SECONDS: 3,
  MINIMIZE_TRIM_AFTER_DEEP_SECONDS: 5, TAB_TRIM_AFTER_SECONDS: 0, DISCARD_AFTER_SECONDS: 0, MAIN_GPU_TRIM_AFTER_DEEP_SECONDS: 600,
  SLEEP_WAKE_INTERVAL_SECONDS: 0, MINIMIZE_RETRIM_MINUTES: 0 });
return (async () => {
  const sleep = ms => new Promise(r => win.setTimeout(r, ms));
  const gb = win.gBrowser;
  const mk = url => gb.addTab(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
  mk('http://127.0.0.1:8766/g7'); mk('http://localhost:8766/g8');
  await sleep(4000);
  win.minimize(); const tMin = Date.now();
  await sleep(22000);
  win.restore(); await sleep(2500);
  const txt = await IOUtils.readUTF8(PathUtils.join(PathUtils.profileDir, 'chrome', 'memlog.txt'));
  const lines = txt.split('\n').filter(l => /TabLifecycle/.test(l) && new Date(l.slice(0, 24)).getTime() >= tMin - 500)
    .map(l => `+${Math.round((new Date(l.slice(0, 24)).getTime() - tMin) / 1000)}s` + l.slice(l.indexOf(']') + 1));
  return { log: lines };
})();
