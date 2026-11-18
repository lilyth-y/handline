// 유형별 공유 미리보기 이미지(1200x630 JPG)와 /s/<유형>/ 정적 페이지를 만든다.
//   node tools/gen_share_og.mjs        (Chrome 필요: CHROME=/usr/bin/google-chrome)
// 이미지는 앱 마스코트(img/hoa.jpg)와 글자만 쓴다. 손바닥 사진은 쓰지 않는다.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';
import { RULES } from '../public/js/rules.js';
import { TYPE_COPY, TYPE_EMOJI } from '../public/js/copy.js';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public');
const ORIGIN = 'https://hoadosa.com';
const hoa = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(pub, 'img/hoa.jpg')).toString('base64');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
fs.mkdirSync(path.join(pub, 'img/share'), { recursive: true });

const slide = (t) => `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:"Noto Sans KR","Gothic A1","NanumGothic",sans-serif;color:#f4f1ff;
background:radial-gradient(ellipse at 25% 40%,#3a3f9a 0%,#161d4f 45%,#0d1236 80%);position:relative}
.st{position:absolute;border-radius:50%;background:#fff}
.frame{position:absolute;inset:22px;border:3px solid #f3cc6b66;border-radius:36px}
.hoa{position:absolute;left:70px;top:105px;width:420px;height:420px;border-radius:50%;box-shadow:0 0 90px #b9a7ffaa;border:6px solid #b9a7ff66}
.tx{position:absolute;left:560px;right:60px;top:64px}
.eb{font-size:30px;color:#e6defc;font-weight:500;margin-bottom:10px}
.me{font-size:40px;font-weight:700;margin-bottom:2px}
.nm{font-size:68px;line-height:1.12;font-weight:900;color:#f3cc6b;letter-spacing:-2px;word-break:keep-all}
.kw{font-size:28px;color:#e6defc;margin-top:12px}
.q{margin-top:16px;font-size:44px;font-weight:800}
.pill{position:absolute;left:560px;bottom:52px;white-space:nowrap;background:linear-gradient(90deg,#f3cc6b,#ffe6a6);color:#2a1d00;font-size:30px;font-weight:800;border-radius:50px;padding:12px 32px}
</style><body>
${Array.from({ length: 36 }, (_, i) => { const r = (n) => ((i * 9301 + n * 49297) % 233280) / 233280; const s = 2 + r(3) * 4; return `<i class="st" style="left:${r(1) * 1200}px;top:${r(2) * 630}px;width:${s}px;height:${s}px;opacity:${0.3 + r(4) * 0.6}"></i>`; }).join('')}
<div class="frame"></div>
<img class="hoa" src="${hoa}">
<div class="tx"><div class="eb">💌 친구가 도전장을 보냈어요!</div>
<div class="me">나는 ${TYPE_EMOJI[t.id] || ''}</div>
<div class="nm">${esc(t.name)}!</div>
<div class="kw">#${esc(t.keyword.replace('·', ' #'))} · ${esc(t.element)}의 기운</div>
<div class="q">너는 무슨 여우야? 🦊</div></div>
<div class="pill">👉 호아 도사의 손금 풀이 · hoadosa.com</div></body>`;

const page = (t) => {
  const c = TYPE_COPY[t.id], emo = TYPE_EMOJI[t.id] || '🦊';
  const title = `나는 ${emo} ${t.name}! 너는 무슨 여우야? · 호아 도사`;
  const desc = `${c.intro} 손바닥 사진 한 장으로 나와 궁합 몇 %인지 확인해 보세요!`;
  const url = `${ORIGIN}/s/${t.id}/`, img = `${ORIGIN}/img/share/${t.id}.jpg`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d1236">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${ORIGIN}/foxes/${t.id}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="호아 도사의 손금 풀이">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${img}">
<link rel="icon" href="/img/icon-192.png">
<noscript><meta http-equiv="refresh" content="0;url=/?t=${t.id}&amp;ref=share"></noscript>
<script>
// 카카오톡 미리보기는 위 OG 만 읽는다. 사람이 열면 곧바로 앱(/?t=…&s=…&ref=share)으로 넘어간다.
(function () {
  var p = new URLSearchParams(location.search);
  var q = new URLSearchParams();
  q.set('t', '${t.id}');
  if (/^[1-5]{4}$/.test(p.get('s') || '')) q.set('s', p.get('s'));
  q.set('ref', /^[a-z0-9_-]{1,20}$/i.test(p.get('ref') || '') ? p.get('ref') : 'share');
  location.replace('/?' + q.toString());
})();
</script>
<style>html,body{margin:0;background:#0d1236;color:#f4f1ff;font-family:-apple-system,"Noto Sans KR",sans-serif;text-align:center}a{color:#f3cc6b}</style>
</head>
<body>
<p style="padding:48px 20px;line-height:1.8">🦊 호아 도사가 손금을 보러 모시는 중이오…<br><a href="/?t=${t.id}&amp;ref=share">바로 가기 ›</a></p>
</body>
</html>
`;
};

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const pg = await ctx.newPage();
for (const t of RULES.types) {
  await pg.setContent(slide(t)); await pg.evaluate(() => document.fonts.ready);
  await pg.screenshot({ path: path.join(pub, `img/share/${t.id}.jpg`), type: 'jpeg', quality: 86 });
  const dir = path.join(pub, 's', t.id); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(t));
  console.log('ok', t.id);
}
await browser.close();
