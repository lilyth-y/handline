// E2E for share card / friend challenge / referral: node tests/e2e_viral.mjs [baseURL]
// Uses ?collect_test=1 so inserted rows are is_test=true (delete them afterwards in Supabase).
import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = process.argv[2] || 'http://localhost:8787/';
const VAL = '/workspace/palm-ai/data/palm_lines_yolo_v2/images/val/';
const OUT = process.env.OUT || '/workspace/palm-ai/web_screens/viral/';
const TAG = process.env.TAG || 'local';
fs.mkdirSync(OUT, { recursive: true });
const KAKAO = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410530';
const CHROME = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const mk = (ua) => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ua, locale: 'ko-KR', acceptDownloads: true });
const results = {}, errors = [];
const check = (name, ok, extra) => { results[name] = { ok: !!ok, ...(extra || {}) }; };
const watch = (page) => { page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };
async function analyse(page, img) {
  await page.click('#btn-start'); await page.waitForSelector('#s-capture.active');
  await page.setInputFiles('#in-album', VAL + img);
  await page.waitForSelector('#s-result.active, #s-error.active', { timeout: 120000 });
}

// ---- A. KakaoTalk in-app, arriving from the blog
const ctxA = await mk(KAKAO);
await ctxA.addInitScript(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared = d; } }); });
const a = await ctxA.newPage(); watch(a);
const posts = [];
a.on('request', (r) => { if (r.url().includes('supabase.co') && r.method() === 'POST') posts.push(r.postData()); });
await a.goto(BASE + '?ref=blog&collect_test=1', { waitUntil: 'networkidle' });
check('ref_saved_in_session', (await a.evaluate(() => sessionStorage.getItem('hoa_ref'))) === 'blog');
check('dogam_12_types', (await a.locator('.dg-item').count()) === 12);
await a.screenshot({ path: OUT + `${TAG}_intro_dogam.png`, fullPage: true });
await analyse(a, 'image1016.jpg');
await a.waitForFunction(() => window.__collect && (window.__collect.sent > 0 || window.__collect.errors.length), null, { timeout: 20000 });
const col = await a.evaluate(() => window.__collect);
const body = posts[0] ? JSON.parse(posts[0]) : {};
check('insert_sent_with_ref_blog', col.sent === 1 && body.ref === 'blog' && body.is_test === true, { collect: col, ref: body.ref, type_id: body.type_id });
await a.screenshot({ path: OUT + `${TAG}_result_top.png` });
await a.locator('#btn-share').scrollIntoViewIfNeeded();
await a.screenshot({ path: OUT + `${TAG}_result_share_buttons.png` });
await a.click('#btn-share');
const shared = await a.evaluate(() => window.__shared);
const sURL = shared && new URL(shared.url);
check('share_text_challenge', shared && /나는 '.+'! 너는 무슨 여우야\?/.test(shared.text), { text: shared?.text });
check('share_url_ref_share', sURL && sURL.searchParams.get('ref') === 'share' && sURL.searchParams.get('t') && /^[1-5]{4}$/.test(sURL.searchParams.get('s')), { url: shared?.url });
await a.click('#btn-card');
await a.waitForSelector('#card-modal:not(.hidden)', { timeout: 15000 });
await a.waitForFunction(() => document.getElementById('card-img').complete && document.getElementById('card-img').naturalWidth > 0);
const card = await a.evaluate(async () => {
  const img = document.getElementById('card-img');
  const r = await fetch(img.src); const buf = Array.from(new Uint8Array(await r.arrayBuffer()));
  return { ...window.__card, w: img.naturalWidth, h: img.naturalHeight, srcType: img.src.slice(0, 12), buf, externalHidden: document.getElementById('btn-card-external').classList.contains('hidden') };
});
fs.writeFileSync(OUT + `${TAG}_share_card.jpg`, Buffer.from(card.buf));
delete card.buf;
check('kakao_card_longpress_modal', card.via === 'modal' && card.w === 1080 && card.h === 1920 && card.bytes < 900000 && !card.externalHidden, { via: card.via, bytes: card.bytes, size: `${card.w}x${card.h}`, srcType: card.srcType, externalHidden: card.externalHidden });
await a.screenshot({ path: OUT + `${TAG}_kakao_card_modal.png` });
await a.click('#card-close');
check('modal_closes', await a.locator('#card-modal.hidden').count() === 1);

// ---- B. friend opens the shared link (KakaoTalk)
const ctxB = await mk(KAKAO);
const b = await ctxB.newPage(); watch(b);
const friendURL = new URL(shared.url); const fu = new URL(BASE); fu.search = friendURL.search; fu.searchParams.set('collect_test', '1');
await b.goto(fu.href, { waitUntil: 'networkidle' });
check('friend_banner_visible', await b.isVisible('#shared-banner #btn-challenge'), { text: (await b.textContent('#shared-banner')).replace(/\s+/g, ' ').trim() });
check('friend_ref_share', (await b.evaluate(() => sessionStorage.getItem('hoa_ref'))) === 'share');
await b.screenshot({ path: OUT + `${TAG}_friend_banner.png` });
await b.click('#btn-challenge');
check('cta_opens_capture', await b.isVisible('#s-capture.active'));
await b.click('#s-capture .back');
const bposts = []; b.on('request', (r) => { if (r.url().includes('supabase.co') && r.method() === 'POST') bposts.push(r.postData()); });
await analyse(b, 'image1018.jpg');
await b.waitForFunction(() => window.__collect && (window.__collect.sent > 0 || window.__collect.errors.length), null, { timeout: 20000 });
check('friend_insert_ref_share', bposts[0] && JSON.parse(bposts[0]).ref === 'share');
check('friend_compare_line', await b.isVisible('#r-friend'), { text: await b.textContent('#r-friend') });
await b.screenshot({ path: OUT + `${TAG}_friend_result.png` });

// ---- C. regular mobile Chrome (no file share): download
const ctxC = await mk(CHROME);
await ctxC.addInitScript(() => { try { localStorage.setItem('hoa_collect', 'off'); } catch {} });
const c = await ctxC.newPage(); watch(c);
await c.goto(BASE, { waitUntil: 'networkidle' });
await analyse(c, 'image1016.jpg');
const [dl] = await Promise.all([c.waitForEvent('download', { timeout: 15000 }).catch(() => null), c.click('#btn-card')]);
check('chrome_download', dl && /hoa-palm-.+\.(png|jpe?g)/.test(dl.suggestedFilename()), { name: dl?.suggestedFilename() });

check('no_app_errors', errors.length === 0, { errors });
console.log(JSON.stringify(results, null, 1));
console.log(Object.values(results).every((r) => r.ok) ? 'ALL PASS' : 'SOME FAILED');
await browser.close();
