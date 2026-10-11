const mgr = Cc["@mozilla.org/memory-reporter-manager;1"].getService(Ci.nsIMemoryReporterManager);
const want = {}; let wr = 0;
return new Promise(res => {
  mgr.getReports((process, path, kind, units, amount) => {
    if (!/^GPU/i.test(process)) return;
    if (['private','resident-unique','gpu-shared','gpu-committed'].includes(path)) want[path] = Math.round(amount/1048576);
    if (/^gfx\/webrender\/textures\//.test(path) && units === 0) wr += amount;
  }, null, () => { want.webrender_textures = Math.round(wr/1048576); res(want); }, null, false);
});
