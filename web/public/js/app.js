// 호아 도사 손금 웹앱 — UI glue. All analysis runs on-device (onnxruntime-web, wasm).
import * as ort from '../vendor/ort.wasm.min.mjs';
import { letterboxTensor, extractFeatures, CLASSES } from './palm.js';
import { interpret } from './interpret.js';
import { RULES } from './rules.js';
import { CALIB } from './calib.js';
import { TYPE_COPY, readingFor, shortFor, LUCK_EMOJI, ANALYZE_LINES, TYPE_EMOJI } from './copy.js';
import { drawShareCard, drawCompareCard, cardBlob, CARD_MIME, CARD_EXT } from './sharecard.js';
import { isInApp, isIOS, isKakao, canUseAnchorDownload, shouldSkipFileShare, externalBrowserHref, triggerDownload, canShareFiles } from './savecard.js';
import './ref.js';   // ?ref= 를 세션에 기억 (익명 수집 행에 같이 기록)
import { luckEvidence, measuredRows, LINE_KO } from './evidence.js';
import { collectEnabled, setCollectEnabled, sendFeatures } from './collect.js';
import { mountMonetize } from './monetize.js';
import { shareLink, ogImageFor, track, kakaoEnabled, kakaoSend, warmKakao } from './share.js';
import { LINES, LINE_NAME, LINE_COLOR, buildProfile, encodeLines, decodeLines, describeLine, compareProfiles, mateOf } from './compare.js';

const MAX_SIDE = 1024;
const $ = (s) => document.querySelector(s);
const state = { session: null, loading: null, result: null };
window.__palm = state; // for e2e tests

// ------------------------------------------------------------------ navigation
function go(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
  syncSticky();
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
  state.result = { feat, res, ms: Math.round(performance.now() - t0), size: [work.data.width, work.data.height], profile: buildProfile(feat, res) };
  const nLines = feat.relations.n_lines;
  if (nLines < 2) { $('#err-text').innerHTML = '어허, 손금이 잘 보이지 않는구려.<br>손바닥을 활짝 펴고 밝은 곳에서 다시 찍어 주시게.'; go('s-error'); return; }
  step(100, 4); await tick();
  renderResult(work.canvas, feat, res);
  if (FRIEND) { renderCompare(); go('s-compare'); } else go('s-result');
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
// 결과 카드(요약): 별점 + 한 줄 + '근거 보기'.  근거 패널(luckPanel)은 눌렀을 때만 펼쳐진다.
function luckTile(k, v) {
  return `
    <button type="button" class="luck-tile" data-open="${k}" aria-expanded="false">
      <span class="lt-label">${LUCK_EMOJI[k]} ${v.label}</span>
      <span class="lt-stars" aria-hidden="true">${starHTML(v.stars)}</span>
      <span class="lt-line">${esc(shortFor(v))}</span>
      <span class="lt-more">근거 보기 <i>▾</i></span>
    </button>`;
}
function luckPanel(k, v, feat) {
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
    <div class="card luck" data-luck="${k}" data-lines="${ev.lines.join(',')}" hidden>
      <div class="luck-top"><span class="luck-label">${LUCK_EMOJI[k]} ${v.label}</span><span class="stars" aria-label="별 ${v.stars}개">${starHTML(v.stars)}</span></div>
      <p class="reading">${readingFor(k, v)}</p>
      <div class="ev-head">호아 도사가 본 근거 <span class="hint">눌러서 손금 보기 👆</span></div>
      ${chips}
      <p class="calc"><span class="calc-label">점수 계산</span> ${esc(ev.calc)}${ev.rounded ? ' <span class="muted">(반올림)</span>' : ''}${zeroNote}</p>
    </div>`;
}
// 근거 보기: 한 번에 하나만 펼치고, 같은 카드를 다시 누르면 접는다
function toggleLuck(k) {
  const opening = state.openLuck !== k;
  state.openLuck = opening ? k : null;
  document.querySelectorAll('.luck-tile').forEach((t) => {
    const on = opening && t.dataset.open === k;
    t.classList.toggle('on', on); t.setAttribute('aria-expanded', String(on));
  });
  let lines = null;
  document.querySelectorAll('#r-panels .luck').forEach((p) => {
    const on = opening && p.dataset.luck === k;
    p.hidden = !on; if (on) lines = p.dataset.lines.split(',');
  });
  $('#r-evidence').classList.toggle('hidden', !opening);
  document.querySelectorAll('.luck.on, .chip.on').forEach((e) => e.classList.remove('on'));
  ov.focus = opening ? lines : null; ov.focusEl = null;
  paintOverlay(ov.focus);
  if (opening) $('#r-evidence').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  track('evidence_toggle', { luck: k, open: opening });
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
  $('#r-emoji').textContent = TYPE_EMOJI[t.id] || '🦊';
  $('#r-type').textContent = t.name;
  $('#r-keyword').textContent = `#${t.keyword.replace('·', ' #')}`;
  $('#r-intro').textContent = copy.intro;
  $('#r-more').innerHTML = `호호, 그대는 <b class="gold">'${esc(t.name)}'</b>로다! ${esc(copy.intro)}<br>${esc(copy.charm)}<br><span class="muted">${esc(t.element)}의 기운</span>`;
  buildOverlay(canvas, feat); ov.focus = null; ov.focusEl = null; paintOverlay(null);
  const missing = Object.entries(feat.lines).filter(([, v]) => !v.present).map(([k]) => NAMES_KO[k]);
  $('#r-missing').textContent = missing.length ? `${missing.join('·')}은 사진에서 또렷하지 않았어요. 없는 선도 하나의 개성이랍니다!` : '';
  $('#r-lucks').innerHTML = Object.entries(res.lucks).map(([k, v]) => luckTile(k, v)).join('');
  $('#r-panels').innerHTML = Object.entries(res.lucks).map(([k, v]) => luckPanel(k, v, feat)).join('');
  state.openLuck = null; $('#r-evidence').classList.add('hidden');
  $('#r-measured').innerHTML = measuredHTML(feat);
  $('#r-measured-box').open = false;
  $('#r-disclaimer').textContent = res.disclaimer || RULES.disclaimer;
  shareHook(res);
  friendLine();
  mountMonetize(res);
}
function shareHook(res) {
  const mate = mateOf(res.type.id);
  $('#r-hook').innerHTML = '💞 친구랑 궁합 몇 %?' + (mate ? ` <span class="muted">천생연분은 ${TYPE_EMOJI[mate.id] || ''} ${esc(mate.name)}</span>` : '');
}
function onPick(e) {
  if (e.target.closest('#btn-focus-clear')) { setFocus(null); return; }
  const tile = e.target.closest('.luck-tile');
  if (tile) { toggleLuck(tile.dataset.open); return; }
  const el = e.target.closest('.chip');
  if (!el || !el.dataset.lines) return;
  setFocus(el.dataset.lines.split(','), el);
}
$('#s-result').addEventListener('click', onPick);
$('#s-result').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const el = e.target.closest('.chip'); if (el) { e.preventDefault(); onPick(e); } } });

