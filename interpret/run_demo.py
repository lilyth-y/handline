"""Demo: run features -> interpretation on ~30 val images.

Writes interpret/demo/results.jsonl, type_distribution.{json,md}, compat_examples.json, overlay_*.png
  python interpret/run_demo.py [--n 30] [--model weights/v2/best.pt]
Single process, 2 torch threads, so a concurrent training job is not starved.
"""
from __future__ import annotations

import argparse
import collections
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from features import ROOT, extract_features, load_model, strip_debug  # noqa: E402
from interpret import compatibility, interpret, load_rules  # noqa: E402

COLORS = {"heart": (230, 40, 60), "head": (40, 90, 230), "life": (30, 170, 60), "fate": (240, 160, 0)}  # RGB
KO = {"heart": "감정선", "head": "두뇌선", "life": "생명선", "fate": "운명선"}


def find_font(bold=True):
    try:
        out = subprocess.run(["fc-match", "-f", "%{file}", "NanumGothic:bold" if bold else "NanumGothic"],
                             capture_output=True, text=True, timeout=5).stdout.strip()
        if out and Path(out).exists() and "Nanum" in out:
            return out
        out = subprocess.run(["fc-list", ":lang=ko", "file"], capture_output=True, text=True, timeout=5).stdout.split()
        out = [o.rstrip(":") for o in out if o.rstrip(":").endswith((".ttf", ".ttc", ".otf"))]
        return out[0] if out else None
    except Exception:
        return None


def stars_str(n):
    return "★" * n + "☆" * (5 - n)


