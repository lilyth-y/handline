// 호아 도사 손금 웹앱 — UI glue. All analysis runs on-device (onnxruntime-web, wasm).
import * as ort from '../vendor/ort.wasm.min.mjs';
import { letterboxTensor, extractFeatures, CLASSES } from './palm.js';
import { interpret } from './interpret.js';
import { RULES } from './rules.js';
import { CALIB } from './calib.js';
import { TYPE_COPY, readingFor, LUCK_EMOJI, ANALYZE_LINES, TYPE_EMOJI } from './copy.js';
import { drawShareCard, cardBlob } from './sharecard.js';
import './ref.js';   // ?ref= 를 세션에 기억 (익명 수집 행에 같이 기록)
import { luckEvidence, measuredRows, LINE_KO } from './evidence.js';
import { collectEnabled, setCollectEnabled, sendFeatures } from './collect.js';

const MAX_SIDE = 1024;
const $ = (s) => document.querySelector(s);
const state = { session: null, loading: null, result: null };
window.__palm = state; // for e2e tests

// ------------------------------------------------------------------ navigation
function go(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200); }

// ------------------------------------------------------------------ model
ort.env.wasm.numThreads = 1;            // KakaoTalk in-app browsers are not cross-origin isolated
ort.env.wasm.wasmPaths = new URL('../vendor/', import.meta.url).href;
function loadModel() {
  if (!state.loading) {
    state.loading = ort.InferenceSession.create(new URL('../model/palm-v2.onnx', import.meta.url).href, { executionProviders: ['wasm'] })
      .then((s) => { state.session = s; $('#model-status').textContent = '수정 구슬 준비 완료! 🔮'; return s; })
      .catch((e) => { state.loading = null; $('#model-status').textContent = '모델을 불러오지 못했어요. 네트워크를 확인해 주세요.'; throw e; });
  }
  return state.loading;
}

// ------------------------------------------------------------------ image helpers
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => res({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('이미지를 읽을 수 없어요')); };
    img.src = url;
  });
}
function workingImage(img) {
  const w0 = img.naturalWidth, h0 = img.naturalHeight, s = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const W = Math.round(w0 * s), H = Math.round(h0 * s);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  return { canvas: c, data: g.getImageData(0, 0, W, H) };
}
const tick = () => new Promise((r) => setTimeout(r, 30));

// ------------------------------------------------------------------ analysis
async function analyse(file) {
  const { img, url } = await loadImage(file);
  $('#ana-photo').src = url;
  go('s-analyzing');
  const bar = $('#ana-bar'), text = $('#ana-text');
  const step = (p, i) => { bar.style.width = p + '%'; text.textContent = ANALYZE_LINES[i]; };
  step(10, 0); await tick();
  const t0 = performance.now();
  const session = await loadModel();
  step(30, 1); await tick();
  const work = workingImage(img);
  const { lb, data: tdata } = letterboxTensor(work.data);
  const tensor = new ort.Tensor('float32', tdata, [1, 3, 640, 640]);
  const out = await session.run({ [session.inputNames[0]]: tensor });
  const outs = session.outputNames.map((n) => out[n]);
  const det = outs.find((o) => o.dims.length === 3), proto = outs.find((o) => o.dims.length === 4);
  step(60, 2); await tick();
  const feat = extractFeatures(work.data, det.data, proto.data, lb);
  step(85, 3); await tick();
  const res = interpret(feat);
  state.result = { feat, res, ms: Math.round(performance.now() - t0), size: [work.data.width, work.data.height] };
  const nLines = feat.relations.n_lines;
  if (nLines < 2) { $('#err-text').innerHTML = '어허, 손금이 잘 보이지 않는구려.<br>손바닥을 활짝 펴고 밝은 곳에서 다시 찍어 주시게.'; go('s-error'); return; }
  step(100, 4); await tick();
  renderResult(work.canvas, feat, res);
  go('s-result');
  sendFeatures(file, feat, res);   // fire-and-forget: 숫자 특징만, 실패해도 화면에 영향 없음
}

