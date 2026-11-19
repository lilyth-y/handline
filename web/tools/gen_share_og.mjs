// 유형별 공유 미리보기 이미지(1200x630 JPG)와 /s/<유형>/ 정적 페이지를 만든다. (언어별)
//   node tools/gen_share_og.mjs                  en,ja,zh-tw 만 생성 (한국어 기존 파일은 건드리지 않는다)
//   node tools/gen_share_og.mjs --langs=ko,en    생성할 언어 지정
//   (Chrome 필요: CHROME=/usr/bin/google-chrome. 글꼴: Noto Sans CJK / Noto Sans KR 이 깔려 있어야 한다)
// 결과: ko → img/share/<id>.jpg + s/<id>/ · 그 외 → img/share/<lang>/<id>.jpg + <lang>/s/<id>/
// 이미지는 앱 마스코트(img/hoa.jpg)와 글자만 쓴다. 손바닥 사진은 쓰지 않는다. 공유 페이지는 noindex.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';
import { RULES } from '../public/js/rules.js';
import { TYPE_EMOJI } from '../public/js/copy.js';
import { LANGS, ORIGIN, pathFor } from '../public/js/i18n/langs.js';
import { makeT } from '../public/js/i18n/core.js';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public');
const argLangs = (process.argv.find((a) => a.startsWith('--langs=')) || '--langs=en,ja,zh-tw').slice(8).split(',').filter(Boolean);
const hoa = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(pub, 'img/hoa.jpg')).toString('base64');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FONTS = {
  ko: '"Noto Sans KR","Gothic A1","NanumGothic",sans-serif',
  en: '"Noto Sans","Helvetica Neue",Arial,"Noto Sans CJK JP",sans-serif',
  ja: '"Noto Sans JP","Noto Sans CJK JP","Hiragino Sans","Yu Gothic",sans-serif',
  'zh-tw': '"Noto Sans TC","Noto Sans CJK TC","PingFang TC","Microsoft JhengHei",sans-serif',
};

const slide = (t, lang, tt) => `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:${FONTS[lang]};color:#f4f1ff;
background:radial-gradient(ellipse at 25% 40%,#3a3f9a 0%,#161d4f 45%,#0d1236 80%);position:relative}
.st{position:absolute;border-radius:50%;background:#fff}
.frame{position:absolute;inset:22px;border:3px solid #f3cc6b66;border-radius:36px}
.hoa{position:absolute;left:70px;top:105px;width:420px;height:420px;border-radius:50%;box-shadow:0 0 90px #b9a7ffaa;border:6px solid #b9a7ff66}
.tx{position:absolute;left:560px;right:60px;top:64px}
.eb{font-size:30px;color:#e6defc;font-weight:500;margin-bottom:10px}
.me{font-size:40px;font-weight:700;margin-bottom:2px}
.nm{font-size:${{ en: 58, ja: 58 }[lang] || 68}px;line-height:1.12;font-weight:900;color:#f3cc6b;letter-spacing:${lang === 'en' ? -1 : -2}px;word-break:${{ en: 'normal', 'zh-tw': 'break-all' }[lang] || 'keep-all'}}
.kw{font-size:28px;color:#e6defc;margin-top:12px}
.q{margin-top:16px;font-size:44px;font-weight:800}
.pill{position:absolute;left:560px;bottom:52px;white-space:nowrap;background:linear-gradient(90deg,#f3cc6b,#ffe6a6);color:#2a1d00;font-size:30px;font-weight:800;border-radius:50px;padding:12px 32px}
</style><body>
${Array.from({ length: 36 }, (_, i) => { const r = (n) => ((i * 9301 + n * 49297) % 233280) / 233280; const s = 2 + r(3) * 4; return `<i class="st" style="left:${r(1) * 1200}px;top:${r(2) * 630}px;width:${s}px;height:${s}px;opacity:${0.3 + r(4) * 0.6}"></i>`; }).join('')}
<div class="frame"></div>
<img class="hoa" src="${hoa}">
<div class="tx"><div class="eb">${esc(tt('og.eyebrow'))}</div>
<div class="me">${esc(tt('og.me', { emoji: TYPE_EMOJI[t.id] || '' }))}</div>
<div class="nm">${esc(tt('og.name', { name: tt(`type.${t.id}.name`) })).replace(lang === 'ja' ? 'ぎつね' : '\u0000', '<wbr>ぎつね')}</div>
<div class="kw">${esc(tt('og.kw', { kw: tt(`type.${t.id}.keyword`).replace('·', ' #'), el: tt(`type.${t.id}.element`) }))}</div>
<div class="q">${esc(tt('og.q'))}</div></div>
<div class="pill">${esc(tt('og.pill', { host: 'hoadosa.com' }))}</div></body>`;

