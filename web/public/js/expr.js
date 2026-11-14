// Tiny safe evaluator for the Python-subset expressions in rules.yaml (no eval / Function).
// Supports: literals, names, attribute access, calls, unary -/not, * /, + -, comparisons (chained),
// and/or (Python short-circuit semantics), "a if cond else b". Mirrors interpret.py's _Missing class.
export const MISSING = Object.freeze({ __missing: true, toString: () => 'Missing' });
const isM = (v) => v === MISSING;
export class NS { constructor(d) { this._d = d || {}; } get(k) { const v = this._d[k]; return v === undefined || v === null ? MISSING : v; } }

export const truthy = (v) => !(isM(v) || v === false || v === 0 || v === '' || v === null || v === undefined);
const num = (v) => (typeof v === 'boolean' ? Number(v) : v);
function eq(a, b) {
  if (isM(a) || isM(b)) return false;
  if (typeof a === typeof b) return a === b;
  if ((typeof a === 'number' || typeof a === 'boolean') && (typeof b === 'number' || typeof b === 'boolean')) return num(a) === num(b);
  return false;
}
function cmp(op, a, b) {
  if (op === '==') return eq(a, b);
  if (op === '!=') return !eq(a, b);
  if (isM(a) || isM(b)) return false;
  a = num(a); b = num(b);
  return op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
}
function arith(op, a, b) {
  if (isM(a) || isM(b)) return MISSING;
  a = num(a); b = num(b);
  if (op === '/' && b === 0) throw new Error('ZeroDivisionError');
  return op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b;
}
// python min/max over args: keep first, replace when item < / > current
export const pyMin = (...xs) => xs.reduce((c, x) => (cmp('<', x, c) ? x : c));
export const pyMax = (...xs) => xs.reduce((c, x) => (cmp('>', x, c) ? x : c));
export const pyAbs = (x) => (isM(x) ? MISSING : Math.abs(num(x)));

// ---------------------------------------------------------------- tokenizer
const KW = new Set(['and', 'or', 'not', 'if', 'else', 'True', 'False', 'None']);
function tokenize(s) {
  const t = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      let j = i; while (j < s.length && /[0-9.eE]/.test(s[j])) j++;
      t.push({ k: 'num', v: parseFloat(s.slice(i, j)) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      const w = s.slice(i, j); t.push(KW.has(w) ? { k: 'kw', v: w } : { k: 'id', v: w }); i = j; continue;
    }
    if (c === "'" || c === '"') { const j = s.indexOf(c, i + 1); if (j < 0) throw new Error('bad string'); t.push({ k: 'str', v: s.slice(i + 1, j) }); i = j + 1; continue; }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '<=', '>='].includes(two)) { t.push({ k: 'op', v: two }); i += 2; continue; }
    if ('<>+-*/().,'.includes(c)) { t.push({ k: 'op', v: c }); i++; continue; }
    throw new Error('bad char ' + c + ' in ' + s);
  }
  return t;
}

// ---------------------------------------------------------------- parser -> AST
export function parse(src) {
  const t = tokenize(String(src)); let p = 0;
  const peek = (k, v) => t[p] && t[p].k === k && (v === undefined || t[p].v === v);
  const take = (k, v) => { if (!peek(k, v)) throw new Error(`expected ${v ?? k} in ${src}`); return t[p++]; };
  const ternary = () => {
    const a = orE();
    if (peek('kw', 'if')) { p++; const c = orE(); take('kw', 'else'); const b = ternary(); return { t: 'if', c, a, b }; }
    return a;
  };
  const orE = () => { let a = andE(); while (peek('kw', 'or')) { p++; a = { t: 'or', a, b: andE() }; } return a; };
  const andE = () => { let a = notE(); while (peek('kw', 'and')) { p++; a = { t: 'and', a, b: notE() }; } return a; };
  const notE = () => (peek('kw', 'not') ? (p++, { t: 'not', a: notE() }) : cmpE());
  const cmpE = () => {
    const first = add(), ops = [], rest = [];
    while (t[p] && t[p].k === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(t[p].v)) { ops.push(t[p++].v); rest.push(add()); }
    return ops.length ? { t: 'cmp', first, ops, rest } : first;
  };
  const add = () => { let a = mul(); while (peek('op', '+') || peek('op', '-')) { const o = t[p++].v; a = { t: 'bin', o, a, b: mul() }; } return a; };
  const mul = () => { let a = unary(); while (peek('op', '*') || peek('op', '/')) { const o = t[p++].v; a = { t: 'bin', o, a, b: unary() }; } return a; };
  const unary = () => (peek('op', '-') ? (p++, { t: 'neg', a: unary() }) : postfix());
  const postfix = () => {
    let a = atom();
    for (;;) {
      if (peek('op', '.')) { p++; a = { t: 'attr', a, n: take('id').v }; }
      else if (peek('op', '(')) {
        p++; const args = [];
        if (!peek('op', ')')) { args.push(ternary()); while (peek('op', ',')) { p++; args.push(ternary()); } }
        take('op', ')'); a = { t: 'call', f: a, args };
      } else return a;
    }
  };
  const atom = () => {
    const k = t[p];
    if (!k) throw new Error('unexpected end in ' + src);
    if (k.k === 'num' || k.k === 'str') { p++; return { t: 'lit', v: k.v }; }
    if (k.k === 'kw' && (k.v === 'True' || k.v === 'False')) { p++; return { t: 'lit', v: k.v === 'True' }; }
    if (k.k === 'kw' && k.v === 'None') { p++; return { t: 'lit', v: MISSING }; }
    if (k.k === 'id') { p++; return { t: 'name', n: k.v }; }
    if (peek('op', '(')) { p++; const e = ternary(); take('op', ')'); return e; }
    throw new Error('unexpected token ' + JSON.stringify(k) + ' in ' + src);
  };
  const e = ternary();
  if (p !== t.length) throw new Error('trailing tokens in ' + src);
  return e;
}

export function evaluate(n, env) {
  switch (n.t) {
    case 'lit': return n.v;
    case 'name': if (!(n.n in env)) throw new Error('unknown name ' + n.n); return env[n.n];
    case 'attr': { const o = evaluate(n.a, env); return o instanceof NS ? o.get(n.n) : MISSING; }
    case 'call': { const f = evaluate(n.f, env); if (typeof f !== 'function') throw new Error('not callable'); return f(...n.args.map((a) => evaluate(a, env))); }
    case 'neg': { const v = evaluate(n.a, env); return isM(v) ? MISSING : -num(v); }
    case 'not': return !truthy(evaluate(n.a, env));
    case 'and': { const a = evaluate(n.a, env); return truthy(a) ? evaluate(n.b, env) : a; }
    case 'or': { const a = evaluate(n.a, env); return truthy(a) ? a : evaluate(n.b, env); }
    case 'if': return truthy(evaluate(n.c, env)) ? evaluate(n.a, env) : evaluate(n.b, env);
    case 'bin': return arith(n.o, evaluate(n.a, env), evaluate(n.b, env));
    case 'cmp': {
      let left = evaluate(n.first, env);
      for (let i = 0; i < n.ops.length; i++) { const right = evaluate(n.rest[i], env); if (!cmp(n.ops[i], left, right)) return false; left = right; }
      return true;
    }
  }
  throw new Error('bad node ' + n.t);
}
