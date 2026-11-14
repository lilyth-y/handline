// node tests/evidence_parity.mjs [features.jsonl] — JS 별점 근거 vs python interpret.py (same features)
// python: /tmp/pyv/bin/python (needs pyyaml). Checks stars, raw, rules_fired, and that the first evidence
// items reproduce python's `reasons` (or the default reason when nothing positive fired).
import fs from 'fs'; import { execFileSync } from 'child_process';
import { interpret } from '../public/js/interpret.js';
import { luckEvidence } from '../public/js/evidence.js';
const F = process.argv[2] || '/workspace/palm-ai/interpret/calib/val_features_v2.jsonl';
const PY = process.env.PY || '/tmp/pyv/bin/python';
const feats = fs.readFileSync(F, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const py = JSON.parse(execFileSync(PY, [new URL('./py_interpret.py', import.meta.url).pathname, F], { maxBuffer: 1 << 28 }).toString());
let bad = 0, n = 0, missingMeaning = new Set();
for (let i = 0; i < feats.length; i++) {
  const js = interpret(feats[i]), p = py[i];
  if (js.type.id !== p.type.id) { bad++; console.log('TYPE', feats[i].image, js.type.id, p.type.id); }
  for (const k of Object.keys(p.lucks)) {
    n++;
    const a = js.lucks[k], b = p.lucks[k], ev = luckEvidence(k, a, feats[i]);
    const evReasons = ev.isDefault ? [b.reasons[0]] : ev.items.slice(0, 2).map((x) => x.reason);
    const ok = a.stars === b.stars && a.raw === b.raw && a.rules_fired.join() === b.rules_fired.join() && evReasons.join() === b.reasons.join();
    ev.items.forEach((x) => { if (!x.meaning) missingMeaning.add(k + ':' + x.id); });
    if (!ok) { bad++; console.log('MISMATCH', feats[i].image, k, { js: [a.stars, a.raw, a.rules_fired, evReasons], py: [b.stars, b.raw, b.rules_fired, b.reasons] }); }
  }
}
console.log(JSON.stringify({ images: feats.length, luck_checks: n, mismatches: bad, missing_meaning: [...missingMeaning] }));
process.exit(bad || missingMeaning.size ? 1 : 0);
