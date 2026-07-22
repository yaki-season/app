# YAKI SEASON asset catalog

- 카탈로그 버전: `1.0.0`
- 마지막 검증일: `2026-07-22`
- 기준: `ART-003 v1.1.0`, `SYS-004 v1.0.0`, `ART-001 v1.1.0`, `QA-002 v1.0.0`
- 런타임 단일 원본: [`public/assets/manifest.json`](../public/assets/manifest.json)
- 자동 검증: `node tools/assets/validate-assets.mjs`

개발자는 파일명 대신 에셋 ID를 사용한다. `approved`만 런타임에서 로드할 수 있으며 `planned`, `blocked`, `review`, `deprecated`는 이 문서에서만 조회한다.

## 현재 이전 레지스트리

<!-- asset-registry:start -->
| ID | 기존 ID | 상태 | 우선순위·pack | 종류·규격 | runtime 또는 review | source | provenance | 대표 사용 화면·콘텐츠 | SHA-256 |
|---|---|---|---|---|---|---|---|---|---|
| `BG-INTERIOR-BASE` | `BG-01` | `approved` | P0 `core` | image 2048x1152 JPEG | [runtime](../public/assets/core/background/shop-backwall-night.jpg) | [source record](provenance/legacy-gameplay-manifest.md) | [review record](provenance/legacy-gameplay-assets.json) | S0-D30 영업 장면, `ShopScene` | `2ae10d087104579b1820e645275f67bb196595df905241abe906e8253da85d26` |
| `BG-FOREGROUND-FRAME` | `BG-02` | `approved` | P0 `core` | image 2048x1152 RGBA PNG | [runtime](../public/assets/core/background/shop-foreground-frame.png) | [source](review/generated-2026-07-22/bg-02-foreground-frame-chroma-unapproved.png) | [review record](provenance/legacy-gameplay-assets.json) | S0-D30 영업 장면 전경, `ShopScene` | `f7499f633a1f4c9314363c62c31dec288bdd738f8e1ba997f8449e55b4832db3` |
| `ST-ASSEMBLY-TIER-1` | `ST-01` | `approved` | P0 `core` | image 1536x768 RGBA PNG | [runtime](../public/assets/core/stations/assembly-workbench.png) | [source](review/generated-2026-07-22/st-01-assembly-workbench-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | D1 조립 station, `AssemblyStationView` | `9352b93f3a4ee0f11095ce38136ba46c26aaeb68965cd66baf6df5b70672e5c0` |
| `ST-GRILL-TIER-1` | `ST-02` | `approved` | P0 `core` | image 1536x768 RGBA PNG | [runtime](../public/assets/core/stations/charcoal-grill-body.png) | [source](review/generated-2026-07-22/st-02-charcoal-grill-body-chroma-v3.png) | [review record](provenance/legacy-gameplay-assets.json) | D1 굽기 station, `GrillStationView` | `359c815fe7258728ed506192e97ac994bced5ef4f2e64f47774511b38eac980a` |
| `ST-CHARCOAL-CORE` | `ST-03` | `approved` | P0 `core` | image 1024x384 RGBA PNG | [runtime](../public/assets/core/stations/charcoal-embers.png) | [source](review/generated-2026-07-22/st-03-charcoal-embers-chroma-unapproved.png) | [review record](provenance/legacy-gameplay-assets.json) | 조립·굽기 열원, `GrillStationView` | `3d2b624da2ed2aa581fbd6e94a7c18155fb8355e6d92115f58b8fe724dc2ae75` |
| `ST-SERVICE-COUNTER` | `ST-04` | `approved` | P0 `core` | image 1536x768 RGBA PNG | [runtime](../public/assets/core/stations/service-counter.png) | [source](review/generated-2026-07-22/st-04-service-counter-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | 주문 전달·서빙, `ServiceCounterView` | `d95d64009bff7ebbfa53a483acf73d856e41bbce4c26aa969431fffc72643e40` |
| `PR-SERVING-PLATE` | `PR-01` | `approved` | P0 `core` | image 768x384 RGBA PNG | [runtime](../public/assets/core/props/serving-plate.png) | [source](review/generated-2026-07-22/pr-01-serving-plate-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | 서빙 접시·주문 decal 바탕 | `d91a98d878416413ff4114fb1a4ea7e752adcb9371764b28dc0a3721ef22e46b` |
| `CH-TSUKIOKA-WAITING` | `CH-01` | `approved` | P0 `core` | image 512x640 RGBA PNG | [runtime](../public/assets/core/characters/tsukioka-waiting.png) | [source](review/generated-2026-07-22/ch-01-tsukioka-waiting-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | D1 츠키오카 `waiting`, `CustomerLayer` | `0070729c0e83e320e8e36017bd6476381f6f93ac1ca3387c2acb6fc73d5c0d17` |
| `CH-TSUKIOKA-TASTING` | `CH-02` | `approved` | P0 `core` | image 512x640 RGBA PNG | [runtime](../public/assets/core/characters/tsukioka-tasting.png) | [source](review/generated-2026-07-22/ch-02-tsukioka-tasting-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | D1 츠키오카 `tasting`, `CustomerLayer` | `36c90a6943cd73fd6494a537de710257b70d25b9e77c1a50694b383ba6d44be5` |
| `CH-TSUKIOKA-SATISFIED` | `CH-03` | `approved` | P0 `core` | image 512x640 RGBA PNG | [runtime](../public/assets/core/characters/tsukioka-satisfied.png) | [source](review/generated-2026-07-22/ch-03-tsukioka-satisfied-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | D1 츠키오카 `satisfied`, `CustomerLayer` | `c2db99162977ff50b0a9d88e5669f5afcbabffd9480057fb30473140cfaf1529` |
| `CH-TSUKIOKA-NEUTRAL` | `CH-04` | `approved` | P0 `core` | image 512x640 RGBA PNG | [runtime](../public/assets/core/characters/tsukioka-neutral.png) | [source](review/generated-2026-07-22/ch-04-tsukioka-neutral-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | D1 츠키오카 `mismatch` 임시 상태, `CustomerLayer` | `790b607d9999087017e4a8a9c3ee67bf648968165608e23005ad6aa91e77fd52` |
| `CH-TSUKIOKA-RETRY` | `CH-05` | `approved` | P0 `core` | image 512x640 RGBA PNG | [runtime](../public/assets/core/characters/tsukioka-retry.png) | [source](review/generated-2026-07-22/ch-05-tsukioka-retry-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | D1 츠키오카 `retry`, `CustomerLayer` | `b2ce0da39293860ba25168d95b12926fe095739ba741177fc3bf34bd2898de32` |
| `FD-01` | `FD-01` | `deprecated` | P0 reference | image 256x256 RGBA PNG | [review](review/legacy-gameplay/food/chicken_thigh_raw.png) | [source](review/generated-2026-07-22/fd-01-chicken-thigh-raw-chroma-unapproved.png) | [review record](provenance/legacy-gameplay-assets.json) | `MDL-INGREDIENT-CHICKEN` 형태·색 참고 | `fac7e019c02cf361210fa5cd017a58fcfb541cdf8033fdf8b17bdedd649b14b2` |
| `FD-02` | `FD-02` | `deprecated` | P0 reference | image 256x256 RGBA PNG | [review](review/legacy-gameplay/food/negi_raw.png) | [source](review/generated-2026-07-22/fd-02-negi-raw-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | `MDL-INGREDIENT-NEGI` 형태·색 참고 | `7a25caacbcee092e8869943ba0b94911c5c0574689d3457a507f4265fb5ab6c7` |
| `FD-03` | `FD-03` | `deprecated` | P0 reference | image 128x1024 RGBA PNG | [review](review/legacy-gameplay/food/bamboo_skewer.png) | [source](review/generated-2026-07-22/fd-03-bamboo-skewer-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | `MDL-SKEWER-BASE` 길이·손잡이 참고 | `ea9a51c87493f5c29b3bb3fd56635389dd7f25e8129672a1c97d1fffc576b895` |
| `FD-04` | `FD-04` | `deprecated` | P0 reference | image 512x1024 RGBA PNG | [review](review/legacy-gameplay/food/negima_raw.png) | [source](review/generated-2026-07-22/fd-04-negima-raw-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | 3D 조립 순서와 `FD-NEGIMA-ORDER` 참고 | `646f8e158db8d38d25158e23d17e69fba1cee16a74521a391464bd90305117a3` |
<!-- asset-registry:end -->

승인 12개 합계는 `2,023,561`바이트다. 스테이션 pivot·interaction anchor, 배경 mobile crop과 츠키오카 최종 11-clip atlas는 각각 Artist 002·003·004가 companion metadata를 승인할 때 보강한다. 그전까지 개발자는 좌표를 추정하지 않는다.

## 화면·모듈별 조회

| 화면·모듈 | 지금 사용 가능한 ID | 후속 필수 ID | 담당 |
|---|---|---|---|
| S0-D1 `ShopScene` | `BG-INTERIOR-BASE`, `BG-FOREGROUND-FRAME` | `BG-SEATING-6`, `BG-EXTERIOR-S0-CLOSED`, `BG-EXTERIOR-S1-OPEN` | Artist 002 |
| `AssemblyStationView` | `ST-ASSEMBLY-TIER-1` | `MDL-SKEWER-BASE`, `MDL-INGREDIENT-CHICKEN`, `MDL-INGREDIENT-NEGI` | Artist 002·003 |
| `GrillStationView` | `ST-GRILL-TIER-1`, `ST-CHARCOAL-CORE` | `MDL-GRILL-RACK`, `MDL-TONGS`, `MDL-FAN`, `VFX-EMBER-CORE`, `VFX-SMOKE-CORE` | Artist 002·003 |
| `DrinkStationView` | 없음 | `ST-DRINK-BEER-TIER-1`, `MDL-BEER-GLASS`, `MDL-BEER-LEVER`, `VFX-BEER-CORE` | Artist 002·003 |
| `ServiceCounterView` | `ST-SERVICE-COUNTER`, `PR-SERVING-PLATE` | `MDL-SERVICE-TRAY`, `FD-*-ORDER`, `FD-*-PLATED` | Artist 002·003 |
| `CustomerLayer` D1 | 츠키오카 fragment 5개 | `CH-TSUKIOKA-SERVICE`, `CH-OFFICE-A-SERVICE`, `CH-OFFICE-B-SERVICE` | Artist 004 |
| `GameplayHud` | 없음 | `UI-STATION-ICONS`, `UI-ORDER-ICONS-P0`, `UI-RISK-ICONS`, `UI-QUALITY-ICONS`, `UI-ECONOMY-ICONS`, `UI-STATE-ICONS` | Artist 003 |

## 후속 제작 예약 레지스트리

아래 ID와 pack은 예약됐다. 신규 파일은 ID를 소문자 kebab-case로 바꾼 이름을 기본으로 하며, atlas는 같은 basename의 `.png`와 `.json`, model은 `.glb`를 사용한다. 실제 runtime 링크는 `approved` 뒤 현재 이전 레지스트리에 추가한다.

### Artist 002: P0 브랜드·환경·스테이션

| 예약 ID | 상태 | pack·종류 | 목표 경로 |
|---|---|---|---|
| `BR-LOGO-HORIZONTAL`, `BR-LOGO-COMPACT` | `planned` | `core` image | `public/assets/core/brand/` |
| `BG-EXTERIOR-S0-CLOSED`, `BG-EXTERIOR-S1-OPEN`, `BG-SEATING-6` | `planned` | `core` image+metadata | `public/assets/core/background/` |
| `PR-SHOP-KEY`, `PR-NOREN-S0`, `PR-RECIPE-NOTE-CORE`, `PR-CHARCOAL-IGNITION`, `PR-MATCHBOX-OLD` | `planned` | `core` image/atlas/vfx | `public/assets/core/props/` |
| `ST-DRINK-BEER-TIER-1`, `ST-CLEANUP-OVERLAY` | `planned` | `core` image+metadata | `public/assets/core/stations/` |

### Artist 003: P0 3D·음식·UI·VFX

| 예약 ID | 상태 | pack·종류 | 목표 경로 |
|---|---|---|---|
| `MDL-SKEWER-BASE`, `MDL-INGREDIENT-CHICKEN`, `MDL-INGREDIENT-NEGI`, `MDL-GRILL-RACK`, `MDL-TONGS`, `MDL-FAN`, `MDL-TARE-BRUSH`, `MDL-BEER-GLASS`, `MDL-BEER-LEVER`, `MDL-SERVICE-TRAY` | `planned` | `core` model | `public/assets/core/models/` |
| `TEX-SKEWER-INGREDIENT-BASE`, `TEX-SKEWER-CHAR-MASK`, `TEX-TARE-MASK`, `TEX-BEER-LIQUID`, `TEX-TOOLS-ATLAS`, `TEX-BLOB-SHADOW` | `planned` | `core` texture | `public/assets/core/textures/` |
| `FD-NEGIMA-ORDER`, `FD-MOMO-ORDER`, `FD-BEER-ORDER`, `FD-NEGIMA-PLATED`, `FD-MOMO-PLATED` | `planned` | `core` image | `public/assets/core/food/` |
| `UI-STATION-ICONS`, `UI-ORDER-ICONS-P0`, `UI-RISK-ICONS`, `UI-QUALITY-ICONS`, `UI-ECONOMY-ICONS`, `UI-STATE-ICONS` | `planned` | `core` atlas | `public/assets/core/ui/` |
| `VFX-EMBER-CORE`, `VFX-SMOKE-CORE`, `VFX-OIL-SPLASH`, `VFX-JUDGEMENT`, `VFX-BEER-CORE`, `VFX-INTERACTION` | `planned` | `core` vfx | `public/assets/core/vfx/` |

### Artist 004: P0 캐릭터

| 예약 ID | 상태 | pack·종류 | 목표 경로·해제 조건 |
|---|---|---|---|
| `CH-TSUKIOKA-SERVICE`, `CH-OFFICE-A-SERVICE`, `CH-OFFICE-B-SERVICE` | `planned` | `core` atlas | `public/assets/core/characters/`; 공통 11 clip 승인 |
| `CH-OWNER-HANDS-P0` | `blocked` | `core` atlas | 주인공 외형 확정 전 손 없는 구도 사용 |

### Artist 005: P1 캠페인·성장·이야기

| 예약 ID | 상태 | pack·종류 | 목표 경로 |
|---|---|---|---|
| `BG-EXT-S0`, `BG-EXT-S1`, `BG-EXT-S3`, `BG-EXT-S4`, `BG-EXT-S5`, `BG-EXT-S6`, `BG-EXT-S7` | `planned` | `campaign` image | `public/assets/campaign/s0-d1/background/` 또는 대응 stage pack |
| `BG-INT-SEATS-8`, `BG-INT-SEATS-12`, `ST-GRILL-TIER-2`, `ST-GRILL-TIER-3`, `ST-STAFF-OVERLAY` | `planned` | `campaign` image+metadata | 대응 `public/assets/campaign/s*-s*/` 하위 |
| `UI-UPGRADE-*`, `UI-NOTE-*`, `UI-STAFF-*`, `PR-NOTE-STAGE-*`, `PR-REGULAR-MEMENTO-*`, `BG-SETTLEMENT-*`, `BG-D31-*` | `planned` | `campaign` atlas/image | 콘텐츠 ID 확정 뒤 wildcard를 실제 ID로 분해 |

### Artist 006·007: 결정 대기

| 예약 ID | 상태 | pack·종류 | 차단 조건 |
|---|---|---|---|
| `CH-OWNER-STORY`, `CH-HARU-SERVICE`, `CH-HARU-PORTRAIT`, `CH-KANAMORI-SERVICE`, `CH-KANAMORI-PORTRAIT` | `blocked` | `campaign` atlas | 주인공·하루·카나모리 외형과 초상 방식 확정 |
| `CH-TSUKIOKA-PORTRAIT`, `CH-OFFICE-A-PORTRAIT`, `CH-OFFICE-B-PORTRAIT`, `CH-PREVIOUS-OWNER-MEMORY`, `CH-GENERIC-SOLO-SET`, `CH-GENERIC-PAIR-SET` | `planned` | `campaign` atlas | Artist 004 identity·atlas 기준 승인 |
| `FD-INSTANT-*`, `FD-SKEWER-ADV-*`, `FD-HIGHBALL-*`, `FD-FRIED-*`, `FD-SASHIMI-*`, `FD-RICE-*`, `FD-SEASON-*` | `blocked` | `campaign` 또는 `optional` | 메뉴·레시피·공정·출시 우선순위 승인 |
| `ST-INSTANT-SERVE`, `ST-FRYER`, `ST-SASHIMI`, `ST-PLATING`, `ST-HIGHBALL` | `blocked` | `campaign` 또는 `optional` | 대응 메뉴와 조작 계약 승인 |

## 이전 판단

- 기존 12개 재사용 후보는 해시·규격·알파와 시각 검수를 통과해 `core`로 승인했다.
- 기존 음식 PNG 4개는 형태·팔레트 참고 가치가 있지만 Three.js 조작, 면별 익힘, socket과 pivot 계약을 충족하지 못해 `deprecated`로 보존했다.
- 츠키오카 fragment 5개는 지금 사용할 수 있으나 최종 `CH-TSUKIOKA-SERVICE` 11-clip atlas의 대체물이 아니다. Artist 004 승인 뒤 fragment 유지·폐기와 코드 전환을 별도 revision으로 기록한다.
- 기존 생성 후보와 실패본은 `art/review/generated-2026-07-22/`, 당시 프롬프트·후처리 기록은 [`legacy-gameplay-manifest.md`](provenance/legacy-gameplay-manifest.md)에 보존한다.
