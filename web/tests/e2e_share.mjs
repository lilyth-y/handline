// E2E for share / 친구와 손금 비교 / 궁합 flow (no network writes: collection is switched off).
//   node tests/e2e_share.mjs [baseURL]     env: OUT=screenshot dir, VAL=palm image dir (local test photos only)
// Screenshots hide the result overlay canvas so no palm photo ends up in any saved image.
import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = process.argv[2] || 'http://localhost:8787/';
const VAL = process.env.VAL || '/workspace/palm-ai/data/palm_lines_yolo_v2/images/val/';
const OUT = process.env.OUT || '/workspace/palm-promo/palm_compare/';
fs.mkdirSync(OUT, { recursive: true });
const KAKAO = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410530';
const results = {}, errors = [];
const check = (n, ok, extra) => { results[n] = { ok: !!ok, ...(extra || {}) }; };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const mk = async (ua, init) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ua, locale: 'ko-KR', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('hoa_collect', 'off'); } catch {} });
  if (init) await ctx.addInitScript(init);
  const posts = []; ctx.on('request', (r) => { if (r.url().includes('supabase.co') && r.method() === 'POST') posts.push(r.url()); });
  const p = await ctx.newPage(); p.__posts = posts;
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return p;
};
const hideOverlay = (p) => p.addStyleTag({ content: '#r-overlay{visibility:hidden!important}' });
async function analyse(p, img) {
  await p.click('#btn-start'); await p.waitForSelector('#s-capture.active');
  await p.setInputFiles('#in-album', VAL + img);
  await p.waitForSelector('#s-result.active, #s-compare.active, #s-error.active', { timeout: 120000 });
  await hideOverlay(p); await p.waitForTimeout(700);   // let the fade-in finish before screenshots
}
const cardInfo = (p) => p.evaluate(async () => {
  const img = document.getElementById('card-img');
  await new Promise((r) => (img.complete && img.naturalWidth ? r() : (img.onload = r)));
  const r = await fetch(img.src); const buf = Array.from(new Uint8Array(await r.arrayBuffer()));
  return { w: img.naturalWidth, h: img.naturalHeight, bytes: buf.length, buf };
});

