return ChromeUtils.requestProcInfo().then(i => ({ parent: i.pid, children: i.children.map(c => [c.pid, c.type]) }));
