// 결과 공유 카드 (세로 1080x1920 = 인스타 스토리 9:16, JPEG 저장). 스토리 UI 에 가려지는 위·아래 250px 안전 영역은 비워 둔다. 사진·손금 그림은 넣지 않는다 (개인 사진 노출 방지): 유형·별점·한마디·URL·마스코트만.
import { typeCopy, typeName, typeKeyword, typeElement, luckLabel, LUCK_EMOJI, TYPE_EMOJI, APP_HOST } from './copy.js';
import { t as tr, LANG, L } from './i18n/runtime.js';

const W = 1080, H = 1920;
const C = { navy: '#0d1236', navy2: '#1b2263', lav: '#b9a7ff', lav2: '#e6defc', gold: '#f3cc6b', gold2: '#ffe6a6', text: '#f4f1ff', muted: '#b7b3d6' };
const FONT_BY_LANG = {
  ko: '"Apple SD Gothic Neo", "Noto Sans KR", "Gothic A1", "Malgun Gothic"',
  ja: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Noto Sans CJK JP", "Meiryo"',
  'zh-tw': '"PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", "Microsoft JhengHei"',
  'zh-cn': '"PingFang SC", "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei"',
  en: '"Helvetica Neue", "Segoe UI", Roboto, "Noto Sans"',
  es: '"Helvetica Neue", "Segoe UI", Roboto, "Noto Sans"',
  de: '"Helvetica Neue", "Segoe UI", Roboto, "Noto Sans"',
  fr: '"Helvetica Neue", "Segoe UI", Roboto, "Noto Sans"',
  id: '"Helvetica Neue", "Segoe UI", Roboto, "Noto Sans"',
  vi: '"Be Vietnam Pro", "Noto Sans", "Segoe UI", sans-serif',
  th: '"Noto Sans Thai", "Leelawadee UI", "Noto Sans", sans-serif',
};
const FONT = `-apple-system, BlinkMacSystemFont, ${FONT_BY_LANG[LANG] || FONT_BY_LANG.ko}, "Noto Sans KR", "Noto Sans CJK JP", "Noto Sans CJK TC", sans-serif`;
const HOST = APP_HOST + L('/').replace(/\/$/, '');   // hoadosa.com, hoadosa.com/en ...
const f = (w, px) => `${w} ${px}px ${FONT}`;

let mascot = null;
function loadMascot() {
  if (!mascot) mascot = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = new URL('../img/hoa.jpg', import.meta.url).href; });
  return mascot;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fitFont(g, text, weight, px, maxW) { while (px > 30) { g.font = f(weight, px); if (g.measureText(text).width <= maxW) break; px -= 2; } return px; }
// 한글은 글자 단위로 줄바꿈 (공백 우선)
function wrap(g, text, maxW, maxLines) {
  const out = []; let line = '';
  for (const word of text.split(/(\s+)/)) {
    const t = line + word;
    if (g.measureText(t).width <= maxW) { line = t; continue; }
    if (line.trim()) { out.push(line.trim()); line = word.trimStart(); }
    while (g.measureText(line).width > maxW) {   // 너무 긴 단어는 글자 단위로
      let k = line.length; while (k > 1 && g.measureText(line.slice(0, k)).width > maxW) k--;
      out.push(line.slice(0, k)); line = line.slice(k);
    }
  }
  if (line.trim()) out.push(line.trim());
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/.{1}$/, '…'); }
  return out;
}
function stars(g, x, y, n, size) {
  g.font = f(700, size); g.textAlign = 'right';
  const on = '★'.repeat(n), off = '★'.repeat(5 - n);
  g.fillStyle = '#ffffff30'; g.fillText(off, x, y);
  const wOff = off ? g.measureText(off).width : 0;
  g.fillStyle = C.gold; g.shadowColor = '#f3cc6b88'; g.shadowBlur = 18; g.fillText(on, x - wOff, y); g.shadowBlur = 0;
}

