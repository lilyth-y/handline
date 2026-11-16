"""Prepare image lists for web/tools/batch_features.mjs (reproduces data/refset/{plsu,11k}.tsv and img/11k).
11K Hands palmar photos are stored fingers-down; they are rotated 180 deg (fingers up, like PLSU / a phone selfie
of the palm) into data/refset/img/11k. Dorsal photos are skipped. subject = "<person id>_<left|right>"."""
import csv, glob, os
from PIL import Image
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../data")
os.makedirs(f"{R}/refset/img/11k", exist_ok=True)
with open(f"{R}/refset/plsu.tsv", "w") as f:
    for p in sorted(glob.glob(f"{R}/palm_lines_yolo_v2/images/*/*.jpg")):
        f.write(f"plsu\t{os.path.basename(p)[:-4]}\t{os.path.abspath(p)}\n")
with open(f"{R}/refset/11k.tsv", "w") as f:
    for r in csv.DictReader(open(f"{R}/raw/11k/HandInfo.csv")):
        if not r["aspectOfHand"].startswith("palmar"): continue
        dst = os.path.abspath(f"{R}/refset/img/11k/{r['imageName']}")
        if not os.path.exists(dst):
            Image.open(f"{R}/raw/11k/Hands/{r['imageName']}").rotate(180).save(dst, quality=95)
        f.write(f"11k\t{r['id']}_{r['aspectOfHand'].split()[1]}\t{dst}\n")
