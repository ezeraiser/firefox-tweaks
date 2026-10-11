import net from 'node:net';
const port = Number(process.argv[2]);
const sock = net.connect(port, '127.0.0.1');
let buf = '', id = 0; const pend = new Map();
sock.on('data', d => { buf += d.toString('utf8');
  for (;;) { const m = buf.match(/^(\d+):/); if (!m) return; const len = Number(m[1]), st = m[0].length;
    const b = Buffer.from(buf.slice(st)); if (b.length < len) return;
    const msg = JSON.parse(b.slice(0, len).toString('utf8')); buf = b.slice(len).toString('utf8');
    if (Array.isArray(msg) && msg[0] === 1 && pend.has(msg[1])) { pend.get(msg[1])(msg); pend.delete(msg[1]); } } });
const send = (cmd, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); const s = JSON.stringify([0, i, cmd, params]); sock.write(Buffer.byteLength(s) + ':' + s); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(1500);
await send('WebDriver:NewSession', { capabilities: {} });
await send('WebDriver:SetTimeouts', { script: 60000, pageLoad: 180000 });
await send('WebDriver:Navigate', { url: 'https://browserbench.org/Speedometer3.1/?startAutomatically' });
let score = null;
for (let i = 0; i < 90 && score == null; i++) {
  await sleep(8000);
  const r = await send('WebDriver:ExecuteScript', { script: "var e=document.querySelector('#result-number'); return e ? e.textContent : ''", args: [] });
  const v = parseFloat(r[3]?.value ?? r[2]?.value);
  if (!isNaN(v) && v > 0) score = v;
}
console.log(score);
sock.destroy();
