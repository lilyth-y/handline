// i18n 검증: node tests/i18n.mjs [baseURL]   (먼저 `node tools/serve.mjs` — 기본 http://localhost:8787/)
//  1) 정적 검사: 사전 키 일치(+{변수}), 콘텐츠 구조 일치, ko 사전 == rules.js 원문, 생성 페이지가 최신인지, hreflang/canonical,
//     en/ja/zh-tw 사전·정적 페이지·공유 랜딩에 한글이 새지 않는지, 한국어 전용 키(쿠팡·후원)만 ko 에 있는지
//  2) 브라우저 검사(언어별): 홈 → 결과 → 공유 링크 → 친구 비교 화면 → 궁합 공유까지 화면 텍스트·스토리 카드 캔버스 글자에 한글이 없는지,
//     공유 링크의 언어 접두어, 추적 이벤트의 lang, AdFit/쿠팡/후원이 한국어 외에는 숨겨지는지
// 수집(Supabase)은 꺼 둔다(hoa_collect=off). 손바닥 사진은 로컬 테스트용 val 이미지만 쓴다.
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { execFileSync } from 'child_process';
import { LANGS, LANG_IDS, pathFor } from '../public/js/i18n/langs.js';
import { RULES } from '../public/js/rules.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const BASE = (process.argv[2] || 'http://localhost:8787/').replace(/\/$/, '');
const VAL = process.env.VAL || '/workspace/palm-ai/data/palm_lines_yolo_v2/images/val/';
const KAKAO = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410530';  // 스토리 카드는 인앱 브라우저에서 모달로 열린다
const results = {}, errors = [];
const check = (n, ok, extra) => { results[n] = { ok: !!ok, ...(extra || {}) }; };
const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
const hangulIn = (s) => (String(s).match(/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]+/g) || []).slice(0, 5);
const NON_KO = LANG_IDS.filter((l) => l !== 'ko');
const KO_ONLY = /^(priv\.(coupang|donate)\.|ads\.coupang_|donate\.)/;

