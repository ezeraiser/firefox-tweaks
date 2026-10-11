// minimal Marionette client: node mn.mjs <port> <script-file> [--context chrome|content]
import net from 'node:net';
import { readFileSync } from 'node:fs';
const [port, file] = process.argv.slice(2);
const script = readFileSync(file, 'utf8');
const sock = net.connect(Number(port), '127.0.0.1');
let buf = '', id = 0; const pend = new Map();
sock.on('data', d => {
  buf += d.toString('utf8');
  for (;;) {
    const m = buf.match(/^(\d+):/); if (!m) return;
    const len = Number(m[1]), start = m[0].length;
    if (Buffer.byteLength(buf.slice(start)) < len) return;
    // slice by bytes
    const b = Buffer.from(buf.slice(start)); const body = b.slice(0, len).toString('utf8');
    buf = b.slice(len).toString('utf8');
    const msg = JSON.parse(body);
    if (Array.isArray(msg) && msg[0] === 1 && pend.has(msg[1])) { pend.get(msg[1])(msg); pend.delete(msg[1]); }
  }
});
const send = (cmd, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); const s = JSON.stringify([0, i, cmd, params]); sock.write(Buffer.byteLength(s) + ':' + s); });
await new Promise(r => setTimeout(r, 1500));
await send('WebDriver:NewSession', { capabilities: {} });
await send('Marionette:SetContext', { value: 'chrome' });
await send('WebDriver:SetTimeouts', { script: 600000 });
const r = await send('WebDriver:ExecuteScript', { script, args: [], newSandbox: true });
console.log(JSON.stringify(r[3] ?? r[2], null, 1));
sock.destroy();