// ------------------------------------------------------------------ share (친구와 손금 비교해보기)
const UA = navigator.userAgent || '';
const IN_APP = isInApp(UA);
const starsOf = (r) => Object.values(r.lucks).map((l) => l.stars);
// 공유 링크/문구/제목. kind: 'self' = 내 결과로 비교 신청, 'compare' = 우리 궁합 결과 공유(둘의 유형·궁합 % 포함)
function sharePayload(kind = 'self') {
  const r = state.result?.res, pr = state.result?.profile;
  if (!r) return { url: new URL('/?ref=share', location.origin).href, text: '', title: '호아 도사의 손금 풀이' };
  const stars = starsOf(r).join(''), lines = pr ? encodeLines(pr) : '';
  if (kind === 'compare' && state.compare) {
    const { cmp, fr } = state.compare;
    return {
      url: shareLink(location.origin, r.type.id, stars, lines, { f: fr.t.id, c: cmp.score }),
      title: `🤝 우리 궁합 ${cmp.score}%!`,
      desc: `${TYPE_EMOJI[r.type.id] || ''} ${r.type.name} × ${TYPE_EMOJI[fr.t.id] || ''} ${fr.t.name} · ${cmp.msg} 너도 친구랑 손금 비교해 볼래?`,
      text: `🤝 친구랑 손금 비교해 봤더니 궁합 ${cmp.score}%!\n${TYPE_EMOJI[r.type.id] || ''} ${r.type.name} × ${TYPE_EMOJI[fr.t.id] || ''} ${fr.t.name} — ${cmp.msg}\n너도 친구랑 비교해 볼래? 👇`,
    };
  }
  const rows = Object.entries(r.lucks).map(([k, v]) => `${LUCK_EMOJI[k]} ${v.label} ${'★'.repeat(v.stars)}${'☆'.repeat(5 - v.stars)}`);
  return {
    url: shareLink(location.origin, r.type.id, stars, lines),
    title: `🦊 나는 '${r.type.name}'! 내 손금이랑 비교해 볼래?`,
    desc: `${TYPE_EMOJI[r.type.id] || ''} ${TYPE_COPY[r.type.id].intro} 손바닥 사진 한 장으로 우리 궁합 몇 %인지 확인해 봐!`,
    text: `🦊 나는 '${r.type.name}'! 내 손금이랑 비교해 볼래?\n${rows.join('\n')}\n우리 궁합 몇 %일까? 손바닥 사진 한 장이면 돼 👇`,
  };
}
const shareURL = () => sharePayload('self').url;
const shareText = () => sharePayload('self').text;
// 결과 카드 다시 그리기(?save=1)는 앱 본문(/)에서 열려야 하므로 따로 만든다
function appURL() {
  const r = state.result?.res, u = new URL('/', location.origin);
  if (r) { u.searchParams.set('t', r.type.id); u.searchParams.set('s', starsOf(r).join('')); }
  u.searchParams.set('ref', 'share');
  return u.href;
}
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch { /* fallthrough */ }
  const ta = document.createElement('textarea'); ta.value = s; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, s.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove(); return ok;
}
// 공유 방식: 카카오톡(키 있을 때) → 기기 공유 시트(navigator.share) → 링크 복사. 카톡 인앱 브라우저에서도 복사는 항상 동작.
async function shareNative(src, kind = 'self') {
  if (!state.result?.res) return;
  const { url, text, title } = sharePayload(kind);
  if (navigator.share) {
    try { await navigator.share({ title: '호아 도사의 손금 풀이', text, url }); track('share_done', { src, method: 'native' }); return; }
    catch (e) { if (e && e.name === 'AbortError') { track('share_cancel', { src }); return; } }
  }
  const ok = await copyText(`${text}\n${url}`);
  track('share_done', { src, method: 'copy' });
  toast(ok ? '문구와 링크를 복사했어요! 카톡에 붙여 넣어 보세요 🤝' : url);
}
async function shareCopyLink(src, kind = 'self') {
  if (!state.result?.res) return;
  const { url } = sharePayload(kind);
  const ok = await copyText(url);
  track('share_done', { src, method: 'copylink' });
  toast(ok ? '링크를 복사했어요! 카톡 대화창에 붙여 넣어 보세요 🔗' : url);
}
async function shareKakao(src, kind = 'self') {
  const r = state.result?.res; if (!r) return;
  const { url, title, desc } = sharePayload(kind);
  const ok = await kakaoSend({ title, description: desc, imageUrl: ogImageFor(location.origin, r.type.id), url, buttonTitle: '나도 손금 비교해 보기 ✨' });
  if (ok) { track('share_done', { src, method: 'kakao' }); return; }
  await shareNative(src, kind);   // SDK 로드/공유 실패 시 대체
}
document.querySelectorAll('[data-share-src]').forEach((b) => b.addEventListener('click', () => {
  const src = b.dataset.shareSrc, kind = b.dataset.shareKind || 'self';
  const method = b.id === 'sh-kakao' ? 'kakao' : b.id === 'sh-copy' ? 'copylink' : 'native';
  track('share_click', { src, method });
  if (method === 'kakao') shareKakao(src, kind); else if (method === 'copylink') shareCopyLink(src, kind); else shareNative(src, kind);
}));
// 카카오 키가 있으면 카톡 버튼을 메인으로, 없으면 숨김. 공유 시트가 없는 브라우저에서는 '공유하기' 대신 복사로 처리됨.
(function setupShareButtons() {
  const k = kakaoEnabled();
  $('#sh-kakao').classList.toggle('hidden', !k);
  if (k) {
    $('#sh-native').classList.replace('primary', 'ghost');
    $('#sh-native').textContent = '📤 다른 앱으로 공유';
    if (!navigator.share) $('#sh-native').classList.add('hidden');   // 공유 시트가 없으면 '링크 복사'만 남김
    warmKakao();
  }
})();
// 화면을 내려도 공유 버튼이 보이도록: 위/아래 공유 버튼이 둘 다 화면 밖일 때만 하단 고정 버튼을 띄움
const seenCTA = { hero: true, bottom: false };
function syncSticky() {
  const on = document.querySelector('.screen.active')?.id === 's-result' && !seenCTA.hero && !seenCTA.bottom;
  $('#share-sticky').classList.toggle('hidden', !on);
  document.body.classList.toggle('has-sticky', on);
}
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((es) => {
    for (const e of es) seenCTA[e.target.id === 'r-sharehero' ? 'hero' : 'bottom'] = e.isIntersecting;
    syncSticky();
  });
  io.observe($('#r-sharehero')); io.observe($('#btn-share'));
}