// ------------------------------------------------------------------ result rendering
const COLORS = { heart_line: [255, 126, 182], head_line: [255, 211, 110], life_line: [110, 231, 200], fate_line: [182, 156, 255] };
const NAMES_KO = LINE_KO;
const CLS_KEY = { heart_line: 'heart', head_line: 'head', life_line: 'life', fate_line: 'fate' };
const ov = { base: null, layers: {}, focus: null };
// 손금별 색 레이어를 한 번만 만들어 두고, 하이라이트할 때는 투명도만 바꿔서 다시 합성
function buildOverlay(canvas, feat) {
  const W = canvas.width, H = canvas.height;
  ov.base = canvas; ov.layers = {};
  for (const cls of CLASSES) {
    const [r, gg, b] = COLORS[cls];
    const img = new ImageData(W, H), d = img.data;
    for (const { mask } of feat._preds[cls]) for (let i = 0; i < mask.length; i++) if (mask[i]) { d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 235; }
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; tmp.getContext('2d').putImageData(img, 0, 0);
    ov.layers[CLS_KEY[cls]] = tmp;
  }
}
function paintOverlay(focus) {
  const W = ov.base.width, H = ov.base.height, c = $('#r-overlay');
  if (c.width !== W) { c.width = W; c.height = H; }
  const g = c.getContext('2d');
  g.globalAlpha = 1; g.drawImage(ov.base, 0, 0);
  g.fillStyle = focus ? 'rgba(13,18,54,0.6)' : 'rgba(13,18,54,0.35)'; g.fillRect(0, 0, W, H);
  for (const [k, layer] of Object.entries(ov.layers)) {
    const on = !focus || focus.includes(k);
    g.save(); g.globalAlpha = on ? 1 : 0.12;
    if (on) { g.shadowColor = 'rgba(255,255,255,0.85)'; g.shadowBlur = Math.max(4, W / (focus ? 90 : 150)); }
    g.drawImage(layer, 0, 0);
    if (on && focus) g.drawImage(layer, 0, 0);   // 선택된 선은 두 번 그려 더 진하게
    g.restore();
  }
  document.querySelectorAll('.legend span').forEach((s) => s.classList.toggle('dim', !!focus && !focus.includes(s.dataset.line)));
  const cap = $('#r-focus');
  if (focus) { cap.innerHTML = `<span>🔍 <b>${focus.map((l) => NAMES_KO[l]).join("·")}</b>을 비추는 중</span> <button type="button" id="btn-focus-clear">전체 보기</button>`; cap.classList.remove('hidden'); }
  else cap.classList.add('hidden');
}
function setFocus(lines, srcEl) {
  const same = ov.focus && lines && ov.focus.join() === lines.join() && ov.focusEl === srcEl;
  ov.focus = same ? null : lines; ov.focusEl = same ? null : srcEl;
  document.querySelectorAll('.luck.on, .chip.on').forEach((e) => e.classList.remove('on'));
  if (ov.focus && srcEl) { srcEl.classList.add('on'); const card = srcEl.closest('.luck'); if (card) card.classList.add('on'); }
  paintOverlay(ov.focus);
  if (ov.focus) {   // 손금 그림이 화면 밖이면 살짝 끌어올려 보여 줌
    const r = $('.overlay-card').getBoundingClientRect();
    if (r.bottom < 80 || r.top > innerHeight - 80) $('.overlay-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function starHTML(n) { return '★'.repeat(n) + `<span class="off">${'★'.repeat(5 - n)}</span>`; }
function luckCard(k, v, feat) {
  const ev = luckEvidence(k, v, feat);
  const chips = ev.isDefault
    ? `<p class="ev-default">🦊 ${esc(ev.defaultText)}</p>`
    : `<ul class="ev-list">${ev.items.map((it) => `
        <li class="chip" data-lines="${it.lines.join(',')}" role="button" tabindex="0">
          <span class="ev-fact"><i class="dot">${it.lines.map((l) => `<b class="ln-${l}"></b>`).join('')}</i>${esc(it.fact)}${it.add > 0 ? `<em class="ev-add">+${it.add}</em>` : '<em class="ev-add zero">성향</em>'}</span>
          <span class="ev-mean">${esc(it.meaning)}</span>
        </li>`).join('')}</ul>`;
  const zeroNote = ev.noScoreItems ? ' · <span class="muted">‘성향’은 점수에 더하지 않아요</span>' : '';
  return `
    <div class="card luck" data-luck="${k}" data-lines="${ev.lines.join(',')}" role="button" tabindex="0">
      <div class="luck-top"><span class="luck-label">${LUCK_EMOJI[k]} ${v.label}</span><span class="stars" aria-label="별 ${v.stars}개">${starHTML(v.stars)}</span></div>
      <p class="reading">${readingFor(k, v)}</p>
      <div class="ev-head">호아 도사가 본 근거 <span class="hint">눌러서 손금 보기 👆</span></div>
      ${chips}
      <p class="calc"><span class="calc-label">점수 계산</span> ${esc(ev.calc)}${ev.rounded ? ' <span class="muted">(반올림)</span>' : ''}${zeroNote}</p>
    </div>`;
}
const REF_TEXT = CALIB.ref
  ? `${CALIB.ref.persons}명의 손 ${CALIB.ref.hands}개, 손바닥 사진 ${CALIB.ref.images.toLocaleString('ko-KR')}장`
  : `손금 사진 ${CALIB.n_images}장`;
function measuredHTML(feat) {
  return measuredRows(feat).map((r) => `
    <div class="m-line"><h4>${r.line === 'rel' ? '🔗 선 사이 관계' : `<b class="ln-${r.line}"></b>${NAMES_KO[r.line]}`}</h4>
      <dl>${r.cells.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl></div>`).join('')
    + `<p class="fine left">‘상위 %’는 ${REF_TEXT}과 비교한 순위예요. 길이는 손바닥 폭을 기준으로 쟀어요.</p>`;
}
function renderResult(canvas, feat, res) {
  const t = res.type, copy = TYPE_COPY[t.id];
  $('#r-type').textContent = t.name;
  $('#r-keyword').textContent = `#${t.keyword.replace('·', ' #')}  ·  ${t.element}의 기운`;
  $('#r-intro').innerHTML = `호호, 그대는 <b class="gold">'${t.name}'</b>로다! ${copy.intro}<br>${copy.charm}`;
  buildOverlay(canvas, feat); ov.focus = null; ov.focusEl = null; paintOverlay(null);
  const missing = Object.entries(feat.lines).filter(([, v]) => !v.present).map(([k]) => NAMES_KO[k]);
  $('#r-missing').textContent = missing.length ? `${missing.join('·')}은 사진에서 또렷하게 보이지 않았어요. 없는 선도 하나의 개성이랍니다!` : '';
  $('#r-lucks').innerHTML = Object.entries(res.lucks).map(([k, v]) => luckCard(k, v, feat)).join('');
  $('#r-measured').innerHTML = measuredHTML(feat);
  $('#r-measured-box').open = false;
  $('#r-disclaimer').textContent = res.disclaimer || RULES.disclaimer;
  friendLine(res);
}
function onPick(e) {
  if (e.target.closest('#btn-focus-clear')) { setFocus(null); return; }
  const el = e.target.closest('.chip') || e.target.closest('.luck');
  if (!el || !el.dataset.lines) return;
  setFocus(el.dataset.lines.split(','), el);
}
$('#s-result').addEventListener('click', onPick);
$('#s-result').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const el = e.target.closest('.chip, .luck'); if (el) { e.preventDefault(); onPick(e); } } });