// ---------- 1. 정적 ----------
const D = {}, C = {};
for (const l of LANG_IDS) { D[l] = (await import(`../public/js/i18n/${l}.js`)).default; C[l] = (await import(`../i18n/content.${l}.mjs`)).default; }
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
{
  const bad = { missing: {}, extra: {}, vars: {}, koOnlyLeak: {}, empty: {} };
  for (const l of NON_KO) {
    bad.missing[l] = Object.keys(D.ko).filter((k) => !(k in D[l]) && !KO_ONLY.test(k));
    bad.extra[l] = Object.keys(D[l]).filter((k) => !(k in D.ko));
    bad.vars[l] = Object.keys(D[l]).filter((k) => k in D.ko && vars(D[l][k]) !== vars(D.ko[k]));
    bad.koOnlyLeak[l] = Object.keys(D[l]).filter((k) => KO_ONLY.test(k));
    bad.empty[l] = Object.keys(D[l]).filter((k) => !String(D[l][k]).trim());
  }
  const all = (o) => NON_KO.every((l) => o[l].length === 0);
  check('dict_keys_match_ko', all(bad.missing) && all(bad.extra), { missing: bad.missing, extra: bad.extra });
  check('dict_placeholders_match', all(bad.vars), { vars: bad.vars });
  check('dict_no_empty_values', all(bad.empty), { empty: bad.empty });
  check('ko_only_keys_only_in_ko', all(bad.koOnlyLeak), { leak: bad.koOnlyLeak });
  check('dict_no_hangul_in_non_ko', NON_KO.every((l) => Object.entries(D[l]).every(([, v]) => !HANGUL.test(v))), { hits: Object.fromEntries(NON_KO.map((l) => [l, Object.entries(D[l]).filter(([, v]) => HANGUL.test(v)).map(([k]) => k)])) });
  check('dict_ko_has_hangul', Object.entries(D.ko).filter(([k, v]) => !/^(brand\.|ev\.)/.test(k) && /[A-Za-z]/.test(v) && !HANGUL.test(v) && !/_html$/.test(k) && v.length > 25).length === 0);
}
{ // ko 사전의 풀이 문구는 interpret/rules.yaml → rules.js 의 원문과 같아야 한다 (앱 문구가 두 곳으로 갈라지지 않게)
  const miss = [];
  for (const [id, txt] of Object.entries(RULES.reasons)) if (D.ko[`reason.${id}`] !== txt) miss.push(id);
  for (const tp of RULES.types) {
    if (D.ko[`type.${tp.id}.name`] !== tp.name) miss.push(`type.${tp.id}.name`);
    if (D.ko[`type.${tp.id}.keyword`] !== tp.keyword) miss.push(`type.${tp.id}.keyword`);
  }
  check('ko_dict_matches_rules_js', miss.length === 0, { miss });
  check('all_reasons_and_types_translated', NON_KO.every((l) => Object.keys(RULES.reasons).every((id) => D[l][`reason.${id}`]) && RULES.types.every((tp) => ['name', 'keyword', 'element', 'intro', 'charm'].every((k) => D[l][`type.${tp.id}.${k}`]))));
}
{ // 콘텐츠 구조
  const shape = (o) => (Array.isArray(o) ? `[${o.length}]` : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, shape(o[k])])) : typeof o);
  const strip = (c) => ({ guide: Object.fromEntries(Object.entries(c.guide).map(([k, v]) => [k, Object.keys(v).sort().concat(v.sections ? v.sections.map((s) => s[1].length) : [])])), fox: Object.keys(c.foxes).sort(), foxShape: Object.fromEntries(Object.entries(c.foxes).map(([k, v]) => [k, [v.traits.length, v.compat.length, v.compat.map((x) => x[0]).join()]])) });
  const ref = JSON.stringify(strip(C.ko).guide).replace(/,?"\d+"/g, '');
  const diffs = [];
  for (const l of NON_KO) {
    const a = strip(C[l]);
    for (const [k, v] of Object.entries(strip(C.ko).guide)) if (a.guide[k].filter((x) => typeof x === 'string').join() !== v.filter((x) => typeof x === 'string').join() || a.guide[k].filter((x) => typeof x === 'number').join() !== v.filter((x) => typeof x === 'number').join()) diffs.push(`${l}:guide.${k}`);
    if (JSON.stringify(a.fox) !== JSON.stringify(strip(C.ko).fox)) diffs.push(`${l}:foxes ids`);
    for (const [k, v] of Object.entries(strip(C.ko).foxShape)) if (JSON.stringify(a.foxShape[k]) !== JSON.stringify(v)) diffs.push(`${l}:fox.${k}`);
    for (const k of Object.keys(C.ko.labels)) if (!(k in C[l].labels) && k !== 'fox_title_suffix') diffs.push(`${l}:labels.${k}`);
    for (const k of ['about', 'terms', 'privacy', 'foxidx']) if (!C[l][k]) diffs.push(`${l}:${k}`);
  }
  check('content_structure_matches_ko', diffs.length === 0 && !!ref, { diffs });
}
{ // 생성 결과가 최신인가
  let out = '', ok = true;
  try { out = execFileSync('node', ['tools/gen_i18n.mjs', '--check'], { cwd: root }).toString(); } catch (e) { ok = false; out = String(e.stdout || e.message); }
  check('generated_pages_up_to_date', ok, { out: out.trim().split('\n').slice(-3) });
}
{ // 정적 페이지: 한글 누출, hreflang 상호 참조, canonical, 공유 랜딩 noindex
  const pages = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name === 'index.html') pages.push(p); } };
  for (const l of NON_KO) walk(path.join(pub, LANGS[l].prefix));
  const leaks = [], hre = [], can = [], noindex = [], sw = [];
  for (const f of pages) {
    const rel = '/' + path.relative(pub, f).replace(/index\.html$/, '').replace(/\\/g, '/');
    const lang = NON_KO.find((l) => rel.startsWith(LANGS[l].prefix + '/'));
    const html = fs.readFileSync(f, 'utf8');
    const body = html.replace(/<details class="lang-switch.*?<\/details>/gs, '');   // 언어 이름(한국어)은 의도된 표기
    if (HANGUL.test(body.replace(/<link rel="alternate"[^>]*>/g, ''))) leaks.push({ f: rel, hits: hangulIn(body) });
    if (!new RegExp(`<html lang="${LANGS[lang].html}"`).test(html)) leaks.push({ f: rel, html_lang: true });
    const isShare = /\/s\/[a-z]+\/$/.test(rel);
    if (isShare) { if (!/name="robots" content="noindex,follow"/.test(html)) noindex.push(rel); if (!html.includes(`/img/share/${lang}/`)) noindex.push(rel + ' og:image'); if (!html.includes(`location.replace('${LANGS[lang].prefix}/?'`)) noindex.push(rel + ' redirect'); continue; }
    if (!html.includes(`<link rel="canonical" href="https://hoadosa.com${rel}">`)) can.push(rel);
    const base = rel.replace(LANGS[lang].prefix, '') || '/';
    for (const l of LANG_IDS) for (const h of LANGS[l].hreflang) if (!html.includes(`hreflang="${h}" href="https://hoadosa.com${pathFor(l, base)}"`)) hre.push(`${rel}:${h}`);
    if (!html.includes(`hreflang="x-default" href="https://hoadosa.com${base}"`)) hre.push(`${rel}:x-default`);
    if (!/class="lang-switch/.test(html)) sw.push(rel);
    for (const l of LANG_IDS) if (!fs.existsSync(path.join(pub, pathFor(l, base), 'index.html'))) hre.push(`${rel}: missing ${l} page`);
  }
  check('static_pages_no_hangul', leaks.length === 0 && pages.length >= NON_KO.length * 22, { n: pages.length, leaks: leaks.slice(0, 6) });
  check('hreflang_complete_and_reciprocal', hre.length === 0, { bad: hre.slice(0, 6) });
  check('canonical_self', can.length === 0, { bad: can.slice(0, 6) });
  check('share_pages_localized_noindex', noindex.length === 0, { bad: noindex.slice(0, 6) });
  check('lang_switcher_on_every_page', sw.length === 0, { bad: sw.slice(0, 6) });
  const sm = fs.readFileSync(path.join(pub, 'sitemap.xml'), 'utf8');
  check('sitemap_has_all_langs', LANG_IDS.every((l) => sm.includes(`<loc>https://hoadosa.com${pathFor(l, '/guide/life/')}</loc>`)) && sm.includes('hreflang="x-default"') && !/\/s\/[a-z]+\//.test(sm));
  const shareImgs = NON_KO.every((l) => RULES.types.every((tp) => fs.existsSync(path.join(pub, 'img/share', l, `${tp.id}.jpg`))));
  check('share_og_images_per_lang', shareImgs);
  // 한국어 루트는 한국어 그대로 (쿠팡·후원 슬롯이 ko 에만 있고 외국어 페이지에는 없다)
  const koHome = fs.readFileSync(path.join(pub, 'index.html'), 'utf8'), enHome = fs.readFileSync(path.join(pub, 'en/index.html'), 'utf8');
  check('korea_only_slots_only_on_ko_home', /r-coupang/.test(koHome) && /r-donate/.test(koHome) && !/r-coupang|r-donate/.test(enHome));
  check('english_privacy_has_no_coupang_donate_kakao', !/Coupang|Toss|KakaoPay|AdFit|Kakao/i.test(fs.readFileSync(path.join(pub, 'en/privacy/index.html'), 'utf8')));
}

// ---------- 2. 브라우저 ----------
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const mk = async (lang) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: KAKAO, locale: LANGS[lang].intl, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('hoa_collect', 'off'); localStorage.setItem('hoa_lang_dismissed', '1'); } catch {}
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared = d; } });
    window.__canvasText = [];
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...r) { window.__canvasText.push(String(t)); return ft.call(this, t, ...r); };
  });
  const posts = []; ctx.on('request', (r) => { if (r.url().includes('supabase.co') && r.method() === 'POST') posts.push(r.url()); });
  const adfit = []; ctx.on('request', (r) => { if (/daumcdn\.net\/kas|kakao.*adfit/.test(r.url())) adfit.push(r.url()); });
  const p = await ctx.newPage(); p.__posts = posts; p.__adfit = adfit;
  p.on('pageerror', (e) => errors.push(`${lang}: ${e}`));
  p.on('console', (m) => { if ((m.type() === 'error' && !/Failed to load resource/.test(m.text())) || /i18n: missing key/.test(m.text())) errors.push(`${lang}: ${m.text()}`); });
  return p;
};
const bodyText = (p) => p.evaluate(() => {
  const c = document.body.cloneNode(true);
  c.querySelectorAll('script,style,.lang-switch,.langbar').forEach((e) => e.remove());
  return c.textContent.replace(/\s+/g, ' ') + ' ' + [...c.querySelectorAll('[alt],[aria-label],[title],[placeholder]')].map((e) => ['alt', 'aria-label', 'title', 'placeholder'].map((a) => e.getAttribute(a) || '').join(' ')).join(' ');
});
async function analyse(p, img) {
  await p.click('#btn-start'); await p.waitForSelector('#s-capture.active');
  await p.setInputFiles('#in-album', VAL + img);
  await p.waitForSelector('#s-result.active, #s-compare.active, #s-error.active', { timeout: 120000 });
  await p.addStyleTag({ content: '#r-overlay{visibility:hidden!important}' }); await p.waitForTimeout(500);
}

