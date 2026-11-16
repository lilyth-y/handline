// E2E for anonymous measurement collection: node tests/e2e_collect.mjs [baseURL]
// 1) analysis -> exactly one INSERT to Supabase (is_test=true via ?collect_test=1), payload has numbers only
// 2) same photo again in the session -> deduped (no request)
// 3) opt-out toggle -> remembered after reload -> new photo sends nothing
// 4) RLS: anon SELECT / UPDATE / DELETE are rejected
// Afterwards verify + delete the is_test rows in Supabase (MCP execute_sql / SQL editor).
import { chromium } from 'playwright-core';
const BASE = process.argv[2] || 'http://localhost:8787/';
const VAL = '/workspace/palm-ai/data/palm_lines_yolo_v2/images/val/';
const OUT = process.env.OUT || '/workspace/palm-ai/web_screens/';
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410530';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, locale: 'ko-KR' });
const page = await ctx.newPage();
const errors = [], posts = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', (r) => { if (r.url().includes('supabase.co')) posts.push({ method: r.method(), url: r.url(), body: r.postData() }); });
const results = {};
const check = (name, ok, extra) => { results[name] = { ok: !!ok, ...(extra || {}) }; };

async function analyse(img, first) {
  await page.click(first ? '#btn-start' : '#btn-retry');
  await page.waitForSelector('#s-capture.active');
  await page.setInputFiles('#in-album', VAL + img);
  await page.waitForSelector('#s-result.active, #s-error.active', { timeout: 120000 });
}
const collect = () => page.evaluate(() => window.__collect || { sent: 0, skipped: [], errors: [] });

await page.goto(BASE + '?collect_test=1', { waitUntil: 'networkidle' });
await page.click('#btn-start'); await page.waitForSelector('#s-capture.active');
check('consent_default_on', await page.isChecked('#s-capture .collect-toggle'));
await page.screenshot({ path: OUT + 'collect_capture_notice.png' });
await page.click('#s-capture .back');

// 1) send
await analyse('image1016.jpg', true);
await page.waitForFunction(() => window.__collect && (window.__collect.sent > 0 || window.__collect.errors.length), null, { timeout: 20000 });
let c = await collect();
const p0 = posts.filter((p) => p.method === 'POST');
const body = p0[0] && JSON.parse(p0[0].body);
const bodyStr = p0[0]?.body || '';
check('insert_sent', c.sent === 1 && p0.length === 1, { collect: c, bytes: bodyStr.length, keys: body && Object.keys(body), is_test: body?.is_test, client_hint: body?.client_hint, type_id: body?.type_id });
check('no_photo_or_paths_in_payload', !/data:image|base64|path_img|blob:|image1016/.test(bodyStr) && bodyStr.length < 6000);
await page.screenshot({ path: OUT + 'collect_result_footer.png', fullPage: true });

// 2) dedupe
await analyse('image1016.jpg', false);
await page.waitForTimeout(1500);
c = await collect();
check('dedupe_same_image', posts.filter((p) => p.method === 'POST').length === 1 && c.skipped.includes('dup'), { collect: c });

// 3) opt-out via privacy page, remembered across reload
await page.click('#s-result [data-privacy]');
await page.waitForSelector('#s-privacy.active');
await page.click('#s-privacy .switch-row');
await page.waitForTimeout(400);
check('optout_saved', (await page.evaluate(() => localStorage.getItem('hoa_collect'))) === 'off' && !(await page.isChecked('#s-privacy .collect-toggle')));
await page.screenshot({ path: OUT + 'collect_privacy_page.png', fullPage: true });
await page.reload({ waitUntil: 'networkidle' });
const nBefore = posts.length;
await page.click('#btn-start'); await page.waitForSelector('#s-capture.active');
check('optout_remembered_after_reload', !(await page.isChecked('#s-capture .collect-toggle')));
await page.click('#s-capture .back');
await analyse('image1018.jpg', true);
await page.waitForTimeout(2500);
c = await collect();
check('optout_sends_nothing', posts.length === nBefore && c.sent === 0 && c.skipped.includes('opt-out'), { collect: c, newRequests: posts.length - nBefore });

// 4) RLS with the public key from the page itself (these 4xx are expected; check app errors before this)
const appErrors = [...errors];
const rls = await page.evaluate(async () => {
  const { COLLECT } = await import('./js/collect.js');
  const h = { apikey: COLLECT.key, 'Content-Type': 'application/json' };
  const sel = await fetch(COLLECT.url + '?select=*', { headers: h });
  const upd = await fetch(COLLECT.url + '?id=gt.0', { method: 'PATCH', headers: h, body: JSON.stringify({ type_id: 'sun' }) });
  const del = await fetch(COLLECT.url + '?id=gt.0', { method: 'DELETE', headers: h });
  const bad = await fetch(COLLECT.url, { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ app_version: 'x', model_version: 'x', calib_version: 'x', feature_version: 1, features: { lines: {}, relations: {}, junk: 'x'.repeat(20000) }, stars: {}, type_id: 'rock', image_w: 100, image_h: 100, lines_found: 3, client_hint: 'other', is_test: true }) });
  return { select: sel.status, update: upd.status, delete: del.status, oversized_insert: bad.status, selectBody: (await sel.text()).slice(0, 120) };
});
check('rls_anon_select_denied', rls.select >= 400, rls);
check('rls_anon_update_denied', rls.update >= 400);
check('rls_anon_delete_denied', rls.delete >= 400);
check('oversized_insert_rejected', rls.oversized_insert >= 400);
check('no_app_errors', appErrors.length === 0, { appErrors });
console.log(JSON.stringify(results, null, 1));
console.log(Object.values(results).every((r) => r.ok) ? 'ALL PASS' : 'SOME FAILED');
await browser.close();
