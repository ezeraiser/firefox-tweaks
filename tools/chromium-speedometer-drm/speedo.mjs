// usage: node speedo.mjs <exe> <label> <runs> [-- chrome args...]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [exe, label, runsStr, ...rest] = process.argv.slice(2);
const extra = rest[0] === '--' ? rest.slice(1) : rest;
const runs = Number(runsStr);
const out = join(import.meta.dirname, 'results.jsonl');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = 'https://browserbench.org/Speedometer3.1/?startAutomatically';
let port = 9400 + Math.floor(Math.random() * 400);

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  return { send: (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() };
}

async function one(i) {
  const dir = mkdtempSync(join(tmpdir(), 'speedo-'));
  const p = ++port;
  const proc = spawn(exe, [`--user-data-dir=${dir}`, `--remote-debugging-port=${p}`, '--no-first-run',
    '--no-default-browser-check', '--window-size=1400,1000', '--window-position=0,0', ...extra, URL_], { stdio: 'ignore' });
  try {
    let target;
    for (let t = 0; t < 60 && !target; t++) {
      await sleep(1000);
      try { const l = await (await fetch(`http://127.0.0.1:${p}/json`)).json(); target = l.find(x => x.type === 'page' && x.url.includes('browserbench')); } catch {}
    }
    if (!target) throw new Error('no page target');
    const c = await cdp(target.webSocketDebuggerUrl);
    let score = null;
    for (let t = 0; t < 120 && score == null; t++) {
      await sleep(5000);
      const r = await c.send('Runtime.evaluate', { expression: `(document.querySelector('#result-number')||{}).textContent||''`, returnByValue: true });
      const v = parseFloat(r?.result?.result?.value);
      if (!isNaN(v) && v > 0) score = v;
    }
    c.close();
    return score;
  } finally {
    proc.kill();
    await sleep(2000);
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

const scores = [];
for (let i = 0; i < runs; i++) {
  const s = await one(i);
  scores.push(s);
  appendFileSync(out, JSON.stringify({ label, i, score: s, extra, t: new Date().toISOString() }) + '\n');
  console.log(label, i, s);
}
const ok = scores.filter(x => x != null).sort((a, b) => a - b);
console.log(label, 'median', ok[Math.floor(ok.length / 2)], 'all', scores.join(','));