// 결과 카드 이미지: (일반 브라우저) 파일 공유 시트 → <a download> → (인앱/iOS) 길게 눌러 저장 + 외부 브라우저
function savePageURL() {
  const u = new URL(appURL());
  u.searchParams.set('save', '1');
  return u.href;
}
async function buildCard() {
  const res = state.result.res;
  if (state.card && state.card.res === res) return state.card;
  const cv = await drawShareCard(res);
  const blob = await cardBlob(cv);
  if (state.card?.url) URL.revokeObjectURL(state.card.url);
  state.card = { res, blob, url: URL.createObjectURL(blob), name: `hoa-palm-${res.type.id}.${CARD_EXT}`, type: CARD_MIME };
  return state.card;
}
function showCardModal(card) {
  const img = $('#card-img');
  img.src = card.url;
  const ext = IN_APP ? externalBrowserHref(savePageURL(), UA) : '';
  window.__card = { ...(window.__card || {}), bytes: card.blob.size, name: card.name, type: card.type, via: window.__card?.via || 'modal', external: ext || undefined };
  $('#btn-card-external').classList.toggle('hidden', !IN_APP);
  $('#card-modal').classList.remove('hidden');
}
function hideCardModal() { $('#card-modal').classList.add('hidden'); }
$('#card-close').addEventListener('click', hideCardModal);
$('#card-modal').addEventListener('click', (e) => { if (e.target.id === 'card-modal') hideCardModal(); });
$('#btn-card-external').addEventListener('click', () => {
  const href = externalBrowserHref(savePageURL(), UA);
  window.__card = { ...(window.__card || {}), external: href, via: 'external' };
  if (window.__preventExternal) return;   // e2e
  location.href = href;
});
$('#btn-card-download').addEventListener('click', async () => {
  if (!state.card) return;
  const via = await offerCard(state.card, { fromModal: true });
  if (via === 'modal') toast('위 이미지를 길게 눌러 저장해 주세요');
});

