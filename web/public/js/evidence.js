// 별점 근거 — rules.yaml 에서 실제로 발동한 규칙(scoreLucks 의 fired)을 사람이 읽는 문장으로 바꿈.
// 규칙 판정은 interpret.js(= interpret.py 포팅)가 하고, 여기서는 '측정값 + 전통 손금 의미' 문구만 만든다.
// 부정 규칙(add<0)은 문구로 보여 주지 않음(점수 계산 줄에서만 '균형 보정'으로 합산).
import { makePct } from './interpret.js';
import { RULES } from './rules.js';

export const LINE_KO = { heart: '감정선', head: '두뇌선', life: '생명선', fate: '운명선' };
const ZONE_KO = { index: '검지 아래', index_middle: '검지와 중지 사이', middle: '중지 아래', ring: '약지 쪽' };
// 근거가 하나도 없을 때(기본값) 하이라이트할 대표 손금
export const LUCK_MAIN_LINE = { wealth: ['head', 'fate'], love: ['heart'], health: ['life'], career: ['fate', 'head'] };

// 0~1 백분위 -> "상위 22%" (보정 세트 155장 기준)
export const topPct = (p) => `상위 ${Math.max(1, Math.round((1 - p) * 100))}%`;
export const rank = (p) => (p >= 0.5 ? topPct(p) : `하위 ${Math.max(1, Math.round(p * 100))}%`);
export const lowPct = (p) => `하위 ${Math.max(1, Math.round(p * 100))}%`;

