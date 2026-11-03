"""Extract features for many images -> jsonl (single process, 2 threads)."""
import argparse, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import extract_features, load_model

ap = argparse.ArgumentParser()
ap.add_argument("--images", default="data/palm_lines_yolo/images/val")
ap.add_argument("--out", default="interpret/calib/val_features.jsonl")
ap.add_argument("--model", default=None)
ap.add_argument("--limit", type=int, default=0)
a = ap.parse_args()
model, mp = load_model(a.model)
files = sorted(p for p in Path(a.images).iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
if a.limit:
    files = files[: a.limit]
with open(a.out, "w") as f:
    for i, p in enumerate(files):
        try:
            d = extract_features(p, model)
        except Exception as e:  # keep going
            print("ERR", p, e, flush=True); continue
        f.write(json.dumps(d, ensure_ascii=False) + "\n"); f.flush()
        print(i, p.name, flush=True)
