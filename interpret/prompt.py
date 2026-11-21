"""언어별 LLM 풀이 프롬프트 + interpret() 결과 현지화 도우미.

    from interpret.prompt import load_prompt, localize
    res = localize(interpret(feat), "en")        # "ko" | "en" | "ja" | "zh-tw"
    system, user_tpl = load_prompt("en")

- 프롬프트: prompt_ko.md / prompt_en.md / prompt_ja.md / prompt_zh-tw.md (각 ## SYSTEM / ## USER 구간)
- localize(): interpret() 결과의 유형 이름·keyword·element, 운 라벨, reason_texts 를 해당 언어로 바꾼다
  (문구는 앱 사전에서 내보낸 i18n_texts.json — `cd web && node tools/export_i18n_texts.mjs`).
- 규칙 계산(별점, 점수)은 언어와 무관하다. rules.yaml / calibration 은 그대로.
"""
import copy
import json
import os
import re

LANGS = ("ko", "en", "ja", "zh-tw", "zh-cn", "es", "vi", "th", "id", "de", "fr")
_HERE = os.path.dirname(os.path.abspath(__file__))
_TEXTS = None


def _texts():
    global _TEXTS
    if _TEXTS is None:
        with open(os.path.join(_HERE, "i18n_texts.json"), encoding="utf-8") as f:
            _TEXTS = json.load(f)
    return _TEXTS


def load_prompt(lang="ko"):
    """(system, user_template) 문자열을 돌려준다. user_template 의 {{...}} 는 호출자가 채운다."""
    if lang not in LANGS:
        raise ValueError(f"unknown lang {lang!r}; expected one of {LANGS}")
    with open(os.path.join(_HERE, f"prompt_{lang}.md"), encoding="utf-8") as f:
        md = f.read()
    m = re.search(r"^## SYSTEM\s*\n(.*?)^## USER\s*\n(.*?)^---", md, re.S | re.M)
    if not m:
        raise ValueError(f"prompt_{lang}.md: SYSTEM/USER sections not found")
    return m.group(1).strip(), m.group(2).strip()


def localize(res, lang="ko"):
    """interpret() 결과(dict)를 lang 문구로 바꾼 복사본을 돌려준다. 입력은 바꾸지 않는다."""
    if lang not in LANGS:
        raise ValueError(f"unknown lang {lang!r}; expected one of {LANGS}")
    T = _texts()[lang]
    out = copy.deepcopy(res)
    tid = out.get("type", {}).get("id")
    if tid in T["types"]:
        out["type"].update({k: T["types"][tid][k] for k in ("name", "keyword", "element")})
    for k, v in out.get("lucks", {}).items():
        v["label"] = T["lucks"].get(k, v.get("label"))
        v["reason_texts"] = [T["reasons"].get(r, r) for r in v.get("reasons", [])]
    if "reasons" in out and "reason_texts" in out:  # compatibility() 결과
        out["reason_texts"] = [T["reasons"].get(r, r) for r in out["reasons"]]
    return out
