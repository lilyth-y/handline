"""손금 특징 추출 (stage 2-a).

image -> YOLO11n-seg masks -> per-line skeleton features (palm-normalized) -> JSON.

Palm frame used everywhere:
  u : 0 = pinky-side palm edge, 1 = thumb-side palm edge  (mirror-invariant: left/right hands look the same)
  v : 0 = finger base (top of palm), grows toward the wrist; measured in palm widths
All lengths / distances are divided by the palm width W (pixels).

Usage:
  python interpret/features.py IMAGE [--model weights/best.pt] [--out f.json]
Model path: --model > $PALM_MODEL > weights/best.pt  (e.g. PALM_MODEL=weights/v2/best.pt)
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")

import cv2
import networkx as nx
import numpy as np
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = "weights/best.pt"
CLASSES = ["heart_line", "head_line", "life_line", "fate_line"]
SHORT = {"heart_line": "heart", "head_line": "head", "life_line": "life", "fate_line": "fate"}
FEATURE_VERSION = 1

_MODEL_CACHE: dict = {}


def resolve_model_path(model: str | None = None) -> Path:
    p = model or os.environ.get("PALM_MODEL") or DEFAULT_MODEL
    p = Path(p)
    if not p.is_absolute():
        p = ROOT / p
    if not p.exists():
        raise FileNotFoundError(f"model not found: {p}")
    return p


def load_model(model: str | None = None, threads: int = 2):
    import torch
    torch.set_num_threads(threads)
    from ultralytics import YOLO
    path = resolve_model_path(model)
    key = str(path)
    if key not in _MODEL_CACHE:
        _MODEL_CACHE[key] = YOLO(key, task="segment")
    return _MODEL_CACHE[key], path


# ----------------------------------------------------------------------------- prediction
def predict_masks(img_bgr: np.ndarray, model, conf: float = 0.15, imgsz: int = 640):
    """Returns {class_name: [(mask_bool HxW, conf), ...]} at original resolution."""
    r = model.predict(img_bgr, imgsz=imgsz, conf=conf, retina_masks=True, verbose=False, device="cpu")[0]
    out = {c: [] for c in CLASSES}
    if r.masks is None:
        return out
    masks = r.masks.data.cpu().numpy() > 0.5
    H, W = img_bgr.shape[:2]
    for m, c, s in zip(masks, r.boxes.cls.cpu().numpy().astype(int), r.boxes.conf.cpu().numpy()):
        if m.shape != (H, W):
            m = cv2.resize(m.astype(np.uint8), (W, H), interpolation=cv2.INTER_NEAREST) > 0
        out[CLASSES[c]].append((m, float(s)))
    return out


# ----------------------------------------------------------------------------- hand / palm
def hand_mask(img_bgr: np.ndarray) -> np.ndarray:
    """Hand silhouette for light/plain backgrounds (PLSU = white bg). Otsu on chroma+darkness."""
    img = cv2.GaussianBlur(img_bgr, (5, 5), 0).astype(np.int16)
    chroma = img.max(2) - img.min(2)
    dark = 255 - img.mean(2)
    f = np.clip(chroma + 0.5 * dark, 0, 255).astype(np.uint8)
    _, m = cv2.threshold(f, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k, iterations=2)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
    if n <= 1:
        return np.zeros(m.shape, bool)
    big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    m = (lab == big).astype(np.uint8)
    # fill holes
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(m)
    cv2.drawContours(filled, cnts, -1, 1, -1)
    return filled.astype(bool)


def _runs(row: np.ndarray):
    """[(start, end_exclusive)] of True runs in a 1-D bool array."""
    d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
    s = np.where(d == 1)[0]
    e = np.where(d == -1)[0]
    return list(zip(s, e))


def _run_at(row, x):
    rs = _runs(row)
    if not rs:
        return None
    for s, e in rs:
        if s <= x < e:
            return (s, e)
    return max(rs, key=lambda r: r[1] - r[0])


def estimate_palm(img_bgr: np.ndarray, line_px: dict) -> dict:
    """Palm width W, palm x-span, finger-base row, thumb side.  Falls back to the line extents."""
    H, Wimg = img_bgr.shape[:2]
    allpts = np.concatenate([p for p in line_px.values() if len(p)], 0) if any(len(p) for p in line_px.values()) else None
    hm = hand_mask(img_bgr)
    frac = hm.mean()
    method = "hand_mask"
    info = {}
    ok = 0.05 < frac < 0.9 and allpts is not None
    if ok:
        ref = line_px.get("heart_line")
        ref = ref if ref is not None and len(ref) else allpts
        y_ref = int(np.median(ref[:, 1]))
        x_c = int(np.median(allpts[:, 0]))
        # median palm span over a few rows around the heart line
        spans = []
        for y in range(max(0, y_ref - 10), min(H, y_ref + 11), 2):
            r = _run_at(hm[y], x_c)
            if r:
                spans.append(r)
        if spans:
            xl = float(np.median([s for s, _ in spans]))
            xr = float(np.median([e for _, e in spans]))
            Wp = xr - xl
            lx0, lx1 = np.percentile(allpts[:, 0], [1, 99])
            # sanity: lines must sit (mostly) inside the span and the span must not be absurd
            if Wp < 0.5 * (lx1 - lx0) or Wp > 0.98 * Wimg:
                ok = False
        else:
            ok = False
    if ok:
        xm = int((xl + xr) / 2)
        y_top = None
        for y in range(y_ref, -1, -1):
            r = _run_at(hm[y], xm)
            if r is None or (r[1] - r[0]) < 0.75 * Wp:
                y_top = y
                break
        if y_top is None:
            y_top = max(0, int(y_ref - 0.25 * Wp))
        # thumb side: hand mass outside the palm span below the heart line
        below = hm[y_ref: min(H, int(y_ref + 0.9 * Wp))]
        left_mass = below[:, : max(0, int(xl - 2))].sum()
        right_mass = below[:, min(Wimg, int(xr + 2)):].sum()
        info["thumb_mass_lr"] = [int(left_mass), int(right_mass)]
    else:
        method = "line_extent"
        if allpts is None:
            xl, xr, y_top = 0.15 * Wimg, 0.85 * Wimg, 0.35 * H
        else:
            lx0, lx1 = np.percentile(allpts[:, 0], [1, 99])
            ly0 = np.percentile(allpts[:, 1], 1)
            pad = 0.08 * (lx1 - lx0)
            xl, xr = lx0 - pad, lx1 + pad
            y_top = ly0 - 0.15 * (xr - xl)
        Wp = xr - xl
        left_mass = right_mass = 0
    # finger-base row sanity: heart line normally sits 0.1-0.35 W below the finger base
    heart = line_px.get("heart_line")
    if heart is not None and len(heart):
        hy = float(np.median(heart[:, 1]))
        y_top = float(min(max(y_top, hy - 0.35 * Wp), hy - 0.1 * Wp))
    thumb_right, side_src, votes = thumb_side_vote(line_px, xl, xr, left_mass, right_mass, Wp)
    info["thumb_votes"] = votes
    return dict(W=float(Wp), xl=float(xl), xr=float(xr), y_top=float(y_top), thumb_right=thumb_right,
                method=method, thumb_side_source=side_src, hand_frac=float(frac), **info)


def thumb_side_vote(line_px, xl, xr, left_mass, right_mass, Wp):
    """Weighted vote (+ = thumb on image right). Several weak cues, because the model's life line is noisy."""
    votes = {}
    tot = left_mass + right_mass
    if tot > 0.01 * Wp * Wp and max(left_mass, right_mass) > 3 * max(1, min(left_mass, right_mass)):
        votes["silhouette"] = 2.0 if right_mass > left_mass else -2.0
    heart = line_px.get("heart_line")
    if heart is not None and len(heart) > 20:
        x0, x1 = heart[:, 0].min(), heart[:, 0].max()
        dl, dr = x0 - xl, xr - x1          # heart line runs out to the pinky-side edge
        if abs(dl - dr) > 0.05 * Wp:
            votes["heart_edge"] = 1.5 if dl < dr else -1.5
    life = line_px.get("life_line")
    if life is not None and len(life) > 20:
        top = life[life[:, 1] <= np.percentile(life[:, 1], 10)][:, 0].mean()
        bot = life[life[:, 1] >= np.percentile(life[:, 1], 90)][:, 0].mean()
        if abs(top - bot) > 0.03 * Wp:
            votes["life_top"] = 1.0 if top > bot else -1.0
        head = line_px.get("head_line")
        if head is not None and len(head) > 20:
            ltop = life[np.argmin(life[:, 1])]
            hl = head[np.argmin(head[:, 0])]
            hr = head[np.argmax(head[:, 0])]
            votes["head_life"] = 1.0 if np.linalg.norm(hr - ltop) < np.linalg.norm(hl - ltop) else -1.0
    s = sum(votes.values())
    if s == 0:
        return True, "default", votes
    return bool(s > 0), "vote", {k: float(v) for k, v in votes.items()}


