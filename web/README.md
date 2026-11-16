# 호아 도사의 손금 풀이 — mobile web app (MVP)

Static site (no server, no build step). Everything runs on the phone:

1. photo → `js/palm.js` (letterbox → YOLO11n-seg v2 ONNX via onnxruntime-web wasm → masks → skeleton features;
   a port of `interpret/features.py`, skeletonize is an exact port of skimage's Zhang-Suen LUT)
2. features → `js/interpret.js` (port of `interpret/interpret.py`; rules/calibration are generated data,
   expressions are evaluated by the tiny safe parser in `js/expr.js` — no `eval`)
3. templated 호아 도사 readings in `js/copy.js` (no LLM key)

```
public/            # deploy this folder as-is
  index.html css/ js/ img/
  model/palm-v2.onnx         # = weights/v2/best.onnx
  vendor/ort*                # onnxruntime-web 1.31 wasm build
tools/gen_rules.cjs          # rules.yaml       -> public/js/rules.js   (npm run gen)
tools/gen_calib.cjs          # calibration.yaml -> public/js/calib.js
tools/serve.mjs              # local static server (npm run serve -> :8787)
tools/batch_features.mjs     # batch feature extraction with the app's own browser pipeline (percentile reference set, ../interpret/refset)
tests/e2e.mjs                # Playwright e2e on val images, screenshots -> ../web_screens
```

Rerun `npm run gen` and copy the new ONNX to `public/model/palm-v2.onnx` whenever the model, rules or calibration change.
Parity (val, 40 images): JS vs Python(.pt) type 34/40, stars 144/160 — differences come from .onnx vs .pt outputs;
the interpretation engine itself matches Python 175/175 on identical features.

Percentiles ('상위 %') compare against the reference set in `../interpret/refset/` (189 people, 375 hands, 2,201 palm photos,
PLSU + 11K Hands, features from this browser pipeline). `gen_calib.cjs` copies its size into `calib.js` (`CALIB.ref`), which the
손금 측정값 footnote shows. Parity on that set: `node tests/evidence_parity.mjs ../data/refset/combined.jsonl` → 8,804/8,804 luck checks match Python.
