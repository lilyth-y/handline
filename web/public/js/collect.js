// 익명 손금 측정값 수집 (사진 X). 분석이 끝난 뒤 숫자 특징만 Supabase(palm_features)에 fire-and-forget 으로 보낸다.
// - 사진·파일 이름·IP·기기 ID·정확한 시각은 보내지 않는다 (DB 는 날짜만 기록, IP 는 저장하는 컬럼이 없음).
// - 끄기: localStorage 'hoa_collect' = 'off' (설정 기억). 같은 사진은 한 세션에 한 번만 보낸다 (sessionStorage 해시).
// - 공개(publishable) 키는 INSERT 만 가능 (RLS + 컬럼 권한, 조회·수정·삭제 불가). 서비스 키는 절대 여기에 두지 않는다.
import { CALIB } from './calib.js';

export const COLLECT = {
  url: 'https://fxyffslmgnxznptbobee.supabase.co/rest/v1/palm_features',
  key: 'sb_publishable_v-uTw_Qaswin80uqKtHTzw__cKjHRZC',
  app_version: '2026.11.16',
  model_version: 'palm-v2-onnx',
};
const PREF = 'hoa_collect', SEEN = 'hoa_sent_hashes';

export function collectEnabled() {
  try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; }
}
export function setCollectEnabled(on) {
  try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* private mode: 이번 화면에서만 */ }
  collectEnabled._mem = on;
}
function enabled() { return collectEnabled._mem === false ? false : collectEnabled(); }

function testMode() {
  try {
    if (new URLSearchParams(location.search).get('collect_test') === '1') sessionStorage.setItem('hoa_collect_test', '1');
    return sessionStorage.getItem('hoa_collect_test') === '1';
  } catch { return false; }
}
function clientHint() {
  const ua = navigator.userAgent || '';
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return 'mobile';
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return 'desktop';
  return 'other';
}
export const calibVersion = () => `${String(CALIB.source).includes('userfeat') ? 'user' : 'refset'}-${CALIB.n_images}`;

const r4 = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null) : v);
// 숫자·불리언·짧은 문자열만 남긴다 (path_img 같은 좌표 배열, 마스크는 버림)
function scalars(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    if (v === null || typeof v === 'boolean' || typeof v === 'number') out[k] = r4(v);
    else if (typeof v === 'string' && v.length <= 32) out[k] = v;
  }
  return out;
}
export function buildRow(feat, res, isTest = testMode()) {
  const lines = Object.fromEntries(Object.entries(feat.lines).map(([k, v]) => [k, scalars(v)]));
  const palm = scalars(feat.palm);   // 손바닥 폭/위치(픽셀 수), 엄지 방향 추정 방식 — 사진은 아님
  return {
    app_version: COLLECT.app_version,
    model_version: COLLECT.model_version,
    calib_version: calibVersion(),
    feature_version: feat.feature_version || 1,
    features: { lines, relations: scalars(feat.relations), palm },
    stars: Object.fromEntries(Object.entries(res.lucks).map(([k, v]) => [k, v.stars])),
    type_id: res.type.id,
    image_w: feat.image_size[0],
    image_h: feat.image_size[1],
    lines_found: feat.relations.n_lines,
    client_hint: clientHint(),
    is_test: !!isTest,
  };
}

async function fileHash(file) {
  try {
    const buf = await file.arrayBuffer();
    const d = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return `${file.size}:${file.type}:${file.lastModified}`; }
}
function seen() { try { return new Set(JSON.parse(sessionStorage.getItem(SEEN) || '[]')); } catch { return new Set(); } }
function markSeen(h) { try { const s = seen(); s.add(h); sessionStorage.setItem(SEEN, JSON.stringify([...s].slice(-50))); } catch { /* ignore */ } }

// 결과 화면을 막지 않도록 await 하지 않고 호출한다. 반환 Promise 는 테스트용 상태 문자열.
export function sendFeatures(file, feat, res) {
  const st = (window.__collect = window.__collect || { sent: 0, skipped: [], errors: [] });
  if (!enabled()) { st.skipped.push('opt-out'); return Promise.resolve('opt-out'); }
  return (async () => {
    const h = await fileHash(file);
    if (seen().has(h)) { st.skipped.push('dup'); return 'dup'; }
    markSeen(h);
    const body = JSON.stringify(buildRow(feat, res));
    if (body.length > 12000) { st.skipped.push('too-big'); return 'too-big'; }
    const r = await fetch(COLLECT.url, {
      method: 'POST', keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { apikey: COLLECT.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body,
    });
    if (!r.ok) throw new Error('collect ' + r.status);
    st.sent++; return 'sent';
  })().catch((e) => { st.errors.push(String(e && e.message || e)); return 'error'; });
}
