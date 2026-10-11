// Faz 2: bellek büyüme eşiği (adım 4) + pencere küçültme (genel küçültme, ana süreç+GPU) + geri yükleme
const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
const win = wm.getMostRecentWindow('navigator:browser');
const L = win.TabLifecycle; const C = L.CONFIG;
Object.assign(C, { DEEP_SLEEP_AFTER_SECONDS: 20, DEEP_RECLAIM_IF_GROWN_MB: 0.5, TAB_TRIM_AFTER_SECONDS: 0, DISCARD_AFTER_SECONDS: 0,
  MAIN_GPU_TRIM_AFTER_DEEP_SECONDS: 6, MAIN_GPU_MIN_INTERVAL_SECONDS: 5 });
return (async () => {
  const sleep = ms => new Promise(r => win.setTimeout(r, ms));
  const gb = win.gBrowser, t0 = Date.now();
  const mk = url => gb.addTab(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
  const Cc1 = mk('http://127.0.0.1:8766/g4');
  gb.selectedTab = Cc1; await sleep(5000);
  const B = [...gb.tabs].find(t => /localhost/.test(t.linkedBrowser.currentURI.spec)); gb.selectedTab = B;
  const tHide = Date.now();
  await sleep(30000);                       // derin uyku (+20) ve büyüme kontrolü
  win.minimize(); const tMin = Date.now();
  await sleep(14000);
  const st = L.state.get(Cc1);
  win.restore(); await sleep(3000);
  const txt = await IOUtils.readUTF8(PathUtils.join(PathUtils.profileDir, 'chrome', 'memlog.txt'));
  const lines = txt.split('\n').filter(l => /TabLifecycle/.test(l) && new Date(l.slice(0, 24)).getTime() >= t0 - 1000)
    .map(l => l.slice(11, 19) + l.slice(l.indexOf(']') + 1));
  return { minimizedState: win.windowState, stateOfC: st && { slept: !!st.slept, susp: !!st.suspended, deep: !!st.deep }, log: lines, afterRestoreC: !!L.state.get(Cc1) && JSON.stringify(L.state.get(Cc1)) };
})();
