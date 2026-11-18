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

## 공유 부스트 (친구 도전장 / 카카오톡 공유)

- 결과 화면 맨 위(`#r-sharehero`)와 맨 아래(`#btn-share`), 화면을 내릴 때 뜨는 하단 고정 버튼이 같은 공유 로직(`js/app.js` → `js/share.js`)을 쓴다.
- 공유 링크는 `https://hoadosa.com/s/<유형id>/?s=<별점4자리>&ref=share`. 이 정적 페이지가 유형별 OG 미리보기(`img/share/<id>.jpg`)를 갖고 있고, 사람이 열면 `/?t=<id>&s=…&ref=share` 로 바로 넘어간다. `/s/*` 는 noindex.
- 미리보기 이미지와 `/s/*` 페이지는 `node tools/gen_share_og.mjs` 로 다시 만든다 (앱 마스코트만 사용, 손 사진 없음).
- 카카오톡 공유: `js/share.js` 의 `KAKAO_JS_KEY` 를 채우면 카카오톡 버튼이 나타난다 (비어 있으면 숨김, 공유 시트/링크 복사로 대체).
  1. developers.kakao.com → 앱 만들기 → [플랫폼 키] → JavaScript 키 복사
  2. 같은 화면 [JavaScript SDK 도메인] 에 `https://hoadosa.com` (필요하면 `https://hoa-palm.vercel.app`) 등록
  3. [제품 링크 관리] → [웹 도메인] 에도 같은 도메인 등록 (카카오톡 공유 링크 허용)
  4. 키를 `KAKAO_JS_KEY` 에 넣고 배포. SDK 는 2.8.5 + SRI 해시로 고정돼 있다.
- 클릭 집계: `window.va('event', …)` (Vercel Web Analytics 사용자 지정 이벤트): `share_click`, `share_done`, `share_cancel`, `share_landing`, `share_challenge_click`, `share_friend_result`. 개인정보는 보내지 않는다. (사용자 지정 이벤트는 Vercel 요금제에 따라 대시보드에 안 보일 수 있다.)
- 테스트: `node tests/e2e_share.mjs http://localhost:<port>/` (수집은 꺼진 상태로 실행, 네트워크 쓰기 없음).
