// 언어 설정 (브라우저와 Node 생성 스크립트가 같이 쓴다). 한국어는 루트(/), 나머지는 접두어.
export const ORIGIN = 'https://hoadosa.com';
export const DEFAULT_LANG = 'ko';
/** URL 경로에 쓰이는 비한국어 접두어 (긴 것부터 매칭) */
export const LANG_PATH_RE = 'zh-tw|zh-cn|en|ja|es|vi|th|id|de|fr';
export const LANGS = {
  ko: { id: 'ko', prefix: '', html: 'ko', hreflang: ['ko'], label: '한국어', short: 'KO', og: 'ko_KR', intl: 'ko-KR' },
  en: { id: 'en', prefix: '/en', html: 'en', hreflang: ['en'], label: 'English', short: 'EN', og: 'en_US', intl: 'en-US' },
  ja: { id: 'ja', prefix: '/ja', html: 'ja', hreflang: ['ja'], label: '日本語', short: 'JA', og: 'ja_JP', intl: 'ja-JP' },
  'zh-tw': { id: 'zh-tw', prefix: '/zh-tw', html: 'zh-TW', hreflang: ['zh-TW', 'zh-HK'], label: '繁體中文', short: '繁中', og: 'zh_TW', intl: 'zh-TW' },
  'zh-cn': { id: 'zh-cn', prefix: '/zh-cn', html: 'zh-CN', hreflang: ['zh-CN', 'zh-Hans', 'zh-SG'], label: '简体中文', short: '简中', og: 'zh_CN', intl: 'zh-CN' },
  es: { id: 'es', prefix: '/es', html: 'es', hreflang: ['es'], label: 'Español', short: 'ES', og: 'es_ES', intl: 'es-ES' },
  vi: { id: 'vi', prefix: '/vi', html: 'vi', hreflang: ['vi'], label: 'Tiếng Việt', short: 'VI', og: 'vi_VN', intl: 'vi-VN' },
  th: { id: 'th', prefix: '/th', html: 'th', hreflang: ['th'], label: 'ไทย', short: 'TH', og: 'th_TH', intl: 'th-TH' },
  id: { id: 'id', prefix: '/id', html: 'id', hreflang: ['id'], label: 'Bahasa Indonesia', short: 'ID', og: 'id_ID', intl: 'id-ID' },
  de: { id: 'de', prefix: '/de', html: 'de', hreflang: ['de'], label: 'Deutsch', short: 'DE', og: 'de_DE', intl: 'de-DE' },
  fr: { id: 'fr', prefix: '/fr', html: 'fr', hreflang: ['fr'], label: 'Français', short: 'FR', og: 'fr_FR', intl: 'fr-FR' },
};
export const LANG_IDS = Object.keys(LANGS);

/** '/en/guide/' -> 'en', '/guide/' -> 'ko' */
export function langFromPath(pathname) {
  const m = new RegExp(`^/(${LANG_PATH_RE})(\\/|$)`).exec(pathname || '');
  return m ? m[1] : DEFAULT_LANG;
}
/** 언어 접두어를 뺀 경로: '/en/guide/' -> '/guide/' */
export function stripLang(pathname) {
  const p = (pathname || '/').replace(new RegExp(`^/(${LANG_PATH_RE})(?=\\/|$)`), '');
  return p || '/';
}
/** pathFor('en', '/guide/') -> '/en/guide/', pathFor('ko', '/guide/') -> '/guide/' */
export const pathFor = (lang, p = '/') => `${LANGS[lang].prefix}${p}`;