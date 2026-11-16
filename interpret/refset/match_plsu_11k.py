"""Map every PLSU photo to its source 11K Hands photo (PLSU was built from 11K Hands).
Nearest neighbour on 40x30 grey thumbnails; PLSU img vs 11K palmar photos rotated 180 deg
(data/refset/img/11k, fingers up like PLSU). Writes data/refset/plsu_to_11k.json."""
import csv, glob, json, os
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from PIL import Image
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../data")
def th(f):
    im = Image.open(f); im.draft("L", (200, 150)); return np.asarray(im.convert("L").resize((40, 30)), dtype=np.float32).ravel()
info = {r["imageName"]: r for r in csv.DictReader(open(f"{R}/raw/11k/HandInfo.csv"))}
k = sorted(os.listdir(f"{R}/refset/img/11k"))
p = sorted(glob.glob(f"{R}/raw/PLSU/img/*.jpg"))
with ProcessPoolExecutor(8) as ex:
    K = np.stack(list(ex.map(th, [f"{R}/refset/img/11k/{n}" for n in k], chunksize=64)))
    P = np.stack(list(ex.map(th, p, chunksize=32)))
d = ((P ** 2).sum(1)[:, None] + (K ** 2).sum(1)[None] - 2 * P @ K.T) / P.shape[1]
o = np.argsort(d, 1)
res = {}
for i, f in enumerate(p):
    n = k[o[i, 0]]
    res[os.path.basename(f).rsplit(".", 1)[0]] = {"k11": n, "id": info[n]["id"], "side": info[n]["aspectOfHand"], "d": round(float(d[i, o[i, 0]]), 2), "d2": round(float(d[i, o[i, 1]]), 2)}
json.dump(res, open(f"{R}/refset/plsu_to_11k.json", "w"))
print("matched", sum(v["d"] < 5 for v in res.values()), "/", len(res), "persons", len({v["id"] for v in res.values()}))
