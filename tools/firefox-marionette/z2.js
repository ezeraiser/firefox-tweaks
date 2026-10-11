const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
const win = wm.getMostRecentWindow('navigator:browser');
const D = win.TabDiscarder; D.CONFIG.DISCARD_AFTER_MINUTES = 0.05; D.CONFIG.KEEP_RECENT_TABS = 1; D.CONFIG.ONLY_HTTP_TABS = true;
const t0 = Date.now();
const before = [...win.gBrowser.tabs].map(t => [t.linkedBrowser.currentURI.spec.slice(0, 40), t.selected, t.hasAttribute('pending')]);
return D.tick(t0).then(a => D.tick(t0 + 10000).then(b => ({ hasDiscardBrowser: typeof win.gBrowser.discardBrowser, first: a, second: b,
  after: [...win.gBrowser.tabs].map(t => [t.linkedBrowser.currentURI.spec.slice(0, 40), t.selected, t.hasAttribute('pending')]) })));