export async function drawShareCard(res) {
  const img = await loadMascot();
  try { await document.fonts?.ready; } catch { /* ignore */ }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const t = res.type, copy = typeCopy(t.id);

  // background: navy gradient + lavender glow + deterministic stars
  let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, C.navy2); gr.addColorStop(0.55, C.navy); gr.addColorStop(1, '#090c28');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(W / 2, 470, 60, W / 2, 470, 620); gr.addColorStop(0, '#6d5fd655'); gr.addColorStop(1, '#6d5fd600');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    const x = rnd() * W, y = rnd() * H, r = rnd() * 2.6 + 0.6, c = rnd();
    g.fillStyle = c < 0.18 ? '#f3cc6bcc' : c < 0.4 ? '#b9a7ffcc' : '#ffffffaa';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // frame
  g.strokeStyle = '#f3cc6b66'; g.lineWidth = 4; rr(g, 36, 36, W - 72, H - 72, 48); g.stroke();
  g.strokeStyle = '#b9a7ff33'; g.lineWidth = 2; rr(g, 54, 54, W - 108, H - 108, 38); g.stroke();

  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillStyle = C.lav2; g.font = f(700, 44); g.fillText(tr('card.title'), W / 2, 310, W - 160);

  // mascot
  const cx = W / 2, cy = 540, R = 170;
  g.save(); g.shadowColor = '#b9a7ffaa'; g.shadowBlur = 70; g.fillStyle = C.navy; g.beginPath(); g.arc(cx, cy, R + 10, 0, Math.PI * 2); g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  if (img) g.drawImage(img, cx - R, cy - R, R * 2, R * 2); else { g.fillStyle = C.navy2; g.fillRect(cx - R, cy - R, R * 2, R * 2); }
  g.restore();
  g.strokeStyle = C.gold; g.lineWidth = 8; g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.stroke();

  // type
  const name = `${TYPE_EMOJI[t.id] || ''} ${typeName(t.id)}`.trim();
  fitFont(g, name, 800, 88, W - 180);
  g.fillStyle = C.gold; g.shadowColor = '#f3cc6b77'; g.shadowBlur = 28; g.fillText(name, W / 2, 830); g.shadowBlur = 0;
  g.fillStyle = C.lav2; g.font = f(500, 42);
  g.fillText(`#${typeKeyword(t.id).replace('·', ' #')}  ·  ${tr('result.element', { el: typeElement(t.id) })}`, W / 2, 900, W - 160);

  // lucks
  const px = 110, pw = W - 220, py = 950, rowH = 90, ph = rowH * 4 + 40;
  g.fillStyle = '#ffffff0f'; rr(g, px, py, pw, ph, 36); g.fill();
  g.strokeStyle = '#b9a7ff44'; g.lineWidth = 2; rr(g, px, py, pw, ph, 36); g.stroke();
  Object.entries(res.lucks).forEach(([k, v], i) => {
    const y = py + 20 + rowH * i + rowH / 2 + 18;
    g.textAlign = 'left'; g.fillStyle = C.text; g.font = f(700, 50); g.fillText(`${LUCK_EMOJI[k] || ''} ${luckLabel(k)}`, px + 50, y, pw - 380);
    stars(g, px + pw - 50, y + 2, v.stars, 62);
    if (i < 3) { g.fillStyle = '#b9a7ff22'; g.fillRect(px + 40, py + 20 + rowH * (i + 1), pw - 80, 2); }
  });

  // one-liner bubble
  g.textAlign = 'center';
  let lines = [], bpx = 40;
  for (; bpx >= 28; bpx -= 4) { g.font = f(600, bpx); lines = wrap(g, `“${copy.intro}”`, W - 300, 99); if (lines.length <= 2) break; }   // 긴 문구(영어)는 글자를 조금 줄여 2줄에 맞춤
  if (lines.length > 2) lines = wrap(g, `“${copy.intro}”`, W - 300, 2);
  const by = 1380, bh = 60 + lines.length * 56;
  g.fillStyle = '#b9a7ff1c'; rr(g, 110, by, W - 220, bh, 40); g.fill();
  g.fillStyle = C.lav2; lines.forEach((l, i) => g.fillText(l, W / 2, by + 72 + i * 56 - 6));

  // footer CTA
  const fy = 1560;
  gr = g.createLinearGradient(160, 0, W - 160, 0); gr.addColorStop(0, C.gold); gr.addColorStop(1, C.gold2);
  g.fillStyle = gr; rr(g, 150, fy, W - 300, 100, 50); g.fill();
  g.fillStyle = '#2a1d00'; g.font = f(800, 42); g.fillText(tr('card.cta', { host: HOST }), W / 2, fy + 64, W - 340);
  return cv;
}

