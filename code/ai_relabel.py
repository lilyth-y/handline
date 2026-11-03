"""AI relabeling of PLSU palm-line masks with a vision LLM (v2 labels).

Pipeline per image:
  1. Crop/resize image + human GT mask exactly as code/build_dataset.py does.
  2. Skeletonize the GT mask, break the skeleton at junction pixels, and keep connected
     skeleton pieces as numbered "segments" (tiny pieces are merged later by nearest assignment).
  3. Render the palm with each segment drawn in a distinct color with its number, send it to a
     vision LLM (NVIDIA API Catalog, OpenAI-compatible) and ask for strict JSON:
     segment id -> heart / head / life / fate / other.
  4. Every GT pixel takes the label of the nearest labelled skeleton segment ("other" is dropped),
     then polygons are written in YOLO-seg format, same as v1.
Raw requests/responses are appended to logs/relabel/*.jsonl; API calls/tokens are counted there.

Usage:
  python code/ai_relabel.py pilot --n 50           # pilot: samples/relabel_pilot/ + agreement stats
  python code/ai_relabel.py full                   # all images -> data/palm_lines_yolo_v2
"""
import os, sys, io, re, json, time, base64, argparse, random, glob, threading
from concurrent.futures import ThreadPoolExecutor
import numpy as np, cv2, requests
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from skimage.morphology import skeletonize
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from teacher_probe import hand_bbox

NAMES = ["heart_line", "head_line", "life_line", "fate_line"]
KEY2C = {"heart": 1, "head": 2, "life": 3, "fate": 4, "other": 0}
CLASS_COL = np.array([[0, 0, 0], [255, 0, 0], [0, 0, 255], [0, 255, 0], [255, 200, 0]], np.uint8)
SEG_COLS = [(230, 25, 75), (60, 180, 75), (0, 130, 200), (245, 130, 48), (145, 30, 180), (70, 240, 240),
            (240, 50, 230), (128, 128, 0), (0, 0, 128), (170, 110, 40), (128, 0, 0), (0, 128, 128),
            (255, 225, 25), (128, 128, 128), (250, 190, 212), (0, 0, 0)]
API = "https://integrate.api.nvidia.com/v1/chat/completions"
MIN_SEG = 12          # skeleton pixels; shorter pieces are not shown to the VLM
MAX_SEGS = 16
LOCK = threading.Lock()

def load_crop(src, n, max_side=1024):
    rgb = np.array(Image.open(f"{src}/img/{n}.jpg").convert("RGB"))
    gt = np.array(Image.open(f"{src}/Mask/{n}.png").convert("L")) > 127
    x0, y0, x1, y1 = hand_bbox(rgb, margin=60)
    rgb_c, gt_c = rgb[y0:y1, x0:x1], gt[y0:y1, x0:x1].astype(np.uint8)
    sc = min(1.0, max_side / max(rgb_c.shape[:2]))
    if sc < 1:
        size = (int(rgb_c.shape[1] * sc), int(rgb_c.shape[0] * sc))
        rgb_c = cv2.resize(rgb_c, size, interpolation=cv2.INTER_AREA)
        gt_c = cv2.resize(gt_c, size, interpolation=cv2.INTER_NEAREST)
    return rgb_c, gt_c.astype(bool)

def segments(gt, shuffle_seed=None):
    """Skeleton broken at junctions -> (label image of skeleton segments, list of segment ids kept)."""
    m = cv2.morphologyEx(gt.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool)
    sk = skeletonize(m)
    nb = ndimage.convolve(sk.astype(np.uint8), np.ones((3, 3), np.uint8), mode="constant") - 1
    junc = sk & (nb >= 3)
    junc = ndimage.binary_dilation(junc, np.ones((3, 3))) & sk
    lab, n = ndimage.label(sk & ~junc, structure=np.ones((3, 3)))
    sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    keep = [i + 1 for i in np.argsort(-sizes) if sizes[i] >= MIN_SEG][:MAX_SEGS]
    out = np.zeros_like(lab)
    order = sorted(keep, key=lambda i: tuple(np.argwhere(lab == i).mean(0)))  # top-to-bottom order
    if shuffle_seed is not None:  # random numbering so the VLM cannot use "1 = topmost = heart"
        random.Random(shuffle_seed).shuffle(order)
    for k, i in enumerate(order):
        out[lab == i] = k + 1
    return out, sk

