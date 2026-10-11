// tab_lifecycle.uc.js sınaması (kısaltılmış süreler). mn.mjs ile chrome bağlamında çalışır.
const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
const win = wm.getMostRecentWindow('navigator:browser');
const L = win.TabLifecycle;
if (!L) return { error: 'TabLifecycle yok (betik yüklenmedi)' };
const C = L.CONFIG;
Object.assign(C, {
  SLEEP_AFTER_SECONDS: 2, SLEEP_WAKE_INTERVAL_SECONDS: 5, SLEEP_WAKE_DURATION_SECONDS: 1,
  DEEP_SLEEP_AFTER_SECONDS: 10, MAIN_GPU_TRIM_AFTER_DEEP_SECONDS: 6, MAIN_GPU_MIN_INTERVAL_SECONDS: 30,
  TAB_TRIM_AFTER_SECONDS: 16, DISCARD_AFTER_SECONDS: 24, MINIMIZE_TRIM_AFTER_SECONDS: 3,
  MINIMIZE_RETRIM_MINUTES: 0, DEEP_RECLAIM_IF_GROWN_MB: 8, DISCARD_EXEMPT_HOSTS: [], HEARTBEAT_MINUTES: 0
});
return (async () => {
const sleep = ms => new Promise(r => win.setTimeout(r, ms));
const gb = win.gBrowser;
const mk = url => gb.addTab(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
const A = mk('http://127.0.0.1:8766/g1'), B = mk('http://localhost:8766/g2');
gb.selectedTab = A;
await sleep(6000);               // A garbage üretsin
gb.selectedTab = B;              // t0: A'dan ayrıldık
const t0 = Date.now();
const tl = [];
for (let i = 0; i < 34; i++) {
  await sleep(1000);
  const st = L.state.get(A);
  tl.push(`${Math.round((Date.now() - t0) / 1000)}s ` + (st ? JSON.stringify({ slept: !!st.slept, susp: !!st.suspended, deep: !!st.deep, trim: !!st.trimmed }) : (A.hasAttribute('pending') ? 'BOŞALTILDI(pending)' : 'durum yok')));
}
// Faz 2: pencereyi küçült -> genel küçültme
const log1 = await IOUtils.readUTF8(PathUtils.join(PathUtils.profileDir, 'chrome', 'memlog.txt'));
return { timeline: tl, aPending: A.hasAttribute('pending'), log: log1.split('\n').filter(l => /TabLifecycle/.test(l)).map(l => l.slice(11, 19) + l.slice(l.indexOf(']') + 1)) };
})();
