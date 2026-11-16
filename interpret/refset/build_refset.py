"""Build the percentile reference set (calibration set) from browser-pipeline features.

Inputs (git-ignored, under data/refset/; see interpret/refset/README.md):
  plsu.jsonl        all 1,039 PLSU palm crops      (web/tools/batch_features.mjs)
  11k.jsonl         all 5,396 palmar 11K Hands photos, subject = "<id>_<left|right>"
  plsu_to_11k.json  PLSU photo -> its 11K source photo (match_plsu_11k.py)
PLSU was cut from 11K Hands, so both sources are the SAME 189 people. To avoid counting a
photo twice and to stop people with many shots from dominating, the unit is the HAND
(person + left/right): each hand contributes at most --cap distinct photos. A photo that has a
PLSU crop uses the crop features (closer to a phone close-up) and is picked first; the rest are
filled evenly (by file name) from that hand's other 11K photos.
Filters: extraction error, fewer than --min_lines principal lines detected.
Writes data/refset/combined.jsonl and interpret/refset/summary.json.
"""
import argparse, collections, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "data/refset"
ap = argparse.ArgumentParser()
ap.add_argument("--min_lines", type=int, default=2)
ap.add_argument("--cap", type=int, default=6)
ap.add_argument("--max_match_d", type=float, default=5.0)
ap.add_argument("--out", default=str(D / "combined.jsonl"))
ap.add_argument("--summary", default=str(ROOT / "interpret/refset/summary.json"))
a = ap.parse_args()

nlines = lambda r: sum(1 for v in r.get("lines", {}).values() if v.get("present"))
match = json.loads((D / "plsu_to_11k.json").read_text())
side = lambda s: "left" if "left" in s else "right"
summary, pools = {}, collections.defaultdict(lambda: {"plsu": [], "11k": []})
for src in ("plsu", "11k"):
    rows = [json.loads(l) for l in open(D / f"{src}.jsonl") if l.strip()]
    s = collections.Counter(total=len(rows))
    for r in rows:
        if "error" in r: s["error"] += 1; continue
        if nlines(r) < a.min_lines: s[f"lt{a.min_lines}_lines"] += 1; continue
        if src == "plsu":
            m = match.get(Path(r["image"]).stem)
            if not m or m["d"] > a.max_match_d: s["unmatched"] += 1; continue
            r["hand"], r["k11"] = f'{m["id"]}_{side(m["side"])}', m["k11"]
        else:
            r["hand"], r["k11"] = r["subject"], r["image"]
        s["usable"] += 1
        pools[r["hand"]][src].append(r)
    summary[src] = dict(s)

keep, picked_src = [], collections.Counter()
for hand, p in sorted(pools.items()):
    sel = sorted(p["plsu"], key=lambda r: r["image"])[: a.cap]
    used = {r["k11"] for r in sel}
    rest = sorted((r for r in p["11k"] if r["k11"] not in used), key=lambda r: r["image"])
    need = min(a.cap - len(sel), len(rest))
    if need > 0:
        idx = sorted({round(i * (len(rest) - 1) / max(1, need - 1)) for i in range(need)}) if need > 1 else [len(rest) // 2]
        sel += [rest[i] for i in idx]
    for r in sel: picked_src[r["source"]] += 1
    keep += sel
per_hand = collections.Counter(r["hand"] for r in keep)
summary["combined"] = {
    "n_images": len(keep), "by_source": dict(picked_src), "persons": len({h.split("_")[0] for h in per_hand}),
    "hands": len(per_hand), "images_per_hand": dict(sorted(collections.Counter(per_hand.values()).items())),
    "cap_per_hand": a.cap, "min_lines": a.min_lines,
    "lines_hist": dict(sorted(collections.Counter(nlines(r) for r in keep).items())),
}
Path(a.out).write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in keep))
Path(a.summary).write_text(json.dumps(summary, indent=1, ensure_ascii=False) + "\n")
print(json.dumps(summary, indent=1))
