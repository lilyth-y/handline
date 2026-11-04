# handline: palm-line segmentation (호아 도사 손금 앱)

First-pass YOLO11n-seg model for palm lines: heart_line, head_line, life_line, fate_line. Training ran CPU-only.
Training and evaluation details are filled in at the end of training (see bottom).

## Layout
- `code/`: dataset builder, teacher pseudo-labeller, training, evaluation, backup sync
- `configs/`: training config, dataset stats
- `logs/`: results.csv/png (per-epoch losses, metrics, LR), TensorBoard events, weights_log.csv, push log
- `weights/`: best.pt, last.pt, periodic epochN.pt, best.onnx (Git LFS)
- `samples/`: label previews and prediction overlays
- `data/`: datasets (git-ignored, never pushed)

## Data
- PLSU palm-line masks (arXiv 2102.12127, built from 11K Hands): 1,039 white-background palm photos, each with ONE binary mask of the principal lines.
  Download link: https://link.sun-asterisk.vn/palmlinedataset. License not stated; the source 11K Hands set is "free for reasonable academic fair use".
- The per-line classes are **pseudo-labels**. Each GT line pixel takes the class of the nearest line predicted by the
  palm-line-reader student ONNX model (MIT, https://github.com/samuelwbarber/palm-line-reader).
  GT pixels far from every predicted line become fate_line, but only if they form a long, vertical segment. See `code/build_dataset.py`.

## Rerun
```bash
python3 -m venv .venv && . .venv/bin/activate
pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision
pip install ultralytics onnx onnxslim onnxruntime scipy tensorboard gdown
mkdir -p data/raw && (cd data/raw && gdown 1B4uj-b4RuUNkC_oeCsRkuih4rjuQ6tHH && unzip -q PLSU.zip)
curl -L -o data/teacher_student_fp32.onnx https://github.com/samuelwbarber/palm-line-reader/raw/main/models/student_fp32.onnx
python code/build_dataset.py            # -> data/palm_lines_yolo
python code/train.py --push             # trains, logs, and pushes backups every 5 epochs
python code/evaluate.py                 # per-class val metrics, sample overlays, ONNX export
tensorboard --logdir logs/tensorboard
```

## Results (v1, 2026-11-04)
YOLO11n-seg, 35 epochs, imgsz 640, CPU only (8 cores, 15GB RAM, no GPU). Training took about 84 min (5,066s). Split: 884 train / 155 val.
Train seg loss went from 2.07 to 1.23. Val seg loss went from 5.74 to 1.23.

Validation results for best.pt (`logs/evaluate_stdout.log`):

| class | mask mAP50 | mask mAP50-95 | pixel IoU | pixel Dice | F1 @5px tolerance |
|---|---|---|---|---|---|
| heart_line | 0.842 | 0.245 | 0.619 | 0.765 | 0.957 |
| head_line | 0.523 | 0.113 | 0.512 | 0.677 | 0.878 |
| life_line | 0.562 | 0.133 | 0.523 | 0.687 | 0.872 |
| fate_line | 0.151 | 0.023 | 0.219 | 0.359 | 0.473 |
| all | 0.519 | 0.128 | | | |

Caveats:
- The per-line labels are pseudo-labels, so these metrics measure agreement with those labels, not with human annotation.
- fate_line is weak because only 59 val instances exist.
- PLSU and 11K Hands are licensed for academic use.

Exports: `weights/best.pt`, `weights/best.onnx`. Prediction overlays are in `samples/val_pred_*.png`, and eval plots are in `logs/eval_plots/`.

<!-- v2-start -->
## Results (v2, AI-relabelled data, 2026-11-04)

### Method: AI relabelling (`code/ai_relabel.py`)
Same PLSU images, human line masks, crop and train/val split (884/155) as v1. Only the per-line class assignment changed.
Each GT mask is skeletonized and split into numbered segments. The palm is rendered with coloured, numbered segments, and a vision LLM returns JSON mapping segment to heart/head/life/fate/other. GT pixels take the class of the nearest labelled segment.
- Model: `nvidia/nemotron-3.5-super-vl-120b-a12b` via NVIDIA API Catalog integrate.api.nvidia.com/v1/chat/completions
- Run: `full --model nvidia/nemotron-3.5-super-vl-120b-a12b --hint --shuffle --policy hybrid --workers 4; VLM_EXTRA_BODY={"chat_template_kwargs":{"enable_thinking":false}}`
- Policy `hybrid`: keep the v1 teacher's heart/head/life segments. The VLM decides segments the teacher left unlabelled and the heuristic fate segments.
- Images labelled: 1039 (`full_stats.json`: calls_ok 728, failed 0)
- API totals, full run: 1089 HTTP requests (200: 1085, None: 4), 1,229,464 prompt + 220,668 completion tokens (46,236 reasoning)
- API totals including pilots and probes: 1444 requests, 1,580,603 prompt + 562,369 completion tokens
- Raw request/response logs: `logs/relabel/*.jsonl`. Stats: `logs/relabel/full_stats.json`, `logs/relabel/v2_dataset_stats.json`
- Skeleton-pixel agreement of the v2 labels with v1: 0.928

| class | v1 instances | v2 instances |
|---|---|---|
| heart_line | 1024 | 1059 |
| head_line | 1372 | 1101 |
| life_line | 1149 | 1132 |
| fate_line | 352 | 149 |

### Training
YOLO11n-seg, `configs/train_v2.yaml` (identical to v1 except data), 35 epochs, CPU, 5,388s (~90 min).
Last epoch: train seg loss 0.857, val seg loss 0.881, val mask mAP50 0.581. best.pt is from epoch 34 (fitness 0.63887). Logs are in `logs/v2/` (results.csv, TensorBoard, weights_log.csv).

### v1 vs v2 on the v2 val labels (155 images, conf 0.25)
`logs/v2/compare_v1_v2.csv` (computed by `code/evaluate.py`, then `code/compare_v1_v2.py`)

| class | mask mAP50 v1 / v2 | mask mAP50-95 v1 / v2 | pixel IoU v1 / v2 | tol5 F1 v1 / v2 |
|---|---|---|---|---|
| heart_line | 0.867 / 0.910 | 0.237 / 0.253 | 0.603 / 0.618 | 0.938 / 0.959 |
| head_line | 0.539 / 0.669 | 0.113 / 0.153 | 0.501 / 0.539 | 0.861 / 0.906 |
| life_line | 0.443 / 0.634 | 0.086 / 0.174 | 0.476 / 0.511 | 0.810 / 0.853 |
| fate_line | 0.062 / 0.101 | 0.011 / 0.034 | 0.167 / 0.093 | 0.396 / 0.208 |
| all (class mean for pixel/F1) | 0.478 / 0.579 | 0.112 / 0.153 | 0.437 / 0.441 | 0.751 / 0.731 |

Decision (mean of class-avg mask_mAP50, mask_mAP50-95, pixel_IoU, tol5_F1): v1 0.4445, v2 0.476. v2 is higher on 3/4 of these metrics. **Better: v2**.
Caveat: these val labels are the AI relabels v2 was trained on, so v1 (trained on teacher pseudo-labels) is at a built-in disadvantage. Neither set of labels is human per-line annotation.

### Stage-2 interpretation
`interpret/` now uses **`weights/v2/best.pt`** (`interpret/features.py` default; calibration.yaml recalibrated on v2 features, v1 calibration saved as `interpret/calibration_v1.yaml`).
Demo type distribution (`interpret/demo_v2/`, n=30): 황금손 재물여우 2, 불꽃손 열정여우 1, 달빛손 감성여우 2, 별빛손 지혜여우 2, 바람손 자유여우 3, 태양손 리더여우 5, 구름손 평화여우 3, 꽃잎손 인기여우 2, 바위손 뚝심여우 1, 물결손 공감여우 1, 번개손 아이디어여우 4, 은하손 행운여우 4

Artifacts: `weights/v2/best.pt`, `weights/v2/best.onnx`, overlays `samples/v2/` (`v2_pred_*` = v2, `v1_pred_*` = v1, same images; left = v2 label, right = prediction), eval plots `logs/v2/eval_plots_v2/`, `logs/v2/eval_plots_v1/`.
<!-- v2-end -->
