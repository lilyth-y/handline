"""Pull anonymous user measurements (Supabase table public.palm_features) and turn them into a calibrate.py
features jsonl — optionally mixed with the lab reference set — then (optionally) run calibrate.py.

Rows contain numbers only (line features, stars, type, image size, versions, date). No photos are ever stored.

Secrets: the service key is read from the environment and never written anywhere.
  export SUPABASE_URL=https://fxyffslmgnxznptbobee.supabase.co            # default
  export SUPABASE_SERVICE_KEY=...   # Dashboard > Project Settings > API Keys > secret (sb_secret_...) or legacy service_role
The public (publishable) key cannot read the table (RLS: anon = INSERT only), so a server-side key is required.

Examples:
  python interpret/refset/export_user_features.py                                  # pull + stats only
  python interpret/refset/export_user_features.py --mix lab --calibrate             # user + lab -> interpret/calibration_user.yaml
  python interpret/refset/export_user_features.py --mix none --calibrate --out interpret/calibration.yaml  # adopt
  python interpret/refset/export_user_features.py --rows-json rows.json             # offline: rows exported elsewhere
"""
import argparse, collections, json, os, random, subprocess, sys, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--url", default=os.environ.get("SUPABASE_URL", "https://fxyffslmgnxznptbobee.supabase.co"))
ap.add_argument("--table", default="palm_features")
ap.add_argument("--rows-json", help="read rows from a JSON array / jsonl file instead of Supabase (no key needed)")
ap.add_argument("--model-version", default="palm-v2-onnx", help="only rows measured with this model (features change with the model)")
ap.add_argument("--feature-version", type=int, default=1)
ap.add_argument("--since", help="YYYY-MM-DD: only rows on/after this date")
ap.add_argument("--min-lines", type=int, default=2, help="drop rows with fewer detected lines (same as build_refset.py)")
ap.add_argument("--min-count", type=int, default=1000, help="refuse to calibrate with fewer usable user rows")
ap.add_argument("--force", action="store_true", help="ignore --min-count (testing only)")
ap.add_argument("--mix", choices=["none", "lab"], default="lab", help="add the lab reference set (data/refset/combined.jsonl)")
ap.add_argument("--lab", default=str(ROOT / "data/refset/combined.jsonl"))
ap.add_argument("--lab-frac", type=float, default=0.3,
                help="with --mix lab: share of lab rows in the output (0.3 = 30%% lab / 70%% user); -1 = all lab rows")
ap.add_argument("--seed", type=int, default=0)
ap.add_argument("--out-jsonl", default=str(ROOT / "data/userfeat/user_features.jsonl"))
ap.add_argument("--calibrate", action="store_true", help="run interpret/calibrate.py on the output jsonl")
ap.add_argument("--out", default=str(ROOT / "interpret/calibration_user.yaml"),
                help="calibration output (default does NOT overwrite the live interpret/calibration.yaml)")
a = ap.parse_args()


def fetch_rows():
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
    if not key:
        sys.exit("SUPABASE_SERVICE_KEY (or SUPABASE_SECRET_KEY) is not set — see the docstring. (Never commit it.)")
    q = {"select": "id,created_on,app_version,model_version,calib_version,feature_version,features,stars,type_id,image_w,image_h,lines_found,client_hint",
         "is_test": "eq.false", "model_version": f"eq.{a.model_version}", "feature_version": f"eq.{a.feature_version}",
         "lines_found": f"gte.{a.min_lines}", "order": "id.asc"}
    if a.since:
        q["created_on"] = f"gte.{a.since}"
    rows, page = [], 1000
    while True:
        url = f"{a.url.rstrip('/')}/rest/v1/{a.table}?{urllib.parse.urlencode(q)}"
        req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}",
                                                   "Range-Unit": "items", "Range": f"{len(rows)}-{len(rows) + page - 1}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            batch = json.load(r)
        rows += batch
        if len(batch) < page:
            return rows


def load_rows_file(p):
    txt = Path(p).read_text()
    rows = json.loads(txt) if txt.lstrip().startswith("[") else [json.loads(l) for l in txt.splitlines() if l.strip()]
    keep = []
    for r in rows:
        if r.get("is_test") or r.get("model_version") != a.model_version or int(r.get("feature_version", 1)) != a.feature_version:
            continue
        if int(r.get("lines_found", 0)) < a.min_lines or (a.since and str(r.get("created_on", "")) < a.since):
            continue
        keep.append(r)
    return keep


def to_feature_row(r):
    f = r["features"] if isinstance(r["features"], dict) else json.loads(r["features"])
    return {"image": f"user-{r['id']}", "source": "user", "client_hint": r.get("client_hint"), "date": r.get("created_on"),
            "model": f"{r['model_version']} (browser, user)", "feature_version": r["feature_version"],
            "image_size": [r["image_w"], r["image_h"]], "palm": f.get("palm", {}), "lines": f["lines"], "relations": f["relations"]}


rows = load_rows_file(a.rows_json) if a.rows_json else fetch_rows()
user = [to_feature_row(r) for r in rows]
print(f"user rows usable: {len(user)}  (model {a.model_version}, feature v{a.feature_version}, lines>={a.min_lines})")
print("  client:", dict(collections.Counter(u["client_hint"] for u in user)))
print("  types (as shown to users):", dict(collections.Counter(r["type_id"] for r in rows)))
if len(user) < a.min_count and not a.force:
    print(f"NOT ENOUGH: {len(user)} < --min-count {a.min_count}. Keep the current calibration (rerun later, or --force for testing).")
    sys.exit(2)

out = list(user)
if a.mix == "lab":
    lab = [json.loads(l) for l in open(a.lab)]
    if a.lab_frac < 0:
        pick = lab
    else:
        n = min(len(lab), round(len(user) * a.lab_frac / max(1e-9, 1 - a.lab_frac)))
        pick = random.Random(a.seed).sample(lab, n)
    out += pick
    print(f"mixed with lab set: +{len(pick)} of {len(lab)} lab rows -> {len(out)} rows ({len(pick) / len(out):.0%} lab)")

Path(a.out_jsonl).parent.mkdir(parents=True, exist_ok=True)
with open(a.out_jsonl, "w") as fh:
    for r in out:
        fh.write(json.dumps(r, ensure_ascii=False) + "\n")
print("wrote", a.out_jsonl)

if a.calibrate:
    cmd = [sys.executable, str(ROOT / "interpret/calibrate.py"), "--features", a.out_jsonl, "--out", a.out]
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True)
    print(f"calibration -> {a.out}. Compare with: python interpret/refset/eval_calib.py --calib {a.out} --features {a.out_jsonl}")
    print("To ship it: copy/--out to interpret/calibration.yaml, then `cd web && npm run gen` (calib_version in the app follows automatically), commit.")
