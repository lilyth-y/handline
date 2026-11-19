// 친구와 손금 비교: 내 결과를 URL 에 담는 짧은 익명 프로필(손금 숫자 요약, 사진·개인정보 없음)과 규칙 기반 궁합.
// 궁합 규칙/점수는 rules.yaml 의 compatibility(= interpret.py 와 같은 값)를 그대로 쓰고, 근거를 항목별로 돌려준다.
import { RULES } from './rules.js';
import { makePct } from './interpret.js';
import { t } from './i18n/runtime.js';
import { reasonText } from './copy.js';

export const LINES = ['heart', 'head', 'life', 'fate'];
export const lineName = (k) => t(`line.${k}`);
export const LINE_COLOR = { heart: '#ff7eb6', head: '#ffd36e', life: '#6ee7c8', fate: '#b69cff' };
const ZONES = ['ring', 'middle', 'index_middle', 'index'];            // 감정선 끝 위치 (약지 → 검지)
const zoneName = (z) => (z >= 0 && z <= 3 ? t(`cmp.zone.${z}`) : '-');
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dig = (p) => clamp(Math.round(p * 9), 0, 9);                    // 0~1 백분위 -> 0~9

// 천생연분 짝: 궁합 규칙(element_pairs)에서 점수가 가장 높은(8점) 원소 조합을 유형으로 바꾼 것
const elementOf = (id) => RULES.types.find((t) => t.id === id)?.element;
const pairBonus = (ea, eb) => { const P = RULES.compatibility.element_pairs; return P[`${ea}-${eb}`] || P[`${eb}-${ea}`] || 0; };
export function mateOf(typeId) {
  const top = Math.max(...Object.values(RULES.compatibility.element_pairs));
  const e = elementOf(typeId);
  return RULES.types.find((t) => t.id !== typeId && pairBonus(e, t.element) === top) || null;
}

// ---------------------------------------------------------------- 프로필 만들기 / 인코딩
// 길이(len)·휘어짐(cur)은 기준 사진 대비 백분위를 0~9 한 자리로. 줄 하나가 안 보이면 '-' 로 채운다.
export function buildProfile(feat, res) {
  const pct = makePct(feat), L = feat.lines, R = feat.relations || {};
  const line = (k, fn) => (L[k] && L[k].present ? fn(L[k]) : null);
  return {
    t: res.type.id,
    s: Object.values(res.lucks).map((l) => l.stars),
    L: {
      heart: line('heart', (v) => ({ len: dig(pct('heart.length')), cur: dig(pct('heart.end_rise')), zone: ZONES.indexOf(v.end_zone) })),
      head: line('head', (v) => ({ len: dig(pct('head.length')), cur: dig(pct('head.bend')), ang: clamp(Math.round(v.angle_deg ?? 0), -30, 41) })),
      life: line('life', (v) => ({ len: dig(pct('life.length')), cur: dig(pct('life.arc_width')), aw: clamp(Math.round((v.arc_width ?? 0) * 20), 0, 35) })),
      fate: line('fate', (v) => ({ len: dig(pct('fate.length')), cur: clamp(Math.round((v.straightness ?? 0) * 9), 0, 9), reach: v.top_v != null && v.top_v <= 0.45 ? 1 : 0 })),
    },
    j: R.head_life_joined == null ? null : R.head_life_joined ? 1 : 0,
  };
}
const D = (n) => (n == null || n < 0 ? '-' : String(n));
export function encodeLines(p) {
  const { heart, head, life, fate } = p.L;
  return (heart ? D(heart.len) + D(heart.cur) + D(heart.zone) : '---')
    + (head ? D(head.len) + D(head.cur) + B36[Math.floor((head.ang + 30) / 36)] + B36[(head.ang + 30) % 36] : '----')
    + (life ? D(life.len) + D(life.cur) + B36[life.aw] : '---')
    + (fate ? D(fate.len) + D(fate.cur) + D(fate.reach) : '---')
    + (p.j == null ? '-' : String(p.j));
}
export const PROFILE_RE = /^([0-9-]{2}[0-3-]|---)([0-9-]{2}[0-9a-z]{2}|----)([0-9-]{2}[0-9a-z]|---)([0-9-]{2}[01-]|---)[01-]$/;
export function decodeLines(str) {
  const m = PROFILE_RE.exec(str || '');
  if (!m) return null;
  const n = (c) => (c === '-' ? null : Number(c));
  const [, h, d, l, f] = m;
  const L = {
    heart: h === '---' ? null : { len: n(h[0]), cur: n(h[1]), zone: n(h[2]) },
    head: d === '----' ? null : { len: n(d[0]), cur: n(d[1]), ang: B36.indexOf(d[2]) * 36 + B36.indexOf(d[3]) - 30 },
    life: l === '---' ? null : { len: n(l[0]), cur: n(l[1]), aw: B36.indexOf(l[2]) },
    fate: f === '---' ? null : { len: n(f[0]), cur: n(f[1]), reach: n(f[2]) },
  };
  if (L.heart && (L.heart.len == null || L.heart.zone == null)) L.heart = null;
  if (L.head && (L.head.len == null || L.head.ang < -30 || L.head.ang > 41)) L.head = null;
  if (L.life && (L.life.len == null || L.life.aw < 0 || L.life.aw > 35)) L.life = null;
  if (L.fate && (L.fate.len == null || L.fate.reach == null)) L.fate = null;
  const j = str[str.length - 1];
  return { L, j: j === '-' ? null : Number(j) };
}