async function offerCard(card, { fromModal = false } = {}) {
  window.__card = { bytes: card.blob.size, name: card.name, type: card.type };   // e2e
  let file = null;
  try { file = new File([card.blob], card.name, { type: card.type || CARD_MIME }); } catch { file = null; }
  const skipShare = shouldSkipFileShare(UA);
  if (!skipShare && file && await canShareFiles(file)) {
    try {
      const pl = sharePayload(card.kind || 'self');
      await navigator.share({ files: [file], title: '호아 도사의 손금 풀이', text: `${pl.text}\n${pl.url}` });
      window.__card.via = 'share';
      return 'share';
    } catch (e) { if (e && e.name === 'AbortError') { window.__card.via = 'abort'; return 'abort'; } }
  }
  if (canUseAnchorDownload(UA)) {
    triggerDownload(card.blob, card.name);
    window.__card.via = 'download';
    toast('결과 카드를 저장했어요! 📥');
    return 'download';
  }
  window.__card.via = 'modal';
  if (!fromModal) showCardModal(card);
  return 'modal';
}

$('#btn-card').addEventListener('click', async () => {
  const btn = $('#btn-card'); btn.disabled = true;
  try { await offerCard(await buildCard()); }
  catch (e) { console.error(e); toast('이미지를 만들지 못했어요. 화면을 캡처해 주세요 🙏'); }
  finally { btn.disabled = false; }
});

