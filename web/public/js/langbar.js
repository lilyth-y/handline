// 언어: 첫 방문 자동 이동은 head 의 langredirect.js, 여기서는 전환 메뉴와 (필요할 때만) 제안 바.
(function () {
  var LANGS = {
    ko: { prefix: '', msg: '한국어로 볼 수 있어요', go: '한국어', html: 'ko' },
    en: { prefix: '/en', msg: 'This page is also available in English', go: 'English', html: 'en' },
    ja: { prefix: '/ja', msg: '日本語でもご覧いただけます', go: '日本語', html: 'ja' },
    'zh-tw': { prefix: '/zh-tw', msg: '也有繁體中文版本', go: '繁體中文', html: 'zh-TW' },
    'zh-cn': { prefix: '/zh-cn', msg: '也可阅读简体中文', go: '简体中文', html: 'zh-CN' },
    es: { prefix: '/es', msg: 'También está en español', go: 'Español', html: 'es' },
    vi: { prefix: '/vi', msg: 'Cũng có bản tiếng Việt', go: 'Tiếng Việt', html: 'vi' },
    th: { prefix: '/th', msg: 'มีภาษาไทยให้อ่านด้วย', go: 'ไทย', html: 'th' },
    id: { prefix: '/id', msg: 'Juga tersedia dalam Bahasa Indonesia', go: 'Indonesia', html: 'id' },
    de: { prefix: '/de', msg: 'Auch auf Deutsch verfügbar', go: 'Deutsch', html: 'de' },
    fr: { prefix: '/fr', msg: 'Aussi disponible en français', go: 'Français', html: 'fr' },
  };
  var KEY = 'hoa_lang', DISMISS = 'hoa_lang_dismissed';
  function cur() { var m = /^\/(zh-tw|zh-cn|en|ja|es|vi|th|id|de|fr)(\/|$)/.exec(location.pathname); return m ? m[1] : 'ko'; }
  function strip(p) { return p.replace(/^\/(zh-tw|zh-cn|en|ja|es|vi|th|id|de|fr)(?=\/|$)/, '') || '/'; }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function withQuery(href) { return href + location.search + location.hash; }
  var here = cur();

  document.querySelectorAll('.lang-switch a[data-lang]').forEach(function (a) {
    var isHome = strip(location.pathname) === '/';
    if (isHome) a.setAttribute('href', withQuery(a.getAttribute('href')));
    a.addEventListener('click', function () { store(KEY, a.getAttribute('data-lang')); });
  });
  document.addEventListener('click', function (e) {
    document.querySelectorAll('.lang-switch[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });

  function browserLang() {
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

  var saved = load(KEY);
  if (saved && LANGS[saved] && saved === here) return;
  if (load(DISMISS) === '1') return;
  var want = (saved && LANGS[saved]) ? saved : browserLang();
  if (!want || want === here || !LANGS[want]) return;
  var bar = document.createElement('div');
  bar.className = 'langbar'; bar.setAttribute('role', 'region'); bar.setAttribute('lang', LANGS[want].html);
  var msg = document.createElement('span'); msg.textContent = LANGS[want].msg;
  var go = document.createElement('a'); go.textContent = LANGS[want].go;
  go.href = withQuery(LANGS[want].prefix + strip(location.pathname)); go.setAttribute('data-lang', want);
  go.addEventListener('click', function () { store(KEY, want); });
  var x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Close');
  x.addEventListener('click', function () { store(DISMISS, '1'); bar.remove(); });
  bar.appendChild(msg); bar.appendChild(go); bar.appendChild(x);
  document.body.appendChild(bar);
})();