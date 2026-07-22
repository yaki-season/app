# YAKI SEASON asset catalog

- 카탈로그 버전: `1.1.0`
- 마지막 검증일: `2026-07-22`
- 기준: `ART-003 v1.1.0`, `SYS-004 v1.0.0`, `ART-001 v1.1.0`, `QA-002 v1.0.0`
- 런타임 단일 원본: [`public/assets/manifest.json`](../public/assets/manifest.json)
- 자동 검증: `node tools/assets/validate-assets.mjs`

개발자는 파일명 대신 에셋 ID를 사용한다. `approved`만 런타임에서 로드할 수 있으며 `planned`, `blocked`, `review`, `deprecated`는 이 문서에서만 조회한다.

## 현재 이전 레지스트리

<!-- asset-registry:start -->
| ID | 기존 ID | 상태 | 우선순위·pack | 종류·규격 | runtime 또는 review | source | provenance | 대표 사용 화면·콘텐츠 | SHA-256 |
|---|---|---|---|---|---|---|---|---|---|
| `BG-INTERIOR-BASE` | `BG-01` | `approved` | P0 `core` | image 2048x1152 JPEG | [runtime](../public/assets/core/background/shop-backwall-night.jpg) | [source record](provenance/legacy-gameplay-manifest.md) | [review record](provenance/artist-002-p0-environment-assets.json) | S0-D30 영업 장면, `ShopScene` | `2ae10d087104579b1820e645275f67bb196595df905241abe906e8253da85d26` |
| `BG-FOREGROUND-FRAME` | `BG-02` | `approved` | P0 `core` | image 2048x1152 indexed-alpha PNG | [runtime](../public/assets/core/background/shop-foreground-frame.png) | [source](review/generated-2026-07-22/bg-02-foreground-frame-chroma-unapproved.png) | [review record](provenance/artist-002-p0-environment-assets.json) | S0-D30 영업 장면 전경, `ShopScene` | `2951e397ee80ebdafc764007592a790f54c0344c1f5741b1b406aa37328e2b1c` |
| `ST-ASSEMBLY-TIER-1` | `ST-01` | `approved` | P0 `core` | image 1536x768 indexed-alpha PNG | [runtime](../public/assets/core/stations/assembly-workbench.png) | [source](review/generated-2026-07-22/st-01-assembly-workbench-chroma-v2.png) | [review record](provenance/artist-002-p0-environment-assets.json) | D1 조립 station, `AssemblyStationView` | `8f5f36f6ab60b513a83e173e7349cd0af462760ce76688a72bc0186c34c31f68` |
| `ST-GRILL-TIER-1` | `ST-02` | `approved` | P0 `core` | image 1536x768 indexed-alpha PNG | [runtime](../public/assets/core/stations/charcoal-grill-body.png) | [source](review/generated-2026-07-22/st-02-charcoal-grill-body-chroma-v3.png) | [review record](provenance/artist-002-p0-environment-assets.json) | D1 굽기 station, `GrillStationView` | `8890a94acd3f5a3236c9d44b3104c345cdee44315b806a5b300d354e86a4d283` |
| `ST-CHARCOAL-CORE` | `ST-03` | `approved` | P0 `core` | image 1024x384 indexed-alpha PNG | [runtime](../public/assets/core/stations/charcoal-embers.png) | [source](review/generated-2026-07-22/st-03-charcoal-embers-chroma-unapproved.png) | [review record](provenance/artist-002-p0-environment-assets.json) | 조립·굽기 열원, `GrillStationView` | `5e8822d45ed86bd5d58ca1cdb5e811a9f142d9ebaf0dcd2be4298fa465eacc2b` |
| `ST-SERVICE-COUNTER` | `ST-04` | `approved` | P0 `core` | image 1536x768 indexed-alpha PNG | [runtime](../public/assets/core/stations/service-counter.png) | [source](review/generated-2026-07-22/st-04-service-counter-chroma-v2.png) | [review record](provenance/artist-002-p0-environment-assets.json) | 주문 전달·서빙, `ServiceCounterView` | `6d94965135c42264853699f44a4e58bd43af26f1621badd0c1b64a41aa0443e0` |
| `PR-SERVING-PLATE` | `PR-01` | `approved` | P0 `core` | image 768x384 indexed-alpha PNG | [runtime](../public/assets/core/props/serving-plate.png) | [source](review/generated-2026-07-22/pr-01-serving-plate-chroma-v2.png) | [review record](provenance/artist-002-p0-environment-assets.json) | 서빙 접시·주문 decal 바탕 | `dd860aa39b2f4cf800c8d40cdf4ec774daffcfbe5b65d52a74c59a092b6d5617` |
| `CH-TSUKIOKA-WAITING` | `CH-01` | `approved` | P0 `core` | image 512x640 RGBA PNG | [runtime](../public/assets/core/characters/tsukioka-waiting.png) | [source](review/generated-2026-07-22/ch-01-tsukioka-waiting-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | D1 츠키오카 `waiting`, `CustomerLayer` | `0070729c0e83e320e8e36017bd6476381f6f93ac1ca3387c2acb6fc73d5c0d17` |
| `CH-TSUKIOKA-TASTING` | `CH-02` | `approved` | P0 `core` | image 512x640 RGBA PNG | [runtime](../public/assets/core/characters/tsukioka-tasting.png) | [source](review/generated-2026-07-22/ch-02-tsukioka-tasting-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | D1 츠키오카 `tasting`, `CustomerLayer` | `36c90a6943cd73fd6494a537de710257b70d25b9e77c1a50694b383ba6d44be5` |
| `CH-TSUKIOKA-SATISFIED` | `CH-03` | `approved` | P0 `core` | image 512x640 RGBA PNG | [runtime](../public/assets/core/characters/tsukioka-satisfied.png) | [source](review/generated-2026-07-22/ch-03-tsukioka-satisfied-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | D1 츠키오카 `satisfied`, `CustomerLayer` | `c2db99162977ff50b0a9d88e5669f5afcbabffd9480057fb30473140cfaf1529` |
| `CH-TSUKIOKA-NEUTRAL` | `CH-04` | `approved` | P0 `core` | image 512x640 RGBA PNG | [runtime](../public/assets/core/characters/tsukioka-neutral.png) | [source](review/generated-2026-07-22/ch-04-tsukioka-neutral-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | D1 츠키오카 `mismatch` 임시 상태, `CustomerLayer` | `790b607d9999087017e4a8a9c3ee67bf648968165608e23005ad6aa91e77fd52` |
| `CH-TSUKIOKA-RETRY` | `CH-05` | `approved` | P0 `core` | image 512x640 RGBA PNG | [runtime](../public/assets/core/characters/tsukioka-retry.png) | [source](review/generated-2026-07-22/ch-05-tsukioka-retry-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | D1 츠키오카 `retry`, `CustomerLayer` | `b2ce0da39293860ba25168d95b12926fe095739ba741177fc3bf34bd2898de32` |
| `BR-LOGO-HORIZONTAL` | - | `approved` | P0 `core` | image 1024x256 indexed-alpha PNG | [runtime](../public/assets/core/brand/br-logo-horizontal.png) | [source](source/brand/br-logo-horizontal/br-logo-horizontal-r1.svg) | [review record](provenance/artist-002-p0-environment-assets.json) | 타이틀·프롤로그·정산 브랜드 | `9686881bd1b2a8f81f8792af895c7fbffe524db0bfbcd9242de7f58eda1ca552` |
| `BR-LOGO-COMPACT` | - | `approved` | P0 `core` | image 512x512 indexed-alpha PNG | [runtime](../public/assets/core/brand/br-logo-compact.png) | [source](source/brand/br-logo-compact/br-logo-compact-r1.svg) | [review record](provenance/artist-002-p0-environment-assets.json) | favicon·작은 화면 표식 | `8ae531e7ed3a836f154aff4592767cb1d2380c3a0e182f541a9828fa37ad6630` |
| `BG-EXTERIOR-S0-CLOSED` | - | `approved` | P0 `core` | image 2048x1152 JPEG | [runtime](../public/assets/core/background/bg-exterior-s0-closed.jpg) | [source](source/environment/bg-exterior-s0-closed-r1.html) | [review record](provenance/artist-002-p0-environment-assets.json) | S0 상속·폐점 외관 | `919b00edd397a91cf94e0a8b8b35fa8ec026831870bbeea38ae061cbcf121060` |
| `BG-EXTERIOR-S1-OPEN` | - | `approved` | P0 `core` | image 2048x1152 JPEG | [runtime](../public/assets/core/background/bg-exterior-s1-open.jpg) | [source](source/environment/bg-exterior-s1-open-r1.html) | [review record](provenance/artist-002-p0-environment-assets.json) | D1 영업 개시 외관 | `f8cb70a61301a2efea8b58fe0572157793c01957b14ddd600bdef850596dd031` |
| `PR-SHOP-KEY` | - | `approved` | P0 `core` | image 512x512 indexed-alpha PNG | [runtime](../public/assets/core/props/pr-shop-key.png) | [source](review/artist-002/pr-shop-key/r1/generated.png) | [review record](provenance/artist-002-p0-environment-assets.json) | S0 열쇠 선택·자물쇠 입력 | `7872bf1bd96b46350d0cec5629acfb36c8e26f6011271520aebf46bf94bfdb6c` |
| `PR-NOREN-S0` | - | `approved` | P0 `core` | atlas 2046x714 indexed-alpha PNG | [runtime](../public/assets/core/props/pr-noren-s0.png) | [source](review/artist-002/pr-noren-s0/r1/generated.png) | [review record](provenance/artist-002-p0-environment-assets.json) | S0 접힘·걸기·약한 흔들림 | `ec74da5a7cafcd39e3f3efe89323ed9703bb56ad75dbb572882eae883b2ec049` |
| `PR-RECIPE-NOTE-CORE` | - | `approved` | P0 `core` | atlas 2045x682 indexed-alpha PNG | [runtime](../public/assets/core/props/pr-recipe-note-core.png) | [source](review/artist-002/pr-recipe-note-core/r1/generated.png) | [review record](provenance/artist-002-p0-environment-assets.json) | S0-D1 노트 5상태 | `27fcb31740b4a58d67d66f59e67dfd4aaf4b7fc99b3cf8a936b4d82ac85db08b` |
| `PR-CHARCOAL-IGNITION` | - | `approved` | P0 `core` | atlas 2048x684 indexed-alpha PNG | [runtime](../public/assets/core/props/pr-charcoal-ignition.png) | [source](review/artist-002/pr-charcoal-ignition/r1/generated.png) | [review record](provenance/artist-002-p0-environment-assets.json) | S0 숯 점화 4단계 | `6fa1057357ed691b5cdefb9d3cda6cb48626cdeb791a901835e51594b8f6ae23` |
| `PR-MATCHBOX-OLD` | - | `approved` | P0 `core` | image 640x512 indexed-alpha PNG | [runtime](../public/assets/core/props/pr-matchbox-old.png) | [source](review/artist-002/pr-matchbox-old/r1/generated.png) | [review record](provenance/artist-002-p0-environment-assets.json) | S0 소품·D14 이야기 회수 | `5fc5d4ccb240bb4b91d81d5fe7a4b54498a08f9f8e07684ba05eeaf4ff56c9f5` |
| `BG-SEATING-6` | - | `approved` | P0 `core` | image 2048x1152 indexed-alpha PNG | [runtime](../public/assets/core/background/bg-seating-6.png) | [source](review/artist-002/bg-seating-6/r1/generated.png) | [review record](provenance/artist-002-p0-environment-assets.json) | D1 기본 6석·좌석 FSM | `b993761f211dd0e430e5ecd27d0bc4fff55275cd0ac68ab784ea08299052a111` |
| `ST-DRINK-BEER-TIER-1` | - | `approved` | P0 `core` | image 1536x768 indexed-alpha PNG | [runtime](../public/assets/core/stations/st-drink-beer-tier-1.png) | [source](review/artist-002/st-drink-beer-tier-1/r1/generated.png) | [review record](provenance/artist-002-p0-environment-assets.json) | D1 단일 레버 생맥주 station | `1f9928b345a34105c336034fbdd5e1efcc08a988f32137cf954f52e6de502366` |
| `ST-CLEANUP-OVERLAY` | - | `approved` | P0 `core` | atlas 2046x728 indexed-alpha PNG | [runtime](../public/assets/core/stations/st-cleanup-overlay.png) | [source](review/artist-002/st-cleanup-overlay/r1/generated.png) | [review record](provenance/artist-002-p0-environment-assets.json) | 식기 있음·잔 있음·정리 완료 | `1c9f52fdbbecb3e2b575b5e1a0fdae01756bf04806ef61a37662976c9056f721` |
| `FD-01` | `FD-01` | `deprecated` | P0 reference | image 256x256 RGBA PNG | [review](review/legacy-gameplay/food/chicken_thigh_raw.png) | [source](review/generated-2026-07-22/fd-01-chicken-thigh-raw-chroma-unapproved.png) | [review record](provenance/legacy-gameplay-assets.json) | `MDL-INGREDIENT-CHICKEN` 형태·색 참고 | `fac7e019c02cf361210fa5cd017a58fcfb541cdf8033fdf8b17bdedd649b14b2` |
| `FD-02` | `FD-02` | `deprecated` | P0 reference | image 256x256 RGBA PNG | [review](review/legacy-gameplay/food/negi_raw.png) | [source](review/generated-2026-07-22/fd-02-negi-raw-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | `MDL-INGREDIENT-NEGI` 형태·색 참고 | `7a25caacbcee092e8869943ba0b94911c5c0574689d3457a507f4265fb5ab6c7` |
| `FD-03` | `FD-03` | `deprecated` | P0 reference | image 128x1024 RGBA PNG | [review](review/legacy-gameplay/food/bamboo_skewer.png) | [source](review/generated-2026-07-22/fd-03-bamboo-skewer-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | `MDL-SKEWER-BASE` 길이·손잡이 참고 | `ea9a51c87493f5c29b3bb3fd56635389dd7f25e8129672a1c97d1fffc576b895` |
| `FD-04` | `FD-04` | `deprecated` | P0 reference | image 512x1024 RGBA PNG | [review](review/legacy-gameplay/food/negima_raw.png) | [source](review/generated-2026-07-22/fd-04-negima-raw-chroma-v2.png) | [review record](provenance/legacy-gameplay-assets.json) | 3D 조립 순서와 `FD-NEGIMA-ORDER` 참고 | `646f8e158db8d38d25158e23d17e69fba1cee16a74521a391464bd90305117a3` |
<!-- asset-registry:end -->

승인 24개 image·atlas 합계는 `2,832,021`바이트, 중복을 제거한 companion metadata는 `6,686`바이트로 총 `2,838,707`바이트다. 스테이션·6석 anchor와 배경 mobile crop은 [`p0-environment-layout.json`](../public/assets/core/metadata/p0-environment-layout.json)에 고정했다. 츠키오카 최종 11-clip atlas는 Artist 004 승인 전까지 기존 fragment를 사용한다.

## 화면·모듈별 조회

| 화면·모듈 | 지금 사용 가능한 ID | 후속 필수 ID | 담당 |
|---|---|---|---|
| S0-D1 `ShopScene` | `BG-INTERIOR-BASE`, `BG-FOREGROUND-FRAME`, `BG-SEATING-6`, `BG-EXTERIOR-S0-CLOSED`, `BG-EXTERIOR-S1-OPEN` | 없음 | Artist 002 완료 |
| `AssemblyStationView` | `ST-ASSEMBLY-TIER-1` | `MDL-SKEWER-BASE`, `MDL-INGREDIENT-CHICKEN`, `MDL-INGREDIENT-NEGI` | Artist 002·003 |
| `GrillStationView` | `ST-GRILL-TIER-1`, `ST-CHARCOAL-CORE` | `MDL-GRILL-RACK`, `MDL-TONGS`, `MDL-FAN`, `VFX-EMBER-CORE`, `VFX-SMOKE-CORE` | Artist 002·003 |
| `DrinkStationView` | `ST-DRINK-BEER-TIER-1` | `MDL-BEER-GLASS`, `MDL-BEER-LEVER`, `VFX-BEER-CORE` | Artist 003 |
| `ServiceCounterView` | `ST-SERVICE-COUNTER`, `PR-SERVING-PLATE`, `ST-CLEANUP-OVERLAY` | `MDL-SERVICE-TRAY`, `FD-*-ORDER`, `FD-*-PLATED` | Artist 003 |
| `CustomerLayer` D1 | 츠키오카 fragment 5개 | `CH-TSUKIOKA-SERVICE`, `CH-OFFICE-A-SERVICE`, `CH-OFFICE-B-SERVICE` | Artist 004 |
| `GameplayHud` | 없음 | `UI-STATION-ICONS`, `UI-ORDER-ICONS-P0`, `UI-RISK-ICONS`, `UI-QUALITY-ICONS`, `UI-ECONOMY-ICONS`, `UI-STATE-ICONS` | Artist 003 |

## 후속 제작 예약 레지스트리

아래 ID와 pack은 예약됐다. 신규 파일은 ID를 소문자 kebab-case로 바꾼 이름을 기본으로 하며, atlas는 같은 basename의 `.png`와 `.json`, model은 `.glb`를 사용한다. 실제 runtime 링크는 `approved` 뒤 현재 이전 레지스트리에 추가한다.

### Artist 002: P0 브랜드·환경·스테이션

작업 002의 신규 12개와 재사용 7개 metadata 보강은 모두 `approved`로 현재 이전 레지스트리와 manifest에 반영됐다.

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