def render(rgb, seg, max_side=896):
    """Palm image with numbered colored segments for the VLM."""
    H, W = seg.shape
    img = Image.fromarray(rgb).convert("RGB")
    ov = np.array(img)
    for k in range(1, seg.max() + 1):
        mk = cv2.dilate((seg == k).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        ov[mk] = SEG_COLS[(k - 1) % len(SEG_COLS)]
    img = Image.fromarray(ov)
    d = ImageDraw.Draw(img)
    fs = max(22, int(max(H, W) / 32))
    try: font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", fs)
    except Exception: font = ImageFont.load_default()
    for k in range(1, seg.max() + 1):
        ys, xs = np.where(seg == k)
        i = np.argsort(ys * 0 + xs)[len(xs) // 2]  # median point along x
        x, y = int(xs[i]), int(ys[i])
        x = min(max(x + 8, 0), W - fs * 2); y = min(max(y - fs - 6, 0), H - fs - 4)
        c = SEG_COLS[(k - 1) % len(SEG_COLS)]
        d.rectangle([x - 3, y - 2, x + fs * (1.3 if k > 9 else 0.75), y + fs + 4], fill=(255, 255, 255), outline=c, width=3)
        d.text((x, y), str(k), fill=c if sum(c) < 600 else (0, 0, 0), font=font)
    sc = min(1.0, max_side / max(H, W))
    if sc < 1: img = img.resize((int(W * sc), int(H * sc)), Image.LANCZOS)
    return img

PROMPT = """This is a photo of a human palm (palmar side). A human annotator traced the palm's principal creases; the traced creases are drawn as colored segments, each labelled with a number (1..{n}). Segments were cut at crossings, so one crease may consist of several segments.

Classify EVERY numbered segment as one of the palmistry principal lines:
- "heart": the uppermost major transverse crease, running across the palm below the finger bases, starting near the little-finger edge and curving toward the index/middle finger.
- "head": the transverse crease below the heart line, starting at the thumb-index edge (often sharing its start with the life line) and running across the middle of the palm.
- "life": the curved crease that arcs around the base of the thumb (thenar mound), from the thumb-index edge down toward the wrist.
- "fate": a roughly vertical crease running up the middle of the palm from the wrist area toward the middle finger.
- "other": anything else (minor creases, finger creases, wrist bracelets, noise).

Reply with ONLY a JSON object, no prose, exactly in this form:
{{"hand_orientation": "thumb_left" or "thumb_right", "segments": {{"1": "<label>", "2": "<label>", ...}}}}
Include all {n} segment numbers."""

PROMPT_HINT = """This is a photo of a human palm (palmar side). A human annotator traced the palm's principal creases; the traced creases are drawn as colored segments, each labelled with a number (1..{n}). Segments were cut at crossings, so one crease may consist of several segments.

An automatic line detector already proposed a label for each segment (it is right most of the time, but sometimes swaps lines or misses one; "none" means it gave no label):
{hint}

Your job: check every proposal against the palm anatomy and correct it where it is wrong. Definitions:
- "heart": the transverse crease CLOSEST to the finger bases. It starts at the little-finger edge of the palm and runs toward the index/middle finger.
- "head": the next transverse crease below the heart line. It starts at the thumb-index edge (often sharing its start with the life line) and runs across the middle of the palm toward the little-finger side.
- "life": the curved crease that arcs around the base of the thumb (the thenar mound), from the thumb-index edge down toward the wrist. It is the line nearest the thumb.
- "fate": a roughly vertical crease up the center of the palm, from the wrist toward the middle finger. Many palms have no fate line; do not call a piece of the life or head line "fate".
- "other": anything else (minor creases, finger creases, wrist creases).
A palm normally has exactly one heart, one head and one life line (each possibly split into several segments).

Segment numbers are assigned in random order and carry no meaning. Judge only by where each segment lies on the palm and what it touches.
First, for each segment write one short line: where it starts and ends (e.g. "little-finger edge, below the ring finger" or "between thumb and index, curving to the wrist"). Then output the final answer as a JSON object, exactly:
{{"hand_orientation": "thumb_left" or "thumb_right", "segments": {{"1": "<label>", "2": "<label>", ...}}}}
Include all {n} segment numbers."""

def call_vlm(model, img, n, log_path, meta, timeout=120, retries=6, hint=None):
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=88)
    b64 = base64.b64encode(buf.getvalue()).decode()
    body = {"model": model, "temperature": 0.0, "max_tokens": int(os.environ.get("VLM_MAX_TOKENS", "6000")),
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": PROMPT.format(n=n) if hint is None else PROMPT_HINT.format(n=n, hint=hint)},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}]}]}
    if os.environ.get("VLM_EXTRA_BODY"): body.update(json.loads(os.environ["VLM_EXTRA_BODY"]))
    hdr = {"Authorization": f"Bearer {os.environ['NVIDIA_API_KEY']}", "Accept": "application/json"}
    for att in range(retries):
        t0 = time.time()
        try:
            r = requests.post(API, json=body, headers=hdr, timeout=(20, timeout))
            js = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text[:2000]}
        except Exception as e:
            r, js = None, {"error": repr(e)}
        rec = {**meta, "model": model, "attempt": att, "status": getattr(r, "status_code", None),
               "latency_s": round(time.time() - t0, 2), "time": time.strftime("%Y-%m-%d %H:%M:%S"), "response": js}
        with LOCK:
            open(log_path, "a").write(json.dumps(rec) + "\n")
        if r is not None and r.status_code == 200:
            msg = js["choices"][0]["message"]; txt = msg.get("content") or ""
            parsed = parse(txt, n)
            if parsed is not None: return parsed, js.get("usage", {})
        time.sleep(5 * (att + 1) if r is None or r.status_code != 429 else 20 * (att + 1))
    return None, {}

def parse(txt, n):
    txt = re.sub(r"<think>.*?</think>", "", txt, flags=re.S)
    js = None
    end = txt.rfind("}")
    for st in [i for i, ch in enumerate(txt) if ch == "{"]:
        try: js = json.loads(txt[st:end + 1]); break
        except Exception: continue
    if not isinstance(js, dict): return None
    segs = js.get("segments", {})
    if isinstance(segs, list): segs = {str(s.get("id")): s.get("label") for s in segs if isinstance(s, dict)}
    out = {}
    for k in range(1, n + 1):
        v = str(segs.get(str(k), "other")).lower().strip()
        v = next((key for key in KEY2C if key in v), "other")
        out[k] = v
    return {"labels": out, "orientation": js.get("hand_orientation")}

def labels_to_mask(gt, seg, labels):
    """Each GT pixel -> label of nearest labelled skeleton segment (0 = other/dropped)."""
    cmap = np.zeros(seg.max() + 1, np.uint8)
    for k, v in labels.items(): cmap[int(k)] = KEY2C[v]
    lab_sk = cmap[seg]
    if not (seg > 0).any(): return np.zeros(gt.shape, np.uint8)
    _, (iy, ix) = ndimage.distance_transform_edt(seg == 0, return_indices=True)
    out = lab_sk[iy, ix]; out[~gt] = 0
    return out

def mask_to_yolo(lab_c):
    H, W = lab_c.shape; lines = []; cnt = [0] * 4
    for c in range(1, 5):
        m = (lab_c == c).astype(np.uint8)
        if not m.any(): continue
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cn in cnts:
            if cv2.contourArea(cn) < 60: continue
            cn = cv2.approxPolyDP(cn, 1.0, True).reshape(-1, 2)
            if len(cn) < 3: continue
            lines.append(f"{c-1} " + " ".join(f"{x/W:.5f} {y/H:.5f}" for x, y in cn)); cnt[c - 1] += 1
    return lines, cnt

def old_mask(old_ds, split, n, shape):
    H, W = shape; m = np.zeros((H, W), np.uint8)
    p = f"{old_ds}/labels/{split}/{n}.txt"
    for line in (open(p) if os.path.exists(p) else []):
        q = line.split()
        if not q: continue
        pts = (np.array(q[1:], float).reshape(-1, 2) * [W, H]).astype(np.int32)
        cv2.fillPoly(m, [pts], int(q[0]) + 1)
    return m

def seg_old_label(seg, oldm, k):
    v = oldm[seg == k]; v = v[v > 0]
    return 0 if len(v) == 0 else int(np.bincount(v, minlength=5).argmax())

def colorize(rgb, lab):
    ov = rgb.copy(); mm = lab > 0
    ov[cv2.dilate(mm.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0] = 0
    ov[mm] = CLASS_COL[lab[mm]]
    for c in range(1, 5):  # thicker for visibility
        k = cv2.dilate((lab == c).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        ov[k] = CLASS_COL[c]
    return ov

def process(n, split, a, log_path):
    rgb, gt = load_crop(a.src, n)
    seg, _ = segments(gt, shuffle_seed=(n if a.shuffle else None))
    ns = int(seg.max())
    hint = None
    if a.hint:
        oldm = old_mask(a.old, split, n, gt.shape); L = ["none", "heart", "head", "life", "fate"]
        hint = "\n".join(f"  segment {k}: {L[seg_old_label(seg, oldm, k)]}" for k in range(1, ns + 1))
    res, usage = (call_vlm(a.model, render(rgb, seg), ns, log_path, {"image": n, "split": split, "n_segments": ns, "hint": hint}, hint=hint)
                  if ns > 0 else ({"labels": {}, "orientation": None}, {}))
    return n, split, rgb, gt, seg, res, usage

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["pilot", "full"])
    ap.add_argument("--src", default="data/raw/PLSU"); ap.add_argument("--old", default="data/palm_lines_yolo")
    ap.add_argument("--out", default="data/palm_lines_yolo_v2")
    ap.add_argument("--model", default="meta/llama-3.2-90b-vision-instruct")
    ap.add_argument("--n", type=int, default=50); ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--tag", default=""); ap.add_argument("--hint", action="store_true")
    ap.add_argument("--shuffle", action="store_true", help="random segment numbering")
    ap.add_argument("--policy", choices=["ai", "hybrid"], default="ai",
                    help="ai: raw VLM labels; hybrid: keep teacher heart/head/life, VLM labels the rest")
    ap.add_argument("--only", default="", help="comma-separated image ids (pilot debugging)")
    a = ap.parse_args(); os.chdir(ROOT)
    split = {os.path.basename(f)[:-4]: s for s in ("train", "val") for f in glob.glob(f"{a.old}/images/{s}/*.jpg")}
    names = sorted(split)
    if a.mode == "pilot":
        names = random.Random(1).sample(names, a.n) if not a.only else a.only.split(",")
        odir = f"samples/relabel_pilot{a.tag}"; os.makedirs(odir, exist_ok=True)
    log_path = f"logs/relabel/{a.mode}{a.tag}_{a.model.replace('/', '_')}.jsonl"
    todo = names
    if a.mode == "full":
        for s in ("train", "val"):
            os.makedirs(f"{a.out}/images/{s}", exist_ok=True); os.makedirs(f"{a.out}/labels/{s}", exist_ok=True)
        os.makedirs(f"{a.out}/preview", exist_ok=True)
        todo = [n for n in names if not os.path.exists(f"{a.out}/labels/{split[n]}/{n}.txt")]  # resume
    summ_path = f"logs/relabel/{a.mode}{a.tag}_segments.jsonl"
    stats = {"calls_ok": 0, "failed": [], "prompt_tokens": 0, "completion_tokens": 0,
             "seg_total": 0, "seg_agree": 0, "conf": np.zeros((5, 5), int).tolist()}
    conf = np.zeros((5, 5), int)  # rows old (0=none/other), cols new (raw AI)
    conf_final = np.zeros((5, 5), int)  # rows old, cols final label after policy
    with ThreadPoolExecutor(a.workers) as ex:
        futs = [ex.submit(process, n, split[n], a, log_path) for n in todo]
        for j in range(len(futs)):
            f = futs[j]; futs[j] = None  # drop reference so finished images' arrays are freed (avoids RAM growth)
            n, s, rgb, gt, seg, res, usage = f.result()
            if res is None:
                stats["failed"].append(n); print("FAILED", n, flush=True); continue
            stats["calls_ok"] += 1
            stats["prompt_tokens"] += usage.get("prompt_tokens", 0) or 0
            stats["completion_tokens"] += usage.get("completion_tokens", 0) or 0
            oldm = old_mask(a.old, s, n, gt.shape)
            per = []
            for k, v in res["labels"].items():
                o = seg_old_label(seg, oldm, int(k)); c = KEY2C[v]; L = int((seg == int(k)).sum())
                conf[o, c] += L; per.append({"seg": int(k), "len": L, "old": o, "new": c})
            final = dict(res["labels"])
            if a.policy == "hybrid":  # keep teacher heart/head/life; AI decides teacher-unlabelled and heuristic-fate segments
                inv = {v: k for k, v in KEY2C.items()}
                for p_ in per:
                    if p_["old"] in (1, 2, 3): final[p_["seg"]] = inv[p_["old"]]
            for p_ in per: p_["final"] = KEY2C[final[p_["seg"]]]
            for p_ in per: conf_final[p_["old"], p_["final"]] += p_["len"]
            newm = labels_to_mask(gt, seg, final)
            open(summ_path, "a").write(json.dumps({"image": n, "split": s, "orientation": res["orientation"], "policy": a.policy, "segments": per}) + "\n")
            if a.mode == "pilot":
                ann = np.array(render(rgb, seg, max_side=10000))
                both = np.concatenate([ann, colorize(rgb, oldm), colorize(rgb, newm)], 1)
                H = both.shape[0]
                for i, t in enumerate(["segments shown to VLM", "old pseudo-label (v1)", f"new label v2 ({a.policy})"]):
                    cv2.putText(both, t, (i * rgb.shape[1] + 15, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 0, 0), 3)
                cv2.putText(both, "red=heart blue=head green=life yellow=fate", (rgb.shape[1] + 15, H - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), 2)
                Image.fromarray(both).save(f"{odir}/{n}.jpg", quality=85)
            else:
                lines, cnt = mask_to_yolo(newm)
                Image.fromarray(rgb).save(f"{a.out}/images/{s}/{n}.jpg", quality=92)
                open(f"{a.out}/labels/{s}/{n}.txt", "w").write("\n".join(lines) + ("\n" if lines else ""))
                if j < 12: Image.fromarray(colorize(rgb, newm)).save(f"{a.out}/preview/{n}.jpg")
            if j % 25 == 0: print(j, len(todo), n, json.dumps(res["labels"]), flush=True)
    stats["conf"] = conf.tolist(); stats["conf_final"] = conf_final.tolist(); stats["policy"] = a.policy
    stats["final_vs_old_agreement"] = float(np.trace(conf_final) / max(conf_final.sum(), 1))
    lab = ["none", "heart", "head", "life", "fate"]
    tot = conf.sum(); agree = np.trace(conf)
    stats["pixel_weighted_agreement"] = float(agree / max(tot, 1))
    stats["model"] = a.model; stats["images"] = len(todo)
    print("confusion (rows=old, cols=AI; skeleton px):", lab)
    for i in range(5): print(lab[i].ljust(6), conf[i].tolist())
    print(f"final labels (policy={a.policy}) rows=old cols=final:")
    for i in range(5): print(lab[i].ljust(6), conf_final[i].tolist())
    print(json.dumps({k: v for k, v in stats.items() if k not in ("conf", "conf_final")}, indent=1))
    json.dump(stats, open(f"logs/relabel/{a.mode}{a.tag}_stats.json", "w"), indent=1)
    if a.mode == "full":
        open(f"{a.out}/data.yaml", "w").write(f"path: {os.path.abspath(a.out)}\ntrain: images/train\nval: images/val\nnames:\n" +
                                               "".join(f"  {i}: {nm}\n" for i, nm in enumerate(NAMES)))

if __name__ == "__main__":
    main()