def to_palm(pts_xy: np.ndarray, palm: dict) -> np.ndarray:
    W = palm["W"]
    if palm["thumb_right"]:
        u = (pts_xy[:, 0] - palm["xl"]) / W
    else:
        u = (palm["xr"] - pts_xy[:, 0]) / W
    v = (pts_xy[:, 1] - palm["y_top"]) / W
    return np.stack([u, v], 1)


# ----------------------------------------------------------------------------- skeleton graph
def skeleton_graph(skel: np.ndarray) -> nx.Graph:
    ys, xs = np.nonzero(skel)
    G = nx.Graph()
    idx = {(y, x): i for i, (y, x) in enumerate(zip(ys, xs))}
    for (y, x), i in idx.items():
        G.add_node(i, xy=(x, y))
        for dy, dx in ((0, 1), (1, -1), (1, 0), (1, 1)):
            j = idx.get((y + dy, x + dx))
            if j is not None:
                G.add_edge(i, j, weight=math.sqrt(2) if dx and dy else 1.0)
    return G


def longest_path(G: nx.Graph):
    """Double-sweep Dijkstra (exact on trees, good approximation on skeletons)."""
    n0 = next(iter(G.nodes))
    d = nx.single_source_dijkstra_path_length(G, n0)
    a = max(d, key=d.get)
    d, paths = nx.single_source_dijkstra(G, a)
    b = max(d, key=d.get)
    return paths[b], float(d[b])


