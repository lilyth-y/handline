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
