# YAKI SEASON 2.5D 게임플레이 에셋 매니페스트

- 생성일: `2026-07-22`
- 구현 기준: `ART-001 v1.1.0`, `SYS-002 v1.0.0`, `SCN-001 v1.0.0`, `UI-001 v1.1.0`
- 담당 작업: `developer-2/001 v1.0.3`
- 생성 방식: Codex 내장 `image_gen` 이미지 생성·편집
- 런타임 에셋: 16개, 합계 `2,155,643`바이트
- 첫 조립 장면 에셋: 합계 `1,116,852`바이트

## 파일 계약

| ID | 경로 | 규격 | 바이트 | SHA-256 |
|---|---|---:|---:|---|
| BG-01 | `art/gameplay/background/shop_backwall_night.jpg` | 2048x1152 JPEG | 342,018 | `2ae10d087104579b1820e645275f67bb196595df905241abe906e8253da85d26` |
| BG-02 | `art/gameplay/background/shop_foreground_frame.png` | 2048x1152 RGBA PNG | 120,162 | `f7499f633a1f4c9314363c62c31dec288bdd738f8e1ba997f8449e55b4832db3` |
| ST-01 | `art/gameplay/stations/assembly_workbench.png` | 1536x768 RGBA PNG | 299,213 | `9352b93f3a4ee0f11095ce38136ba46c26aaeb68965cd66baf6df5b70672e5c0` |
| ST-02 | `art/gameplay/stations/charcoal_grill_body.png` | 1536x768 RGBA PNG | 228,814 | `359c815fe7258728ed506192e97ac994bced5ef4f2e64f47774511b38eac980a` |
| ST-03 | `art/gameplay/stations/charcoal_embers.png` | 1024x384 RGBA PNG | 151,101 | `3d2b624da2ed2aa581fbd6e94a7c18155fb8355e6d92115f58b8fe724dc2ae75` |
| ST-04 | `art/gameplay/stations/service_counter.png` | 1536x768 RGBA PNG | 240,574 | `d95d64009bff7ebbfa53a483acf73d856e41bbce4c26aa969431fffc72643e40` |
| FD-01 | `art/gameplay/food/chicken_thigh_raw.png` | 256x256 RGBA PNG | 12,710 | `fac7e019c02cf361210fa5cd017a58fcfb541cdf8033fdf8b17bdedd649b14b2` |
| FD-02 | `art/gameplay/food/negi_raw.png` | 256x256 RGBA PNG | 14,725 | `7a25caacbcee092e8869943ba0b94911c5c0574689d3457a507f4265fb5ab6c7` |
| FD-03 | `art/gameplay/food/bamboo_skewer.png` | 128x1024 RGBA PNG | 15,636 | `ea9a51c87493f5c29b3bb3fd56635389dd7f25e8129672a1c97d1fffc576b895` |
| FD-04 | `art/gameplay/food/negima_raw.png` | 512x1024 RGBA PNG | 89,011 | `646f8e158db8d38d25158e23d17e69fba1cee16a74521a391464bd90305117a3` |
| PR-01 | `art/gameplay/props/serving_plate.png` | 768x384 RGBA PNG | 72,276 | `d91a98d878416413ff4114fb1a4ea7e752adcb9371764b28dc0a3721ef22e46b` |
| CH-01 | `art/gameplay/characters/tsukioka_waiting.png` | 512x640 RGBA PNG | 111,936 | `0070729c0e83e320e8e36017bd6476381f6f93ac1ca3387c2acb6fc73d5c0d17` |
| CH-02 | `art/gameplay/characters/tsukioka_tasting.png` | 512x640 RGBA PNG | 121,196 | `36c90a6943cd73fd6494a537de710257b70d25b9e77c1a50694b383ba6d44be5` |
| CH-03 | `art/gameplay/characters/tsukioka_satisfied.png` | 512x640 RGBA PNG | 110,419 | `c2db99162977ff50b0a9d88e5669f5afcbabffd9480057fb30473140cfaf1529` |
| CH-04 | `art/gameplay/characters/tsukioka_neutral.png` | 512x640 RGBA PNG | 112,412 | `790b607d9999087017e4a8a9c3ee67bf648968165608e23005ad6aa91e77fd52` |
| CH-05 | `art/gameplay/characters/tsukioka_retry.png` | 512x640 RGBA PNG | 113,440 | `b2ce0da39293860ba25168d95b12926fe095739ba741177fc3bf34bd2898de32` |

## 공통 생성 프롬프트

```text
Use case: final game-ready raster asset for the YAKI SEASON web prototype.
Create handcrafted Japanese pixel art matching the supplied YAKI SEASON concept references: deliberate 4-pixel clusters, crisp readable silhouettes, restrained dithering, dark timber and charcoal, warm amber firelight balanced by deep navy night and muted moss and teal accents. Use the fixed first-person 2.5D yakitori counter perspective, a consistent center vanishing point, warm lower-left charcoal light and weak neutral indoor fill. Preserve a calm lived-in 40-year-old neighborhood yakitori shop, never a glossy modern restaurant. No photorealism, smooth vector art, painterly blur, text, letters, numbers, Japanese writing, logo, UI, cursor, arrows, border, caption, watermark, or objects not explicitly requested.
For transparent assets, use one perfectly flat uniform #00ff66 chroma-key background with no shadow, gradient, texture, reflection, floor plane, lighting variation, halo, glow, text, or watermark. Keep the full requested object inside the frame and do not use #00ff66 in the object.
```

