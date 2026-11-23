// 다국어 정적 페이지 생성기 (빌드 단계 없는 사이트라 결과물 HTML 을 커밋한다).
//   node tools/gen_i18n.mjs            전체 생성 (홈·가이드·도감·소개·개인정보·약관 × ko/en/ja/zh-tw + sitemap)
//   node tools/gen_i18n.mjs --check    생성하지 않고 현재 파일과 같은지만 확인 (CI/테스트용)
// 문구: public/js/i18n/<lang>.js (앱+공용 사전), i18n/content.<lang>.mjs (가이드·도감·소개·약관 본문).
// 공유 랜딩(/s/…)과 OG 이미지는 tools/gen_share_og.mjs.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { LANGS, LANG_IDS, ORIGIN, pathFor } from '../public/js/i18n/langs.js';
import { makeT } from '../public/js/i18n/core.js';
import { RULES } from '../public/js/rules.js';
import { TYPE_EMOJI } from '../public/js/copy.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const CHECK = process.argv.includes('--check');
const LASTMOD = '2026-11-19';
const TYPE_IDS = RULES.types.map((x) => x.id);
const GUIDE_LINES = [['life', '🌿', 'life'], ['head', '⭐', 'head'], ['heart', '💕', 'heart'], ['fate', '🏆', 'fate']];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escText = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const GEN = (process.env.GEN_LANGS || LANG_IDS.join(',')).split(',');  // 개발용: GEN_LANGS=ko 처럼 일부만
const DICTS = {}, CONTENT = {}, T = {};
for (const l of GEN) {
  DICTS[l] = (await import(`../public/js/i18n/${l}.js`)).default;
  CONTENT[l] = (await import(`../i18n/content.${l}.mjs`)).default;
  T[l] = makeT(DICTS[l], (k) => { throw new Error(`missing i18n key ${k} (${l})`); });
}

/** 본문 HTML 안의 사이트 내부 링크(/guide/ …, /#privacy)에 언어 접두어를 붙인다. 루트(/)·lang-menu 링크는 건드리지 않는다. */
const PAGE_HREF = /href="(\/(?:(?:guide|foxes|about|privacy|terms)(?:\/[^"]*)?|#[^"]+))"/g;
const localize = (html, lang) => (lang === 'ko' ? html : html.replace(PAGE_HREF, (m, p) => `href="${pathFor(lang, p)}"`));

