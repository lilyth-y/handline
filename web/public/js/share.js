// 공유 도우미: 공유 링크(/s/<유형>/), 친구 궁합, 카카오톡 공유, 클릭 집계.
// 개인정보는 다루지 않는다: 집계에는 버튼 위치/방식 같은 이벤트 이름만 쓴다.

// 카카오 JavaScript 키 (developers.kakao.com > 앱 > 플랫폼 키 > JavaScript 키).
// 비어 있으면 카카오톡 버튼은 숨겨지고 '공유하기 / 링크 복사'만 보인다.
// 키 자체는 공개돼도 되는 값이지만, 카카오 앱 설정에서 JavaScript SDK 도메인(hoadosa.com)을 꼭 등록해야 한다.
export const KAKAO_JS_KEY = '';
export const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js';
export const KAKAO_SDK_SRI = 'sha384-v6JKY3z4FUkWq21oZDHZe74YvuPk/WUrVLrDHTBojHXClOSa3iXy7sCXPY1jkFbj';

export const kakaoEnabled = () => Boolean(KAKAO_JS_KEY && String(KAKAO_JS_KEY).trim());

// 친구에게 보내는 링크: 유형별 OG 미리보기가 있는 정적 페이지(/s/<id>/)로 보내고,
// 그 페이지가 곧바로 /?t=<id>&s=<별점>&ref=share 로 넘겨 준다 (카톡 미리보기는 OG 만 읽고 JS 는 실행하지 않음).
export function shareLink(origin, typeId, starsStr) {
  const u = new URL(`/s/${typeId}/`, origin);
  if (/^[1-5]{4}$/.test(starsStr || '')) u.searchParams.set('s', starsStr);
  u.searchParams.set('ref', 'share');
  return u.href;
}
export const ogImageFor = (origin, typeId) => new URL(`/img/share/${typeId}.jpg`, origin).href;

// 천생연분 짝 (서로 보완되는 성향)
export const MATES = {
  gold: 'rock', rock: 'gold', fire: 'wave', wave: 'fire', moon: 'star', star: 'moon',
  wind: 'lightning', lightning: 'wind', sun: 'flower', flower: 'sun', cloud: 'galaxy', galaxy: 'cloud',
};
// 재미용 궁합: 유형 짝 여부(+최대 25) + 네 가지 운세 별점이 얼마나 닮았는지(+최대 20). 60~99%.
export function compat(aId, bId, aStars, bStars) {
  const kind = aId === bId ? 'same' : MATES[aId] === bId ? 'mate' : 'diff';
  const bonus = kind === 'mate' ? 25 : kind === 'same' ? 20 : 0;
  let sim = 10;
  if (Array.isArray(aStars) && Array.isArray(bStars) && aStars.length === 4 && bStars.length === 4) {
    const diff = aStars.reduce((n, v, i) => n + Math.abs(v - bStars[i]), 0);
    sim = 20 * (1 - Math.min(diff, 16) / 16);
  }
  const pct = Math.min(99, Math.round(60 + bonus + sim));
  const msg = pct >= 90 ? '천생연분이로다! 💞' : pct >= 80 ? '찰떡궁합이구려! ✨' : pct >= 70 ? '서로 채워 주는 사이로다 🌙' : '다르기에 끌리는 사이로다 🍃';
  return { pct, kind, msg };
}

// Vercel Web Analytics 사용자 지정 이벤트. 스크립트가 없거나 차단돼도 아무 일도 일어나지 않는다.
export function track(name, data) {
  try { if (typeof window.va === 'function') window.va('event', data ? { name, data } : { name }); } catch { /* ignore */ }
  try { (window.__track = window.__track || []).push({ name, data }); } catch { /* ignore */ }
}

let kakaoLoading = null;
function loadKakao() {
  if (window.Kakao) return Promise.resolve(window.Kakao);
  if (!kakaoLoading) {
    kakaoLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = KAKAO_SDK_URL; s.integrity = KAKAO_SDK_SRI; s.crossOrigin = 'anonymous';
      s.onload = () => res(window.Kakao); s.onerror = () => { kakaoLoading = null; rej(new Error('kakao sdk')); };
      document.head.appendChild(s);
    });
  }
  return kakaoLoading;
}
export function warmKakao() { if (kakaoEnabled()) loadKakao().catch(() => {}); }

// 카카오톡 피드 메시지. 성공적으로 공유 창을 띄우면 true, 실패하면 false (호출한 쪽이 공유하기/복사로 대체).
export async function kakaoSend({ title, description, imageUrl, url, buttonTitle }) {
  if (!kakaoEnabled()) return false;
  try {
    const K = await loadKakao();
    if (!K.isInitialized()) K.init(KAKAO_JS_KEY);
    const link = { mobileWebUrl: url, webUrl: url };
    K.Share.sendDefault({
      objectType: 'feed',
      content: { title, description, imageUrl, imageWidth: 1200, imageHeight: 630, link },
      buttons: [{ title: buttonTitle || '나도 손금 보기', link }],
    });
    return true;
  } catch (e) { console.warn('kakao share failed', e && e.message); return false; }
}