def overlay(img_bgr, preds, feat, res, out_path, font_path):
    H, W = img_bgr.shape[:2]
    scale = 720 / H
    base = cv2.resize(img_bgr, (int(W * scale), 720))
    rgb = cv2.cvtColor(base, cv2.COLOR_BGR2RGB).astype(np.float32)
    name_of = {"heart_line": "heart", "head_line": "head", "life_line": "life", "fate_line": "fate"}
    for cname, inst in preds.items():
        col = np.array(COLORS[name_of[cname]], np.float32)
        for m, _ in inst:
            mm = cv2.resize(m.astype(np.uint8), (base.shape[1], 720), interpolation=cv2.INTER_NEAREST) > 0
            rgb[mm] = 0.35 * rgb[mm] + 0.65 * col
    im = Image.fromarray(rgb.clip(0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    P = feat["palm"]
    d.rectangle([P["xl"] * scale, P["y_top"] * scale, P["xr"] * scale, (P["y_top"] + P["W"]) * scale],
                outline=(60, 60, 60), width=2)
    f_s = ImageFont.truetype(font_path, 18) if font_path else ImageFont.load_default()
    for k, L in feat["lines"].items():
        if not L["present"]:
            continue
        pts = [(x * scale, y * scale) for x, y in L["path_img"]]
        d.line(pts, fill=(255, 255, 255), width=2)
        sx, sy = pts[0]
        ex, ey = pts[-1]
        d.ellipse([sx - 6, sy - 6, sx + 6, sy + 6], fill=COLORS[k], outline=(255, 255, 255), width=2)  # start
        d.rectangle([ex - 5, ey - 5, ex + 5, ey + 5], fill=COLORS[k], outline=(255, 255, 255), width=2)  # end
    # side panel
    panel_w = 470
    canvas = Image.new("RGB", (im.width + panel_w, 720), (255, 252, 245))
    canvas.paste(im, (0, 0))
    d = ImageDraw.Draw(canvas)
    if font_path:
        f_t, f_m, f_x = (ImageFont.truetype(font_path, s) for s in (30, 21, 16))
    else:
        f_t = f_m = f_x = ImageFont.load_default()
    x0, y = im.width + 18, 16
    t = res["type"]
    d.text((x0, y), t["name"], font=f_t, fill=(120, 60, 0)); y += 42
    d.text((x0, y), f"키워드: {t['keyword']}  ·  {feat['image']}", font=f_x, fill=(90, 90, 90)); y += 30
    for k, v in res["lucks"].items():
        d.text((x0, y), f"{v['label']}", font=f_m, fill=(30, 30, 30))
        d.text((x0 + 140, y), stars_str(v["stars"]), font=f_m, fill=(230, 150, 0)); y += 27
        d.text((x0 + 8, y), "· " + v["reason_texts"][0], font=f_x, fill=(80, 80, 80)); y += 30
    y += 6
    d.line([(x0, y), (x0 + panel_w - 36, y)], fill=(200, 190, 170), width=1); y += 10
    L, R = feat["lines"], feat["relations"]

    def g(k, a, fmt="{:.2f}"):
        v = L[k].get(a)
        return "-" if v is None else fmt.format(v) if isinstance(v, (int, float)) else str(v)

    rows = [
        ("감정선", f"길이 {g('heart','length')} · 끝 {g('heart','end_zone','{}')} · 상승 {g('heart','end_rise')}"),
        ("두뇌선", f"길이 {g('head','length')} · 하강 {g('head','drop')} · 휨 {g('head','bend')}"),
        ("생명선", f"길이 {g('life','length')} · 호 너비 {g('life','arc_width')}"),
        ("운명선", f"{'있음 · 길이 ' + g('fate','length') if L['fate']['present'] else '안 보임'}"),
        ("관계", f"두뇌-생명 {'붙음' if R['head_life_joined'] else '떨어짐' if R['head_life_joined'] is False else '-'}"
                f" · 감정-두뇌 간격 {R['heart_head_distance'] if R['heart_head_distance'] is not None else '-'}"),
        ("끊김/가지", " ".join(f"{KO[k][:2]}{L[k].get('breaks', 0)}/{L[k].get('branches', 0)}" for k in L if L[k]["present"])),
    ]
    for a, b in rows:
        d.text((x0, y), a, font=f_x, fill=COLORS.get({v: k for k, v in KO.items()}.get(a, ""), (60, 60, 60)))
        d.text((x0 + 78, y), b, font=f_x, fill=(50, 50, 50)); y += 24
    y += 8
    for k in KO:
        d.rectangle([x0, y + 3, x0 + 14, y + 17], fill=COLORS[k]); d.text((x0 + 20, y), KO[k], font=f_x, fill=(50, 50, 50)); x0 += 90
    x0 = im.width + 18; y += 26
    d.text((x0, y), "● 시작점  ■ 끝점  □ 추정 손바닥 (폭=W)", font=f_x, fill=(90, 90, 90)); y += 24
    d.text((x0, y), "재미로 보는 손금이에요 (entertainment only)", font=f_x, fill=(150, 150, 150))
    canvas.save(out_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", default=str(ROOT / "data/palm_lines_yolo/images/val"))
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--model", default=None)
    ap.add_argument("--out", default=str(HERE / "demo"))
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    model, mpath = load_model(a.model)
    rules, calib = load_rules()
    files = sorted(p for p in Path(a.images).iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    step = max(1, len(files) // a.n)
    files = files[::step][: a.n]
    font = find_font()
    results, feats, dbg = [], [], {}
    with open(out / "results.jsonl", "w") as fo:
        for i, p in enumerate(files):
            feat, img, preds = extract_features(p, model, return_debug=True)
            res = interpret(feat, rules, calib)
            rec = {"image": p.name, "model": str(mpath), "features": strip_debug(feat), "reading": res}
            fo.write(json.dumps(rec, ensure_ascii=False) + "\n")
            results.append(res); feats.append(feat)
            if i < 8:
                dbg[p.name] = (img, preds, feat, res)
            print(f"{i:2d} {p.name:16s} {res['type']['name']:12s} " +
                  " ".join(f"{v['label']}{v['stars']}" for v in res["lucks"].values()), flush=True)
    # distribution
    tc = collections.Counter(r["type"]["name"] for r in results)
    names = [t["name"] for t in rules["types"]]
    stars = {k: dict(sorted(collections.Counter(r["lucks"][k]["stars"] for r in results).items())) for k in rules["lucks"]}
    summary = {"n": len(results), "model": str(mpath), "types": {n: tc.get(n, 0) for n in names}, "stars": stars}
    (out / "type_distribution.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    md = [f"# 데모 유형 분포 (n={len(results)}, model={Path(mpath).name})", "", "| 유형 | 수 |", "|---|---|"]
    md += [f"| {n} | {tc.get(n, 0)} |" for n in names]
    md += ["", "| 운 | ★1 | ★2 | ★3 | ★4 | ★5 |", "|---|---|---|---|---|---|"]
    md += [f"| {rules['lucks'][k]['label']} | " + " | ".join(str(stars[k].get(s, 0)) for s in range(1, 6)) + " |" for k in stars]
    (out / "type_distribution.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))
    # compatibility examples
    comp = [dict(a=feats[i]["image"], b=feats[i + 1]["image"], **compatibility(feats[i], feats[i + 1], rules, calib))
            for i in range(0, min(10, len(feats) - 1), 2)]
    (out / "compat_examples.json").write_text(json.dumps(comp, ensure_ascii=False, indent=1))
    for c in comp:
        print("compat", c["a"], c["b"], c["score"], c["reasons"])
    # overlays: 3 images with different types
    chosen, seen = [], set()
    for k, (img, preds, feat, res) in dbg.items():
        if res["type"]["id"] not in seen:
            chosen.append(k); seen.add(res["type"]["id"])
        if len(chosen) == 3:
            break
    for j, k in enumerate(chosen, 1):
        img, preds, feat, res = dbg[k]
        pth = out / f"overlay_{j}_{Path(k).stem}.png"
        overlay(img, preds, feat, res, pth, font)
        print("overlay", pth)


if __name__ == "__main__":
    main()