// A. KakaoTalk in-app, navigator.share present (iOS-like) → share sheet; no Kakao key → kakao button hidden
const A = await mk(KAKAO, () => { Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared = d; } }); });
await A.goto(BASE + '?ref=blog', { waitUntil: 'networkidle' });
await analyse(A, 'image1016.jpg');
check('hero_cta_visible_without_scroll', await A.locator('#r-sharehero').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), {});
check('kakao_hidden_without_key', await A.locator('#sh-kakao.hidden').count() === 1);
check('hook_has_mate', /천생연분/.test(await A.textContent('#r-hook')), { text: (await A.textContent('#r-hook')).trim() });
check('wording_compare_not_challenge', /친구 손금이랑 궁합 보기|카톡에 메시지 붙여넣기/.test(await A.textContent('#sh-native')) && !/도전장/.test(await A.evaluate(() => document.body.innerText + document.getElementById('share-sticky').textContent)), {});
check('sticky_hidden_at_top', await A.locator('#share-sticky.hidden').count() === 1);
await A.screenshot({ path: OUT + 'result_top_share_cta.png' });
await A.click('#sh-native');
const sh = await A.evaluate(() => window.__shared);
const u = sh && new URL(sh.url);
check('native_share_url', u && /^\/s\/[a-z]+\/$/.test(u.pathname) && u.searchParams.get('ref') === 'share' && /^[1-5]{4}$/.test(u.searchParams.get('s')) && /^[0-9a-z-]{14}$/.test(u.searchParams.get('p') || ''), { url: sh?.url, length: sh?.url.length });
check('share_text_compare_wording', /손금이랑 비교해 볼래\?/.test(sh?.text || ''), { text: sh?.text });
await A.click('.luck-tile[data-open="wealth"]'); await A.waitForSelector('#r-evidence:not(.hidden)');
check('evidence_opens_with_chips', await A.locator('#r-panels .luck:not([hidden]) .chip, #r-panels .luck:not([hidden]) .ev-default').count() > 0);
await A.evaluate(() => window.scrollTo(0, 420)); await A.waitForTimeout(500);
check('sticky_visible_with_evidence_open', await A.locator('#share-sticky:not(.hidden)').count() === 1);
await A.screenshot({ path: OUT + 'result_mid_sticky.png' });
await A.click('.luck-tile[data-open="wealth"]'); await A.evaluate(() => window.scrollTo(0, 0)); await A.waitForTimeout(500);
check('sticky_hidden_when_hero_visible', await A.locator('#share-sticky.hidden').count() === 1);
await A.screenshot({ path: OUT + 'result_top_again.png' });
await A.locator('#r-sharehero').scrollIntoViewIfNeeded(); await A.click('#sh-copy');
await A.waitForSelector('#toast.show');
const clip = await A.evaluate(() => navigator.clipboard.readText()).catch(() => null);
check('copy_link_only_url', clip && clip === sh.url, { clip });
const ev = await A.evaluate(() => window.__track.map((e) => e.name + ':' + (e.data && (e.data.method || e.data.src))));
check('tracking_events', ev.includes('share_click:native') && ev.includes('share_done:native') && ev.includes('share_done:copylink'), { ev });
// story card (9:16) + ?save=1 link still points at the app root
await A.locator('#btn-card').scrollIntoViewIfNeeded(); await A.click('#btn-card');
await A.waitForSelector('#card-modal:not(.hidden)', { timeout: 15000 });
const ci = await cardInfo(A);
fs.writeFileSync(OUT + 'story_card_result.jpg', Buffer.from(ci.buf));
check('story_card_1080x1920', ci.w === 1080 && ci.h === 1920 && ci.bytes < 900000, { w: ci.w, h: ci.h, bytes: ci.bytes });
const ext = await A.evaluate(() => window.__card && window.__card.external);
const extDec = ext ? decodeURIComponent(ext) : '';
check('save_link_root', /openExternal\?url=/.test(ext || '') && extDec.includes('save=1') && !extDec.includes('/s/'), { ext });

// B. no navigator.share (Android KakaoTalk WebView) → copy fallback with toast
const B = await mk(KAKAO, () => { try { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); } catch {} });
await B.goto(BASE, { waitUntil: 'networkidle' });
await analyse(B, 'image1018.jpg');
await B.click('#sh-native'); await B.waitForSelector('#toast.show');
const clipB = await B.evaluate(() => navigator.clipboard.readText()).catch(() => '');
check('kakao_inapp_paste_label', /카톡에 메시지 붙여넣기/.test(await B.textContent('#sh-native')));
check('fallback_copy_text_and_link', /손금이랑 비교해 볼래\?/.test(clipB) && /\/s\/[a-z]+\/\?s=[1-5]{4}&p=[0-9a-z-]{14}&ref=share/.test(clipB), { clip: clipB });
await B.screenshot({ path: OUT + 'result_copy_toast.png' });