// rule id -> { lines, fact(ctx), meaning }.  같은 id 가 여러 운에 있으면 luck 별로 덮어씀.
const COMMON = {
  fate_present: { lines: ['fate'], fact: () => '운명선이 뚜렷하게 보임', meaning: '전통 손금에서 운명선은 한 우물을 꾸준히 파는 힘을 뜻하오.' },
  fate_long: { lines: ['fate'], fact: ({ pct }) => `운명선 길이: ${topPct(pct('fate.length'))} (긴 편)`, meaning: '운명선이 길면 쌓은 노력이 오래도록 결실을 맺는다고 보오.' },
  head_long: { lines: ['head'], fact: ({ pct }) => `두뇌선 길이: ${topPct(pct('head.length'))} (긴 편)`, meaning: '전통 손금에서 긴 두뇌선은 계획성과 실속을 뜻해요.' },
  head_straight: { lines: ['head'], fact: ({ pct }) => `두뇌선이 곧게 뻗음 (휘어짐 ${lowPct(pct('head.bend'))})`, meaning: '곧은 두뇌선은 현실 감각과 논리적인 판단력을 뜻하오.' },
  heart_branch: { lines: ['heart'], fact: ({ L }) => `감정선 잔가지 ${L.heart.branches}개 보임`, meaning: '감정선의 가지는 사람과의 인연이 복으로 돌아온다는 뜻이오.' },
  heart_index: { lines: ['heart'], fact: () => '감정선이 검지 아래까지 뻗음', meaning: '검지 아래로 뻗은 감정선은 다정하고 헌신적인 마음을 뜻하오.' },
};
const BY_LUCK = {
  wealth: {
    life_wide: { lines: ['life'], fact: ({ pct }) => `생명선 곡선 폭: ${topPct(pct('life.arc_width'))} (넓은 편)`, meaning: '크게 휘어진 생명선은 부지런한 활력, 그 힘이 재물을 부른다고 보오.' },
  },
  love: {
    heart_balance: { lines: ['heart'], fact: () => '감정선 끝이 검지와 중지 사이를 향함', meaning: '검지와 중지 사이로 향한 감정선은 이상과 현실의 균형 잡힌 사랑을 뜻하오.' },
    heart_middle: { lines: ['heart'], fact: () => '감정선 끝이 중지 아래를 향함', meaning: '중지 쪽 감정선은 내 마음에 솔직한 실속파 연애를 뜻하오.' },
    heart_curve_up: { lines: ['heart'], fact: ({ pct }) => `감정선 끝 휘어 오름: ${topPct(pct('heart.end_rise'))}`, meaning: '위로 휘어 오르는 감정선은 마음을 잘 표현하는 사람이라 보오.' },
    heart_long: { lines: ['heart'], fact: ({ pct }) => `감정선 길이: ${topPct(pct('heart.length'))} (긴 편)`, meaning: '길게 이어진 감정선은 깊고 넓은 마음을 뜻하오.' },
    heart_branch: { lines: ['heart'], fact: ({ L }) => `감정선 잔가지 ${L.heart.branches}개 보임`, meaning: '감정선의 잔가지는 주변에 사랑받는 인기를 뜻하오.' },
    heart_clear: { lines: ['heart'], fact: ({ pct }) => `감정선 선명도: ${topPct(pct('heart.clarity'))} (또렷함)`, meaning: '또렷한 감정선은 한결같은 진심을 뜻하오.' },
    heart_head_gap: { lines: ['heart', 'head'], fact: ({ pct }) => `감정선–두뇌선 간격: ${topPct(pct('rel.heart_head_distance'))} (넓은 편)`, meaning: '두 선 사이가 넓으면 너그럽고 품이 넓은 마음이라 보오.' },
  },
  health: {
    life_wide_arc: { lines: ['life'], fact: ({ pct }) => `생명선 곡선 폭: ${topPct(pct('life.arc_width'))} (넓은 편)`, meaning: '생명선이 손바닥 안쪽까지 크게 휘면 활력이 넘친다고 보오. (수명과는 무관!)' },
    life_long: { lines: ['life'], fact: ({ pct }) => `생명선 길이: ${topPct(pct('life.length'))} (긴 편)`, meaning: '길게 이어진 생명선은 꾸준한 체력과 끈기를 뜻하오.' },
    life_clear: { lines: ['life'], fact: ({ pct }) => `생명선 선명도: ${topPct(pct('life.clarity'))} (또렷함)`, meaning: '또렷한 생명선은 밝고 건강한 기운을 뜻하오.' },
    life_thick: { lines: ['life'], fact: ({ pct }) => `생명선 굵기: ${topPct(pct('life.thickness'))} (굵은 편)`, meaning: '굵직한 생명선은 든든한 에너지를 뜻하오.' },
    life_branch: { lines: ['life'], fact: ({ L }) => `생명선 잔가지 ${L.life.branches}개 보임`, meaning: '생명선에서 뻗는 가지는 새로 솟는 활력을 뜻하오.' },
  },
  career: {
    fate_present: { lines: ['fate'], fact: () => '운명선이 뚜렷하게 보임', meaning: '전통 손금에서 운명선은 일과 목표 의식을 뜻하오.' },
    fate_reach: { lines: ['fate'], fact: () => '운명선이 손가락 쪽까지 높이 뻗음', meaning: '위로 높이 뻗은 운명선은 꿈을 향해 쭉 나아가는 힘이라 보오.' },
    head_long: { lines: ['head'], fact: ({ pct }) => `두뇌선 길이: ${topPct(pct('head.length'))} (긴 편)`, meaning: '긴 두뇌선은 폭넓은 관심과 실력을 뜻하오.' },
    separate_start: { lines: ['head', 'life'], fact: () => '두뇌선과 생명선이 떨어져서 시작', meaning: '두 선이 떨어져 시작하면 독립심과 추진력이 강하다고 보오.' },
    joined_start: { lines: ['head', 'life'], fact: () => '두뇌선과 생명선이 붙어서 시작', meaning: '두 선이 함께 시작하면 신중하고 믿음직한 일솜씨라 보오.' },
    head_clear: { lines: ['head'], fact: ({ pct }) => `두뇌선 선명도: ${topPct(pct('head.clarity'))} (또렷함)`, meaning: '또렷한 두뇌선은 높은 집중력을 뜻하오.' },
    heart_index: { lines: ['heart'], fact: () => '감정선이 검지 아래까지 뻗음', meaning: '검지(목성구) 쪽 감정선은 사람을 이끄는 리더 기질이라 보오.' },
  },
};
const DEFAULT_TEXT = {
  wealth: '재물운을 끌어올리는 뚜렷한 특징은 아직 안 보여요. 이 운에서는 평균적인 손금이라는 뜻이니, 별 {S}개는 기본 기운이에요.',
  love: '연애운을 끌어올리는 뚜렷한 특징은 아직 안 보여요. 이 운에서는 평균적인 손금이라는 뜻이니, 별 {S}개는 기본 기운이에요.',
  health: '건강운을 끌어올리는 뚜렷한 특징은 아직 안 보여요. 이 운에서는 평균적인 손금이라는 뜻이니, 별 {S}개는 기본 기운이에요.',
  career: '직업운을 끌어올리는 뚜렷한 특징은 아직 안 보여요. 이 운에서는 평균적인 손금이라는 뜻이니, 별 {S}개는 기본 기운이에요.',
};
// 점수 계산 줄에 쓰는 짧은 이름 (rule id 기준, 운마다 같은 뜻)
const SHORT = { fate_present: '운명선', fate_long: '긴 운명선', head_long: '긴 두뇌선', head_straight: '곧은 두뇌선',
  life_wide: '넓은 생명선', heart_branch: '감정선 가지', heart_index: '검지 쪽 감정선', heart_balance: '균형 감정선',
  heart_curve_up: '오르는 감정선', heart_long: '긴 감정선', heart_clear: '또렷한 감정선', heart_head_gap: '넓은 선 간격',
  life_wide_arc: '넓은 생명선', life_long: '긴 생명선', life_clear: '또렷한 생명선', life_thick: '굵은 생명선',
  life_branch: '생명선 가지', fate_reach: '높이 뻗은 운명선', separate_start: '떨어진 시작점', head_clear: '또렷한 두뇌선' };
const fmt = (x) => (Math.round(x * 100) / 100).toString();
const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + fmt(Math.abs(x));

