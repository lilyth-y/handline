// E2E for the share-boost flow (no network writes: collection is switched off).
//   node tests/e2e_share.mjs [baseURL]     env: OUT=screenshot dir, VAL=palm image dir (local test photos only)
// Screenshots hide the result overlay canvas so no palm photo ends up in any saved image.
import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = process.argv[2] || 'http://localhost:8787/';
const VAL = process.env.VAL || '/workspace/palm-ai/data/palm_lines_yolo_v2/images/val/';
const OUT = process.env.OUT || '/workspace/palm-promo/share_preview/';
fs.mkdirSync(OUT, { recursive: true });
const KAKAO = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410530';
const results = {}, errors = [];
const check = (n, ok, extra) => { results[n] = { ok: !!ok, ...(extra || {}) }; };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const mk = async (ua, init) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ua, locale: 'ko-KR', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('hoa_collect', 'off'); } catch {} });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return p;
};
const hideOverlay = (p) => p.addStyleTag({ content: '#r-overlay{visibility:hidden!important}' });
async function analyse(p, img) {
  await p.click('#btn-start'); await p.waitForSelector('#s-capture.active');
  await p.setInputFiles('#in-album', VAL + img);
  await p.waitForSelector('#s-result.active, #s-error.active', { timeout: 120000 });
  await hideOverlay(p); await p.waitForTimeout(700);   // let the fade-in finish before screenshots
}

// A. KakaoTalk in-app, navigator.share present (iOS-like) → share sheet; no Kakao key → kakao button hidden
const A = await mk(KAKAO, () => { Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared = d; } }); });
await A.goto(BASE + '?ref=blog', { waitUntil: 'networkidle' });
await analyse(A, 'image1016.jpg');
check('hero_cta_visible_without_scroll', await A.locator('#r-sharehero').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), {});
check('kakao_hidden_without_key', await A.locator('#sh-kakao.hidden').count() === 1);
check('hook_has_mate', /천생연분인 여우는/.test(await A.textContent('#r-hook')), { text: (await A.textContent('#r-hook')).trim() });
check('sticky_hidden_at_top', await A.locator('#share-sticky.hidden').count() === 1);
await A.screenshot({ path: OUT + 'result_top_share_cta.png' });
await A.click('#sh-native');
const sh = await A.evaluate(() => window.__shared);
const u = sh && new URL(sh.url);
check('native_share_url', u && /^\/s\/[a-z]+\/$/.test(u.pathname) && u.searchParams.get('ref') === 'share' && /^[1-5]{4}$/.test(u.searchParams.get('s')), { url: sh?.url });
await A.evaluate(() => window.scrollTo(0, 1400)); await A.waitForTimeout(400);
check('sticky_visible_mid_scroll', await A.locator('#share-sticky:not(.hidden)').count() === 1);
await A.screenshot({ path: OUT + 'result_mid_sticky.png' });
await A.locator('#btn-share').scrollIntoViewIfNeeded(); await A.waitForTimeout(400);
check('sticky_hidden_at_bottom_cta', await A.locator('#share-sticky.hidden').count() === 1);
await A.screenshot({ path: OUT + 'result_bottom_share.png' });
await A.click('#sh-copy').catch(async () => { await A.locator('#r-sharehero').scrollIntoViewIfNeeded(); await A.click('#sh-copy'); });
await A.waitForSelector('#toast.show');
const clip = await A.evaluate(() => navigator.clipboard.readText()).catch(() => null);
check('copy_link_only_url', clip && clip === sh.url, { clip });
const ev = await A.evaluate(() => window.__track.map((e) => e.name + ':' + (e.data && (e.data.method || e.data.src))));
check('tracking_events', ev.includes('share_click:native') && ev.includes('share_done:native') && ev.includes('share_done:copylink'), { ev });
// ?save=1 link still points at the app root
await A.locator('#btn-card').scrollIntoViewIfNeeded(); await A.click('#btn-card');
await A.waitForSelector('#card-modal:not(.hidden)', { timeout: 15000 });
const ext = await A.evaluate(() => window.__card && window.__card.external);
const extDec = ext ? decodeURIComponent(ext) : '';
check('save_link_root', /openExternal\?url=/.test(ext || '') && extDec.includes('save=1') && !extDec.includes('/s/'), { ext });

