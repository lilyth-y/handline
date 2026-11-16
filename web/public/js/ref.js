// 유입 경로(?ref=blog 등)를 세션 동안 기억한다. DB 체크 제약과 같은 규칙: [a-z0-9_-]{1,20}
const KEY = 'hoa_ref';
export const cleanRef = (v) => {
  const s = String(v || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,20}$/.test(s) ? s : null;
};
let mem = null;
export function initRef() {
  const r = cleanRef(new URLSearchParams(location.search).get('ref'));
  if (r) { mem = r; try { sessionStorage.setItem(KEY, r); } catch { /* private mode */ } }
}
export function getRef() {
  try { return cleanRef(sessionStorage.getItem(KEY)) || mem; } catch { return mem; }
}
initRef();