/** luck(scoreLucks 결과 1개) -> { items:[{id,add,lines,fact,meaning}], calc, lines, isDefault } */
export function luckEvidence(key, luck, feat) {
  const pct = makePct(feat), ctx = { pct, L: feat.lines, R: feat.relations };
  const seen = new Set(), items = [];
  for (const f of luck.fired) {                     // already sorted: add desc, id
    if (f.add < 0 || seen.has(f.reason)) continue;  // 부정 규칙은 문구 없음 (python reasons 와 같은 dedupe)
    seen.add(f.reason);
    const m = (BY_LUCK[key] || {})[f.id] || COMMON[f.id];
    items.push({ id: f.id, add: f.add, reason: f.reason, lines: m ? m.lines : [], fact: m ? m.fact(ctx) : (RULES.reasons[f.reason] || f.id), meaning: m ? m.meaning : '' });
  }
  const shown = items.slice(0, 3);
  const pos = luck.fired.filter((f) => f.add > 0), neg = luck.fired.filter((f) => f.add < 0);
  const negSum = neg.reduce((a, f) => a + f.add, 0);
  // 점수 계산 줄 (부정 규칙은 어느 선인지 말하지 않고 '균형 보정'으로만 합산)
  const parts = [`기본 ${fmt(luck.base)}`];
  for (const f of pos) parts.push(`+ ${SHORT[f.id] || f.id} ${fmt(f.add)}`);
  if (negSum) parts.push(`− 균형 보정 ${fmt(-negSum)}`);
  const raw = luck.raw, rounded = Math.floor(raw + 0.5);
  let calc = parts.length > 1 ? `${parts.join(' ')} = ${fmt(raw)} → ★${luck.stars}` : `${parts[0]} → ★${luck.stars}`;
  if (rounded > 5) calc += ' (최대 5개)'; else if (rounded < 1) calc += ' (최소 1개)';
  const isDefault = !shown.length;
  const lines = isDefault ? LUCK_MAIN_LINE[key] : [...new Set(shown.flatMap((i) => i.lines))];
  return { items: shown, calc, rounded: raw !== Math.trunc(raw), isDefault, defaultText: DEFAULT_TEXT[key].replace('{S}', luck.stars), noScoreItems: shown.filter((i) => i.add === 0).length, lines };
}

// ------------------------------------------------------------------ 손금 측정값 표
const yes = (b) => (b ? '보임' : '안 보임');
function level(p, words) { return p >= 0.7 ? words[2] : p <= 0.3 ? words[0] : words[1]; }
export function measuredRows(feat) {
  const pct = makePct(feat), L = feat.lines, R = feat.relations || {};
  const rows = [];
  for (const k of ['heart', 'head', 'life', 'fate']) {
    const v = L[k] || {};
    if (!v.present) { rows.push({ line: k, cells: [['상태', '사진에서 또렷하게 안 보임']] }); continue; }
    const c = [['상태', yes(true)]];
    const lenKey = `${k}.length`;
    c.push(['길이', `손바닥 폭의 ${Math.round(v.length * 100)}%` + ` · ${rank(pct(lenKey))}`]);
    if (k === 'life') c.push(['곡선 폭', `${level(pct('life.arc_width'), ['좁은 편', '보통', '넓은 편'])} · ${rank(pct('life.arc_width'))}`]);
    else if (k === 'head') c.push(['휘어짐', `${level(pct('head.bend'), ['곧은 편', '보통', '휜 편'])} · ${rank(pct('head.bend'))}`]);
    else c.push(['휘어짐', v.bend == null ? '-' : v.bend < 0.06 ? '곧은 편' : v.bend < 0.15 ? '살짝 휨' : '많이 휨']);
    if (k === 'heart') { c.push(['끝 위치', ZONE_KO[v.end_zone] || '-']); c.push(['끝 휘어 오름', rank(pct('heart.end_rise'))]); }
    if (k === 'fate') c.push(['위쪽 끝', v.top_v != null && v.top_v <= 0.45 ? '손가락 쪽까지' : '손바닥 중간까지']);
    const clarKey = `${k}.clarity`;
    c.push(['선명도', k === 'fate' ? `${Math.round((v.clarity || 0) * 100)}점` : `${Math.round((v.clarity || 0) * 100)}점 · ${rank(pct(clarKey))}`]);
    if (k !== 'fate') c.push(['굵기', rank(pct(`${k}.thickness`))]);
    c.push(['가지', `${v.branches ?? 0}개`]);
    c.push(['끊김', `${v.breaks ?? 0}곳`]);
    rows.push({ line: k, cells: c });
  }
  const rel = [];
  if (R.head_life_joined != null) rel.push(['두뇌선·생명선 시작', R.head_life_joined ? '붙어서 시작' : '떨어져서 시작']);
  if (R.heart_head_distance != null) rel.push(['감정선–두뇌선 간격', `${level(pct('rel.heart_head_distance'), ['좁은 편', '보통', '넓은 편'])} · ${rank(pct('rel.heart_head_distance'))}`]);
  if (rel.length) rows.push({ line: 'rel', cells: rel });
  return rows;
}