const jsonLdTag = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
function webAppLd(lang) {
  const t = T[lang];
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: t('brand.title'),
    description: t('meta.desc'),
    url: `${ORIGIN}${pathFor(lang, '/')}`,
    applicationCategory: 'EntertainmentApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}
function articleLd(lang, page, { title, desc }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: desc,
    author: { '@type': 'Organization', name: 'mbox solutions' },
    publisher: { '@type': 'Organization', name: T[lang]('brand.title') },
    mainEntityOfPage: `${ORIGIN}${pathFor(lang, page)}`,
  };
}
function privacyFaqLd(lang) {
  const t = T[lang];
  const keys = ['photo', 'anon', 'visits', 'ads', ...(lang === 'ko' ? ['coupang', 'donate'] : []), 'none', 'store', 'off'];
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: keys.map((k) => ({
      '@type': 'Question',
      name: t(`priv.${k}.h`).replace(/^[^\s]+\s*/, ''),
      acceptedAnswer: { '@type': 'Answer', text: k === 'anon' || k === 'ads' || k === 'none' ? stripHtml(t(`priv.${k}.p_html`)) : t(`priv.${k}.p`) },
    })),
  };
}
const stripHtml = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// ---------- 공통 조각 ----------
function langSwitch(lang, page, cls = '') {
  const items = LANG_IDS.map((l) => {
    const cur = l === lang;
    return `<li><a href="${pathFor(l, page)}" lang="${LANGS[l].html}" hreflang="${LANGS[l].hreflang[0]}" data-lang="${l}"${cur ? ' aria-current="true"' : ''}>${LANGS[l].label}</a></li>`;
  }).join('');
  return `<details class="lang-switch${cls ? ' ' + cls : ''}"><summary aria-label="Language">🌐 <span>${LANGS[lang].label}</span></summary><ul class="lang-menu">${items}</ul></details>`;
}
function hreflangs(page) {
  const out = [];
  for (const l of LANG_IDS) for (const h of LANGS[l].hreflang) out.push(`<link rel="alternate" hreflang="${h}" href="${ORIGIN}${pathFor(l, page)}">`);
  out.push(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}${pathFor('ko', page)}">`);
  return out.join('\n');
}
function head(lang, page, { title, desc, ogType, ogDesc, bodyClass, jsonLd }) {
  const t = T[lang];
  return `<!doctype html>
<html lang="${LANGS[lang].html}" data-lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d1236">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${ORIGIN}${pathFor(lang, page)}">
${hreflangs(page)}
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(t('brand.title'))}">
<meta property="og:locale" content="${LANGS[lang].og}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(ogDesc || desc)}">
<meta property="og:url" content="${ORIGIN}${pathFor(lang, page)}">
<meta property="og:image" content="${ORIGIN}/img/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/img/icon-192.png">
<link rel="apple-touch-icon" href="/img/icon-192.png">
<link rel="stylesheet" href="/css/app.css">
<link rel="stylesheet" href="/css/site.css">
<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>
${lang === 'ko' ? '<script src="/js/langredirect.js"></script>\n' : ''}<script defer src="/_vercel/insights/script.js"></script>
<meta name="google-adsense-account" content="ca-pub-1321078614012821">
${(Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : []).map(jsonLdTag).join('\n')}
</head>
`;
}
function footer(lang) {
  const t = T[lang];
  return localize(`<footer class="site-foot">
  <nav class="site-foot-nav">
    <a href="/guide/">${escText(t('nav.guide'))}</a>
    <a href="/foxes/">${escText(CONTENT[lang].labels.foxes)}</a>
    <a href="/about/">${escText(t('nav.about'))}</a>
    <a href="/privacy/">${escText(t('nav.privacy'))}</a>
    <a href="/terms/">${escText(t('nav.terms'))}</a>
  </nav>
  <p class="site-foot-copy">${escText(t('foot.copy'))}</p>
</footer>`, lang);
}
function sitePage(lang, page, meta, article, { ogType = 'website', articleClass = '' } = {}) {
  const jsonLd = meta.jsonLd;
  const t = T[lang];
  const header = localize(`  <header class="site-head">
    <a class="site-brand" href="/">${escText(t('brand.short'))}</a>
    <nav class="site-nav">
      <a href="/guide/">${escText(t('nav.guide'))}</a>
      <a href="/foxes/">${escText(t('nav.foxes_short'))}</a>
      <a href="/">${escText(t('nav.read'))}</a>
      ${langSwitch(lang, page)}
    </nav>
  </header>`, lang);
  return `${head(lang, page, { ...meta, ogType, jsonLd })}<body class="site-page">
<div id="app" class="site-app">
  <div class="stars-bg"></div>

${header}

  
  <article class="site-article card${articleClass}">
    ${localize(article, lang)}
  </article>


${footer(lang)}

</div>
<script defer src="/js/langbar.js"></script>
</body>
</html>
`;
}

// ---------- 페이지 본문 ----------
const crumb = (lang, ...rest) => {
  const c = CONTENT[lang].labels;
  const sep = c.crumb_sep || ' · ';
  return `<p class="crumb"><a href="/">${escText(c.home)}</a>${sep}${rest.join(sep)}</p>`;
};
const navBlock = (a, b) => `<p class="article-nav">
      ${a}
      ${b}
    </p>`;

