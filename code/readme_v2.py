"""Append/replace the 'Results (v2)' section of README.md using numbers read from files.
python code/readme_v2.py --compare logs/v2/compare_v1_v2.csv --demo interpret/demo_v2 --interp_model weights/v2/best.pt"""
import csv, json, re, os, argparse, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
ap = argparse.ArgumentParser()
ap.add_argument("--compare", default="logs/v2/compare_v1_v2.csv"); ap.add_argument("--demo", default="interpret/demo")
ap.add_argument("--interp_model", default="weights/best.pt"); ap.add_argument("--readme", default="README.md")
ap.add_argument("--train_log", default="logs/v2/train_stdout.log"); ap.add_argument("--results", default="logs/v2/results.csv")
a = ap.parse_args()
ds = json.load(open("logs/relabel/v2_dataset_stats.json")); rl = ds["relabel"]; fr = rl["full_run_api"]; al = rl["all_relabel_api_incl_pilots_probes"]
fs = json.load(open("logs/relabel/full_stats.json"))
cmp_rows = list(csv.DictReader(open(a.compare))); win = json.load(open(a.compare + ".winner.json"))
res = [{k.strip(): v for k, v in r.items()} for r in csv.DictReader(open(a.results))]
last = res[-1]
secs = None
if os.path.exists(a.train_log):
    m = re.findall(r"TRAINING_DONE (\d+)s", open(a.train_log, errors="ignore").read())
    secs = int(m[-1]) if m else None
wl = list(csv.DictReader(open("logs/v2/weights_log.csv")))
best = [r for r in wl if r["file"] == "best.pt"][-1]
f3 = lambda x: "" if x in (None, "") else f"{float(x):.3f}"
L = ["<!-- v2-start -->", f"## Results (v2, AI-relabelled data, {time.strftime('%Y-%m-%d')})", "",
     "### Method: AI relabelling (`code/ai_relabel.py`)",
     "Same PLSU images, human line masks, crop and train/val split (884/155) as v1. Only the per-line class assignment changed.",
     "Each GT mask is skeletonized and split into numbered segments. The palm is rendered with coloured, numbered segments, and a vision LLM returns JSON "
     "mapping segment to heart/head/life/fate/other. GT pixels take the class of the nearest labelled segment.",
     f"- Model: `{rl['model']}` via {rl['endpoint']}",
     f"- Run: `{rl['args']}`",
     f"- Policy `{fs.get('policy', 'hybrid')}`: keep the v1 teacher's heart/head/life segments. The VLM decides segments the teacher left unlabelled and the heuristic fate segments.",
     f"- Images labelled: {rl['images_labelled']} (`full_stats.json`: calls_ok {fs['calls_ok']}, failed {len(fs['failed'])})",
     f"- API totals, full run: {fr['http_requests']} HTTP requests ({', '.join(f'{k}: {v}' for k, v in fr['status'].items())}), "
     f"{fr['prompt_tokens']:,} prompt + {fr['completion_tokens']:,} completion tokens ({fr['reasoning_tokens']:,} reasoning)",
     f"- API totals including pilots and probes: {al['http_requests']} requests, {al['prompt_tokens']:,} prompt + {al['completion_tokens']:,} completion tokens",
     f"- Raw request/response logs: `logs/relabel/*.jsonl`. Stats: `logs/relabel/full_stats.json`, `logs/relabel/v2_dataset_stats.json`",
     f"- Skeleton-pixel agreement of the v2 labels with v1: {rl['final_vs_v1_skeleton_agreement']:.3f}",
     "", "| class | v1 instances | v2 instances |", "|---|---|---|"]
L += [f"| {c} | {ds['v1_instances'][c]} | {ds['instances'][c]} |" for c in ds["instances"]]
L += ["", "### Training", f"YOLO11n-seg, `configs/train_v2.yaml` (identical to v1 except data), {last['epoch']} epochs, CPU"
      + (f", {secs:,}s (~{secs/60:.0f} min)" if secs else "") + ".",
      f"Last epoch: train seg loss {float(last['train/seg_loss']):.3f}, val seg loss {float(last['val/seg_loss']):.3f}, val mask mAP50 {float(last['metrics/mAP50(M)']):.3f}. "
      f"best.pt is from epoch {best['epoch']} (fitness {best['fitness']}). Logs are in `logs/v2/` (results.csv, TensorBoard, weights_log.csv).",
      "", "### v1 vs v2 on the v2 val labels (155 images, conf 0.25)", f"`logs/v2/compare_v1_v2.csv` (computed by `code/evaluate.py`, then `code/compare_v1_v2.py`)", "",
      "| class | mask mAP50 v1 / v2 | mask mAP50-95 v1 / v2 | pixel IoU v1 / v2 | tol5 F1 v1 / v2 |", "|---|---|---|---|---|"]
for r in cmp_rows:
    L.append(f"| {r['class']}{' (class mean for pixel/F1)' if r['class']=='all' else ''} | " + " | ".join(f"{f3(r['v1_'+m])} / {f3(r['v2_'+m])}" for m in ["mask_mAP50", "mask_mAP50-95", "pixel_IoU", "tol5_F1"]) + " |")
L += ["", f"Decision ({win['criterion']}): v1 {win['v1_score']}, v2 {win['v2_score']}. v2 is higher on {win['v2_wins_on']} of these metrics. **Better: {win['winner']}**.",
      "Caveat: these val labels are the AI relabels v2 was trained on, so v1 (trained on teacher pseudo-labels) is at a built-in disadvantage. Neither set of labels is human per-line annotation."]
td = os.path.join(a.demo, "type_distribution.json")
L += ["", "### Stage-2 interpretation", f"`interpret/` now uses **`{a.interp_model}`**" + (" (`interpret/features.py` default; calibration.yaml recalibrated on v2 features, v1 calibration saved as `interpret/calibration_v1.yaml`)." if "v2" in a.interp_model else " (v1 kept, since v2 was not better)." )]
if os.path.exists(td):
    t = json.load(open(td))
    L += [f"Demo type distribution (`{a.demo}/`, n={t['n']}): " + ", ".join(f"{k} {v}" for k, v in t["types"].items())]
L += ["", "Artifacts: `weights/v2/best.pt`, `weights/v2/best.onnx`, overlays `samples/v2/` (`v2_pred_*` = v2, `v1_pred_*` = v1, same images; left = v2 label, right = prediction), "
      "eval plots `logs/v2/eval_plots_v2/`, `logs/v2/eval_plots_v1/`.", "<!-- v2-end -->", ""]
txt = open(a.readme).read()
txt = re.sub(r"\n?<!-- v2-start -->.*?<!-- v2-end -->\n?", "\n", txt, flags=re.S).rstrip("\n") + "\n\n" + "\n".join(L)
open(a.readme, "w").write(txt); print("\n".join(L))
