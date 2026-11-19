// 브라우저 런타임: <html data-lang> (없으면 URL 접두어)로 언어를 정하고 그 사전만 불러온다.
// Node(평가 스크립트/테스트)에서는 한국어.
import { LANGS, DEFAULT_LANG, langFromPath, pathFor } from './langs.js';
import { makeT } from './core.js';

function detect() {
  try { const d = document.documentElement.dataset.lang; if (d && LANGS[d]) return d; } catch { /* not in a browser */ }
  try { return langFromPath(location.pathname); } catch { /* node */ }
  return DEFAULT_LANG;
}
export const LANG = detect();
const DICT = (await import(`./${LANG}.js`)).default;
export const t = makeT(DICT, (k) => { try { console.warn('i18n: missing key', k); } catch { /* ignore */ } });
export const tr = t;
export const intlLocale = LANGS[LANG].intl;
export const isKo = LANG === 'ko';
/** 현재 언어의 경로: L('/guide/') -> '/en/guide/' */
export const L = (p = '/') => pathFor(LANG, p);