## ID별 최종 프롬프트와 참조

| ID | 최종 요청 | 참조 이미지 |
|---|---|---|
| BG-01 | Empty 40-year-old neighborhood yakitori-shop back wall at night: aged dark timber, bottle shelves, two paper-and-brass lamps, deep-navy window, quiet HUD and customer areas; no people, counter, stools, cooking station, food, or readable signage. | `02`, `03`, `13` |
| BG-02 | Extreme-edge foreground only: aged timber posts and warm lamps, symmetric weight, center 80 percent empty, top 162px HUD band empty; no wall, floor, counter, people, or food. | `02`, `13`, BG-01 |
| ST-01 | One chef-eye 3/4 assembly workbench with exactly three empty ingredient compartments on the left, one empty vertical skewer groove in the center, and one empty handoff tray on the right. | `05`, `17`, `13`, BG-01 |
| ST-02 | One low wide cold binchotan grill body with exactly two usable grate fields separated by exactly one central divider; no embers, flame, smoke, food, or skewers. | `06`, `17`, `13`, BG-01 |
| ST-03 | Only a low bed of irregular black binchotan charcoal with restrained internal red and amber glow; no metal frame, grate, flame, smoke, food, or floor. | `06`, `17` |
| ST-04 | One dark timber pass counter with a centered indigo woven order mat and empty plate landing area; no plate, customer, stool, grill, smoke, lamp, shelf, or background. | `15`, `16`, `13`, BG-01 |
| FD-01 | One raw boneless chicken-thigh cube at 3/4 angle, pale pink fibrous flesh and creamy fat seams; no plate, bin, skewer, sauce, cooking, or garnish. | `05`, `17` |
| FD-02 | One thick raw negi segment at the same angle, scale, and light as FD-01, with white layered cut face and deep-green outer leaves. | `05`, `17`, FD-01 |
| FD-03 | One straight vertical bamboo skewer with a sharp top point and small faceted bottom handle; no food, hand, plate, or decoration. | `13`, `17` |
| FD-04 | One vertical raw negima in exact top-to-bottom order chicken-leek-chicken-leek-chicken, exactly three chicken cubes and two leek segments, with point and handle visible. | FD-01, FD-02, FD-03, `05`, `17` |
| PR-01 | One completely empty low oval serving plate in 3/4 view, dark indigo glaze, restrained teal rim, handmade irregularity. | `15`, `17`, `13` |
| CH-01 | Tsukioka, slim 68-year-old Japanese man seated waist-up, swept-back silver hair, round wire glasses, moss cardigan and gray-beige shirt, calmly waiting with both hands low. | `18`, `19`, BG-01 |
| CH-02 | Edit CH-01 only: preserve exact identity, outfit, scale, lighting and anchor; raise one negima near his mouth for a restrained first taste with eyes open. | CH-01, `19` |
| CH-03 | Edit CH-01 only: preserve invariants; warm narrowed eyes, small closed-mouth smile and subtle approving nod, hands low. | CH-01, `19` |
| CH-04 | Edit CH-01 only: preserve invariants; slight head dip and restrained acceptance, less pleased than CH-03 but not disappointed. | CH-01, `19` |
| CH-05 | Edit CH-01 only: preserve invariants; mild concern and encouragement with one relaxed open hand, never angry or pointing. | CH-01, `19` |

숫자 참조는 `docs/inbox/2.art-concept/`의 같은 번호 파일을 뜻한다. 생성 과정의 복사본은 `art/review/generated-2026-07-22/`에만 보존하며 런타임 경로에서 참조하지 않는다.

## 후처리

- `#00ff66`과 생성 과정에서 생긴 밝은 청록 혼합 영역을 제거해 straight alpha로 변환했다.
- 스테이션·음식·소품은 실루엣 비율을 유지하고 최근접 보간으로 고정 캔버스에 배치했다.
- 캐릭터 5종은 공통 크롭·배율·하단 피벗을 적용했고 CH-04의 세로 범위만 기준 컷에 맞게 정규화했다.
- BG-02의 상단 `162px`를 완전 투명으로 비워 HUD 안전 영역을 고정했다.
- 투명 PNG는 16단계 RGB 양자화로 픽셀 경계와 RGBA 캔버스를 유지하며 전송 크기를 최적화했다.
- 자동 trim을 사용하지 않았고 모든 최종 파일은 manifest의 고정 캔버스를 유지한다.

## 검수 결과

- 15개 PNG: 지정 규격 일치, 네 모서리 알파 `0`, 내부 불투명 픽셀 존재, 잔류 밝은 크로마 픽셀 `0`.
- 음식: 닭과 대파 실루엣 구분, 빈 꼬치 방향, 네기마의 `닭-파-닭-파-닭` 순서와 3:2 개수 확인.
- 스테이션: ST-01 재료통 3칸, ST-02 2레인과 중앙 분리선 1개, ST-04 단독 서빙대 확인.
- 캐릭터: 머리 상단 `62~63px`, 불투명 하단 `617px`; 얼굴·은발·안경·의상 일치 확인.
- 반응: 만족·수용·재조리가 눈·입·고개 또는 손 자세 중 두 가지 이상으로 구분됨.
- 런타임 디렉터리에는 16개 최종 이미지와 이 매니페스트만 있으며 크로마 원본과 실패본은 없음.
- 전체 이미지 합계 `2,155,643`바이트로 5MB 이하, 첫 조립 장면 합계 `1,116,852`바이트로 2.5MB 이하.
