# 백분위 기준 세트 (percentile reference set)

앱의 "상위 22%" 같은 순위와 12유형 균형(type_bias)은 이 기준 세트로 계산한 `interpret/calibration.yaml`
(→ `web/public/js/calib.js`)에서 나온다. 2026-11-16 에 val 155장 → **189명 · 손 375개 · 사진 2,201장**으로 확장.
이전 보정 파일은 `interpret/calibration_v2_155.yaml` 로 보관.

## 데이터 출처 / 라이선스
| 소스 | 받은 곳 | 내용 | 라이선스 |
|---|---|---|---|
| 11K Hands (Afifi, 2019) | https://sites.google.com/view/11khands (Hands.zip, HandInfo.csv) | 190명, 11,076장 (손등/손바닥, 1600×1200, 흰 배경) → **손바닥(palmar) 5,396장, 189명**만 사용 | "FREE for reasonable academic fair use" — 논문 인용 필요 (Multimedia Tools and Applications, 2019, doi:10.1007/s11042-019-7424-8) |
| PLSU (arXiv 2102.12127) | https://link.sun-asterisk.vn/palmlinedataset | 1,039장, 손금 마스크 | 명시 없음. 원본이 11K Hands 이므로 학술 용도 |

**주의: PLSU 는 11K Hands 손바닥 사진을 골라 만든 세트다.** `match_plsu_11k.py` 로 확인한 결과 PLSU 1,039장 중
1,038장이 11K Hands 원본 사진과 같은 사진(썸네일 거리 < 5, 픽셀 평균차 1~2)이고 162명 · 손 283개에 해당한다.
그래서 두 소스를 그냥 더하면 같은 사진이 두 번 들어가므로, 사람이 아니라 **손(사람+좌/우) 단위**로 묶는다.
이미지·jsonl 은 커밋하지 않는다 (`data/` 는 git-ignore).

## 만드는 순서
```bash
# 0) 11K Hands 받기: data/raw/11k/{Hands/,HandInfo.csv}   (PLSU 는 루트 README 참고)
python interpret/refset/prep_lists.py                  # plsu.tsv, 11k.tsv, 11k 손바닥 사진 180° 회전본
cd web
node tools/batch_features.mjs ../data/refset/plsu.tsv ../data/refset/plsu.jsonl 6   # 앱과 같은 브라우저 파이프라인
node tools/batch_features.mjs ../data/refset/11k.tsv  ../data/refset/11k.jsonl  6   # (재시작 가능, 5,396장 ≈ 수 시간)
cd ..
python interpret/refset/match_plsu_11k.py              # PLSU 사진 -> 11K 원본 사진/사람/좌우
python interpret/refset/build_refset.py                # 필터 + 손당 최대 6장 -> data/refset/combined.jsonl, summary.json
python interpret/refset/eval_calib.py --calib interpret/calibration_v2_155.yaml --features data/refset/combined.jsonl --json interpret/refset/before_v2_155.json
python interpret/calibrate.py --features data/refset/combined.jsonl
python interpret/refset/eval_calib.py --calib interpret/calibration.yaml --features data/refset/combined.jsonl --json interpret/refset/after_refset.json
cd web && npm run gen && node tests/evidence_parity.mjs ../data/refset/combined.jsonl
```

## 선별 규칙 (`build_refset.py`)
- 제외: 추출 실패 0장, 손금선 2개 미만 검출 (11K 10장), PLSU↔11K 매칭 실패 1장 (PLSU image63).
- 쓸 수 있는 사진: PLSU 1,038 / 1,039, 11K 5,386 / 5,396.
- 손 하나(사람 id + 좌/우)당 최대 6장. 11K 는 한 손을 손가락 펴고/오므리며 평균 14장 연속 촬영해서 거의 같은 사진이 많다.
  PLSU 크롭이 있는 사진(폰 근접 촬영과 더 비슷)을 먼저 고르고, 나머지는 그 손의 다른 11K 사진에서 고르게 채운다. 같은 사진은 한 번만.
- 결과: 2,201장 = PLSU 크롭 941 + 11K 원본 1,260, 189명, 손 375개 (손당 6장 344개, 2~5장 31개). 검출 선 수: 2개 71, 3개 1,998, 4개 132.
- 특징은 전부 웹앱과 같은 브라우저 파이프라인(onnxruntime-web, `palm.js`)으로 뽑았다 → 앱에서 계산하는 값과 같은 기준.
  (이전 155장 보정은 Python `.pt` 특징이었다.)

## 결과 (같은 2,201장에서 비교)
| 유형 | 이전 보정(155장) | 새 보정(2,201장) |
|---|---|---|
| 황금 (gold) | 154 | 183 |
| 불꽃 (fire) | 213 | 179 |
| 달빛 (moon) | 240 | 188 |
| 별빛 (star) | 163 | 176 |
| 바람 (wind) | 169 | 189 |
| 태양 (sun) | 172 | 185 |
| 구름 (cloud) | 209 | 182 |
| 꽃잎 (flower) | 138 | 185 |
| 바위 (rock) | 327 | 187 |
| 물결 (wave) | 121 | 185 |
| 번개 (lightning) | 137 | 186 |
| 은하 (galaxy) | 158 | 176 |
| min~max | 121~327 | 176~189 |

| 운 | 이전 ★2/3/4/5 | 새 ★2/3/4/5 |
|---|---|---|
| wealth | 314 / 1237 / 631 / 19 | 263 / 1243 / 671 / 24 |
| love | 356 / 903 / 603 / 339 | 267 / 985 / 643 / 306 |
| health | 408 / 1005 / 621 / 167 | 344 / 975 / 673 / 209 |
| career | 277 / 968 / 866 / 90 | 286 / 994 / 833 / 88 |

소스별(새 보정): PLSU 크롭 941장은 바위 22 · 물결 109 · 꽃잎 106, 11K 원본 1,260장은 바위 165 · 꽃잎 79 로 쏠린다
(크롭 vs 손 전체 사진의 차이). 전체로는 유형당 176~189장.
val 155장(Python 특징)에서는 이전 보정이 유형당 12~13장(그 세트에 맞춘 값), 새 보정은 4~20장.

## 한계
- 사람 수는 189명이 전부다 (PLSU 가 11K Hands 의 부분집합). 18~75세(사진 기준 나이 중앙값 21세), 여성 사진이 더 많고, 흰 배경 실험실 촬영.
- 실제 사용자 폰 사진(배경·조명·각도) 분포와 다를 수 있다. 사용자 측정값(사진 X)을 익명으로 모으면 그걸로 다시 보정하는 게 맞다.
- 11K 원본은 손 전체가 작게 찍혀 선 굵기(손바닥 폭 대비 %)가 PLSU 크롭보다 약 10~15% 크게 나온다.
- 기준 세트에 모델 학습 사진(PLSU train)이 들어 있다 (백분위만 쓰므로 학습 누수는 아니지만, 선이 실제보다 깔끔하게 잡혔을 수 있음).
- 운명선은 검출이 약해 2,201장 중 157장에서만 길이 값이 있다 (`calibration.yaml` 의 fate.length n).
