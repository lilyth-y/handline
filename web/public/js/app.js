// 호아 도사 손금 웹앱 — UI glue. All analysis runs on-device (onnxruntime-web, wasm).
import * as ort from '../vendor/ort.wasm.min.mjs';
import { letterboxTensor, extractFeatures, CLASSES } from './palm.js';
import { interpret } from './interpret.js';
import { RULES } from './rules.js';
import { TYPE_COPY, readingFor, LUCK_EMOJI, ANALYZE_LINES } from './copy.js';

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
}

// ------------------------------------------------------------------ result rendering
const COLORS = { heart_line: [255, 126, 182], head_line: [255, 211, 110], life_line: [110, 231, 200], fate_line: [182, 156, 255] };
const NAMES_KO = { heart: '감정선', head: '두뇌선', life: '생명선', fate: '운명선' };
function drawOverlay(canvas, feat) {
  const W = canvas.width, H = canvas.height, c = $('#r-overlay');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(canvas, 0, 0);
  g.fillStyle = 'rgba(13,18,54,0.35)'; g.fillRect(0, 0, W, H);
  const ov = g.createImageData(W, H), d = ov.data;
  for (const cls of CLASSES) {
    const [r, gg, b] = COLORS[cls];
    for (const { mask } of feat._preds[cls]) for (let i = 0; i < mask.length; i++) if (mask[i]) { d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 235; }
  }
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; tmp.getContext('2d').putImageData(ov, 0, 0);
  g.save(); g.shadowColor = 'rgba(255,255,255,0.8)'; g.shadowBlur = Math.max(4, W / 150); g.drawImage(tmp, 0, 0); g.restore();
}
function starHTML(n) { return '★'.repeat(n) + `<span class="off">${'★'.repeat(5 - n)}</span>`; }
function renderResult(canvas, feat, res) {
  const t = res.type, copy = TYPE_COPY[t.id];
  $('#r-type').textContent = t.name;
  $('#r-keyword').textContent = `#${t.keyword.replace('·', ' #')}  ·  ${t.element}의 기운`;
  $('#r-intro').innerHTML = `호호, 그대는 <b class="gold">'${t.name}'</b>로다! ${copy.intro}<br>${copy.charm}`;
  drawOverlay(canvas, feat);
  const missing = Object.entries(feat.lines).filter(([, v]) => !v.present).map(([k]) => NAMES_KO[k]);
  $('#r-missing').textContent = missing.length ? `${missing.join('·')}은 사진에서 또렷하게 보이지 않았어요. 없는 선도 하나의 개성이랍니다!` : '';
  $('#r-lucks').innerHTML = Object.entries(res.lucks).map(([k, v]) => `
    <div class="card luck" data-luck="${k}">
      <div class="luck-top"><span class="luck-label">${LUCK_EMOJI[k]} ${v.label}</span><span class="stars" aria-label="별 ${v.stars}개">${starHTML(v.stars)}</span></div>
      <p>${readingFor(k, v)}</p>
    </div>`).join('');
  $('#r-disclaimer').textContent = res.disclaimer || RULES.disclaimer;
}

// ------------------------------------------------------------------ share
function shareURL() {
  const r = state.result?.res, u = new URL(location.href);
  u.search = ''; u.hash = '';
  if (r) { u.searchParams.set('t', r.type.id); u.searchParams.set('s', Object.values(r.lucks).map((l) => l.stars).join('')); }
  return u.href;
}
function shareText() {
  const r = state.result.res;
  const lines = Object.entries(r.lucks).map(([k, v]) => `${LUCK_EMOJI[k]} ${v.label} ${'★'.repeat(v.stars)}${'☆'.repeat(5 - v.stars)}`);
  return `🦊 호아 도사가 본 내 손금: '${r.type.name}'\n${lines.join('\n')}\n너의 여우 유형도 확인해 봐!`;
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
  toast(ok ? '결과와 링크를 복사했어요! 카톡에 붙여 넣어 보세요 💌' : url);
});

// ------------------------------------------------------------------ shared-link landing
(function sharedBanner() {
  const p = new URLSearchParams(location.search), id = p.get('t');
  const t = RULES.types.find((x) => x.id === id);
  if (!t) return;
  const b = $('#shared-banner');
  b.innerHTML = `친구는 <b>'${t.name}'</b>가 나왔어요!<br>나는 어떤 여우일까? 🦊`;
  b.classList.remove('hidden');
})();

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
