// node tests/e2e_evidence.mjs [baseURL] — 별점 근거 UI e2e (mobile, KakaoTalk UA).
// For each val image: upload, screenshot the result/evidence section, tap a chip (line highlight),
// open 손금 측정값, then dump the browser-extracted features and check the shown evidence against
// python interpret/interpret.py on those exact features (stars, rules fired, reasons).
import { chromium } from 'playwright-core';
import fs from 'fs'; import { execFileSync } from 'child_process';
const BASE = process.argv[2] || 'http://localhost:8787/';
const VAL = '/workspace/palm-ai/data/palm_lines_yolo_v2/images/val/';
const OUT = process.env.OUT || '/workspace/palm-ai/web_screens/v2_evidence/';
const TAG = process.env.TAG || 'local';
const IMAGES = (process.env.IMAGES || 'image1016.jpg,image1018.jpg,image1047.jpg').split(',');
const PY = process.env.PY || '/tmp/pyv/bin/python';
fs.mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410530';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, locale: 'ko-KR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE + '?nocache=' + Date.now(), { waitUntil: 'networkidle' });
const report = [], featLines = [], shown = [];
for (const [k, name] of IMAGES.entries()) {
  const stem = name.replace('.jpg', '');
  if (k === 0) await page.click('#btn-start'); else await page.click('#btn-retry');
  await page.waitForSelector('#s-capture.active');
  await page.setInputFiles('#in-album', VAL + name);
  await page.waitForSelector('#s-result.active, #s-error.active', { timeout: 180000 });
  if (await page.$('#s-error.active')) { report.push({ image: name, error: true }); continue; }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}${TAG}_${k + 1}_${stem}_full.png`, fullPage: true });
  const lucks = await page.$('#r-lucks');
  await lucks.screenshot({ path: `${OUT}${TAG}_${k + 1}_${stem}_lucks.png` });
  // tap the first evidence chip of the first card that has one -> highlight
  const chip = await page.$('.luck .chip');
  if (chip) {
    await chip.tap();
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.overlay-card').getBoundingClientRect().top + scrollY - 10));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}${TAG}_${k + 1}_${stem}_highlight.png` });
  }
  await page.click('#r-measured-box summary');
  await page.waitForTimeout(200);
  await (await page.$('#r-measured-box')).screenshot({ path: `${OUT}${TAG}_${k + 1}_${stem}_measured.png` });
  const data = await page.evaluate(() => {
    const s = window.__palm.result;
    const feat = JSON.parse(JSON.stringify(s.feat, (key, v) => (key.startsWith('_') || key === 'path_img' ? undefined : v)));
    const ui = [...document.querySelectorAll('.luck')].map((c) => ({ luck: c.dataset.luck, stars: c.querySelectorAll('.stars').length && c.querySelector('.stars').getAttribute('aria-label'),
      facts: [...c.querySelectorAll('.ev-fact')].map((e) => e.textContent.trim()), meanings: [...c.querySelectorAll('.ev-mean')].map((e) => e.textContent.trim()),
      def: c.querySelector('.ev-default')?.textContent.trim() || null, calc: c.querySelector('.calc').textContent.trim() }));
    const js = Object.fromEntries(Object.entries(s.res.lucks).map(([k, v]) => [k, { stars: v.stars, rules_fired: v.rules_fired, reasons: v.reasons }]));
    return { feat, ui, js, focus: document.querySelector('#r-focus').textContent.trim(), disclaimer: document.querySelector('#r-disclaimer').textContent };
  });
  featLines.push(JSON.stringify(data.feat)); shown.push({ name, ...data });
}
const tmp = `/tmp/e2e_feats_${TAG}.jsonl`;
fs.writeFileSync(tmp, featLines.join('\n') + '\n');
const py = JSON.parse(execFileSync(PY, [new URL('./py_interpret.py', import.meta.url).pathname, tmp]).toString());
shown.forEach((s, i) => {
  const p = py[i], checks = {};
  for (const k of Object.keys(p.lucks)) {
    const a = s.js[k], b = p.lucks[k], uiCard = s.ui.find((u) => u.luck === k);
    const uiCount = uiCard.def ? 0 : uiCard.facts.length;
    checks[k] = { py_stars: b.stars, js_stars: a.stars, py_reasons: b.reasons, js_reasons: a.reasons, py_fired: b.rules_fired, js_fired: a.rules_fired,
      match: a.stars === b.stars && a.rules_fired.join() === b.rules_fired.join() && a.reasons.join() === b.reasons.join(), ui_items: uiCount, ui_default: !!uiCard.def };
  }
  report.push({ image: s.name, py_type: p.type.name, ui: s.ui, focus_caption: s.focus, checks, all_match: Object.values(checks).every((c) => c.match), disclaimer: s.disclaimer });
});
console.log(JSON.stringify({ base: BASE, report, errors }, null, 1));
await browser.close();
