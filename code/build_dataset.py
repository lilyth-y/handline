"""Build a YOLO-seg dataset (heart/head/life/fate) from PLSU binary palm-line masks.

PLSU (arXiv 2102.12127) gives ONE binary mask of all principal lines per image.
Per-line classes are pseudo-labelled:
  * heart/head/life: each GT line pixel takes the class of the nearest line predicted by
    the palm-line-reader student ONNX model (MIT, github.com/samuelwbarber/palm-line-reader),
    if within DIST_MAX px.
  * fate: GT pixels farther than DIST_MAX from any teacher line, grouped into connected
    components; a component is kept as fate_line if it is long and mostly vertical.
Images are cropped to the hand bounding box (white background) and resized to max 1024 px.
"""
import os, sys, json, random, argparse
import numpy as np, cv2
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(__file__))
from teacher_probe import teacher_classmap, hand_bbox

ap = argparse.ArgumentParser()
ap.add_argument("--src", default="data/raw/PLSU")
ap.add_argument("--out", default="data/palm_lines_yolo")
ap.add_argument("--teacher", default="data/teacher_student_fp32.onnx")
ap.add_argument("--val", type=float, default=0.15)
ap.add_argument("--seed", type=int, default=0)
ap.add_argument("--dist_max", type=float, default=30)
ap.add_argument("--max_side", type=int, default=1024)
ap.add_argument("--overwrite", action="store_true")
a = ap.parse_args()

NAMES = ["heart_line", "head_line", "life_line", "fate_line"]
COL = np.array([[0,0,0],[255,0,0],[0,0,255],[0,255,0],[255,200,0]], np.uint8)
names = sorted(f[:-4] for f in os.listdir(f"{a.src}/img") if f.endswith(".jpg"))
random.Random(a.seed).shuffle(names)
nval = int(len(names) * a.val)
split = {n: ("val" if i < nval else "train") for i, n in enumerate(names)}
for s in ("train", "val"):
    os.makedirs(f"{a.out}/images/{s}", exist_ok=True); os.makedirs(f"{a.out}/labels/{s}", exist_ok=True)
os.makedirs(f"{a.out}/preview", exist_ok=True)
stats = {"images": 0, "instances": {n: 0 for n in NAMES}, "fate_images": 0, "split": {"train": 0, "val": 0}}

for k, n in enumerate(names):
    if os.path.exists(f"{a.out}/labels/{split[n]}/{n}.txt") and not a.overwrite:
        continue  # resume support
    rgb = np.array(Image.open(f"{a.src}/img/{n}.jpg").convert("RGB"))
    gt = np.array(Image.open(f"{a.src}/Mask/{n}.png").convert("L")) > 127
    prob, _ = teacher_classmap(a.teacher, rgb)
    cls = prob.argmax(0)
    D = np.stack([ndimage.distance_transform_edt(cls != c) if (cls == c).any() else np.full(cls.shape, 1e9) for c in (1,2,3)])
    lab = np.zeros(gt.shape, np.uint8)
    near = D.min(0) <= a.dist_max
    lab[gt & near] = (D.argmin(0) + 1)[gt & near]
    far = gt & ~near
    cc, ncc = ndimage.label(far, structure=np.ones((3,3)))
    for i in range(1, ncc + 1):
        ys, xs = np.where(cc == i)
        h, w = np.ptp(ys) + 1, np.ptp(xs) + 1
        if len(ys) > 800 and h > 120 and h > 1.5 * w:
            lab[cc == i] = 4
    # crop to hand, resize
    x0, y0, x1, y1 = hand_bbox(rgb, margin=60)
    rgb_c, lab_c = rgb[y0:y1, x0:x1], lab[y0:y1, x0:x1]
    sc = min(1.0, a.max_side / max(rgb_c.shape[:2]))
    if sc < 1:
        size = (int(rgb_c.shape[1] * sc), int(rgb_c.shape[0] * sc))
        rgb_c = cv2.resize(rgb_c, size, interpolation=cv2.INTER_AREA)
        lab_c = cv2.resize(lab_c, size, interpolation=cv2.INTER_NEAREST)
    H, W = lab_c.shape
    lines = []
    for c in range(1, 5):
        m = (lab_c == c).astype(np.uint8)
        if not m.any(): continue
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5,5), np.uint8))
        cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cn in cnts:
            if cv2.contourArea(cn) < 60: continue
            cn = cv2.approxPolyDP(cn, 1.0, True).reshape(-1, 2)
            if len(cn) < 3: continue
            pts = " ".join(f"{x/W:.5f} {y/H:.5f}" for x, y in cn)
            lines.append(f"{c-1} {pts}")
            stats["instances"][NAMES[c-1]] += 1
    if (lab_c == 4).any(): stats["fate_images"] += 1
    s = split[n]
    Image.fromarray(rgb_c).save(f"{a.out}/images/{s}/{n}.jpg", quality=92)
    open(f"{a.out}/labels/{s}/{n}.txt", "w").write("\n".join(lines) + ("\n" if lines else ""))
    if k < 12:
        ov = rgb_c.copy(); mm = lab_c > 0; ov[mm] = COL[lab_c[mm]]
        Image.fromarray(ov).save(f"{a.out}/preview/{n}.jpg")
    stats["images"] += 1; stats["split"][s] += 1
    if k % 100 == 0: print(k, n, flush=True)

open(f"{a.out}/data.yaml", "w").write(
    f"path: {os.path.abspath(a.out)}\ntrain: images/train\nval: images/val\nnames:\n" +
    "".join(f"  {i}: {nm}\n" for i, nm in enumerate(NAMES)))
json.dump(stats, open(f"{a.out}/stats.json", "w"), indent=2)
print(json.dumps(stats, indent=2))