// ------------------------------------------------------------------ share (friend challenge)
const UA = navigator.userAgent || '';
const IN_APP = /KAKAOTALK|NAVER\(inapp|; wv\)|Instagram|FBAN|FBAV|Line\//i.test(UA);   // 다운로드가 막히는 인앱 브라우저
function shareURL() {
  const r = state.result?.res, u = new URL(location.href);
  u.search = ''; u.hash = '';
  if (r) { u.searchParams.set('t', r.type.id); u.searchParams.set('s', Object.values(r.lucks).map((l) => l.stars).join('')); }
  u.searchParams.set('ref', 'share');
  return u.href;
}
function shareText() {
  const r = state.result.res;
  const lines = Object.entries(r.lucks).map(([k, v]) => `${LUCK_EMOJI[k]} ${v.label} ${'★'.repeat(v.stars)}${'☆'.repeat(5 - v.stars)}`);
  return `🦊 나는 '${r.type.name}'! 너는 무슨 여우야?\n${lines.join('\n')}\n손바닥 사진 한 장이면 호아 도사가 봐 줘 👇`;
}
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch { /* fallthrough */ }
  const ta = document.createElement('textarea'); ta.value = s; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, s.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove(); return ok;
}
$('#btn-share').addEventListener('click', async () => {
  const url = shareURL(), text = shareText();
  if (navigator.share) {
    try { await navigator.share({ title: '호아 도사의 손금 풀이', text, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const ok = await copyText(`${text}\n${url}`);
  toast(ok ? '도전장과 링크를 복사했어요! 카톡에 붙여 넣어 보세요 💌' : url);
});

// 결과 카드 이미지: 파일 공유 시트 → (일반 브라우저) 다운로드 → (인앱/실패) 길게 눌러 저장
async function buildCard() {
  const res = state.result.res;
  if (state.card && state.card.res === res) return state.card;
  const cv = await drawShareCard(res);
  const blob = await cardBlob(cv);
  state.card = { res, blob, dataURL: cv.toDataURL('image/png'), name: `hoa-palm-${res.type.id}.png` };
  return state.card;
}
function showCardModal(card) {
  $('#card-img').src = card.dataURL;
  $('#card-modal').classList.remove('hidden');
}
$('#card-close').addEventListener('click', () => $('#card-modal').classList.add('hidden'));
$('#card-modal').addEventListener('click', (e) => { if (e.target.id === 'card-modal') $('#card-modal').classList.add('hidden'); });
$('#btn-card').addEventListener('click', async () => {
  const btn = $('#btn-card'); btn.disabled = true;
  try {
    const card = await buildCard();
    window.__card = { bytes: card.blob.size, name: card.name };   // e2e
    let file = null; try { file = new File([card.blob], card.name, { type: 'image/png' }); } catch { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '호아 도사의 손금 풀이', text: `${shareText()}\n${shareURL()}` }); window.__card.via = 'share'; return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    if (!IN_APP && !/iPhone|iPad|iPod/i.test(UA)) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(card.blob); a.download = card.name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      window.__card.via = 'download';
      toast('결과 카드를 저장했어요! 📥');
      return;
    }
    window.__card.via = 'modal';
    showCardModal(card);
  } catch (e) {
    console.error(e); toast('이미지를 만들지 못했어요. 화면을 캡처해 주세요 🙏');
  } finally { btn.disabled = false; }
});

// ------------------------------------------------------------------ shared-link landing (friend challenge)
const FRIEND = (() => {
  const p = new URLSearchParams(location.search);
  const t = RULES.types.find((x) => x.id === p.get('t'));
  if (!t) return null;
  const s = /^[1-5]{4}$/.test(p.get('s') || '') ? p.get('s').split('').map(Number) : null;
  return { t, s };
})();
(function sharedBanner() {
  if (!FRIEND) return;
  const { t, s } = FRIEND, b = $('#shared-banner');
  const keys = ['wealth', 'love', 'health', 'career'], labels = { wealth: '재물', love: '연애', health: '건강', career: '직업' };
  const starRow = s ? `<p class="sh-stars">${keys.map((k, i) => `<span>${LUCK_EMOJI[k]} ${labels[k]} <b>${'★'.repeat(s[i])}</b></span>`).join('')}</p>` : '';
  b.innerHTML = `
    <p class="sh-eyebrow">💌 친구가 도전장을 보냈어요!</p>
    <p class="sh-type">“나는 <b>${TYPE_EMOJI[t.id] || ''} ${t.name}</b>!</p>
    <p class="sh-q">너는 무슨 여우야? 🦊”</p>
    ${starRow}
    <button type="button" id="btn-challenge" class="btn primary">나도 손금 보기 ✨</button>`;
  b.classList.remove('hidden');
  $('#btn-challenge').addEventListener('click', () => $('#btn-start').click());
})();
function friendLine(res) {
  const el = $('#r-friend');
  if (!FRIEND) { el.classList.add('hidden'); return; }
  const same = FRIEND.t.id === res.type.id;
  el.innerHTML = same
    ? `🦊 친구도 <b>'${FRIEND.t.name}'</b>! 같은 여우끼리 통했구려.`
    : `🦊 친구는 <b>'${FRIEND.t.name}'</b>, 그대는 <b>'${res.type.name}'</b>!`;
  el.classList.remove('hidden');
}

// ------------------------------------------------------------------ 12가지 여우 도감 (intro)
$('#dogam-grid').innerHTML = RULES.types.map((t) => `
  <div class="dg-item"><span class="dg-emo">${TYPE_EMOJI[t.id] || '🦊'}</span><b>${esc(t.name)}</b><small>#${esc(t.keyword.replace('·', ' #'))}</small></div>`).join('');

// ------------------------------------------------------------------ consent / privacy
function syncCollectUI() {
  const on = collectEnabled();
  document.querySelectorAll('.collect-toggle').forEach((t) => { t.checked = on; });
  document.querySelectorAll('.collect-state').forEach((e) => { e.textContent = on ? '켜짐' : '꺼짐'; });
}
document.querySelectorAll('.collect-toggle').forEach((t) => t.addEventListener('change', () => {
  setCollectEnabled(t.checked); syncCollectUI();
  toast(t.checked ? '측정 숫자 익명 제공을 켰어요' : '이제 아무것도 보내지 않아요');
}));
let privacyFrom = 's-intro';
document.querySelectorAll('[data-privacy]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  privacyFrom = document.querySelector('.screen.active')?.id || 's-intro';
  go('s-privacy');
}));
$('#privacy-back').addEventListener('click', () => go(privacyFrom === 's-privacy' ? 's-intro' : privacyFrom));
syncCollectUI();

// ------------------------------------------------------------------ wiring
$('#btn-start').addEventListener('click', () => { loadModel().catch(() => {}); go('s-capture'); });
$('#btn-retry').addEventListener('click', () => go('s-capture'));
for (const id of ['#in-camera', '#in-album']) {
  $(id).addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { await analyse(f); }
    catch (err) {
      console.error(err);
      state.error = String(err && err.message || err);
      $('#err-text').innerHTML = '어허, 수정 구슬이 잠시 흐려졌구려.<br>다시 한 번 시도해 주시게.';
      go('s-error');
    }
  });
}
