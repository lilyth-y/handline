"""Evaluate best.pt on val: Ultralytics per-class box/mask mAP + pixel-level IoU/Dice per class,
sample overlays, and ONNX export."""
import os, sys, json, csv, glob, shutil, argparse
import numpy as np, cv2
from PIL import Image
from ultralytics import YOLO
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
ap = argparse.ArgumentParser(); ap.add_argument("--weights", default="runs/segment/runs/palm_seg_v1/weights/best.pt")
ap.add_argument("--data", default="data/palm_lines_yolo/data.yaml"); ap.add_argument("--conf", type=float, default=0.25)
a = ap.parse_args()
NAMES = ["heart_line", "head_line", "life_line", "fate_line"]
COL = [(255, 60, 60), (60, 120, 255), (40, 220, 80), (255, 190, 0)]
model = YOLO(a.weights)
# 1) Ultralytics val metrics per class
r = model.val(data=a.data, imgsz=640, batch=8, device="cpu", plots=True, project=f"{ROOT}/runs", name="palm_seg_v1_eval", exist_ok=True, mask_ratio=2)
rows = []
for i, c in enumerate(r.seg.ap_class_index):
    rows.append({"class": NAMES[c], "box_mAP50": float(r.box.ap50[i]), "box_mAP50-95": float(r.box.ap[i]),
                 "mask_mAP50": float(r.seg.ap50[i]), "mask_mAP50-95": float(r.seg.ap[i])})
rows.append({"class": "all", "box_mAP50": float(r.box.map50), "box_mAP50-95": float(r.box.map),
             "mask_mAP50": float(r.seg.map50), "mask_mAP50-95": float(r.seg.map)})
# 2) pixel-level IoU / Dice per class at image resolution (more meaningful for thin lines)
vdir = "data/palm_lines_yolo/images/val"; ldir = "data/palm_lines_yolo/labels/val"
inter = np.zeros(4); union = np.zeros(4); gsum = np.zeros(4); psum = np.zeros(4)
TOL = 5  # px tolerance: dilate both masks for a tolerant line-overlap score
k = np.ones((2 * TOL + 1, 2 * TOL + 1), np.uint8)
ti = np.zeros(4); tg = np.zeros(4); tp = np.zeros(4)
files = sorted(glob.glob(f"{vdir}/*.jpg"))
os.makedirs("samples", exist_ok=True)
for j, f in enumerate(files):
    img = cv2.imread(f); H, W = img.shape[:2]
    gt = np.zeros((4, H, W), np.uint8)
    for line in open(f"{ldir}/{os.path.basename(f)[:-4]}.txt"):
        p = line.split()
        if not p: continue
        pts = (np.array(p[1:], float).reshape(-1, 2) * [W, H]).astype(np.int32)
        cv2.fillPoly(gt[int(p[0])], [pts], 1)
    res = model.predict(f, imgsz=640, conf=a.conf, device="cpu", retina_masks=True, verbose=False)[0]
    pr = np.zeros((4, H, W), np.uint8)
    if res.masks is not None:
        for m, c in zip(res.masks.data.cpu().numpy(), res.boxes.cls.cpu().numpy().astype(int)):
            pr[c] |= (cv2.resize(m, (W, H)) > 0.5).astype(np.uint8)
    for c in range(4):
        g, q = gt[c].astype(bool), pr[c].astype(bool)
        inter[c] += (g & q).sum(); union[c] += (g | q).sum(); gsum[c] += g.sum(); psum[c] += q.sum()
        gd, qd = cv2.dilate(gt[c], k).astype(bool), cv2.dilate(pr[c], k).astype(bool)
        tp[c] += (q & gd).sum(); tg[c] += (g & qd).sum()
    if j < 4:
        ov = img[:, :, ::-1].copy(); gov = ov.copy()
        for c in range(4):
            ov[pr[c] > 0] = COL[c]; gov[gt[c] > 0] = COL[c]
        both = np.concatenate([gov, ov], 1)
        cv2.putText(both, "label", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 0), 3)
        cv2.putText(both, "prediction", (W + 20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 0), 3)
        Image.fromarray(both).save(f"samples/val_pred_{j+1}_{os.path.basename(f)[:-4]}.png")
for i, c in enumerate(NAMES):
    row = next(x for x in rows if x["class"] == c) if any(x["class"] == c for x in rows) else {"class": c}
    row["pixel_IoU"] = inter[i] / max(union[i], 1); row["pixel_Dice"] = 2 * inter[i] / max(gsum[i] + psum[i], 1)
    prec = tp[i] / max(psum[i], 1); rec = tg[i] / max(gsum[i], 1)
    row["tol5_precision"] = prec; row["tol5_recall"] = rec; row["tol5_F1"] = 2 * prec * rec / max(prec + rec, 1e-9)
os.makedirs("logs", exist_ok=True)
keys = ["class", "box_mAP50", "box_mAP50-95", "mask_mAP50", "mask_mAP50-95", "pixel_IoU", "pixel_Dice", "tol5_precision", "tol5_recall", "tol5_F1"]
with open("logs/val_metrics_per_class.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, keys); w.writeheader()
    for x in rows: w.writerow({k: (round(v, 4) if isinstance(v, float) else v) for k, v in x.items() if k in keys})
for f in glob.glob(f"{getattr(r, 'save_dir', None) or (ROOT + '/runs/segment/runs/palm_seg_v1_eval')}/*.png"):
    os.makedirs("logs/eval_plots", exist_ok=True); shutil.copy2(f, "logs/eval_plots/")
print(open("logs/val_metrics_per_class.csv").read())
# 3) ONNX export
onnx = model.export(format="onnx", imgsz=640, simplify=True, opset=17)
shutil.copy2(onnx, "weights/best.onnx"); print("ONNX:", onnx)