// C. friend opens the shared link: /s/<type>/ → app with teaser → analysis → comparison screen
const link = new URL(sh.url);
const C = await mk(KAKAO);
const html = await (await C.request.get(BASE + link.pathname.slice(1) + link.search)).text();
check('og_tags_per_type', /og:title" content="나는 .+ 내 손금이랑 비교해 볼래\?/.test(html) && /og:description" content="친구가 손금 비교를 신청했어요/.test(html) && /og:image" content="https:\/\/hoadosa\.com\/img\/share\/[a-z]+\.jpg"/.test(html), {});
await C.goto(BASE + link.pathname.slice(1) + link.search, { waitUntil: 'networkidle' });
await C.waitForSelector('#sl-start');
check('share_landing_page_visible', await C.isVisible('#sl-start') && /친구가 손금 비교를 신청했어요/.test(await C.textContent('body')));
await C.screenshot({ path: OUT + 'share_landing_ko.png' });
await C.click('#sl-start');
await C.waitForSelector('#shared-banner:not(.hidden)');
const q = new URL(C.url()).searchParams;
check('redirect_keeps_params', q.get('t') && q.get('ref') === 'share' && /^[1-5]{4}$/.test(q.get('s')) && q.get('p') === link.searchParams.get('p') && new URL(C.url()).pathname === '/', { url: C.url() });
const banner = (await C.textContent('#shared-banner')).replace(/\s+/g, ' ').trim();
check('teaser_text', /친구가 손금 비교를 신청했어요/.test(banner) && /친구는 .+\./.test(banner) && /너는 무슨 여우야/.test(banner), { text: banner });
await C.screenshot({ path: OUT + 'landing_shared_link.png' });
await analyse(C, 'image1047.jpg');
check('friend_goes_to_compare_screen', await C.locator('#s-compare.active').count() === 1);
const pct = Number(await C.textContent('#c-pct'));
check('compat_score_in_range', pct >= 55 && pct <= 100, { pct });
check('compat_has_evidence', await C.locator('#c-why li').count() >= 1 && /기본 62/.test(await C.textContent('#c-calc')), { why: (await C.locator('#c-why li').allTextContents()).map((t) => t.trim()), calc: await C.textContent('#c-calc') });
check('compare_4_lines_and_4_lucks', await C.locator('#c-lines .cmp-row').count() === 4 && await C.locator('#c-lucks .cmp-luck:not(.head)').count() === 4);
check('fun_label', /재미로 보는 궁합/.test(await C.textContent('#s-compare')));
// score = 62 + sum of shown points (unless clamped) → evidence adds up
const calc = await C.textContent('#c-calc');
const nums = [...calc.matchAll(/\+ [^0-9=]*?(\d+)(?= \+| =)/g)].map((m) => Number(m[1]));
const total = Number(/= (\d+)/.exec(calc)[1]);
check('calc_adds_up', 62 + nums.reduce((a, b) => a + b, 0) === total && pct === Math.max(55, Math.min(100, total)), { calc, nums, total, pct });
await C.screenshot({ path: OUT + 'compare_top.png' });
await C.screenshot({ path: OUT + 'compare_full.png', fullPage: true });
await C.click('.cmp-more summary'); await C.waitForTimeout(200);
await C.screenshot({ path: OUT + 'compare_calc_open.png' });
// 우리 궁합 결과 공유: link carries my profile + friend's type + score
await C.click('#c-share'); await C.waitForSelector('#toast.show');
const pairClip = await C.evaluate(() => navigator.clipboard.readText()).catch(() => '');
const pairUrl = new URL(pairClip.split('\n').pop());
check('pair_share_link', pairUrl.pathname.startsWith('/s/') && pairUrl.searchParams.get('f') === link.pathname.split('/')[2] && Number(pairUrl.searchParams.get('c')) === pct && /^[0-9a-z-]{14}$/.test(pairUrl.searchParams.get('p')) && /궁합 \d+%/.test(pairClip), { clip: pairClip, length: pairUrl.href.length });
// loop: 내 결과로 다른 친구와 비교하기 → link without f/c
await C.waitForTimeout(2300);
await C.click('#c-loop'); await C.waitForSelector('#toast.show');
const loopClip = await C.evaluate(() => navigator.clipboard.readText()).catch(() => '');
const loopUrl = new URL(loopClip.split('\n').pop());
check('loop_share_link', loopUrl.pathname.startsWith('/s/') && !loopUrl.searchParams.get('f') && /손금이랑 비교해 볼래\?/.test(loopClip), { clip: loopClip });
// compare card (story)
await C.click('#c-card'); await C.waitForSelector('#card-modal:not(.hidden)', { timeout: 15000 });
const cc = await cardInfo(C);
fs.writeFileSync(OUT + 'story_card_compare.jpg', Buffer.from(cc.buf));
check('compare_card_1080x1920', cc.w === 1080 && cc.h === 1920 && cc.bytes < 900000, { w: cc.w, h: cc.h, bytes: cc.bytes });
await C.click('#card-close');
// result screen: friend line reopens comparison
await C.click('#c-to-result'); await C.waitForSelector('#s-result.active'); await C.waitForTimeout(500);
check('result_friend_button_visible', await C.isVisible('#r-friend') && /궁합/.test(await C.textContent('#r-friend')));
await C.screenshot({ path: OUT + 'result_after_compare.png' });
await C.click('#r-friend'); check('friend_button_reopens_compare', await C.locator('#s-compare.active').count() === 1);
const evC = await C.evaluate(() => window.__track.map((e) => e.name));
check('compare_tracking', ['share_landing_view', 'share_landing', 'compare_view', 'share_click', 'share_done', 'compare_card_click', 'compare_reopen'].every((n) => evC.includes(n)), { evC });
check('no_supabase_writes', C.__posts.length === 0 && A.__posts.length === 0);

// E. third person opens the pair link: both foxes + score in the teaser, then compares with the sender
const E = await mk(KAKAO);
await E.goto(BASE + pairUrl.pathname.slice(1) + pairUrl.search, { waitUntil: 'networkidle' });
await E.click('#sl-start');
await E.waitForSelector('#shared-banner:not(.hidden)');
const bE = (await E.textContent('#shared-banner')).replace(/\s+/g, ' ').trim();
check('pair_teaser', /친구가 손금 비교 결과를 보냈어요/.test(bE) && new RegExp(`궁합 ${pct}%`).test(bE) && / × /.test(bE), { text: bE });
await E.screenshot({ path: OUT + 'landing_pair_link.png' });

// F. old-style link (no p) still works: compares by type + stars only
const F = await mk(KAKAO);
await F.goto(BASE + '?t=gold&s=3453&ref=share', { waitUntil: 'networkidle' });
await analyse(F, 'image1016.jpg');
check('old_link_fallback', await F.locator('#s-compare.active').count() === 1 && await F.locator('#c-lines .cmp-row').count() === 0 && /예전 링크/.test(await F.textContent('#c-lines')) && Number(await F.textContent('#c-pct')) >= 55);
// junk p is ignored
const F2 = await mk(KAKAO);
await F2.goto(BASE + '?t=gold&s=3453&p=%3Cb%3E&ref=share', { waitUntil: 'networkidle' });
await analyse(F2, 'image1016.jpg');
check('bad_p_ignored', await F2.locator('#s-compare.active').count() === 1 && await F2.locator('#c-lines .cmp-row').count() === 0);

// D. Kakao enabled path (SDK stubbed): feed template with image/title/button
const D = await mk(KAKAO);
await D.route('**/js/share.js', async (r) => {
  const b = (await (await r.fetch()).text()).replace("export const KAKAO_JS_KEY = '';", "export const KAKAO_JS_KEY = 'TESTKEY';")
    .replace(/export const KAKAO_SDK_SRI = '[^']*';/, "export const KAKAO_SDK_SRI = '';");   // a stubbed SDK body would fail the real SRI hash
  r.fulfill({ contentType: 'text/javascript', body: b });
});
await D.route('https://t1.kakaocdn.net/**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.Kakao={_i:false,isInitialized(){return this._i},init(k){this._i=true;window.__kinit=k},Share:{sendDefault(o){window.__ksend=o}}};' }));
await D.goto(BASE, { waitUntil: 'networkidle' });
await analyse(D, 'image1016.jpg');
check('kakao_button_shown_with_key', await D.locator('#sh-kakao:not(.hidden)').count() === 1);
await D.screenshot({ path: OUT + 'result_top_share_cta_kakao_enabled.png' });
await D.click('#sh-kakao');
await D.waitForFunction(() => window.__ksend, null, { timeout: 5000 });
const ks = await D.evaluate(() => ({ o: window.__ksend, k: window.__kinit }));
check('kakao_feed_template', ks.o.objectType === 'feed' && /\/img\/share\/[a-z]+\.jpg$/.test(ks.o.content.imageUrl) && /\/s\/[a-z]+\//.test(ks.o.content.link.webUrl) && /p=[0-9a-z-]{14}/.test(ks.o.content.link.webUrl) && !!ks.o.buttons[0].title && !!ks.o.content.title && ks.k === 'TESTKEY', { content: ks.o.content });

check('no_app_errors', errors.length === 0, { errors });
console.log(JSON.stringify(results, null, 1));
console.log(Object.values(results).every((r) => r.ok) ? 'ALL PASS' : 'SOME FAILED');
await browser.close();
