// Batch feature extraction with the web app's OWN browser pipeline (headless Chrome + onnxruntime-web wasm,
// same decode -> canvas downscale (MAX_SIDE 1024) -> letterboxTensor -> palm.js extractFeatures as app.js).
// Used to build the percentile reference set (interpret/calibrate.py) so calibration matches what phones compute.
//   node tools/batch_features.mjs <list.txt: "source<TAB>subject<TAB>/abs/path.jpg" per line> <out.jsonl> [workers=6]
// Resumable: images already in out.jsonl are skipped.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public');
const [LIST, OUT, NW = '6'] = process.argv.slice(2);
const items = fs.readFileSync(LIST, 'utf8').trim().split('\n').map((l) => { const [source, subject, file] = l.split('\t'); return { source, subject, file }; });
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).file) : []);
const todo = items.filter((it) => !done.has(it.file));
console.log('total', items.length, 'done', done.size, 'todo', todo.length);
const allowed = new Set(items.map((i) => i.file));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
const HARNESS = `<!doctype html><meta charset="utf-8"><script type="module">
import * as ort from '/vendor/ort.wasm.min.mjs';
import { letterboxTensor, extractFeatures } from '/js/palm.js';
ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = '/vendor/';
const sess = ort.InferenceSession.create('/model/palm-v2.onnx', { executionProviders: ['wasm'] });
const MAX_SIDE = 1024;
window.analyse = async (url) => {
  const session = await sess;
  const blob = await (await fetch(url)).blob();             // app: File -> objectURL -> <img>
  const ourl = URL.createObjectURL(blob), img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode')); img.src = ourl; });
  const w0 = img.naturalWidth, h0 = img.naturalHeight, s = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const W = Math.round(w0 * s), H = Math.round(h0 * s);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
  const data = g.getImageData(0, 0, W, H); URL.revokeObjectURL(ourl);
  const { lb, data: tdata } = letterboxTensor(data);
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', tdata, [1, 3, 640, 640]) });
  const outs = session.outputNames.map((n) => out[n]);
  const det = outs.find((o) => o.dims.length === 3), proto = outs.find((o) => o.dims.length === 4);
  const { _preds, ...feat } = extractFeatures(data, det.data, proto.data, lb);
  return feat;
};
window.ready = sess.then(() => true);
</script>`;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__batch.html') { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); return res.end(HARNESS); }
  if (u.pathname === '/__img') { const f = u.searchParams.get('f'); if (!allowed.has(f)) { res.writeHead(403); return res.end(); } res.writeHead(200); return fs.createReadStream(f).pipe(res); }
  const f = path.join(root, decodeURIComponent(u.pathname));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
await new Promise((r) => srv.on('listening', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const out = fs.createWriteStream(OUT, { flags: 'a' });
let next = 0, n = 0; const t0 = Date.now();
async function worker() {
  let page = null;
  const open = async () => { if (page) await page.close().catch(() => {}); page = await browser.newPage(); await page.goto(BASE + '/__batch.html'); await page.waitForFunction(() => window.ready); await page.evaluate(() => window.ready); };
  await open();
  while (next < todo.length) {
    const it = todo[next++];
    try {
      const feat = await page.evaluate((u) => window.analyse(u), BASE + '/__img?f=' + encodeURIComponent(it.file));
      out.write(JSON.stringify({ image: path.basename(it.file), source: it.source, subject: it.subject, file: it.file, model: 'web/public/model/palm-v2.onnx (browser)', ...feat }) + '\n');
    } catch (e) { console.log('ERR', it.file, String(e).slice(0, 200)); out.write(JSON.stringify({ file: it.file, source: it.source, subject: it.subject, error: String(e).slice(0, 200) }) + '\n'); await open(); }
    if (++n % 25 === 0) console.log(n, '/', todo.length, ((Date.now() - t0) / n / 1000).toFixed(2), 's/img');
  }
  await page.close();
}
await Promise.all(Array.from({ length: Number(NW) }, worker));
out.end(); await browser.close(); srv.close(); console.log('done', n);