for (const lang of LANG_IDS) {
  const pre = LANGS[lang].prefix, ko = lang === 'ko', tag = (n) => `${lang}:${n}`;
  const A = await mk(lang);
  await A.goto(`${BASE}${pre}/`, { waitUntil: 'networkidle' });
  check(tag('html_lang_and_data_lang'), await A.evaluate((h) => document.documentElement.lang === h.html && document.documentElement.dataset.lang === h.id, LANGS[lang]));
  const home = await bodyText(A);
  check(tag('home_language'), ko ? HANGUL.test(home) : !HANGUL.test(home), { hangul: hangulIn(home) });
  check(tag('home_title'), ko ? HANGUL.test(await A.title()) : !HANGUL.test(await A.title()), { title: await A.title() });
  await A.screenshot({ path: `/tmp/i18n_home_${lang}.png` });
  await analyse(A, 'image1016.jpg');
  check(tag('result_screen_reached'), await A.locator('#s-result.active').count() === 1);
  await A.click('.luck-tile[data-open="wealth"]'); await A.waitForSelector('#r-evidence:not(.hidden)');
  await A.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  const res = await bodyText(A);
  check(tag('result_language'), ko ? HANGUL.test(res) : !HANGUL.test(res), { hangul: hangulIn(res) });
  const lh = ['#r-type', '#r-keyword', '#r-intro', '#r-lucks'];
  const ltxt = (await Promise.all(lh.map((s) => A.textContent(s)))).join(' ');
  check(tag('result_main_blocks_nonempty'), ltxt.replace(/\s/g, '').length > 80, { len: ltxt.length });
  check(tag('monetize_slots'), await A.evaluate((isKo) => {
    const hid = (id) => { const e = document.getElementById(id); return !e || e.hidden || e.classList.contains('hidden') || !e.childElementCount; };
    return isKo ? true : hid('r-coupang') && hid('r-donate') && hid('r-adfit');
  }, ko) && (ko || A.__adfit.length === 0), { adfit_requests: A.__adfit });
  // 공유: 링크의 언어 접두어와 본문
  await A.locator('#r-sharehero').scrollIntoViewIfNeeded(); await A.click('#sh-native');
  const sh = await A.evaluate(() => window.__shared);
  const su = sh && new URL(sh.url);
  check(tag('share_url_prefix'), su && new RegExp(`^${pre}/s/[a-z]+/$`).test(su.pathname) && su.searchParams.get('ref') === 'share', { url: sh && sh.url });
  check(tag('share_text_language'), sh && (ko ? HANGUL.test(sh.text) : !HANGUL.test(sh.text) && sh.text.length > 10), { text: sh && sh.text });
  const ev = await A.evaluate(() => window.__track.map((e) => ({ n: e.name, l: e.data && e.data.lang })));
  check(tag('tracking_has_lang'), ev.length > 0 && ev.every((e) => e.l === lang), { ev: ev.slice(0, 6) });
  // 스토리 카드 (캔버스에 그려지는 글자)
  await A.locator('#btn-card').scrollIntoViewIfNeeded(); await A.evaluate(() => { window.__canvasText = []; }); await A.click('#btn-card');
  await A.waitForSelector('#card-modal:not(.hidden)', { timeout: 20000 });
  const ct = await A.evaluate(() => window.__canvasText.join(' | '));
  check(tag('story_card_text_language'), ct.length > 20 && (ko ? HANGUL.test(ct) : !HANGUL.test(ct)), { text: ct.slice(0, 160), hangul: hangulIn(ct) });
  check(tag('story_card_link_prefix'), ko ? true : /hoadosa\.com/.test(ct), { text: ct.slice(-80) });
  check(tag('no_supabase_writes'), A.__posts.length === 0);

  // 친구가 공유 링크를 연다 → 앱 안내 → 비교 화면
  const C = await mk(lang);
  const html = await (await C.request.get(BASE + su.pathname + su.search)).text();
  check(tag('landing_og'), html.includes(`<html lang="${LANGS[lang].html}"`) && html.includes(`og:image" content="https://hoadosa.com/img/share/${ko ? '' : lang + '/'}`) && (ko || !HANGUL.test(html)));
  await C.goto(BASE + su.pathname + su.search, { waitUntil: 'networkidle' });
  await C.waitForSelector('#shared-banner:not(.hidden)');
  const cu = new URL(C.url());
  check(tag('landing_redirects_to_lang_home'), cu.pathname === `${pre}/` || (ko && cu.pathname === '/'), { path: cu.pathname });
  check(tag('landing_banner_language'), (() => true)() && await C.evaluate((k) => { const t = document.getElementById('shared-banner').textContent; return k ? /[가-힣]/.test(t) : !/[가-힣]/.test(t); }, ko));
  await analyse(C, 'image1047.jpg');
  check(tag('compare_screen'), await C.locator('#s-compare.active').count() === 1);
  await C.screenshot({ path: `/tmp/i18n_compare_${lang}.png` });
  await C.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  const cmp = await bodyText(C);
  check(tag('compare_language'), ko ? HANGUL.test(cmp) : !HANGUL.test(cmp), { hangul: hangulIn(cmp) });
  await C.click('#c-share'); await C.waitForFunction(() => window.__shared, null, { timeout: 15000 });
  const pc = await C.evaluate(() => window.__shared);
  check(tag('pair_share_language_and_prefix'), pc.text && (ko ? HANGUL.test(pc.text) : !HANGUL.test(pc.text)) && (pc.url ? new RegExp(`^${pre}/s/`).test(new URL(pc.url).pathname) : new RegExp(`${pre}/s/[a-z]+/\\?`).test(pc.text)), { text: pc.text, url: pc.url });
  await C.evaluate(() => { window.__canvasText = []; });
  await C.locator('#c-card').scrollIntoViewIfNeeded(); await C.click('#c-card');
  await C.waitForSelector('#card-modal:not(.hidden)', { timeout: 20000 });
  const cct = await C.evaluate(() => window.__canvasText.join(' | '));
  check(tag('compare_card_text_language'), cct.length > 15 && (ko ? HANGUL.test(cct) : !HANGUL.test(cct)), { text: cct.slice(0, 160), hangul: hangulIn(cct) });
  check(tag('no_supabase_writes_friend'), C.__posts.length === 0);
  await A.context().close(); await C.context().close();
}

