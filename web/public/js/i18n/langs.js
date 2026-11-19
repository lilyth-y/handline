// 언어 설정 (브라우저와 Node 생성 스크립트가 같이 쓴다). 한국어는 루트(/), 나머지는 /en/ /ja/ /zh-tw/.
export const ORIGIN = 'https://hoadosa.com';
export const DEFAULT_LANG = 'ko';
export const LANGS = {
  ko: { id: 'ko', prefix: '', html: 'ko', hreflang: ['ko'], label: '한국어', short: 'KO', og: 'ko_KR', intl: 'ko-KR' },
  en: { id: 'en', prefix: '/en', html: 'en', hreflang: ['en'], label: 'English', short: 'EN', og: 'en_US', intl: 'en-US' },
  ja: { id: 'ja', prefix: '/ja', html: 'ja', hreflang: ['ja'], label: '日本語', short: 'JA', og: 'ja_JP', intl: 'ja-JP' },
  'zh-tw': { id: 'zh-tw', prefix: '/zh-tw', html: 'zh-TW', hreflang: ['zh-TW', 'zh-HK'], label: '繁體中文', short: '繁中', og: 'zh_TW', intl: 'zh-TW' },
};
export const LANG_IDS = Object.keys(LANGS);

/** '/en/guide/' -> 'en', '/guide/' -> 'ko' */
export function langFromPath(pathname) {
  const m = /^\/(en|ja|zh-tw)(\/|$)/.exec(pathname || '');
  return m ? m[1] : DEFAULT_LANG;
}
/** 언어 접두어를 뺀 경로: '/en/guide/' -> '/guide/' */
export function stripLang(pathname) {
  const p = (pathname || '/').replace(/^\/(en|ja|zh-tw)(?=\/|$)/, '');
  return p || '/';
}
/** pathFor('en', '/guide/') -> '/en/guide/', pathFor('ko', '/guide/') -> '/guide/' */
export const pathFor = (lang, p = '/') => `${LANGS[lang].prefix}${p}`;
