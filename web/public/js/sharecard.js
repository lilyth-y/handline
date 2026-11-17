// 결과 공유 카드 (세로 1080x1920, JPEG 저장). 사진·손금 그림은 넣지 않는다 (개인 사진 노출 방지): 유형·별점·한마디·URL·마스코트만.
import { TYPE_COPY, APP_HOST } from './copy.js';
import { iconImage, LUCK_ICON, TYPE_ICON } from './icons.js';

const W = 1080, H = 1920;
const C = { navy: '#0d1236', navy2: '#1b2263', lav: '#b9a7ff', lav2: '#e6defc', gold: '#f3cc6b', gold2: '#ffe6a6', text: '#f4f1ff', muted: '#b7b3d6' };
const FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Gothic A1", "Malgun Gothic", sans-serif';
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
async function drawIco(g, name, x, y, size, color, fill = 'none') {
  const img = await iconImage(name, { color, fill, size: Math.max(128, size * 2) });
  if (img) g.drawImage(img, x, y, size, size);
}
async function labelWithIcon(g, icon, text, cx, y, iconSize, color, fontSpec, fill = 'none') {
  g.font = fontSpec; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const tw = g.measureText(text).width, gap = iconSize * 0.28, total = iconSize + gap + tw;
  const x = cx - total / 2;
  await drawIco(g, icon, x, y - iconSize * 0.78, iconSize, color, fill);
  g.fillStyle = color; g.fillText(text, x + iconSize + gap, y);
  g.textAlign = 'center';
}
async function stars(g, x, y, n, size) {
  const gap = size * 0.1, total = 5 * size + 4 * gap;
  let px = x - total, cy = y - size * 0.72;
  for (let i = 0; i < 5; i++) {
    const on = i < n;
    if (on) { g.save(); g.shadowColor = '#f3cc6b88'; g.shadowBlur = 18; }
    await drawIco(g, 'star', px, cy, size, on ? C.gold : '#b9a7ff99', on ? C.gold : 'none');
    if (on) g.restore();
    px += size + gap;
  }
}

export async function drawShareCard(res) {
  const img = await loadMascot();
  try { await document.fonts?.ready; } catch { /* ignore */ }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const t = res.type, copy = TYPE_COPY[t.id] || { intro: '', charm: '' };

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
  await labelWithIcon(g, 'fox', '호아 도사의 손금 풀이', W / 2, 160, 48, C.lav2, f(700, 44));

  // mascot
  const cx = W / 2, cy = 450, R = 220;
  g.save(); g.shadowColor = '#b9a7ffaa'; g.shadowBlur = 70; g.fillStyle = C.navy; g.beginPath(); g.arc(cx, cy, R + 10, 0, Math.PI * 2); g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  if (img) g.drawImage(img, cx - R, cy - R, R * 2, R * 2); else { g.fillStyle = C.navy2; g.fillRect(cx - R, cy - R, R * 2, R * 2); }
  g.restore();
  g.strokeStyle = C.gold; g.lineWidth = 8; g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.stroke();

  // type
  g.fillStyle = C.muted; g.font = f(500, 40); g.fillText('그대의 손은…', W / 2, 770);
  const name = t.name;
  const namePx = fitFont(g, name, 800, 96, W - 280);
  g.fillStyle = C.gold; g.shadowColor = '#f3cc6b77'; g.shadowBlur = 28;
  await labelWithIcon(g, TYPE_ICON[t.id] || 'fox', name, W / 2, 875, Math.round(namePx * 0.92), C.gold, f(800, namePx));
  g.shadowBlur = 0;
  g.fillStyle = C.lav2; g.font = f(500, 42);
  g.fillText(`#${t.keyword.replace('·', ' #')}  ·  ${t.element}의 기운`, W / 2, 950);

  // lucks
  const px = 110, pw = W - 220, py = 1000, rowH = 96, ph = rowH * 4 + 40;
  g.fillStyle = '#ffffff0f'; rr(g, px, py, pw, ph, 36); g.fill();
  g.strokeStyle = '#b9a7ff44'; g.lineWidth = 2; rr(g, px, py, pw, ph, 36); g.stroke();
  const luckEntries = Object.entries(res.lucks);
  for (let i = 0; i < luckEntries.length; i++) {
    const [k, v] = luckEntries[i];
    const y = py + 20 + rowH * i + rowH / 2 + 18;
    await drawIco(g, LUCK_ICON[k] || 'sparkle', px + 50, y - 40, 52, C.gold);
    g.textAlign = 'left'; g.fillStyle = C.text; g.font = f(700, 50); g.fillText(v.label, px + 114, y);
    await stars(g, px + pw - 50, y + 2, v.stars, 52);
    if (i < 3) { g.fillStyle = '#b9a7ff22'; g.fillRect(px + 40, py + 20 + rowH * (i + 1), pw - 80, 2); }
  }

  // one-liner bubble
  g.textAlign = 'center'; g.font = f(600, 40);
  const lines = wrap(g, `“${copy.intro} ${copy.charm}”`, W - 300, 3);
  const by = 1448, bh = 60 + lines.length * 56;
  g.fillStyle = '#b9a7ff1c'; rr(g, 110, by, W - 220, bh, 40); g.fill();
  g.fillStyle = C.lav2; lines.forEach((l, i) => g.fillText(l, W / 2, by + 72 + i * 56 - 6));
  await labelWithIcon(g, 'fox', '— 호아 도사', W / 2, by + bh + 46, 36, C.gold, f(700, 34));

  // footer CTA
  const fy = 1750;
  gr = g.createLinearGradient(160, 0, W - 160, 0); gr.addColorStop(0, C.gold); gr.addColorStop(1, C.gold2);
  g.fillStyle = gr; rr(g, 150, fy, W - 300, 100, 50); g.fill();
  const cta = `너는 무슨 여우야?  ${APP_HOST}`;
  g.font = f(800, 42);
  const ctaW = Math.min(g.measureText(cta).width, W - 400);
  const arrow = 40, gap = 10;
  // icon + text centered in the gold bar
  const group = arrow + gap + ctaW;
  const gx = (W - group) / 2;
  await drawIco(g, 'arrow', gx, fy + 30, arrow, '#2a1d00');
  g.fillStyle = '#2a1d00'; g.textAlign = 'left'; g.font = f(800, 42);
  g.fillText(cta, gx + arrow + gap, fy + 64, W - 400);
  g.textAlign = 'center';
  return cv;
}

// JPEG: 1080x1920 PNG was ~1.9MB and often failed to save in KakaoTalk / iOS.
export const CARD_MIME = 'image/jpeg';
export const CARD_QUALITY = 0.9;
export const CARD_EXT = 'jpg';
export const cardBlob = (cv, quality = CARD_QUALITY) => new Promise((res, rej) => {
  cv.toBlob((b) => (b ? res(b) : rej(new Error('카드 이미지를 만들지 못했어요'))), CARD_MIME, quality);
});