const page = (t, lang, tt) => {
  const emo = TYPE_EMOJI[t.id] || '🦊', pre = LANGS[lang].prefix;
  const name = tt(`type.${t.id}.name`);
  const title = tt('sp.title', { emoji: emo, name });
  const desc = tt('sp.desc', { intro: tt(`type.${t.id}.intro`) });
  const url = `${ORIGIN}${pre}/s/${t.id}/`;
  const img = `${ORIGIN}/img/share/${lang === 'ko' ? '' : lang + '/'}${t.id}.jpg`;
  const home = `${pre}/`;
  return `<!doctype html>
<html lang="${LANGS[lang].html}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d1236">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${ORIGIN}${pre}/foxes/${t.id}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(tt('brand.title'))}">
<meta property="og:locale" content="${LANGS[lang].og}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${img}">
<link rel="icon" href="/img/icon-192.png">
<noscript><meta http-equiv="refresh" content="0;url=${home}?t=${t.id}&amp;ref=share"></noscript>
<script>
// Chat-app previews read only the OG tags above. A human visitor is sent straight on to the app (${home}?t=…&s=…&ref=share).
(function () {
  var p = new URLSearchParams(location.search);
  var q = new URLSearchParams();
  q.set('t', '${t.id}');
  if (/^[1-5]{4}$/.test(p.get('s') || '')) q.set('s', p.get('s'));
  if (/^[0-9a-z-]{14}$/.test(p.get('p') || '')) q.set('p', p.get('p'));
  if (/^[a-z]{3,12}$/.test(p.get('f') || '') && /^[0-9]{2,3}$/.test(p.get('c') || '')) { q.set('f', p.get('f')); q.set('c', p.get('c')); }
  q.set('ref', /^[a-z0-9_-]{1,20}$/i.test(p.get('ref') || '') ? p.get('ref') : 'share');
  location.replace('${home}?' + q.toString());
})();
</script>
<style>html,body{margin:0;background:#0d1236;color:#f4f1ff;font-family:-apple-system,"Noto Sans KR","Noto Sans JP","Noto Sans TC",sans-serif;text-align:center}a{color:#f3cc6b}</style>
</head>
<body>
<p style="padding:48px 20px;line-height:1.8">${esc(tt('sp.waiting'))}<br><a href="${home}?t=${t.id}&amp;ref=share">${esc(tt('sp.go'))}</a></p>
</body>
</html>
`;
};

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const pg = await ctx.newPage();
for (const lang of argLangs) {
  if (!LANGS[lang]) throw new Error(`unknown lang ${lang}`);
  const tt = makeT((await import(`../public/js/i18n/${lang}.js`)).default, (k) => { throw new Error(`missing key ${k} (${lang})`); });
  const imgDir = path.join(pub, 'img/share', lang === 'ko' ? '' : lang);
  fs.mkdirSync(imgDir, { recursive: true });
  for (const t of RULES.types) {
    await pg.setContent(slide(t, lang, tt)); await pg.evaluate(() => document.fonts.ready);
    await pg.screenshot({ path: path.join(imgDir, `${t.id}.jpg`), type: 'jpeg', quality: 86 });
    const dir = path.join(pub, pathFor(lang, '/s'), t.id); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page(t, lang, tt));
    console.log('ok', lang, t.id);
  }
}
await browser.close();
