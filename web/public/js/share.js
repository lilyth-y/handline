// 공유 도우미: 공유 링크(/s/<유형>/), 친구 궁합, 카카오톡 공유, 클릭 집계.
// 개인정보는 다루지 않는다: 집계에는 버튼 위치/방식 같은 이벤트 이름만 쓴다.

// 카카오 JavaScript 키 (developers.kakao.com > 앱 > 플랫폼 키 > JavaScript 키).
// 비어 있으면 카카오톡 버튼은 숨겨지고 '공유하기 / 링크 복사'만 보인다.
// 키 자체는 공개돼도 되는 값이지만, 카카오 앱 설정에서 JavaScript SDK 도메인(hoadosa.com)을 꼭 등록해야 한다.
export const KAKAO_JS_KEY = '';
export const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js';
export const KAKAO_SDK_SRI = 'sha384-v6JKY3z4FUkWq21oZDHZe74YvuPk/WUrVLrDHTBojHXClOSa3iXy7sCXPY1jkFbj';

import { LANG, t } from './i18n/runtime.js';

export const kakaoEnabled = () => Boolean(KAKAO_JS_KEY && String(KAKAO_JS_KEY).trim());

// 친구에게 보내는 링크: 유형별 OG 미리보기가 있는 정적 페이지(/s/<id>/)로 보내고,
// 그 페이지가 곧바로 /?t=<id>&s=…&p=…&ref=share 로 넘겨 준다 (카톡 미리보기는 OG 만 읽고 JS 는 실행하지 않음).
//   s = 운세 별점 4자리, p = 손금 숫자 요약 14자 (compare.js encodeLines, 사진·개인정보 없음)
//   f, c = (궁합 결과 공유 전용) 상대 유형 id 와 궁합 %, 링크를 여는 사람에게 '둘의 궁합' 티저를 보여 준다
//   언어: 한국어는 /s/<id>/, 그 외는 /<언어>/s/<id>/ (미리보기 이미지·문구가 그 언어, 열면 /<언어>/ 앱으로 넘어감)
export function shareLink(origin, typeId, starsStr, linesStr, pair, lang = 'ko') {
  const u = new URL(`${lang && lang !== 'ko' ? `/${lang}` : ''}/s/${typeId}/`, origin);
  if (/^[1-5]{4}$/.test(starsStr || '')) u.searchParams.set('s', starsStr);
  if (linesStr) u.searchParams.set('p', linesStr);
  if (pair && pair.f && Number.isInteger(pair.c)) { u.searchParams.set('f', pair.f); u.searchParams.set('c', String(pair.c)); }
  u.searchParams.set('ref', 'share');
  return u.href;
}
export const ogImageFor = (origin, typeId, lang = 'ko') => new URL(lang && lang !== 'ko' ? `/img/share/${lang}/${typeId}.jpg` : `/img/share/${typeId}.jpg`, origin).href;

// Vercel Web Analytics 사용자 지정 이벤트. 스크립트가 없거나 차단돼도 아무 일도 일어나지 않는다.
// 모든 이벤트에 언어(lang: ko/en/ja/zh-tw)를 같이 보낸다. 개인정보 아님.
export function track(name, data) {
  const d = { ...(data || {}), lang: LANG };
  try { if (typeof window.va === 'function') window.va('event', { name, data: d }); } catch { /* ignore */ }
  try { (window.__track = window.__track || []).push({ name, data: d }); } catch { /* ignore */ }
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
      buttons: [{ title: buttonTitle || t('share.kakao_default_btn'), link }],
    });
    return true;
  } catch (e) { console.warn('kakao share failed', e && e.message); return false; }
}