def path_len(xy: np.ndarray) -> float:
    return float(np.linalg.norm(np.diff(xy, axis=0), axis=1).sum()) if len(xy) > 1 else 0.0


def analyse_line(name: str, inst: list, palm: dict, shape) -> dict:
    W = palm["W"]
    feat = {"present": False}
    if not inst:
        return feat
    union = np.zeros(shape, bool)
    for m, _ in inst:
        union |= m
    skel = skeletonize(union)
    G = skeleton_graph(skel)
    comps = []
    for cc in nx.connected_components(G):
        sub = G.subgraph(cc)
        if len(cc) < 3:
            continue
        path, L = longest_path(sub)
        comps.append((L, sub, path))
    comps = [c for c in comps if c[0] >= 0.03 * W]
    if not comps:
        return feat
    comps.sort(key=lambda c: -c[0])
    Lmain, main, path = comps[0]
    main_xy = np.array([G.nodes[i]["xy"] for i in path], float)
    # segments near the main one = same line with gaps
    segs = [comps[0]]
    for c in comps[1:]:
        xy = np.array([G.nodes[i]["xy"] for i in c[2]], float)
        dmin = np.min(np.linalg.norm(xy[:, None, :] - main_xy[::3][None, :, :], axis=2))
        if dmin < 0.35 * W and c[0] >= 0.04 * W:
            segs.append(c)
    # branches: side-trees hanging off the main path, longer than 5% of palm width
    rest = main.copy()
    rest = nx.Graph(rest)
    rest.remove_nodes_from(path)
    branches = 0
    for cc in nx.connected_components(rest):
        sub = rest.subgraph(cc)
        Lb = sum(d["weight"] for _, _, d in sub.edges(data=True)) + 1
        if Lb >= 0.05 * W:
            branches += 1

    P = to_palm(main_xy, palm)
    # orient path: heart pinky->index (u up), head thumb->outer (u down), life top->wrist, fate wrist->top
    if name == "heart_line" and P[0, 0] > P[-1, 0]:
        P, main_xy = P[::-1], main_xy[::-1]
    if name == "head_line" and P[0, 0] < P[-1, 0]:
        P, main_xy = P[::-1], main_xy[::-1]
    if name == "life_line" and P[0, 1] > P[-1, 1]:
        P, main_xy = P[::-1], main_xy[::-1]
    if name == "fate_line" and P[0, 1] < P[-1, 1]:
        P, main_xy = P[::-1], main_xy[::-1]

    total_len = sum(c[0] for c in segs) / W
    chord_vec = P[-1] - P[0]
    chord = float(np.linalg.norm(chord_vec)) + 1e-6
    # signed sagitta: + = bulges toward the fingers (smaller v) for horizontal lines,
    #                 + = bulges toward the palm centre (smaller u) for life/fate
    nrm = np.array([-chord_vec[1], chord_vec[0]]) / chord
    dev = (P - P[0]) @ nrm
    k = int(np.argmax(np.abs(dev)))
    sag = float(dev[k]) / chord
    if name in ("heart_line", "head_line"):
        bulge_dir = np.array([0.0, -1.0])
    else:
        bulge_dir = np.array([-1.0, 0.0])
    sign = 1.0 if (nrm @ bulge_dir) * dev[k] >= 0 else -1.0
    bend = abs(sag)
    # angle of the chord in palm frame: degrees, 0 = horizontal, + = going toward the wrist
    ang = math.degrees(math.atan2(chord_vec[1], abs(chord_vec[0]) + 1e-6))
    area = int(sum(m.sum() for m, _ in inst))
    skel_len = sum(c[0] for c in segs)
    thickness = area / max(skel_len, 1) / W
    conf = max(s for _, s in inst)

    feat.update(
        present=True,
        confidence=round(conf, 3),
        length=round(Lmain / W, 3),
        total_length=round(total_len, 3),
        chord=round(chord, 3),
        bend=round(bend, 3),
        bend_signed=round(sign * bend, 3),
        tortuosity=round(Lmain / W / chord - 1, 3),
        angle_deg=round(ang, 1),
        start_u=round(float(P[0, 0]), 3), start_v=round(float(P[0, 1]), 3),
        end_u=round(float(P[-1, 0]), 3), end_v=round(float(P[-1, 1]), 3),
        min_u=round(float(P[:, 0].min()), 3), max_u=round(float(P[:, 0].max()), 3),
        min_v=round(float(P[:, 1].min()), 3), max_v=round(float(P[:, 1].max()), 3),
        thickness=round(thickness * 100, 2),  # % of palm width
        clarity=round(float(0.6 * conf + 0.4 * min(1.0, thickness * 100 / 3.0)), 3),
        breaks=len(segs) - 1,
        branches=branches,
        n_instances=len(inst),
    )
    # line specific
    if name == "heart_line":
        e = feat["end_u"]
        # zone boundaries are approximate (finger positions are not detected); tuned on PLSU val so the
        # 4 zones are all populated. u is measured on the palm span at heart-line height.
        feat["end_zone"] = ("index" if e >= 0.66 else "index_middle" if e >= 0.56 else
                            "middle" if e >= 0.46 else "ring")
        # rise of the tail toward the fingers (palm widths)
        feat["end_rise"] = round(float(P[:, 1].max() - P[-1, 1]), 3)
    if name == "head_line":
        feat["reach_u"] = feat["end_u"]  # small = reaches far toward pinky edge
        feat["drop"] = round(float(P[-1, 1] - P[0, 1]), 3)
    if name == "life_line":
        feat["arc_width"] = round(float(1.0 - P[:, 0].min()), 3)  # how far the arc swings into the palm
        feat["reach_v"] = feat["max_v"]
    if name == "fate_line":
        feat["top_v"] = feat["min_v"]
        feat["straightness"] = round(1.0 / (1.0 + feat["tortuosity"]), 3)
    # downsampled path for overlays (image px)
    step = max(1, len(main_xy) // 24)
    feat["path_img"] = main_xy[::step].round().astype(int).tolist() + [main_xy[-1].round().astype(int).tolist()]
    return feat


def relations(lines: dict, skel_px: dict, palm: dict) -> dict:
    W = palm["W"]
    rel = {"head_life_joined": None, "head_life_gap": None, "heart_head_distance": None,
           "fate_present": bool(lines["fate"]["present"]), "fate_length": lines["fate"].get("length", 0.0),
           "n_lines": int(sum(lines[k]["present"] for k in lines)), "simian_like": False}
    hd, lf, ht = lines["head"], lines["life"], lines["heart"]
    if hd["present"] and lf["present"]:
        s = np.array(hd["path_img"][0], float)
        life_pts = skel_px["life_line"]
        gap = float(np.min(np.linalg.norm(life_pts - s[None], axis=1))) / W
        rel["head_life_gap"] = round(gap, 3)
        rel["head_life_joined"] = bool(gap < 0.07)
    if ht["present"] and hd["present"]:
        a = to_palm(np.array(ht["path_img"], float), palm)
        b = to_palm(np.array(hd["path_img"], float), palm)
        lo, hi = max(a[:, 0].min(), b[:, 0].min()), min(a[:, 0].max(), b[:, 0].max())
        if hi - lo > 0.1:
            us = np.linspace(lo, hi, 15)
            ia, ib = np.argsort(a[:, 0]), np.argsort(b[:, 0])
            va = np.interp(us, a[ia, 0], a[ia, 1])
            vb = np.interp(us, b[ib, 0], b[ib, 1])
            dist = float(np.mean(vb - va))
        else:
            dist = float(b[:, 1].mean() - a[:, 1].mean())
        rel["heart_head_distance"] = round(dist, 3)
        rel["simian_like"] = bool(dist < 0.06)
    return rel


def extract_features(image, model=None, conf: float = 0.15, return_debug: bool = False):
    """image: path or BGR ndarray. model: YOLO object, path str, or None (env/default)."""
    if isinstance(image, (str, Path)):
        img = cv2.imread(str(image))
        if img is None:
            raise FileNotFoundError(image)
        name = Path(image).name
    else:
        img, name = image, None
    if model is None or isinstance(model, (str, Path)):
        model, mpath = load_model(model)
    else:
        mpath = getattr(model, "ckpt_path", None) or getattr(model, "model_name", "?")
    preds = predict_masks(img, model, conf=conf)
    line_px, skel_px = {}, {}
    for c in CLASSES:
        if preds[c]:
            u = np.zeros(img.shape[:2], bool)
            for m, _ in preds[c]:
                u |= m
            ys, xs = np.nonzero(skeletonize(u))
            skel_px[c] = np.stack([xs, ys], 1).astype(float)
            line_px[c] = skel_px[c]
        else:
            skel_px[c] = np.zeros((0, 2))
            line_px[c] = np.zeros((0, 2))
    palm = estimate_palm(img, line_px)
    lines = {SHORT[c]: analyse_line(c, preds[c], palm, img.shape[:2]) for c in CLASSES}
    rel = relations(lines, skel_px, palm)
    out = {
        "image": name,
        "feature_version": FEATURE_VERSION,
        "model": str(mpath),
        "image_size": [int(img.shape[1]), int(img.shape[0])],
        "palm": {k: (round(v, 2) if isinstance(v, float) else v) for k, v in palm.items()},
        "lines": lines,
        "relations": rel,
    }
    if return_debug:
        return out, img, preds
    return out


def strip_debug(feat: dict) -> dict:
    """Copy without image-space paths (for the LLM prompt)."""
    f = json.loads(json.dumps(feat))
    for v in f["lines"].values():
        v.pop("path_img", None)
    return f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--model", default=None)
    ap.add_argument("--conf", type=float, default=0.15)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    f = extract_features(a.image, a.model, a.conf)
    s = json.dumps(f, ensure_ascii=False, indent=1)
    if a.out:
        Path(a.out).write_text(s)
    else:
        print(s)


if __name__ == "__main__":
    main()