// ?save=1&t=&s= : 카카오 외부 브라우저에서 결과 카드를 다시 그림 (손 사진 불필요)
function resFromQuery() {
  const p = new URLSearchParams(location.search);
  if (p.get('save') !== '1') return null;
  const t = RULES.types.find((x) => x.id === p.get('t'));
  const s = /^[1-5]{4}$/.test(p.get('s') || '') ? p.get('s').split('').map(Number) : null;
  if (!t || !s) return null;
  const keys = ['wealth', 'love', 'health', 'career'];
  const lucks = Object.fromEntries(keys.map((k, i) => [k, { label: RULES.lucks[k].label, stars: s[i] }]));
  return { type: t, lucks };
}
const PENDING_CARD = resFromQuery();
if (PENDING_CARD) {
  state.result = { res: PENDING_CARD };
  (async () => {
    try {
      const card = await buildCard();
      window.__card = { bytes: card.blob.size, name: card.name, type: card.type, via: 'modal', autoload: true };
      showCardModal(card);
    } catch (e) { console.error(e); }
  })();
}

// ------------------------------------------------------------------ 공유 링크로 들어온 친구 (손금 비교 신청)
// 링크: ?t=유형&s=별점4자리&p=손금요약14자 [&f=상대유형&c=궁합%]  (모두 선택, 형식이 틀리면 무시)
const FRIEND = (() => {
  const p = new URLSearchParams(location.search);
  const t = RULES.types.find((x) => x.id === p.get('t'));
  if (!t) return null;
  const s = /^[1-5]{4}$/.test(p.get('s') || '') ? p.get('s').split('').map(Number) : null;
  const dec = decodeLines(p.get('p'));
  const ft = RULES.types.find((x) => x.id === p.get('f'));
  const c = /^[0-9]{2,3}$/.test(p.get('c') || '') ? Number(p.get('c')) : NaN;
  return { t, s, L: dec ? dec.L : null, j: dec ? dec.j : null, pair: ft && c >= 40 && c <= 100 ? { ft, c } : null };
})();
(function sharedBanner() {
  if (!FRIEND) return;
  const { t, s, pair } = FRIEND, b = $('#shared-banner');
  const keys = ['wealth', 'love', 'health', 'career'], labels = { wealth: '재물', love: '연애', health: '건강', career: '직업' };
  const starRow = s ? `<p class="sh-stars">${keys.map((k, i) => `<span>${LUCK_EMOJI[k]} ${labels[k]} <b>${'★'.repeat(s[i])}</b></span>`).join('')}</p>` : '';
  b.innerHTML = pair ? `
    <p class="sh-eyebrow">🤝 친구가 손금 비교 결과를 보냈어요!</p>
    <p class="sh-type">${TYPE_EMOJI[t.id] || ''} <b>${esc(t.name)}</b> × ${TYPE_EMOJI[pair.ft.id] || ''} <b>${esc(pair.ft.name)}</b></p>
    <p class="sh-q">궁합 <span class="gold">${pair.c}%</span> · 너는 몇 %일까? 🦊</p>
    <button type="button" id="btn-challenge" class="btn primary">나도 손금 비교해 보기 ✨</button>` : `
    <p class="sh-eyebrow">🤝 친구가 손금 비교를 신청했어요!</p>
    <p class="sh-type">친구는 <b>${TYPE_EMOJI[t.id] || ''} ${esc(t.name)}</b>.</p>
    <p class="sh-q">너는 무슨 여우야? 🦊</p>
    ${starRow}
    <button type="button" id="btn-challenge" class="btn primary">내 손금 보고 비교하기 ✨</button>`;
  b.classList.remove('hidden');
  track('share_landing', { t: t.id, pair: !!pair, p: !!FRIEND.L });
  $('#btn-challenge').addEventListener('click', () => { track('share_challenge_click', { t: t.id }); $('#btn-start').click(); });
})();

