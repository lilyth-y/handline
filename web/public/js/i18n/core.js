// 번역 함수 (사전 + {변수} 치환). 브라우저(runtime.js)와 Node(gen_i18n.mjs, 테스트)가 같이 쓴다.
export function makeT(dict, warn) {
  const t = (key, vars) => {
    let s = dict[key];
    if (s == null) { if (warn) warn(key); return key; }
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
  };
  t.has = (key) => key in dict;
  return t;
}