// 첫 방문 언어 자동 이동 (langredirect.js) + 제안 바 보조
{
  const fresh = async (locale, opts = {}) => {
    const ua = opts.ua || KAKAO;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale, userAgent: ua });
    await ctx.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('hoa_test_fresh')) {
          localStorage.removeItem('hoa_lang');
          localStorage.removeItem('hoa_lang_dismissed');
          sessionStorage.setItem('hoa_test_fresh', '1');
        }
      } catch {}
    });
    const p = await ctx.newPage();
    return { ctx, p };
  };
  {
    const { ctx, p } = await fresh('en-US');
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check('auto_redirect_en', new URL(p.url()).pathname === '/en/');
    check('auto_redirect_stores_pref_en', await p.evaluate(() => localStorage.getItem('hoa_lang')) === 'en');
    await ctx.close();
  }
  {
    const { ctx, p } = await fresh('ja-JP');
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check('auto_redirect_ja', new URL(p.url()).pathname === '/ja/');
    await ctx.close();
  }
  {
    const { ctx, p } = await fresh('zh-TW');
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check('auto_redirect_zh_tw', new URL(p.url()).pathname === '/zh-tw/');
    await ctx.close();
  }
  {
    const { ctx, p } = await fresh('zh-CN');
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check('auto_redirect_zh_cn', new URL(p.url()).pathname === '/zh-cn/');
    await ctx.close();
  }
  {
    const { ctx, p } = await fresh('ko-KR');
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check('auto_redirect_ko_stays', new URL(p.url()).pathname === '/');
    await ctx.close();
  }
  {
    const { ctx, p } = await fresh('en-US', { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check('auto_redirect_bot_stays', new URL(p.url()).pathname === '/');
    await ctx.close();
  }
  {
    const { ctx, p } = await fresh('ja-JP');
    await p.goto(`${BASE}/?t=gold&ref=share`, { waitUntil: 'networkidle' });
    const u = new URL(p.url());
    check('auto_redirect_preserves_share_query', u.pathname === '/ja/' && u.searchParams.get('t') === 'gold' && u.searchParams.get('ref') === 'share');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await p.locator('.lang-switch summary').click();
    await p.locator('.lang-switch a[data-lang="ko"]').click();
    await p.waitForURL((url) => url.pathname === '/' || url.pathname === '', { waitUntil: 'networkidle' });
    await p.reload({ waitUntil: 'networkidle' });
    check('auto_redirect_respects_ko_switch', new URL(p.url()).pathname === '/');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', userAgent: KAKAO });
    await ctx.addInitScript(() => { try { localStorage.setItem('hoa_lang', 'ko'); } catch {} });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check('no_redirect_after_ko_switch', new URL(p.url()).pathname === '/');
    await ctx.close();
  }
  for (const [loc, path, id] of [
    ['es-ES', '/es/', 'auto_redirect_es'],
    ['vi-VN', '/vi/', 'auto_redirect_vi'],
    ['th-TH', '/th/', 'auto_redirect_th'],
    ['id-ID', '/id/', 'auto_redirect_id'],
    ['de-DE', '/de/', 'auto_redirect_de'],
    ['fr-FR', '/fr/', 'auto_redirect_fr'],
  ]) {
    const { ctx, p } = await fresh(loc);
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check(id, new URL(p.url()).pathname === path);
    await ctx.close();
  }
  {
    const { ctx, p } = await fresh('zh-TW');
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check('auto_redirect_zh_hant_to_zh_tw', new URL(p.url()).pathname === '/zh-tw/');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/en/`, { waitUntil: 'networkidle' });
    check('langbar_silent_when_already_matching', await p.locator('.langbar').count() === 0);
    await p.locator('.lang-switch summary').click();
    check('lang_switch_menu_lists_all_langs', await p.locator('.lang-menu a').count() === LANG_IDS.length);
    await ctx.close();
  }
  const koHome = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
  const enHome = fs.readFileSync(path.join(pub, 'en/index.html'), 'utf8');
  check('langredirect_on_ko_not_on_en', koHome.includes('/js/langredirect.js') && !enHome.includes('/js/langredirect.js'));
}
check('no_app_errors', errors.length === 0, { errors: errors.slice(0, 8) });
await browser.close();
const bad = Object.entries(results).filter(([, v]) => !v.ok);
console.log(JSON.stringify(bad.length ? Object.fromEntries(bad) : { passed: Object.keys(results).length }, null, 1));
console.log(bad.length ? `FAIL (${bad.length}/${Object.keys(results).length})` : `ALL PASS (${Object.keys(results).length})`);
process.exit(bad.length ? 1 : 0);
