const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
const win = wm.getMostRecentWindow('navigator:browser');
const sp = win.Services.scriptSecurityManager.getSystemPrincipal();
const urls = ['https://en.wikipedia.org/wiki/Firefox','https://www.bbc.com/','https://www.technopat.net/','https://developer.mozilla.org/en-US/'];
let first; for (const u of urls) { const t = win.gBrowser.addTab(u, {triggeringPrincipal: sp}); first = first || t; }
win.gBrowser.selectedTab = first;
return 'opened';
