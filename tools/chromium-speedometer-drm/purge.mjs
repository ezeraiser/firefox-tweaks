// usage: node purge.mjs <port>   -> calls Memory.forciblyPurgeJavaScriptMemory on every page target
const port = process.argv[2];
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const pages = list.filter(t => t.type === 'page');
const send = (ws, method) => new Promise(res => { const id = 1; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === id) res(m); }; ws.send(JSON.stringify({ id, method })); });
for (const p of pages) {
  const ws = new WebSocket(p.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const r = await send(ws, 'Memory.forciblyPurgeJavaScriptMemory');
  console.log('purged', (p.url || '').slice(0, 50), JSON.stringify(r.error ?? 'ok'));
  ws.close();
}
