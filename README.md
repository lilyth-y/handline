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
