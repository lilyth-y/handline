# 호아 도사의 손금 풀이 — mobile web app (MVP)

Static site (no server, no build step). Everything runs on the phone:

1. photo → `js/palm.js` (letterbox → YOLO11n-seg v2 ONNX via onnxruntime-web wasm → masks → skeleton features;
   a port of `interpret/features.py`, skeletonize is an exact port of skimage's Zhang-Suen LUT)
2. features → `js/interpret.js` (port of `interpret/interpret.py`; rules/calibration are generated data,
   expressions are evaluated by the tiny safe parser in `js/expr.js` — no `eval`)
3. templated 호아 도사 readings in `js/copy.js` (no LLM key)

```
public/            # deploy this folder as-is
  index.html css/ js/ img/
  model/palm-v2.onnx         # = weights/v2/best.onnx
  vendor/ort*                # onnxruntime-web 1.31 wasm build
tools/gen_rules.cjs          # rules.yaml       -> public/js/rules.js   (npm run gen)
tools/gen_calib.cjs          # calibration.yaml -> public/js/calib.js
tools/serve.mjs              # local static server (npm run serve -> :8787)
tools/batch_features.mjs     # batch feature extraction with the app's own browser pipeline (percentile reference set, ../interpret/refset)
tests/e2e.mjs                # Playwright e2e on val images, screenshots -> ../web_screens
```

Rerun `npm run gen` and copy the new ONNX to `public/model/palm-v2.onnx` whenever the model, rules or calibration change.
Parity (val, 40 images): JS vs Python(.pt) type 34/40, stars 144/160 — differences come from .onnx vs .pt outputs;
the interpretation engine itself matches Python 175/175 on identical features.

Percentiles ('상위 %') compare against the reference set in `../interpret/refset/` (189 people, 375 hands, 2,201 palm photos,
PLSU + 11K Hands, features from this browser pipeline). `gen_calib.cjs` copies its size into `calib.js` (`CALIB.ref`), which the
손금 측정값 footnote shows. Parity on that set: `node tests/evidence_parity.mjs ../data/refset/combined.jsonl` → 8,804/8,804 luck checks match Python.

## 익명 측정값 수집 (`js/collect.js`)
분석이 성공하면(선 2개 이상) 결과 화면을 띄운 뒤 **fire-and-forget** 으로 숫자 특징 1행(~1.8KB)을 Supabase 에 보낸다.
- 보내는 것: 선별 측정값(`lines.*` 스칼라만, `path_img` 좌표 제외), `relations`, 손바닥 추정치(`palm` 스칼라), 별점, 유형, 사진 크기,
  찾은 선 수, 앱/모델/보정 버전, 기기 종류(`kakao`/`mobile`/`desktop`/`other`). 날짜는 DB 가 붙인다(시각 X).
- 보내지 않는 것: 사진·마스크·파일 이름·IP(컬럼 없음)·기기/사용자 ID. 요청은 `credentials: 'omit'`, `no-referrer`.
- 동의/끄기: 촬영 화면 카드(토글, 기본 켜짐), 결과 화면 하단 상태 줄, `개인정보 안내` 화면(토글). 끄면 `localStorage.hoa_collect='off'` 로 기억.
- 중복: 같은 파일(SHA-256 앞 12바이트)은 세션(`sessionStorage`)당 한 번.
- 저장: Supabase 프로젝트 `handline` → `public.palm_features` (RLS: anon INSERT 전용, 컬럼 CHECK, features ≤ 8KB, 하루 5,000행).
  공개(publishable) 키만 클라이언트에 있다. 서버 키는 저장소 어디에도 두지 않는다.
- 테스트 행: URL 에 `?collect_test=1` 이면 `is_test=true` 로 보내고, 내보내기 스크립트가 제외한다.
- E2E: `node tests/e2e_collect.mjs [baseURL]` — INSERT 1회 · 페이로드에 사진/좌표 없음 · 같은 사진 중복 제거 · 끄기 기억 + 아무것도 안 보냄 ·
  anon SELECT/UPDATE/DELETE 거부 · 8KB 초과 거부. 끝나면 `delete from palm_features where is_test;` 로 테스트 행 삭제.
- 보정에 쓰기: `../interpret/refset/README.md` 의 "실제 사용자 측정값으로 다시 보정하기".
