// 별점 근거 — rules.yaml 에서 실제로 발동한 규칙(scoreLucks 의 fired)을 사람이 읽는 문장으로 바꿈.
// 규칙 판정은 interpret.js(= interpret.py 포팅)가 하고, 여기서는 '측정값 + 전통 손금 의미' 문구만 만든다.
// 문구는 js/i18n/<언어>.js 사전의 ev.* / m.* / calc.* / pct.* 키. 부정 규칙(add<0)은 문구로 보여 주지 않음(점수 계산 줄에서만 '균형 보정'으로 합산).
import { makePct } from './interpret.js';
import { t } from './i18n/runtime.js';
import { reasonText } from './copy.js';

export const lineName = (k) => t(`line.${k}`);
// 근거가 하나도 없을 때(기본값) 하이라이트할 대표 손금
export const LUCK_MAIN_LINE = { wealth: ['head', 'fate'], love: ['heart'], health: ['life'], career: ['fate', 'head'] };

// 0~1 백분위 -> "상위 22%" (보정 세트 기준: calib.js 의 ref / n_images)
export const topPct = (p) => t('pct.top', { n: Math.max(1, Math.round((1 - p) * 100)) });
export const lowPct = (p) => t('pct.bottom', { n: Math.max(1, Math.round(p * 100)) });
export const rank = (p) => (p >= 0.5 ? topPct(p) : lowPct(p));

// rule id -> { lines, fact(ctx), meaning() }.  같은 id 가 여러 운에 있으면 luck 별로 덮어씀. 사전 키: ev.<scope>.<id>.fact|meaning (scope: c=공통, wealth, love, health, career)
const top = (key) => ({ pct }) => ({ p: topPct(pct(key)) });
const low = (key) => ({ pct }) => ({ p: lowPct(pct(key)) });
const branches = (line) => ({ L }) => ({ n: L[line].branches });
const E = (scope, id, lines, args) => ({ lines, fact: (ctx) => t(`ev.${scope}.${id}.fact`, args ? args(ctx) : undefined), meaning: () => t(`ev.${scope}.${id}.meaning`) });
const COMMON = {
  fate_present: E('c', 'fate_present', ['fate']),
  fate_long: E('c', 'fate_long', ['fate'], top('fate.length')),
  head_long: E('c', 'head_long', ['head'], top('head.length')),
  head_straight: E('c', 'head_straight', ['head'], low('head.bend')),
  heart_branch: E('c', 'heart_branch', ['heart'], branches('heart')),
  heart_index: E('c', 'heart_index', ['heart']),
};
const BY_LUCK = {
  wealth: {
    life_wide: E('wealth', 'life_wide', ['life'], top('life.arc_width')),
  },
  love: {
    heart_balance: E('love', 'heart_balance', ['heart']),
    heart_middle: E('love', 'heart_middle', ['heart']),
    heart_curve_up: E('love', 'heart_curve_up', ['heart'], top('heart.end_rise')),
    heart_long: E('love', 'heart_long', ['heart'], top('heart.length')),
    heart_branch: E('love', 'heart_branch', ['heart'], branches('heart')),
    heart_clear: E('love', 'heart_clear', ['heart'], top('heart.clarity')),
    heart_head_gap: E('love', 'heart_head_gap', ['heart', 'head'], top('rel.heart_head_distance')),
  },
  health: {
    life_wide_arc: E('health', 'life_wide_arc', ['life'], top('life.arc_width')),
    life_long: E('health', 'life_long', ['life'], top('life.length')),
    life_clear: E('health', 'life_clear', ['life'], top('life.clarity')),
    life_thick: E('health', 'life_thick', ['life'], top('life.thickness')),
    life_branch: E('health', 'life_branch', ['life'], branches('life')),
  },
  career: {
    fate_present: E('career', 'fate_present', ['fate']),
    fate_reach: E('career', 'fate_reach', ['fate']),
    head_long: E('career', 'head_long', ['head'], top('head.length')),
    separate_start: E('career', 'separate_start', ['head', 'life']),
    joined_start: E('career', 'joined_start', ['head', 'life']),
    head_clear: E('career', 'head_clear', ['head'], top('head.clarity')),
    heart_index: E('career', 'heart_index', ['heart']),
  },
};
// 점수 계산 줄에 쓰는 짧은 이름 (rule id 기준, 운마다 같은 뜻): calc.short.<id>
const SHORT_IDS = ['fate_present', 'fate_long', 'head_long', 'head_straight', 'life_wide', 'heart_branch', 'heart_index', 'heart_balance',
  'heart_curve_up', 'heart_long', 'heart_clear', 'heart_head_gap', 'life_wide_arc', 'life_long', 'life_clear', 'life_thick',
  'life_branch', 'fate_reach', 'separate_start', 'head_clear'];
const shortName = (id) => (SHORT_IDS.includes(id) ? t(`calc.short.${id}`) : id);
const fmt = (x) => (Math.round(x * 100) / 100).toString();

