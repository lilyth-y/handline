// 손금 해석 — faithful JS port of interpret/interpret.py driven by rules.js + calib.js (generated data).
import { RULES } from './rules.js';
import { CALIB } from './calib.js';
import { MISSING, NS, parse, evaluate, pyMin, pyMax, pyAbs, truthy } from './expr.js';

const astCache = new Map();
const ast = (e) => { if (!astCache.has(e)) astCache.set(e, parse(e)); return astCache.get(e); };
const round = (v, d) => { const f = 10 ** d; return Math.round(v * f) / f; };

export function makePct(feat, calib = CALIB) {
  const L = feat.lines, quant = (calib && calib.quantiles) || {};
  return (key) => {
    const [obj, attr] = key.split('.');
    const src = obj in L ? L[obj] : obj === 'rel' ? feat.relations || {} : null;
    const val = src == null ? null : src[attr];
    if (val === null || val === undefined || (typeof val === 'boolean' && obj !== 'rel')) return 0.0;
    const qs = quant[key];
    if (!qs) return 0.5;
    const v = Number(val);
    if (v <= qs[0]) return 0.0;
    if (v >= qs[qs.length - 1]) return 1.0;
    for (let i = 0; i < qs.length - 1; i++) if (qs[i] <= v && v <= qs[i + 1]) {
      const span = qs[i + 1] - qs[i];
      return (span > 0 ? i + (v - qs[i]) / span : i + 0.5) / (qs.length - 1);
    }
    return 0.5;
  };
}

function namespace(feat, calib, extra) {
  const L = feat.lines, pct = makePct(feat, calib);
  return { heart: new NS(L.heart), head: new NS(L.head), life: new NS(L.life), fate: new NS(L.fate),
    rel: new NS(feat.relations), palm: new NS(feat.palm), pct, abs: pyAbs, min: pyMin, max: pyMax, MISSING, ...(extra || {}) };
}

function ev(expr, env) {
  if (typeof expr === 'number') return expr;
  const v = evaluate(ast(expr), env);
  return v === MISSING ? 0 : v;
}

export function scoreLucks(feat, rules = RULES, calib = CALIB) {
  const env = namespace(feat, calib), out = {};
  for (const [key, spec] of Object.entries(rules.lucks)) {
    let raw = Number(spec.base ?? 3.0); const fired = [];
    for (const r of spec.rules) if (truthy(ev(r.when, env))) { raw += r.add; fired.push([r.add, r.id, r.reason]); }
    const stars = Math.trunc(Math.max(1, Math.min(5, Math.floor(raw + 0.5))));
    fired.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    let reasons = [...new Set(fired.filter((f) => f[0] >= 0).map((f) => f[2]))].slice(0, 2);
    if (!reasons.length) reasons = [spec.default_reason];
    out[key] = { label: spec.label, base: Number(spec.base ?? 3.0), stars, raw: round(raw, 2), reasons, rules_fired: fired.map((f) => f[1]),
      fired: fired.map((f) => ({ add: f[0], id: f[1], reason: f[2] })) };
  }
  return out;
}

export function scoreTypes(feat, lucks, rules = RULES, calib = CALIB) {
  const stars = new NS(Object.fromEntries(Object.entries(lucks).map(([k, v]) => [k, (v.stars - 1) / 4])));
  const env = namespace(feat, calib, { stars }), sig = {};
  for (const [name, expr] of Object.entries(rules.signals)) sig[name] = Number(ev(expr, env));
  const bias = (calib && calib.type_bias) || {};
  const scores = rules.types.map((t, i) => {
    const s = Object.entries(t.weights).reduce((a, [n, w]) => a + w * sig[n], 0) + (bias[t.id] ?? 0.0);
    return [round(s, 4), -i, t];
  });
  scores.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const best = scores[0][2];
  const top = Object.entries(best.weights).map((kv, i) => [kv, i]).sort((a, b) => (-a[0][1] * sig[a[0][0]]) - (-b[0][1] * sig[b[0][0]]) || a[1] - b[1]);
  return [{ id: best.id, name: best.name, element: best.element, keyword: best.keyword, score: scores[0][0],
    why_signals: top.slice(0, 3).map((x) => x[0][0]), ranking: scores.slice(0, 3).map((s) => [s[2].id, s[0]]) }, sig];
}

export function interpret(feat, rules = RULES, calib = CALIB) {
  const lucks = scoreLucks(feat, rules, calib);
  const [type, sig] = scoreTypes(feat, lucks, rules, calib);
  const rt = rules.reasons;
  return {
    image: feat.image, type,
    lucks: Object.fromEntries(Object.entries(lucks).map(([k, v]) => [k, { ...v, reason_texts: v.reasons.map((r) => rt[r] ?? r) }])),
    signals: Object.fromEntries(Object.entries(sig).map(([k, v]) => [k, round(v, 3)])),
    disclaimer: rules.disclaimer,
  };
}

export function compatibility(fa, fb, rules = RULES, calib = CALIB) {
  const ra = interpret(fa, rules, calib), rb = interpret(fb, rules, calib), C = rules.compatibility;
  let score = Number(C.base); const reasons = [];
  const ln = (f, k) => f.lines[k] || {};
  const order = ['ring', 'middle', 'index_middle', 'index'];
  const za = ln(fa, 'heart').end_zone, zb = ln(fb, 'heart').end_zone;
  if (order.includes(za) && order.includes(zb)) {
    const d = Math.abs(order.indexOf(za) - order.indexOf(zb));
    if (d === 0) { score += C.heart_same; reasons.push('compat_heart_same'); } else if (d === 1) { score += C.heart_near; reasons.push('compat_heart_near'); }
  }
  const aa = ln(fa, 'head').angle_deg, ab = ln(fb, 'head').angle_deg;
  if (aa != null && ab != null) {
    const diff = Math.abs(aa - ab);
    if (diff < 8) { score += C.head_similar; reasons.push('compat_head_similar'); } else if (diff > 20) { score += C.head_complement; reasons.push('compat_head_complement'); }
  }
  const wa = ln(fa, 'life').arc_width, wb = ln(fb, 'life').arc_width;
  if (wa != null && wb != null && Math.abs(wa - wb) < 0.1) { score += C.life_similar; reasons.push('compat_life_similar'); }
  const ja = fa.relations.head_life_joined, jb = fb.relations.head_life_joined;
  if (ja != null && jb != null) {
    if (ja === jb) { score += C.junction_same; reasons.push('compat_junction_same'); } else { score += C.junction_mix; reasons.push('compat_junction_mix'); }
  }
  const ea = ra.type.element, eb = rb.type.element;
  const pair = C.element_pairs[`${ea}-${eb}`] || C.element_pairs[`${eb}-${ea}`];
  if (ea === eb) { score += C.same_element; reasons.push('compat_same_element'); } else if (pair) { score += pair; reasons.push('compat_element_pair'); }
  const comp = Object.keys(ra.lucks).filter((k) => Math.abs(ra.lucks[k].stars - rb.lucks[k].stars) >= 2).length;
  if (comp) { score += C.luck_complement * Math.min(comp, 2); reasons.push('compat_luck_complement'); }
  score = Math.round(Math.max(C.floor, Math.min(100, score)));   // NB: python round() is banker's; scores are integers here
  return { score, type_a: ra.type.name, type_b: rb.type.name, reasons: reasons.length ? reasons : ['compat_default'],
    reason_texts: (reasons.length ? reasons : ['compat_default']).map((r) => rules.reasons[r] ?? r) };
}