// 궁합 카드 (9:16, 인스타 스토리용): 두 여우 + 궁합 % + 근거 3줄 + URL. 사진·손금 그림은 넣지 않는다.
export async function drawCompareCard({ me, fr, cmp, meEmoji = '', frEmoji = '' }) {
  const img = await loadMascot();
  try { await document.fonts?.ready; } catch { /* ignore */ }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, C.navy2); gr.addColorStop(0.55, C.navy); gr.addColorStop(1, '#090c28');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(W / 2, 760, 60, W / 2, 760, 640); gr.addColorStop(0, '#6d5fd655'); gr.addColorStop(1, '#6d5fd600');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) { const x = rnd() * W, y = rnd() * H, r = rnd() * 2.6 + 0.6, c = rnd(); g.fillStyle = c < 0.18 ? '#f3cc6bcc' : c < 0.4 ? '#b9a7ffcc' : '#ffffffaa'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#f3cc6b66'; g.lineWidth = 4; rr(g, 36, 36, W - 72, H - 72, 48); g.stroke();
  g.strokeStyle = '#b9a7ff33'; g.lineWidth = 2; rr(g, 54, 54, W - 108, H - 108, 38); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillStyle = C.lav2; g.font = f(700, 46); g.fillText(tr('card.cmp_title'), W / 2, 320, W - 160);
  // two foxes
  const side = (cx, label, t, emo) => {
    g.save(); g.shadowColor = '#b9a7ffaa'; g.shadowBlur = 50; g.fillStyle = C.navy; g.beginPath(); g.arc(cx, 520, 130, 0, Math.PI * 2); g.fill(); g.restore();
    g.save(); g.beginPath(); g.arc(cx, 520, 124, 0, Math.PI * 2); g.clip();
    if (img) g.drawImage(img, cx - 124, 396, 248, 248); else { g.fillStyle = C.navy2; g.fillRect(cx - 124, 396, 248, 248); }
    g.restore();
    g.strokeStyle = C.gold; g.lineWidth = 6; g.beginPath(); g.arc(cx, 520, 130, 0, Math.PI * 2); g.stroke();
    g.font = f(400, 70); g.fillText(emo, cx + 96, 640);
    g.fillStyle = C.muted; g.font = f(600, 36); g.fillText(label, cx, 700);
    g.fillStyle = C.text; const nm = typeName(t.id); fitFont(g, nm, 800, 40, 400); g.fillText(nm, cx, 750);
  };
  side(W / 2 - 250, tr('cmp.me'), me, meEmoji); side(W / 2 + 250, tr('cmp.friend'), fr, frEmoji);
  g.fillStyle = C.gold; g.font = f(800, 70); g.fillText('×', W / 2, 545);
  // score
  g.fillStyle = C.gold; g.shadowColor = '#f3cc6b88'; g.shadowBlur = 40; g.font = f(900, 250); g.fillText(`${cmp.score}%`, W / 2, 1060); g.shadowBlur = 0;
  g.fillStyle = C.lav2; g.font = f(700, 52); g.fillText(tr('card.cmp_msg', { msg: cmp.msg }), W / 2, 1140, W - 200);
  g.fillStyle = C.muted; g.font = f(500, 34); g.fillText(tr('card.cmp_fun'), W / 2, 1195, W - 200);
  // evidence (top 3)
  const items = cmp.items.slice(0, 3), px = 110, pw = W - 220, py = 1240, rowH = 90, ph = items.length * rowH + 30;
  g.fillStyle = '#ffffff0f'; rr(g, px, py, pw, ph, 36); g.fill();
  g.strokeStyle = '#b9a7ff44'; g.lineWidth = 2; rr(g, px, py, pw, ph, 36); g.stroke();
  items.forEach((it, i) => {
    const y = py + 15 + rowH * i + 58;
    g.textAlign = 'left'; g.fillStyle = C.gold; g.font = f(800, 40); if (it.pts) g.fillText(`+${it.pts}`, px + 36, y);
    g.fillStyle = C.text; g.font = f(600, 36); g.fillText(it.label, px + (it.pts ? 128 : 36), y, pw - 180);
  });
  g.textAlign = 'center';
  const fy = 1560;
  gr = g.createLinearGradient(160, 0, W - 160, 0); gr.addColorStop(0, C.gold); gr.addColorStop(1, C.gold2);
  g.fillStyle = gr; rr(g, 150, fy, W - 300, 100, 50); g.fill();
  g.fillStyle = '#2a1d00'; g.font = f(800, 42); g.fillText(tr('card.cmp_cta', { host: HOST }), W / 2, fy + 64, W - 340);
  return cv;
}

// JPEG: 1080x1920 PNG was ~1.9MB and often failed to save in KakaoTalk / iOS.
export const CARD_MIME = 'image/jpeg';
export const CARD_QUALITY = 0.9;
export const CARD_EXT = 'jpg';
export const cardBlob = (cv, quality = CARD_QUALITY) => new Promise((res, rej) => {
  cv.toBlob((b) => (b ? res(b) : rej(new Error('card image failed'))), CARD_MIME, quality);
});