// ---------------------------------------------------------------- 손금 한 줄 설명 (짧게)
const lenWord = (d) => t(`cmp.len.${d >= 7 ? 'long' : d <= 3 ? 'short' : 'mid'}`);
export function describeLine(k, d) {
  if (!d) return { len: 0, text: t('cmp.line_missing') };
  let extra = '';
  if (k === 'heart') extra = t('cmp.heart_end', { zone: zoneName(d.zone) });
  else if (k === 'head') extra = t(`cmp.head.${d.cur >= 7 ? 'curvy' : d.cur <= 3 ? 'straight' : 'slight'}`);
  else if (k === 'life') extra = t(`cmp.life.${d.cur >= 7 ? 'wide' : d.cur <= 3 ? 'narrow' : 'mid'}`);
  else extra = t(`cmp.fate.${d.reach ? 'reach' : 'mid'}`);
  return { len: d.len + 1, text: `${lenWord(d.len)} · ${extra}` };
}

// ---------------------------------------------------------------- 규칙 기반 궁합
// me, friend: { t, s:[4], L?, j? }.  선 정보(L)가 없으면(예전 링크) 유형·별점 규칙만 쓴다.
export function compareProfiles(me, fr) {
  const C = RULES.compatibility, items = [];
  const add = (id, pts, lines, labelKey) => items.push({ id, pts, lines, label: t(`cmp.chip.${labelKey}`), text: reasonText(id) });
  const has = (p) => p && p.L;
  if (has(me) && has(fr)) {
    const hz = [me.L.heart?.zone, fr.L.heart?.zone];
    if (hz[0] != null && hz[1] != null) {
      const d = Math.abs(hz[0] - hz[1]);
      if (d === 0) add('compat_heart_same', C.heart_same, ['heart'], 'heart_same');
      else if (d === 1) add('compat_heart_near', C.heart_near, ['heart'], 'heart_near');
    }
    if (me.L.head && fr.L.head) {
      const d = Math.abs(me.L.head.ang - fr.L.head.ang);
      if (d < 8) add('compat_head_similar', C.head_similar, ['head'], 'head_similar');
      else if (d > 20) add('compat_head_complement', C.head_complement, ['head'], 'head_complement');
    }
    if (me.L.life && fr.L.life && Math.abs(me.L.life.aw - fr.L.life.aw) / 20 < 0.1) add('compat_life_similar', C.life_similar, ['life'], 'life_similar');
    if (me.j != null && fr.j != null) {
      if (me.j === fr.j) add('compat_junction_same', C.junction_same, ['head', 'life'], 'junction_same');
      else add('compat_junction_mix', C.junction_mix, ['head', 'life'], 'junction_mix');
    }
  }
  const ea = elementOf(me.t), eb = elementOf(fr.t), pair = pairBonus(ea, eb);
  if (ea === eb) add('compat_same_element', C.same_element, [], 'same_element');
  else if (pair) add('compat_element_pair', pair, [], pair >= 8 ? 'pair_top' : 'pair');
  if (me.s && fr.s) {
    const n = me.s.filter((v, i) => Math.abs(v - fr.s[i]) >= 2).length;
    if (n) add('compat_luck_complement', C.luck_complement * Math.min(n, 2), [], 'luck_complement');
  }
  const raw = C.base + items.reduce((a, i) => a + i.pts, 0);
  const score = Math.round(Math.max(C.floor, Math.min(100, raw)));
  if (!items.length) items.push({ id: 'compat_default', pts: 0, lines: [], label: t('cmp.chip.default'), text: reasonText('compat_default') });
  const msg = t(`cmp.msg.${score >= 90 ? 90 : score >= 80 ? 80 : score >= 70 ? 70 : 60}`);
  items.sort((a, b) => b.pts - a.pts);
  const calc = `${t('calc.base', { v: C.base })} ${items.filter((i) => i.pts).map((i) => t('calc.plus', { name: i.label, v: i.pts })).join(' ')} = ${raw}${raw !== score ? ` → ${score}` : ''}`;
  return { score, msg, items, calc, base: C.base, mate: pairBonus(ea, eb) >= Math.max(...Object.values(C.element_pairs)) && ea !== eb };
}
