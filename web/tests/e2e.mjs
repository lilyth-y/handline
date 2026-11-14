// E2E: node tests/e2e.mjs [baseURL] — drives the app in mobile Chrome (KakaoTalk UA) on val images,
// saves screenshots to ../web_screens and compares the browser result with the Python reference features.
import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = process.argv[2] || 'http://localhost:8787/';
const VAL = '/workspace/palm-ai/data/palm_lines_yolo_v2/images/val/';
const OUT = '/workspace/palm-ai/web_screens/';
const IMAGES = (process.env.IMAGES || 'image1016.jpg,image1018.jpg,image1047.jpg').split(',');
const ref = Object.fromEntries(fs.readFileSync('/workspace/palm-ai/interpret/calib/val_features_v2.jsonl', 'utf8').trim().split('\n').map((l) => { const j = JSON.parse(l); return [j.image, j]; }));
// /tmp/py_out.json = python interpret.py output on the same jsonl (optional reference)
const pyOut = fs.existsSync('/tmp/py_out.json') ? JSON.parse(fs.readFileSync('/tmp/py_out.json', 'utf8')) : { interp: [] };
const pyType = Object.fromEntries(pyOut.interp.map((r, i) => [Object.keys(ref)[i], r]));
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410530';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, locale: 'ko-KR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const failed = [];
page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.screenshot({ path: OUT + 'mobile_intro.png' });
const summary = [];
for (const [k, name] of IMAGES.entries()) {
  if (k === 0) await page.click('#btn-start'); else await page.click('#btn-retry');
  await page.waitForSelector('#s-capture.active');
  if (k === 0) await page.screenshot({ path: OUT + 'mobile_capture.png' });
  await page.setInputFiles('#in-album', VAL + name);
  await page.waitForSelector('#s-result.active, #s-error.active', { timeout: 120000 });
  const r = await page.evaluate(() => { const s = window.__palm; return s.result && { ms: s.result.ms, size: s.result.size, type: s.result.res.type.id, name: s.result.res.type.name,
    stars: Object.values(s.result.res.lucks).map((l) => l.stars), lines: Object.fromEntries(Object.entries(s.result.feat.lines).map(([k, v]) => [k, v.present ? v.length : null])), err: s.error }; });
  const p = ref[name], py = pyType[name];
  if (!p || !py) { summary.push({ image: name, js: r }); await page.screenshot({ path: OUT + `mobile_result_${k + 1}_${name.replace('.jpg', '')}.png`, fullPage: true }); continue; }
  const pyLines = Object.fromEntries(Object.entries(p.lines).map(([k, v]) => [k, v.present ? v.length : null]));
  summary.push({ image: name, js: r, py: { type: py.type.id, stars: Object.values(py.lucks).map((l) => l.stars), lines: pyLines, size: p.image_size } });
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + `mobile_result_${k + 1}_${name.replace('.jpg', '')}.png`, fullPage: true });
  if (k === 0) await page.screenshot({ path: OUT + 'mobile_result_top.png' });
}
// share fallback (no navigator.share in desktop chrome) -> toast
await page.click('#btn-share');
await page.waitForTimeout(400);
const toast = await page.textContent('#toast');
await page.screenshot({ path: OUT + 'mobile_share_toast.png' });
// shared-link landing
await page.goto(BASE + '?t=rock&s=4343', { waitUntil: 'networkidle' });
await page.screenshot({ path: OUT + 'mobile_intro_shared.png' });
console.log(JSON.stringify({ summary, toast, errors, failed }, null, 1));
await browser.close();
