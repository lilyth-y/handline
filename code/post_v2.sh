#!/usr/bin/env bash
# Post-v2 pipeline: wait for v2 training -> eval v1 & v2 on v2 val labels -> compare -> ONNX -> (if v2 better) re-run
# interpret calibration/demo with v2 -> README v2 section -> git commit + push (origin main only).
# Run detached:  setsid nohup bash code/post_v2.sh > logs/v2/post_v2.log 2>&1 &
# Test overrides (env): WAIT_PID, V2_W, V1_W, DATA, OUT_LOGS, OUT_SAMPLES, ONNX_OUT, DEMO_DIR, CALIB_FEAT, CALIB_OUT,
#   README, EXTRA_EVAL_ARGS, EXTRACT_LIMIT, DEMO_N, THREADS, APPLY_INTERP(1), DO_GIT(1)
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
PY="$ROOT/.venv/bin/python"
WAIT_PID="${WAIT_PID:-921715}"
V2_W="${V2_W:-weights/v2/best.pt}"; V1_W="${V1_W:-weights/best.pt}"
DATA="${DATA:-data/palm_lines_yolo_v2/data.yaml}"
OUT_LOGS="${OUT_LOGS:-logs/v2}"; OUT_SAMPLES="${OUT_SAMPLES:-samples/v2}"; ONNX_OUT="${ONNX_OUT:-weights/v2/best.onnx}"
DEMO_DIR="${DEMO_DIR:-interpret/demo_v2}"; CALIB_FEAT="${CALIB_FEAT:-interpret/calib/val_features_v2.jsonl}"
CALIB_OUT="${CALIB_OUT:-interpret/calibration.yaml}"; README="${README:-README.md}"
EXTRA_EVAL_ARGS="${EXTRA_EVAL_ARGS:-}"; EXTRACT_LIMIT="${EXTRACT_LIMIT:-0}"; DEMO_N="${DEMO_N:-30}"; THREADS="${THREADS:-0}"
APPLY_INTERP="${APPLY_INTERP:-1}"; DO_GIT="${DO_GIT:-1}"
REMOTE_URL="https://github.com/lilyth-y/handline.git"
RC=0
ts() { date '+%Y-%m-%d %H:%M:%S KST'; }
log() { echo "[$(ts)] $*"; }
step() {  # step <name> <cmd...> ; records failure in RC, keeps going
  local name="$1"; shift; log "STEP $name: $*"; "$@"; local r=$?
  if [ $r -ne 0 ]; then log "STEP $name FAILED rc=$r"; RC=1; else log "STEP $name OK"; fi; return $r
}
finish() { log "finished"; echo "POST_V2_DONE rc=$RC"; exit $RC; }
mkdir -p "$OUT_LOGS" "$OUT_SAMPLES"

# (a) wait for training
log "waiting for PID $WAIT_PID"
while kill -0 "$WAIT_PID" 2>/dev/null; do sleep 60; done
log "PID $WAIT_PID gone"
if [ "$WAIT_PID" = "921715" ]; then
  grep -a "TRAINING_DONE" logs/v2/train_stdout.log | tail -1 || log "WARNING: TRAINING_DONE not found in logs/v2/train_stdout.log"
  tail -c 600 logs/v2/train_stdout.log | tr '\r' '\n' | tail -4
fi
[ -f "$V2_W" ] || { log "missing $V2_W"; RC=1; finish; }
[ -f "$V1_W" ] || { log "missing $V1_W"; RC=1; finish; }

# (b) evaluate both models on the v2 val labels
step eval_v2 nice -n 5 "$PY" code/evaluate.py --weights "$V2_W" --data "$DATA" --name palm_eval_v2_on_v2val \
  --csv "$OUT_LOGS/eval_v2_on_v2val.csv" --samples "$OUT_SAMPLES" --prefix v2_pred --plots_dir "$OUT_LOGS/eval_plots_v2" \
  --onnx_out "$ONNX_OUT" --threads "$THREADS" $EXTRA_EVAL_ARGS
step eval_v1 nice -n 5 "$PY" code/evaluate.py --weights "$V1_W" --data "$DATA" --name palm_eval_v1_on_v2val \
  --csv "$OUT_LOGS/eval_v1_on_v2val.csv" --samples "$OUT_SAMPLES" --prefix v1_pred --plots_dir "$OUT_LOGS/eval_plots_v1" \
  --onnx_out "" --threads "$THREADS" $EXTRA_EVAL_ARGS
[ -f "$ONNX_OUT" ] && log "ONNX: $(ls -la "$ONNX_OUT")" || { log "ONNX missing: $ONNX_OUT"; RC=1; }
WINNER=v1
if step compare "$PY" code/compare_v1_v2.py --v1 "$OUT_LOGS/eval_v1_on_v2val.csv" --v2 "$OUT_LOGS/eval_v2_on_v2val.csv" \
     --out "$OUT_LOGS/compare_v1_v2.csv" > "$OUT_LOGS/compare_stdout.txt"; then
  cat "$OUT_LOGS/compare_stdout.txt"; WINNER="$(grep -o 'WINNER=v[12]' "$OUT_LOGS/compare_stdout.txt" | tail -1 | cut -d= -f2)"