// B. no navigator.share (Android KakaoTalk WebView) → copy fallback with toast
const B = await mk(KAKAO, () => { try { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); } catch {} });
await B.goto(BASE, { waitUntil: 'networkidle' });
await analyse(B, 'image1018.jpg');
await B.click('#sh-native'); await B.waitForSelector('#toast.show');
const clipB = await B.evaluate(() => navigator.clipboard.readText()).catch(() => '');
check('fallback_copy_text_and_link', /너는 무슨 여우야\?/.test(clipB) && /\/s\/[a-z]+\/\?s=[1-5]{4}&ref=share/.test(clipB), { clip: clipB });
await B.screenshot({ path: OUT + 'result_copy_toast.png' });

// C. friend opens the shared link: /s/<type>/ → app with teaser
const link = new URL(sh.url);
const C = await mk(KAKAO);
const html = await (await C.request.get(BASE + link.pathname.slice(1) + link.search)).text();
check('og_tags_per_type', /og:title" content="나는 .+ 너는 무슨 여우야\?/.test(html) && /og:image" content="https:\/\/hoadosa\.com\/img\/share\/[a-z]+\.jpg"/.test(html) && /og:description/.test(html), {});
await C.goto(BASE + link.pathname.slice(1) + link.search, { waitUntil: 'networkidle' });
await C.waitForSelector('#shared-banner:not(.hidden)');
const q = new URL(C.url()).searchParams;
check('redirect_keeps_params', q.get('t') && q.get('ref') === 'share' && /^[1-5]{4}$/.test(q.get('s')) && new URL(C.url()).pathname === '/', { url: C.url() });
check('teaser_text', /친구는 .+!/.test(await C.textContent('#shared-banner')) && /궁합/.test(await C.textContent('#shared-banner')), { text: (await C.textContent('#shared-banner')).replace(/\s+/g, ' ').trim() });
await C.screenshot({ path: OUT + 'landing_shared_link.png' });
await analyse(C, 'image1047.jpg');
check('friend_compat_line', /궁합은 \d+%/.test(await C.textContent('#r-friend')), { text: (await C.textContent('#r-friend')).replace(/\s+/g, ' ').trim() });
await C.screenshot({ path: OUT + 'friend_result_compat.png' });
const evC = await C.evaluate(() => window.__track.map((e) => e.name));
check('landing_tracking', evC.includes('share_landing') && evC.includes('share_friend_result'), { evC });

// D. Kakao enabled path (SDK stubbed): feed template with image/title/button
const D = await mk(KAKAO);
await D.route('**/js/share.js', async (r) => { const b = (await (await r.fetch()).text()).replace("export const KAKAO_JS_KEY = '';", "export const KAKAO_JS_KEY = 'TESTKEY';").replace(/export const KAKAO_SDK_SRI = '[^']*';/, "export const KAKAO_SDK_SRI = '';");   // a stubbed SDK body would fail the real SRI hash
  r.fulfill({ contentType: 'text/javascript', body: b }); });
await D.route('https://t1.kakaocdn.net/**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.Kakao={_i:false,isInitialized(){return this._i},init(k){this._i=true;window.__kinit=k},Share:{sendDefault(o){window.__ksend=o}}};' }));
await D.goto(BASE, { waitUntil: 'networkidle' });
await analyse(D, 'image1016.jpg');
check('kakao_button_shown_with_key', await D.locator('#sh-kakao:not(.hidden)').count() === 1);
await D.screenshot({ path: OUT + 'result_top_share_cta_kakao_enabled.png' });
await D.click('#sh-kakao');
await D.waitForFunction(() => window.__ksend, null, { timeout: 5000 });
const ks = await D.evaluate(() => ({ o: window.__ksend, k: window.__kinit }));
check('kakao_feed_template', ks.o.objectType === 'feed' && /\/img\/share\/[a-z]+\.jpg$/.test(ks.o.content.imageUrl) && /\/s\/[a-z]+\//.test(ks.o.content.link.webUrl) && !!ks.o.buttons[0].title && !!ks.o.content.title && ks.k === 'TESTKEY', { content: ks.o.content, buttons: ks.o.buttons });

check('no_app_errors', errors.length === 0, { errors });
console.log(JSON.stringify(results, null, 1));
console.log(Object.values(results).every((r) => r.ok) ? 'ALL PASS' : 'SOME FAILED');
await browser.close();
