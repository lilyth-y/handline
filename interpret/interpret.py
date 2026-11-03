"""손금 해석 (stage 2-b): features JSON -> 4 luck stars + 1 of 12 fox types + friend compatibility.

Everything is driven by interpret/rules.yaml (transparent rule table) and
interpret/calibration.yaml (feature quantiles + per-type balancing biases, produced by calibrate.py).

  python interpret/interpret.py features.json            # one reading
  python interpret/interpret.py a.json --friend b.json   # 궁합
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
RULES_PATH = HERE / "rules.yaml"
CALIB_PATH = HERE / "calibration.yaml"


# ----------------------------------------------------------------------------- safe feature access
class _Missing:
    """Stands in for any feature of an absent line: every comparison is False, maths stays Missing."""
    def __bool__(self): return False
    def __eq__(self, o): return False
    def __ne__(self, o): return True
    def __lt__(self, o): return False
    __le__ = __gt__ = __ge__ = __lt__
    def __add__(self, o): return self
    __radd__ = __sub__ = __rsub__ = __mul__ = __rmul__ = __truediv__ = __rtruediv__ = __abs__ = __neg__ = __add__
    def __hash__(self): return 0
    def __repr__(self): return "Missing"


MISSING = _Missing()


class NS:
    def __init__(self, d: dict | None):
        self._d = d or {}
    def __getattr__(self, k):
        v = self._d.get(k, MISSING)
        return MISSING if v is None else v


def _namespace(feat: dict, calib: dict, extra: dict | None = None):
    L = feat["lines"]
    quant = (calib or {}).get("quantiles", {})

    def pct(key: str) -> float:
        """Percentile rank (0..1) of a feature among the calibration set; absent -> 0."""
        obj, attr = key.split(".")
        src = L.get(obj) if obj in L else feat.get("relations", {}) if obj == "rel" else None
        val = None if src is None else src.get(attr)
        if val is None or isinstance(val, bool) and obj != "rel":
            return 0.0
        q = quant.get(key)
        if not q:
            return 0.5
        qs = q["q"]  # values at 0,10,...,100 percentiles
        val = float(val)
        if val <= qs[0]:
            return 0.0
        if val >= qs[-1]:
            return 1.0
        for i in range(len(qs) - 1):
            if qs[i] <= val <= qs[i + 1]:
                span = qs[i + 1] - qs[i]
                return (i + (val - qs[i]) / span if span > 0 else i + 0.5) / (len(qs) - 1)
        return 0.5

    ns = {"heart": NS(L.get("heart")), "head": NS(L.get("head")), "life": NS(L.get("life")),
          "fate": NS(L.get("fate")), "rel": NS(feat.get("relations")), "palm": NS(feat.get("palm")),
          "pct": pct, "abs": abs, "min": min, "max": max, "MISSING": MISSING}
    if extra:
        ns.update(extra)
    return ns


def _eval(expr, ns):
    if isinstance(expr, (int, float)):
        return expr
    v = eval(expr, {"__builtins__": {}}, ns)  # rules.yaml is our own trusted file
    if isinstance(v, _Missing):
        return 0
    return v


# ----------------------------------------------------------------------------- engine
def load_rules(path=RULES_PATH, calib_path=CALIB_PATH):
    rules = yaml.safe_load(Path(path).read_text())
    calib = yaml.safe_load(Path(calib_path).read_text()) if Path(calib_path).exists() else {}
    return rules, calib or {}


def score_lucks(feat, rules, calib):
    ns = _namespace(feat, calib)
    out = {}
    for key, spec in rules["lucks"].items():
        raw = float(spec.get("base", 3.0))
        fired = []
        for r in spec["rules"]:
            if _eval(r["when"], ns):
                raw += r["add"]
                fired.append((r["add"], r["id"], r["reason"]))
        stars = int(max(1, min(5, math.floor(raw + 0.5))))
        # reasons: strongest positive first (gentle framing), then others
        fired.sort(key=lambda t: (-t[0], t[1]))
        reasons = list(dict.fromkeys(t[2] for t in fired if t[0] >= 0))[:2] or [spec["default_reason"]]
        out[key] = {"label": spec["label"], "stars": stars, "raw": round(raw, 2),
                    "reasons": reasons, "rules_fired": [t[1] for t in fired]}
    return out


def score_types(feat, lucks, rules, calib):
    stars = NS({k: (v["stars"] - 1) / 4 for k, v in lucks.items()})
    ns = _namespace(feat, calib, {"stars": stars})
    sig = {}
    for name, expr in rules["signals"].items():
        v = _eval(expr, ns)
        sig[name] = float(v) if not isinstance(v, bool) else float(v)
    bias = (calib.get("type_bias") or {})
    scores = []
    for i, t in enumerate(rules["types"]):
        s = sum(w * sig[s_name] for s_name, w in t["weights"].items()) + bias.get(t["id"], 0.0)
        scores.append((round(s, 4), -i, t))
    # deterministic: max score, ties -> earlier type in rules.yaml order
    scores.sort(key=lambda x: (x[0], x[1]), reverse=True)
    best = scores[0][2]
    top_sig = sorted(best["weights"].items(), key=lambda kv: -kv[1] * sig[kv[0]])
    return {"id": best["id"], "name": best["name"], "element": best["element"], "keyword": best["keyword"],
            "score": scores[0][0], "why_signals": [k for k, _ in top_sig[:3]],
            "ranking": [(s[2]["id"], s[0]) for s in scores[:3]]}, sig


def interpret(feat, rules=None, calib=None):
    if rules is None:
        rules, calib = load_rules()
    lucks = score_lucks(feat, rules, calib)
    typ, sig = score_types(feat, lucks, rules, calib)
    reason_text = rules["reasons"]
    return {
        "image": feat.get("image"),
        "type": typ,
        "lucks": {k: {**v, "reason_texts": [reason_text.get(r, r) for r in v["reasons"]]} for k, v in lucks.items()},
        "signals": {k: round(v, 3) for k, v in sig.items()},
        "disclaimer": rules.get("disclaimer"),
    }


# ----------------------------------------------------------------------------- 궁합
def compatibility(feat_a, feat_b, rules=None, calib=None):
    """Two feature sets -> friend compatibility 0-100 + reason keys (always friendly, floor 55)."""
    if rules is None:
        rules, calib = load_rules()
    ra, rb = interpret(feat_a, rules, calib), interpret(feat_b, rules, calib)
    C = rules["compatibility"]
    score = float(C["base"])
    reasons = []

    def ln(f, k):
        return f["lines"].get(k, {})

    # 1. love style: heart line end zone similarity
    za, zb = ln(feat_a, "heart").get("end_zone"), ln(feat_b, "heart").get("end_zone")
    order = ["ring", "middle", "index_middle", "index"]
    if za in order and zb in order:
        d = abs(order.index(za) - order.index(zb))
        if d == 0:
            score += C["heart_same"]; reasons.append("compat_heart_same")
        elif d == 1:
            score += C["heart_near"]; reasons.append("compat_heart_near")
    # 2. thinking style: head slope — similar = 말이 잘 통함, very different = 서로 보완
    aa, ab = ln(feat_a, "head").get("angle_deg"), ln(feat_b, "head").get("angle_deg")
    if aa is not None and ab is not None:
        diff = abs(aa - ab)
        if diff < 8:
            score += C["head_similar"]; reasons.append("compat_head_similar")
        elif diff > 20:
            score += C["head_complement"]; reasons.append("compat_head_complement")
    # 3. energy: life arc width closeness
    wa, wb = ln(feat_a, "life").get("arc_width"), ln(feat_b, "life").get("arc_width")
    if wa is not None and wb is not None and abs(wa - wb) < 0.1:
        score += C["life_similar"]; reasons.append("compat_life_similar")
    # 4. independence: head-life junction
    ja, jb = feat_a["relations"].get("head_life_joined"), feat_b["relations"].get("head_life_joined")
    if ja is not None and jb is not None:
        if ja == jb:
            score += C["junction_same"]; reasons.append("compat_junction_same")
        else:
            score += C["junction_mix"]; reasons.append("compat_junction_mix")
    # 5. element pairing of the two fox types
    ea, eb = ra["type"]["element"], rb["type"]["element"]
    pair = C["element_pairs"].get(f"{ea}-{eb}") or C["element_pairs"].get(f"{eb}-{ea}")
    if ea == eb:
        score += C["same_element"]; reasons.append("compat_same_element")
    elif pair:
        score += pair; reasons.append("compat_element_pair")
    # 6. luck balance: complementary strengths
    comp = sum(1 for k in ra["lucks"] if abs(ra["lucks"][k]["stars"] - rb["lucks"][k]["stars"]) >= 2)
    if comp:
        score += C["luck_complement"] * min(comp, 2); reasons.append("compat_luck_complement")
    score = int(round(max(C["floor"], min(100, score))))
    if not reasons:
        reasons = ["compat_default"]
    return {"score": score, "type_a": ra["type"]["name"], "type_b": rb["type"]["name"],
            "reasons": reasons, "reason_texts": [rules["reasons"].get(r, r) for r in reasons]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("features")
    ap.add_argument("--friend", default=None)
    a = ap.parse_args()
    fa = json.loads(Path(a.features).read_text())
    if a.friend:
        fb = json.loads(Path(a.friend).read_text())
        print(json.dumps(compatibility(fa, fb), ensure_ascii=False, indent=1))
    else:
        print(json.dumps(interpret(fa), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
