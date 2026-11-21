// 첫 방문: 한국어 페이지(현지화 쌍 있음)에서 브라우저 언어로 자동 이동. 봇·저장된 선호는 제외.
(function () {
  var KEY = 'hoa_lang';
  var DEST = {
    en: '/en', ja: '/ja', 'zh-tw': '/zh-tw', 'zh-cn': '/zh-cn',
    es: '/es', vi: '/vi', th: '/th', id: '/id', de: '/de', fr: '/fr',
  };
  var NON_KO = /^\/(zh-tw|zh-cn|en|ja|es|vi|th|id|de|fr)(\/|$)/;

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function isKoPath() { return !NON_KO.test(location.pathname); }

  if (!isKoPath()) return;
  var path = location.pathname.replace(/\/$/, '') || '/';
  if (/^\/s\//.test(path)) return;

  var ua = navigator.userAgent || '';
  if (/googlebot|google-inspectiontool|bingbot|msnbot|yandexbot|duckduckbot|slurp|baiduspider|naverbot|\byeti\b|daumoa|daum[- ]?bot|facebookexternalhit|facebot|twitterbot|slackbot|linkedinbot|discordbot|telegrambot|whatsapp|kakaotalk[- ]?scrap|kakaostory|embedly|quora link preview|outbrain|pinterest|vkshare|w3c_validator|headlesschrome|headless|phantomjs|playwright|puppeteer|selenium|wget|curl\/|python-requests|go-http-client|java\/|apache-httpclient|bytespider|petalbot|applebot|semrush|ahrefsbot|mj12bot|dotbot|gptbot|chatgpt-user|claudebot|anthropic-ai|perplexitybot|amazonbot|meta-externalagent/i.test(ua)) return;

  if (load(KEY)) return;

  function pickLang() {
    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < list.length; i++) {
      var l = String(list[i] || '').toLowerCase();
      if (l.indexOf('ko') === 0) return 'ko';
      if (l.indexOf('ja') === 0) return 'ja';
      if (l.indexOf('en') === 0) return 'en';
      if (/^zh-(tw|hk|mo|hant)/.test(l)) return 'zh-tw';
      if (/^zh-(cn|sg|hans)/.test(l) || l === 'zh') return 'zh-cn';
      if (l.indexOf('zh') === 0) return 'zh-cn';
      if (l.indexOf('es') === 0) return 'es';
      if (l.indexOf('vi') === 0) return 'vi';
      if (l.indexOf('th') === 0) return 'th';
      if (l.indexOf('id') === 0) return 'id';
      if (l.indexOf('de') === 0) return 'de';
      if (l.indexOf('fr') === 0) return 'fr';
    }
    return 'en';
  }

  var want = pickLang();
  if (want === 'ko' || !DEST[want]) return;

  var suffix = path === '/' ? '/' : path;
  var href = DEST[want] + suffix + location.search + location.hash;
  store(KEY, want);
  try { if (typeof window.va === 'function') window.va('event', { name: 'lang_auto_redirect', data: { lang: want } }); } catch (e) { /* ignore */ }
  location.replace(href);
})();