else
  cat "$OUT_LOGS/compare_stdout.txt" 2>/dev/null; log "compare failed; README/commit would have no table -> stopping"; finish
fi
log "WINNER=$WINNER"

# (c) stage-2 interpretation with v2 if better
INTERP_MODEL="weights/best.pt"; INTERP_DEMO="interpret/demo"
if [ "$WINNER" = "v2" ]; then
  export PALM_MODEL="$V2_W" OMP_NUM_THREADS=2
  if [ "$APPLY_INTERP" = "1" ] && [ ! -f interpret/calibration_v1.yaml ]; then cp interpret/calibration.yaml interpret/calibration_v1.yaml; fi
  ok=1
  step extract nice -n 5 "$PY" interpret/extract_batch.py --model "$V2_W" --images data/palm_lines_yolo_v2/images/val \
       --out "$CALIB_FEAT" --limit "$EXTRACT_LIMIT" > "$OUT_LOGS/interpret_extract_stdout.txt" || ok=0
  tail -3 "$OUT_LOGS/interpret_extract_stdout.txt"
  [ $ok = 1 ] && { step calibrate "$PY" interpret/calibrate.py --features "$CALIB_FEAT" --out "$CALIB_OUT" || ok=0; }
  [ $ok = 1 ] && { step demo nice -n 5 "$PY" interpret/run_demo.py --model "$V2_W" --n "$DEMO_N" --out "$DEMO_DIR" \
       --images data/palm_lines_yolo_v2/images/val > "$OUT_LOGS/interpret_demo_stdout.txt" || ok=0; tail -25 "$OUT_LOGS/interpret_demo_stdout.txt"; }
  if [ $ok = 1 ]; then
    INTERP_MODEL="$V2_W"; INTERP_DEMO="$DEMO_DIR"
    if [ "$APPLY_INTERP" = "1" ]; then
      sed -i 's|^DEFAULT_MODEL = "weights/best.pt"|DEFAULT_MODEL = "weights/v2/best.pt"|' interpret/features.py
      grep -n '^DEFAULT_MODEL' interpret/features.py
    fi
  else
    log "interpret rerun with v2 failed -> keeping v1 calibration"
    if [ "$APPLY_INTERP" = "1" ] && [ -f interpret/calibration_v1.yaml ]; then cp interpret/calibration_v1.yaml interpret/calibration.yaml; fi
  fi
else
  log "v1 is not worse -> interpret pipeline keeps v1 (weights/best.pt)"
fi
log "interpret model: $INTERP_MODEL (demo dir $INTERP_DEMO)"
[ -f "$INTERP_DEMO/type_distribution.json" ] && cat "$INTERP_DEMO/type_distribution.json"

# (d) README v2 section
step readme "$PY" code/readme_v2.py --compare "$OUT_LOGS/compare_v1_v2.csv" --demo "$INTERP_DEMO" --interp_model "$INTERP_MODEL" --readme "$README"

# (e) git commit + push
if [ "$DO_GIT" = "1" ]; then
  url="$(git remote get-url origin)"
  if [ "$url" != "$REMOTE_URL" ]; then log "origin is $url, not $REMOTE_URL -> not pushing"; RC=1; finish; fi
  git add -A
  bad="$(git diff --cached --name-only | grep -E '^(data/|\.venv/|runs/)|(^|/)\.env$|\.key$' || true)"
  if [ -n "$bad" ]; then log "forbidden paths staged -> abort:"; echo "$bad"; git reset -q; RC=1; finish; fi
  if git diff --cached -U0 | grep -E '^\+' | grep -qE 'nvapi-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_|sk-[A-Za-z0-9]{32,}'; then
    log "possible secret in staged diff -> abort"; git reset -q; RC=1; finish; fi
  big=""
  for f in $(git diff --cached --name-only --diff-filter=AM); do
    [ -f "$f" ] || continue
    if [ "$(stat -c %s "$f")" -gt 50000000 ] && ! git check-attr filter -- "$f" | grep -q 'filter: lfs'; then big="$big $f"; fi
  done
  [ -n "$big" ] && { log "large non-LFS files staged:$big -> abort"; git reset -q; RC=1; finish; }
  git lfs ls-files | grep -E 'v2/' || true
  log "staged: $(git diff --cached --name-only | wc -l) files"
  git diff --cached --stat | tail -3
  if git diff --cached --quiet; then log "nothing to commit"; else
    step commit git commit -q -m "v2 results: AI-relabelled data (nemotron VL, hybrid), v1 vs v2 eval on v2 val, ONNX, interpret ($INTERP_MODEL)"
  fi
  for i in 1 2 3; do
    if git push origin main; then log "push OK"; break; fi
    log "push attempt $i failed"; [ $i = 3 ] && RC=1; sleep 30
  done
  git fetch -q origin main
  log "HEAD=$(git rev-parse --short HEAD) origin/main=$(git rev-parse --short origin/main)"
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { log "origin/main != HEAD"; RC=1; }
  git log --oneline -3 origin/main
fi
finish