/** luck(scoreLucks 결과 1개) -> { items:[{id,add,lines,fact,meaning}], calc, lines, isDefault } */
export function luckEvidence(key, luck, feat) {
  const pct = makePct(feat), ctx = { pct, L: feat.lines, R: feat.relations };
  const seen = new Set(), items = [];
  for (const f of luck.fired) {                     // already sorted: add desc, id
    if (f.add < 0 || seen.has(f.reason)) continue;  // 부정 규칙은 문구 없음 (python reasons 와 같은 dedupe)
    seen.add(f.reason);
    const m = (BY_LUCK[key] || {})[f.id] || COMMON[f.id];
    items.push({ id: f.id, add: f.add, reason: f.reason, lines: m ? m.lines : [], fact: m ? m.fact(ctx) : reasonText(f.reason), meaning: m ? m.meaning() : '' });
  }
  const shown = items.slice(0, 3);
  const pos = luck.fired.filter((f) => f.add > 0), neg = luck.fired.filter((f) => f.add < 0);
  const negSum = neg.reduce((a, f) => a + f.add, 0);
  // 점수 계산 줄 (부정 규칙은 어느 선인지 말하지 않고 '균형 보정'으로만 합산)
  const parts = [t('calc.base', { v: fmt(luck.base) })];
  for (const f of pos) parts.push(t('calc.plus', { name: shortName(f.id), v: fmt(f.add) }));
  if (negSum) parts.push(t('calc.balance', { v: fmt(-negSum) }));
  const raw = luck.raw, rounded = Math.floor(raw + 0.5);
  let calc = parts.length > 1 ? `${parts.join(' ')} = ${fmt(raw)} → ★${luck.stars}` : `${parts[0]} → ★${luck.stars}`;
  if (rounded > 5) calc += t('calc.max'); else if (rounded < 1) calc += t('calc.min');
  const isDefault = !shown.length;
  const lines = isDefault ? LUCK_MAIN_LINE[key] : [...new Set(shown.flatMap((i) => i.lines))];
  return { items: shown, calc, rounded: raw !== Math.trunc(raw), isDefault, defaultText: t(`ev.default.${key}`, { n: luck.stars }), noScoreItems: shown.filter((i) => i.add === 0).length, lines };
}

// ------------------------------------------------------------------ 손금 측정값 표
const yes = (b) => (b ? t('m.visible') : t('m.hidden'));
const level = (p, scale) => t(`m.lv.${scale}.${p >= 0.7 ? 2 : p <= 0.3 ? 0 : 1}`);
export function measuredRows(feat) {
  const pct = makePct(feat), L = feat.lines, R = feat.relations || {};
  const rows = [];
  for (const k of ['heart', 'head', 'life', 'fate']) {
    const v = L[k] || {};
    if (!v.present) { rows.push({ line: k, cells: [[t('m.status'), t('m.not_clear')]] }); continue; }
    const c = [[t('m.status'), yes(true)]];
    const lenKey = `${k}.length`;
    c.push([t('m.length'), t('m.len_val', { n: Math.round(v.length * 100) }) + ` · ${rank(pct(lenKey))}`]);
    if (k === 'life') c.push([t('m.arc'), `${level(pct('life.arc_width'), 'arc')} · ${rank(pct('life.arc_width'))}`]);
    else if (k === 'head') c.push([t('m.bend'), `${level(pct('head.bend'), 'bend')} · ${rank(pct('head.bend'))}`]);
    else c.push([t('m.bend'), v.bend == null ? '-' : t(`m.hb.${v.bend < 0.06 ? 0 : v.bend < 0.15 ? 1 : 2}`)]);
    if (k === 'heart') { c.push([t('m.end_pos'), v.end_zone && t.has(`m.zone.${v.end_zone}`) ? t(`m.zone.${v.end_zone}`) : '-']); c.push([t('m.end_rise'), rank(pct('heart.end_rise'))]); }
    if (k === 'fate') c.push([t('m.top_end'), v.top_v != null && v.top_v <= 0.45 ? t('m.top.reach') : t('m.top.mid')]);
    const clarKey = `${k}.clarity`;
    c.push([t('m.clarity'), k === 'fate' ? t('m.score', { n: Math.round((v.clarity || 0) * 100) }) : `${t('m.score', { n: Math.round((v.clarity || 0) * 100) })} · ${rank(pct(clarKey))}`]);
    if (k !== 'fate') c.push([t('m.thickness'), rank(pct(`${k}.thickness`))]);
    c.push([t('m.branches'), t('m.count', { n: v.branches ?? 0 })]);
    c.push([t('m.breaks'), t('m.places', { n: v.breaks ?? 0 })]);
    rows.push({ line: k, cells: c });
  }
  const rel = [];
  if (R.head_life_joined != null) rel.push([t('m.rel.joined_label'), R.head_life_joined ? t('m.rel.joined') : t('m.rel.separate')]);
  if (R.heart_head_distance != null) rel.push([t('m.rel.gap_label'), `${level(pct('rel.heart_head_distance'), 'gap')} · ${rank(pct('rel.heart_head_distance'))}`]);
  if (rel.length) rows.push({ line: 'rel', cells: rel });
  return rows;
}
