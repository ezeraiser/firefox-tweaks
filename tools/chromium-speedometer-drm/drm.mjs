// usage: node drm.mjs <exe> <label> [--cdm <WidevineCdm version dir to copy into the temp profile>]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [exe, label, flag, cdm] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'drm-'));
if (flag === '--cdm') { mkdirSync(join(dir, 'WidevineCdm'), { recursive: true }); cpSync(cdm, join(dir, 'WidevineCdm', '4.10.3050.1'), { recursive: true }); }
const port = 9500 + Math.floor(Math.random() * 300);
const proc = spawn(exe, [`--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', 'https://www.netflix.com/tr/'], { stdio: 'ignore' });
const expr = `(async () => {
  const out = {ua: navigator.userAgent, secure: isSecureContext};
  const codecs = [{contentType:'video/mp4; codecs="avc1.640028"'},{contentType:'video/mp4; codecs="hev1.1.6.L93.B0"'},{contentType:'video/mp4; codecs="av01.0.08M.08"'}];
  const aud = [{contentType:'audio/mp4; codecs="mp4a.40.2"'}];
  async function probe(name, sys, rob) {
    try {
      const cfg = [{initDataTypes:['cenc'], audioCapabilities: aud.map(a=>({...a, robustness: rob.audio})), videoCapabilities: [codecs[0]].map(v=>({...v, robustness: rob.video})), persistentState:'optional', distinctiveIdentifier:'optional', sessionTypes:['temporary']}];
      const a = await navigator.requestMediaKeySystemAccess(sys, cfg);
      const c = a.getConfiguration();
      out[name] = 'OK ' + (c.videoCapabilities?.[0]?.robustness ?? '') ;
    } catch (e) { out[name] = 'FAIL ' + e.name + ': ' + e.message.slice(0,80); }
  }
  await probe('widevine_SW_SECURE_CRYPTO', 'com.widevine.alpha', {audio:'SW_SECURE_CRYPTO', video:'SW_SECURE_CRYPTO'});
  await probe('widevine_SW_SECURE_DECODE', 'com.widevine.alpha', {audio:'SW_SECURE_CRYPTO', video:'SW_SECURE_DECODE'});
  await probe('widevine_HW_SECURE_ALL', 'com.widevine.alpha', {audio:'HW_SECURE_CRYPTO', video:'HW_SECURE_ALL'});
  await probe('playready_SL2000', 'com.microsoft.playready.recommendation', {audio:'', video:''});
  await probe('playready_sw', 'com.microsoft.playready', {audio:'', video:''});
  for (const [n,t] of [['h264','video/mp4; codecs="avc1.640028"'],['hevc','video/mp4; codecs="hev1.1.6.L93.B0"'],['av1','video/mp4; codecs="av01.0.08M.08"'],['vp9','video/webm; codecs="vp09.00.10.08"'],['aac','audio/mp4; codecs="mp4a.40.2"'],['ec3','audio/mp4; codecs="ec-3"']]) out['MSE_'+n] = MediaSource.isTypeSupported(t);
  return JSON.stringify(out, null, 1);
})()`;
try {
  let target;
  for (let t = 0; t < 60 && !target; t++) { await sleep(1000); try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); target = l.find(x => x.type === 'page' && x.url.includes('netflix')); } catch {} }
  if (!target) throw new Error('no page');
  await sleep(6000);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const res = await new Promise(r => { ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 1) r(m); }; ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); });
  console.log('=== ' + label + '\n' + (res.result?.result?.value ?? JSON.stringify(res)));
  ws.close();
} finally { proc.kill(); await sleep(2500); try { rmSync(dir, { recursive: true, force: true }); } catch {} }
