"""Type / star distribution of a calibration file on a features jsonl (per source too).
  python interpret/refset/eval_calib.py --calib interpret/calibration.yaml --features data/refset/combined.jsonl"""
import argparse, collections, json, sys
from pathlib import Path
import yaml
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import interpret as I
ap = argparse.ArgumentParser(); ap.add_argument("--calib", required=True); ap.add_argument("--features", required=True); ap.add_argument("--json")
a = ap.parse_args()
rules = yaml.safe_load(I.RULES_PATH.read_text()); calib = yaml.safe_load(Path(a.calib).read_text())
rows = [json.loads(l) for l in open(a.features)]
res = collections.defaultdict(lambda: {"types": collections.Counter(), "stars": collections.defaultdict(collections.Counter), "n": 0})
for r in rows:
    l = I.score_lucks(r, rules, calib); t = I.score_types(r, l, rules, calib)[0]["id"]
    for g in ("all", r.get("source", "?")):
        res[g]["n"] += 1; res[g]["types"][t] += 1
        for k, v in l.items(): res[g]["stars"][k][v["stars"]] += 1
ids = [t["id"] for t in rules["types"]]
out = {g: {"n": d["n"], "types": {i: d["types"].get(i, 0) for i in ids}, "stars": {k: dict(sorted(c.items())) for k, c in d["stars"].items()}} for g, d in res.items()}
print(json.dumps(out, ensure_ascii=False))
if a.json: Path(a.json).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