function guideIndex(lang) {
  const c = CONTENT[lang], g = c.guide.index, t = T[lang];
  const cards = GUIDE_LINES.map(([id, emo, line]) => `<a class="guide-card" href="/guide/${id}/"><span class="guide-emo">${emo}</span><b>${escText(t('line.' + line))}</b><small>${escText(g.small)}</small></a>`).join('');
  return { title: g.title, desc: g.desc, article: `${crumb(lang, escText(c.labels.guide))}
    <h1>${g.h1}</h1>
    <p class="bubble">${g.bubble}</p>
    <p>${g.intro}</p>
    <div class="guide-list">
      ${cards}
    </div>
    <p class="fine">${g.fine}</p>
    <p><a class="btn primary" href="/">${escText(c.labels.cta_read)}</a></p>` };
}
function guideLine(lang, id) {
  const c = CONTENT[lang], g = c.guide[id], L = c.labels;
  const secs = g.sections.map(([h, ps]) => `<h2>${h}</h2>\n    ${ps.map((p) => `<p>${p}</p>`).join('')}`).join('\n    ');
  const nm = T[lang]('line.' + id);
  return { title: g.title, desc: g.desc, article: `${crumb(lang, `<a href="/guide/">${escText(L.guide)}</a>`, escText(nm))}
    <h1>${g.h1}</h1>
    <p class="bubble">${g.bubble}</p>
    ${secs}
    <p class="fine">${g.fine}</p>
    ${navBlock(`<a href="/guide/">${escText(L.back_guide)}</a>`, `<a class="btn primary" href="/">${escText(L.cta_read)}</a>`)}` };
}
function foxCard(lang, id) {
  const t = T[lang];
  return `<a class="fox-card" href="/foxes/${id}/"><span class="dg-emo">${TYPE_EMOJI[id]}</span><b>${escText(t(`type.${id}.name`))}</b><small>${escText(foxTag(lang, id, ' · '))}</small></a>`;
}
function foxTag(lang, id, sep) {
  const t = T[lang];
  const kw = '#' + t(`type.${id}.keyword`).split(/[·&]/).map((s) => s.trim()).join(' #');
  return `${kw}${sep}${t('result.element', { el: t(`type.${id}.element`) })}`;
}
function foxIndex(lang) {
  const c = CONTENT[lang], f = c.foxidx;
  return { title: f.title, desc: f.desc, article: `${crumb(lang, escText(c.labels.foxes))}
    <h1>${f.h1}</h1>
    <p class="bubble">${f.bubble}</p>
    <p>${f.intro}</p>
    <div class="fox-grid">
      ${TYPE_IDS.map((id) => foxCard(lang, id)).join('')}
    </div>
    <p><a class="btn primary" href="/">${escText(c.labels.cta_fox)}</a></p>` };
}
/** 한국어 조사 자리표시자({은는} {이가} {을를})를 앞 글자의 받침에 맞게 고른다. 다른 언어 문구에는 없다. */
function josa(s) {
  const PAIRS = { '은는': ['은', '는'], '이가': ['이', '가'], '을를': ['을', '를'] };
  return s.replace(/(.)\{(은는|이가|을를)\}/gu, (m, ch, k) => {
    const c = ch.charCodeAt(0);
    const has = c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0;
    return ch + PAIRS[k][has ? 0 : 1];
  });
}
function foxPage(lang, id) {
  const c = CONTENT[lang], L = c.labels, t = T[lang], f = c.foxes[id];
  const name = t(`type.${id}.name`), emo = TYPE_EMOJI[id];
  const title = `${emo} ${name}${L.fox_title_suffix}`;
  const desc = f.desc || josa(L.fox_desc.replace('{name}', name).replace('{el}', t(`type.${id}.element`)).replace('{kw}', t(`type.${id}.keyword`).split(/[·&]/).map((s) => s.trim()).join(L.fox_kw_sep || ', ')));
  const others = TYPE_IDS.filter((x) => x !== id).map((x) => `<a class="chip" href="/foxes/${x}/">${TYPE_EMOJI[x]} ${escText(t(`type.${x}.name`))}</a>`).join('');
  const compat = f.compat.map(([o, txt]) => `<li><a href="/foxes/${o}/">${TYPE_EMOJI[o]} ${escText(t(`type.${o}.name`))}</a> — ${txt}</li>`).join('');
  return { title, desc, article: `${crumb(lang, `<a href="/foxes/">${escText(L.foxes)}</a>`, escText(name))}
    <p class="fox-emo-lg">${emo}</p>
    <h1>${escText(name)}</h1>
    <p class="keyword">${escText(foxTag(lang, id, L.fox_tag_sep))}</p>
    <p class="bubble">${escText(t(`type.${id}.intro`))} ${escText(t(`type.${id}.charm`))}</p>
    <h2>${L.fox_h_what}</h2>
    <p>${f.intro}</p>
    <h2>${L.fox_h_traits}</h2>
    <ul class="trait-list">${f.traits.map((x) => `<li>${x}</li>`).join('')}</ul>
    <h2>${L.fox_h_compat}</h2>
    <p>${L.fox_compat_intro}</p>
    <ul class="compat-list">${compat}</ul>
    <h2>${L.fox_h_others}</h2>
    <p class="chip-row">${others}</p>
    ${navBlock(`<a href="/foxes/">${escText(L.back_foxes)}</a>`, `<a class="btn primary" href="/">${escText(L.cta_fox)}</a>`)}` };
}
function privacyPage(lang) {
  const c = CONTENT[lang], t = T[lang], ko = lang === 'ko';
  const sec = (k, body) => `<h2>${escText(t(`priv.${k}.h`))}</h2>\n    ${body}`;
  const p = (s) => `<p>${s}</p>`;
  const parts = [
    sec('photo', p(escText(t('priv.photo.p')))),
    sec('anon', `${p(t('priv.anon.p_html'))}
    <ul>
      ${[1, 2, 3, 4].map((i) => `<li>${escText(t('priv.anon.li' + i))}</li>`).join('\n      ')}
    </ul>`),
    sec('visits', p(escText(t('priv.visits.p')))),
    sec('ads', p(t('priv.ads.p_html'))),
    ...(ko ? [sec('coupang', p(escText(t('priv.coupang.p')))), sec('donate', p(escText(t('priv.donate.p'))))] : []),
    sec('none', p(t('priv.none.p_html'))),
    sec('store', p(escText(t('priv.store.p')))),
    sec('off', `${p(escText(t('priv.off.p')))}
    <p><a class="btn ghost" href="/#privacy">${escText(t('priv.off.btn'))}</a></p>
    <p class="fine">${t('priv.contact_html')}</p>`),
  ];
  return {
    title: `${t('priv.title')} · ${t('brand.title')}`,
    desc: c.privacy.desc,
    jsonLd: privacyFaqLd(lang),
    article: `${crumb(lang, escText(t('priv.title')))}
    <h1>${escText(t('priv.title'))}</h1>
    ${parts.join('\n    ')}`,
  };
}
const rawPage = (lang, k) => ({ title: CONTENT[lang][k].title, desc: CONTENT[lang][k].desc, article: CONTENT[lang][k].article });