// ------------------------------------------------------------------ 비교 화면 (나 vs 친구 + 궁합)
const KEYS4 = ['wealth', 'love', 'health', 'career'];
const starsTxt = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
function renderCompare() {
  const me = state.result.profile;
  const fr = { t: FRIEND.t.id, s: FRIEND.s, L: FRIEND.L, j: FRIEND.j };
  const cmp = compareProfiles(me, fr);
  state.compare = { cmp, fr: { t: FRIEND.t }, hasLines: !!(FRIEND.L && me.L) };
  const mt = state.result.res.type, ft = FRIEND.t;
  $('#c-me-emo').textContent = TYPE_EMOJI[mt.id] || '🦊'; $('#c-me-name').textContent = mt.name;
  $('#c-fr-emo').textContent = TYPE_EMOJI[ft.id] || '🦊'; $('#c-fr-name').textContent = ft.name;
  $('#c-pct').textContent = cmp.score; $('#c-msg').textContent = cmp.msg;
  $('#c-why').innerHTML = cmp.items.slice(0, 3).map((i) => `<li>${i.pts ? `<em>+${i.pts}</em>` : ''}<span>${esc(i.text)}</span></li>`).join('');
  $('#c-calc').textContent = cmp.calc;
  const chipFor = (k) => cmp.items.filter((i) => i.pts && i.lines[0] === k).map((i) => `<em class="cmp-chip">+${i.pts} ${esc(i.label)}</em>`).join('');
  $('#c-lines').innerHTML = state.compare.hasLines ? LINES.map((k) => {
    const a = describeLine(k, me.L[k]), b = describeLine(k, FRIEND.L[k]);
    const row = (who, d) => `<div class="cmp-bar"><em>${who}</em><span class="bar"><i style="width:${d.len * 10}%;background:${LINE_COLOR[k]}"></i></span><small>${esc(d.text)}</small></div>`;
    return `<div class="card cmp-row"><div class="cmp-rh"><b class="ln-${k}"></b><strong>${LINE_NAME[k]}</strong>${chipFor(k)}</div>${row('나', a)}${row('친구', b)}</div>`;
  }).join('') : '<p class="fine">친구 손금 요약이 없는 예전 링크라, 유형과 운세로만 비교했어요.</p>';
  $('#c-lucks').innerHTML = FRIEND.s ? `<div class="cmp-luck head"><span></span><b>나</b><b>친구</b></div>` + KEYS4.map((k, i) => {
    const mine = me.s[i], theirs = FRIEND.s[i];
    return `<div class="cmp-luck"><span>${LUCK_EMOJI[k]} ${esc(RULES.lucks[k].label)}</span><b class="s">${starsTxt(mine)}</b><b class="s">${starsTxt(theirs)}</b></div>`;
  }).join('') : '';
  $('#c-lucks').classList.toggle('hidden', !FRIEND.s);
  friendLine();
  $('#c-more').open = false;
  track('compare_view', { lines: state.compare.hasLines, score: Math.floor(cmp.score / 10) * 10 });
}
function friendLine() {
  const el = $('#r-friend');
  if (!FRIEND || !state.compare) { el.classList.add('hidden'); return; }
  el.innerHTML = `🤝 친구와 비교 · 궁합 <b class="pct">${state.compare.cmp.score}%</b> <span class="muted">다시 보기 ›</span>`;
  el.classList.remove('hidden');
}
$('#r-friend').addEventListener('click', () => { go('s-compare'); track('compare_reopen'); });
$('#c-to-result').addEventListener('click', () => go('s-result'));

// 궁합 카드(9:16, 인스타 스토리용) 저장/공유
$('#c-card').addEventListener('click', async () => {
  const btn = $('#c-card'); btn.disabled = true;
  try {
    const { cmp, fr } = state.compare, mt = state.result.res.type;
    if (!state.cmpCard || state.cmpCard.cmp !== cmp) {
      const cv = await drawCompareCard({ me: mt, fr: fr.t, cmp, meEmoji: TYPE_EMOJI[mt.id], frEmoji: TYPE_EMOJI[fr.t.id] });
      const blob = await cardBlob(cv);
      if (state.cmpCard?.url) URL.revokeObjectURL(state.cmpCard.url);
      state.cmpCard = { cmp, blob, url: URL.createObjectURL(blob), name: `hoa-compare-${mt.id}-${fr.t.id}.${CARD_EXT}`, type: CARD_MIME, kind: 'compare' };
    }
    track('compare_card_click');
    await offerCard(state.cmpCard);
  } catch (e) { console.error(e); toast('이미지를 만들지 못했어요. 화면을 캡처해 주세요 🙏'); }
  finally { btn.disabled = false; }
});

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
$('#privacy-back').addEventListener('click', () => {
  if (location.hash === '#privacy') history.replaceState(null, '', location.pathname + location.search);
  go(privacyFrom === 's-privacy' ? 's-intro' : privacyFrom);
});
function openPrivacyFromHash() {
  if (location.hash === '#privacy') {
    privacyFrom = document.querySelector('.screen.active')?.id || 's-intro';
    if (privacyFrom === 's-privacy') privacyFrom = 's-intro';
    go('s-privacy');
  }
}
window.addEventListener('hashchange', openPrivacyFromHash);
openPrivacyFromHash();
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
