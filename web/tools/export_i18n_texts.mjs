// 앱 사전(public/js/i18n/<lang>.js)에서 서버/LLM 쪽(interpret/)이 쓰는 문구만 JSON 으로 내보낸다.
//   node tools/export_i18n_texts.mjs   ->  ../interpret/i18n_texts.json
// interpret/prompt.py 의 localize() 가 interpret() 결과(유형 id, 이유 id)를 언어별 문구로 바꿀 때 쓴다.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { LANG_IDS } from '../public/js/i18n/langs.js';
import { RULES } from '../public/js/rules.js';

const out = {};
const reasonIds = Object.keys(RULES.reasons);
for (const lang of LANG_IDS) {
  const d = (await import(`../public/js/i18n/${lang}.js`)).default;
  out[lang] = {
    types: Object.fromEntries(RULES.types.map((t) => [t.id, Object.fromEntries(['name', 'keyword', 'element', 'intro', 'charm'].map((k) => [k, d[`type.${t.id}.${k}`]]))])),
    lucks: Object.fromEntries(['wealth', 'love', 'health', 'career'].map((k) => [k, d[`luck.${k}`]])),
    reasons: Object.fromEntries(reasonIds.map((r) => [r, d[`reason.${r}`]]).filter(([, v]) => v != null)),
  };
}
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../interpret/i18n_texts.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log('wrote', file, LANG_IDS.map((l) => `${l}:${Object.keys(out[l].reasons).length} reasons`).join(' '));
