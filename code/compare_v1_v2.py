"""Merge v1/v2 per-class eval CSVs (both evaluated on the v2 val labels) -> compare CSV, and decide which model is better.
Usage: python code/compare_v1_v2.py --v1 logs/v2/eval_v1_on_v2val.csv --v2 logs/v2/eval_v2_on_v2val.csv --out logs/v2/compare_v1_v2.csv
Prints 'WINNER=v1' or 'WINNER=v2' as the last line and writes <out>.winner.json.
Decision: mean of 4 class-averaged scores (mask mAP50, mask mAP50-95, pixel IoU, tol5 F1); v2 wins only if strictly higher."""
import csv, json, argparse
ap = argparse.ArgumentParser(); ap.add_argument("--v1", required=True); ap.add_argument("--v2", required=True); ap.add_argument("--out", required=True)
a = ap.parse_args()
M = ["mask_mAP50", "mask_mAP50-95", "pixel_IoU", "pixel_Dice", "tol5_F1", "box_mAP50", "box_mAP50-95", "tol5_precision", "tol5_recall"]
KEY = ["mask_mAP50", "mask_mAP50-95", "pixel_IoU", "tol5_F1"]
def load(p): return {r["class"]: r for r in csv.DictReader(open(p))}
v1, v2 = load(a.v1), load(a.v2)
f = lambda r, m: float(r[m]) if r.get(m) not in (None, "") else None
rows = []
for c in v1:
    row = {"class": c}
    for m in M:
        x, y = f(v1[c], m), f(v2.get(c, {}), m)
        row[f"v1_{m}"] = x; row[f"v2_{m}"] = y; row[f"delta_{m}"] = None if x is None or y is None else round(y - x, 4)
    rows.append(row)
with open(a.out, "w", newline="") as fh:
    w = csv.DictWriter(fh, list(rows[0].keys())); w.writeheader(); w.writerows(rows)
s1 = sum(f(v1["all"], m) for m in KEY) / len(KEY); s2 = sum(f(v2["all"], m) for m in KEY) / len(KEY)
wins = sum(f(v2["all"], m) > f(v1["all"], m) for m in KEY)
winner = "v2" if s2 > s1 else "v1"
json.dump({"criterion": "mean of class-avg " + ", ".join(KEY), "v1_score": round(s1, 4), "v2_score": round(s2, 4),
           "v2_wins_on": f"{wins}/{len(KEY)}", "winner": winner}, open(a.out + ".winner.json", "w"), indent=1)
print(open(a.out).read()); print(open(a.out + ".winner.json").read())
print(f"WINNER={winner}")