// ---------- 홈 (앱 화면) ----------
function privApp(lang) {
  const t = T[lang], ko = lang === 'ko';
  const sec = (k, body) => `      <h3>${escText(t(`priv.${k}.h`))}</h3>\n      ${body}`;
  const p = (s) => `<p>${s}</p>`;
  return [
    sec('photo', p(escText(t('priv.photo.p')))),
    sec('anon', `${p(t('priv.anon.p_html'))}
      <ul>
        ${[1, 2, 3, 4].map((i) => `<li>${escText(t('priv.anon.li' + i))}</li>`).join('\n        ')}
      </ul>`),
    sec('visits', p(escText(t('priv.visits.p')))),
    sec('ads', p(t('priv.ads.p_html'))),
    ...(ko ? [sec('coupang', p(escText(t('priv.coupang.p')))), sec('donate', p(escText(t('priv.donate.p'))))] : []),
    sec('none', p(t('priv.none.p_html'))),
    sec('store', p(escText(t('priv.store.p')))),
    sec('off', `<label class="switch-row">
        <span class="consent-text">${escText(t('consent.aria'))}</span>
        <input type="checkbox" class="collect-toggle" role="switch" aria-label="${esc(t('consent.aria'))}">
        <i class="switch" aria-hidden="true"></i>
      </label>
      <p class="consent-sub">${escText(t('priv.off.sub'))}</p>`),
  ].join('\n');
}
function homePage(lang) {
  const t = T[lang];
  const tpl = fs.readFileSync(path.join(root, 'i18n/index.body.html'), 'utf8');
  // 쿠팡·후원 슬롯은 한국어 페이지에만 둔다 (monetize.js 도 비한국어에서는 마운트하지 않는다).
  const src = lang === 'ko' ? tpl : tpl.replace(/^.*(?:r-donate|r-coupang).*\n/gm, '');
  const body = src.replace(/\{\{([\w.]+)\}\}/g, (m, k) => {
    if (k === 'footer') return footer(lang).replace(/\n/g, '\n    ');
    if (k === 'lang_switch_top') return langSwitch(lang, '/', 'top');
    if (k === 'priv_app') return privApp(lang);
    if (!t.has(k)) throw new Error(`template key ${k} missing (${lang})`);
    return k.endsWith('_html') ? t(k) : escText(t(k)).replace(/"/g, '&quot;');
  });
  return head(lang, '/', { title: t('meta.title'), desc: t('meta.desc'), ogDesc: t('meta.og_desc'), ogType: 'website', jsonLd: [webAppLd(lang)] }) + localize(body, lang);
}

// ---------- 출력 ----------
const files = new Map();
const put = (lang, page, html) => files.set(path.join(pub, pathFor(lang, page), 'index.html').replace(/\/\/+/g, '/'), html);
const PAGES = [
  ['/', null],
  ['/guide/', guideIndex], ...GUIDE_LINES.map(([id]) => [`/guide/${id}/`, (l) => guideLine(l, id)]),
  ['/foxes/', foxIndex], ...TYPE_IDS.map((id) => [`/foxes/${id}/`, (l) => foxPage(l, id)]),
  ['/about/', (l) => rawPage(l, 'about')], ['/privacy/', privacyPage], ['/terms/', (l) => rawPage(l, 'terms')],
];
for (const lang of GEN) {
  for (const [page, fn] of PAGES) {
    if (page === '/') { put(lang, page, homePage(lang)); continue; }
    const m = fn(lang);
    const isArticle = /^\/(foxes|guide)\/.+/.test(page);
    const jsonLd = m.jsonLd || (isArticle ? [articleLd(lang, page, m)] : []);
    put(lang, page, sitePage(lang, page, { title: m.title, desc: m.desc, jsonLd }, m.article, { ogType: isArticle ? 'article' : 'website', articleClass: page === '/privacy/' ? ' privacy' : '' }));
  }
}
// sitemap (hreflang 대체 주소 포함). 공유 랜딩(/s/…)은 noindex 라 넣지 않는다.
const urlset = PAGES.flatMap(([page]) => GEN.map((lang) => {
  const alts = LANG_IDS.flatMap((l) => LANGS[l].hreflang.map((h) => `    <xhtml:link rel="alternate" hreflang="${h}" href="${ORIGIN}${pathFor(l, page)}"/>`));
  alts.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${pathFor('ko', page)}"/>`);
  return `  <url>
    <loc>${ORIGIN}${pathFor(lang, page)}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>monthly</changefreq>
${alts.join('\n')}
  </url>`;
}));
files.set(path.join(pub, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlset.join('\n')}
</urlset>
`);

let diff = 0;
for (const [file, html] of files) {
  if (CHECK) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== html) { diff++; console.log('DIFF', path.relative(pub, file)); } continue; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}
console.log(CHECK ? (diff ? `${diff} file(s) out of date` : `ok: ${files.size} files up to date`) : `wrote ${files.size} files`);
if (CHECK && diff) process.exit(1);
