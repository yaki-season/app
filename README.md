# YAKI SEASON — 단일 야키토리 주문 수직 슬라이스

PC 웹에서 마우스 클릭만으로 네기마 한 주문을 조립하고, 양면을 굽고, 손님에게 서빙하는
최소 프로토타입입니다.

구현 기준 요구사항은 별도 `docs` 저장소에서 관리합니다.

| 식별자 | 문서 | 버전 |
|---|---|---|
| `SYS-001` | `spec/system/SYS-001_웹_프로토타입_런타임과_상태_관리.md` | `v1.0.0` |
| `GPL-001` | `spec/gameplay/GPL-001_단일_야키토리_주문_수직_슬라이스.md` | `v1.0.0` |
| `UI-001` | `spec/ui/UI-001_웹_클릭_조리_및_서빙_인터페이스.md` | `v1.0.0` |
| `ART-001` | `spec/art/ART-001_야키토리_프로토타입_픽셀_아트_에셋.md` | `v1.0.0` |
| `QA-001` | `spec/qa/QA-001_최소_프로토타입_동작_검증.md` | `v1.0.0` |

## 실행

셰이더와 텍스처를 `fetch`로 불러오므로 로컬 서버가 필요합니다. `file://`로 열면 동작하지 않습니다.

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:8777/src/index.html 을 엽니다.

`?debug`를 붙이면 현재 공정, 면별 경과 시간과 판정 결과가 1초마다 콘솔에 출력됩니다
(`SYS-001 §상세요구사항 10`). 개발자용 수치는 UI에 노출하지 않습니다.

## 검증

```bash
npm run test:e2e:install   # 최초 1회, Chromium 내려받기
npm run verify             # 상태 로직 단위 테스트 + 데스크톱 종단 테스트
```

개별 실행도 가능합니다.

| 명령 | 대상 |
|---|---|
| `npm test` | 상태 전이·조리 판정 단위 테스트 (Vitest, 브라우저 없음) |
| `npm run test:e2e` | `1280×720`과 `1920×1080` 종단 테스트 (Playwright, Chromium) |
| `npx playwright test qa-scenarios` | `QA-001` 시나리오 A~D와 캔버스 픽셀 검사 |
| `npx playwright test assets` | 에셋 404·콘솔 오류·보간·로딩 게이트 |
| `npx playwright test layout` | 최소 클릭 영역·화면 내 포함·겹침 |
| `npx playwright test capture` | 공정별 화면 캡처를 `captures/`에 생성 |

종단 테스트는 `python -m http.server 8777`을 자동으로 띄웁니다. 이미 떠 있으면 재사용합니다.

### 종단 테스트가 시간에 의존하는 방식

조리 판정은 실제 경과 시간 기준이라(`GPL-001 §9`) 종단 테스트가 CPU 부하에 민감합니다.
두 가지로 대응합니다.

- **고정 대기를 쓰지 않습니다.** `waitForTimeout(2700)` 대신 익힘 배지가 `앞면 · 적정`이 될 때까지
  기다렸다 클릭합니다(`tests/e2e/helpers.js`). 고정 대기는 머신이 느리면 적정 구간을 넘겨 `과다`가 됩니다.
- **워커를 2로 고정합니다** (`playwright.config.js`). 기본값(코어의 절반)은 WebGL 렌더링과 겹쳐
  브라우저를 굶기고, 그러면 적정 구간 3초가 관측되기 전에 지나갑니다.

예외적으로 남긴 고정 대기는 *느려지면 오히려 안전한* 것들뿐입니다 — 연출 정착 대기,
입력 잠금(160ms) 회피, 숨김 상태에서 시간이 누적되지 않음을 확인하는 대기.

검증 결과와 남은 위험은 [QA-RESULTS.md](QA-RESULTS.md)에 있습니다.

## 구성

```
app/
├── src/
│   ├── index.html            # 애플리케이션 진입점
│   ├── main.js               # DOM 이벤트 → 상태 전이 → 렌더링 배선, 단일 rAF 루프
│   ├── style.css             # 화면 레이아웃, 1280×720 / 1920×1080 대응
│   ├── config/recipe.js      # ★ 레시피와 조리 임계값의 단일 정의 위치
│   ├── state/gameState.js    # ★ 순수 상태 모델 (DOM·WebGL 의존 없음)
│   ├── render/grillRenderer.js
│   └── shaders/              # sources/ 스파이크에서 가져온 익힘 셰이더
├── art/                      # 런타임 에셋
├── tests/
│   ├── unit/                 # 상태 전이와 조리 판정 경계
│   └── e2e/                  # 데스크톱 마우스 클릭 종단 흐름
└── sources/                  # 초기 익힘 셰이더 스파이크 (런타임 아님, 아래 참고)
```

## 렌더러 선택 근거

**기존 WebGL2를 유지하고 Three.js를 도입하지 않았습니다** (`SYS-001 §상세요구사항 13`).

- 이 슬라이스에서 3D 렌더링이 필요한 대상은 그릴 위 꼬치 하나뿐입니다. 씬 그래프, 카메라와
  머티리얼 시스템을 얻는 대가로 Three.js 번들을 추가할 만한 대상 수가 아닙니다.
- `sources/`의 익힘 셰이더가 이미 요구 표현(마이야르 색 변화, 그을음 마스크, 타레 스페큘러,
  숯불 반사광)을 담고 있어 그대로 옮기면 통합 비용이 가장 낮았습니다.
- 나머지 화면(조립, 카운터, 주문표, 공정 탭)은 DOM으로 충분하고, 클릭 영역과 접근성 처리도
  DOM 쪽이 유리합니다.
- 결과적으로 화면 전체에서 렌더러는 WebGL2 하나, 애니메이션 루프는 `main.js`의 `loop()`
  하나만 운영합니다.

전환이 필요해지는 시점은 꼬치가 여러 개 동시에 보이거나 카메라 앵글이 생길 때입니다.

## 기존 실험 코드 재사용 판정

| 자산 | 판정 | 근거 |
|---|---|---|
| `sources/shaders/skewer.vert.glsl` | **재사용** | `src/shaders/`로 복사. 버퍼 없는 풀스크린 쿼드로 수정 없이 사용 가능 |
| `sources/shaders/skewer.frag.glsl` | **재사용** | `src/shaders/`로 복사. `uDoneness` 인터페이스를 그대로 두고 값 계산만 게임 상태로 옮김 |
| `art/skewer-negima-pixel.png` | **재사용** | 그릴 셰이더의 런타임 텍스처. 품질이 충분해 교체하지 않음 |
| `art/skewer-negima.png` | 분리 | 이전 러프. `art/archive/`로 옮김 |
| `art/test.png` | 분리 | 빈 흰 원. `art/archive/`로 옮김 |
| `sources/index.html`, `sources/main.js` | **대체** | 슬라이더 계측용 단일 토글 UI. 게임 화면 구조와 목적이 달라 `src/`로 새로 작성 |
| `tools/grill-tool.html` | 유지 | 개발자용 계측 도구. 런타임과 무관 |

`sources/`는 참조용으로 남겨두었습니다. 런타임 진입점은 `src/index.html` 하나입니다.

## 콘텐츠 데이터 (밸런스 수치)

게임 수치는 코드 상수가 아니라 `content/`의 JSON에서 옵니다 (`DAT-001`). 부팅 시 로드·검증해
게임 로직에 반영합니다. 로드에 실패하면 코드의 안전 기본값으로 계속됩니다.

```
content/
├── schema/            # JSON Schema (Ajv 검증용)
├── processes/grill.json     # 조리 익힘 구간(적정·과다·탄) — recipe.js가 읽음
├── recipes/negima.json      # 네기마 레시피
├── customers/types.json     # 손님 유형별 인내심·팁·주문 순서
└── campaign/day-d1.json     # 영업일 손님 수·간격·경제
```

| 모듈 | 역할 |
|---|---|
| `src/content/rules.js` | 교차 검증(참조·중복·구간 순서·상태). 브라우저·Node 공용 |
| `src/content/validate.js` | Ajv 전체 스키마 검증. **개발·테스트 전용**(런타임 미사용) |
| `src/content/loader.js` | 런타임 로더. fetch + 가벼운 검사 + `candidate`/`approved` 분리 |

`SYS-004`대로 **전체 스키마 검증(Ajv)은 테스트에서, 런타임은 가벼운 검사만** 합니다.
`approved`이고 활성인 레코드만 게임 기본값으로 로드되고, `candidate`는 도구에서만 시험합니다.
`npm test`가 실제 `content/`를 스키마·교차 규칙으로 검증하고, 각 위반 유형의 거부를 확인합니다.

## 밸런스 튜닝 도구 (개발·기획용)

기획자가 코드 수정 없이 게임 수치를 조절하고 한 영업일을 시뮬레이션해 결과를 보는 내부 도구입니다
(`SYS-005` 1차 버전). 출시 빌드에는 포함하지 않습니다.

```bash
npm run dev
```

브라우저에서 http://localhost:8777/tools/balance-tool.html 을 엽니다.

- 조리 시간·손님 인내심·손님 간격·팁·판매가 등을 슬라이더로 조절
- **시뮬레이션 실행** → 한 영업일을 렌더링 없이 돌려 총수익·서빙·이탈·평균 대기·품질 분포 표시
- 직전 실행 대비 변화(초록/빨강 화살표)로 수치 영향을 비교
- **JSON 내보내기**로 조절한 값을 저장

| 파일 | 역할 |
|---|---|
| `tools/balance-data.json` | 튜닝 수치 (`candidate` 상태) |
| `tools/simulator.js` | 순수 영업일 시뮬레이터. 도구와 단위 테스트가 공유 |
| `tools/balance-tool.html` | 슬라이더 UI |
| `tests/unit/simulator.test.js` | 재현성·수치 영향 검증 |

**한계**: 정식 영업일 루프(개발자 1 작업 007)와 데이터 계약 구현(개발자 3 작업 001)이 아직 없어,
이 시뮬레이터는 조리·손님 판정 규칙만 재사용하고 대기열 모델은 도구 자체에 둔 1차 버전입니다.
그 작업들이 생기면 시뮬레이터가 실제 게임 루프를 재사용하도록 교체합니다. 값은 아직 `candidate`이며
게임 기본값으로 로드되지 않습니다.

## 손님 시스템 (현재 비활성)

`src/state/customer/`에 손님 상태 머신·유형·다중 슬롯 재주문이 구현돼 있지만
**기본으로 꺼져 있습니다** (`src/config/features.js`의 `CUSTOMER_SYSTEM_ENABLED`).

끈 이유:

- `epic/developer-1/005 (2.5D 영업 장면과 손님 반응)`이 범위에서 **복수 주문과 대기 게이지를
  명시적으로 제외**하고, 구현 기준선을 수직 슬라이스 커밋으로 고정해 두었습니다.
- 손님의 정본 요구사항은 `spec/gameplay/GPL-003 주문·손님·좌석과 러시 운영`이며 좌석·그룹·러시까지
  포함합니다. 현재 구현은 그보다 좁은 초기 설계 기준이라 재작업이 필요합니다.

끄면 화면은 수직 슬라이스 동작을 그대로 유지합니다(서빙 즉시 결과 표시, 품질 판정은
`GPL-001 §13`대로 조리 쪽에서 계산). 켜면 판정 소유가 손님으로 이동합니다.

| 상태 | 단위 테스트 | 종단 테스트 |
|---|---|---|
| 꺼짐(현재) | 기준선 32개 + 휴면 모듈 31개 | 46개 (손님 런타임 8개는 건너뜀) |
| 켜짐 | 63개 | 54개 |

`GPL-003` 기준으로 손님 모델을 재정렬하는 후속 작업에서 플래그를 켭니다. 그때까지
`src/state/customer/`와 단위 테스트는 휴면 상태로 유지해 회귀를 막습니다.

## 설계 경계

- **상태와 렌더링은 분리되어 있습니다.** `src/state/gameState.js`는 순수 함수만 노출하고
  DOM·WebGL·타이머를 참조하지 않습니다. 모든 시간 값은 호출자가 단조 증가 밀리초로 넘깁니다.
  덕분에 조리 판정 전체를 브라우저 없이 모의 시간으로 검증할 수 있습니다 (`SYS-001 §14`).
- **조리 수치는 `src/config/recipe.js` 한 곳에만 있습니다** (`GPL-001 §비기능 4`).
  화면별로 임계값을 다시 정의하지 않습니다.
- **타이머는 존재하지 않습니다.** 조리 시간은 `faceStartAtMs`와 현재 시각의 차이로만 계산하므로
  `setInterval` 누적 오차나 중복 타이머가 생길 수 없습니다. 숨김·복귀는 `pausedAtMs`를 두고
  복귀 시 정지 구간만큼 `faceStartAtMs`를 미루는 방식으로 처리합니다 (`SYS-001 §6`).
- **입력 잠금은 대상별입니다.** 전역 잠금은 서로 다른 대상의 연속 클릭까지 삼켜
  화면 전체 입력을 막으므로 사용하지 않습니다 (`UI-001 §17`).

## 에셋

런타임 에셋은 `art/generated/`에 있고, 경로는 `src/config/assets.js` 한 곳에서만 정의합니다.
여기 등록된 항목은 모두 필수 에셋으로 취급해 전부 로드되기 전에는 핵심 입력을 활성화하지 않습니다.

### 제작 방법

에셋은 손으로 그린 것이 아니라 **코드로 생성**합니다.

```bash
pip install Pillow
python tools/generate-art.py
```

`tools/generate-art.py`가 `ART-001`의 팔레트·광원 방향·상태 구분 규칙을 코드로 담고 있어,
색이나 크기를 바꾸려면 이미지가 아니라 이 스크립트를 수정하고 다시 실행합니다.
팔레트 기준값은 콘셉트 `05`, `06`, `13`에서 추출했습니다.

### 목록

| 파일 | 사용 위치 | 상태·변형 | 원본 크기 |
|---|---|---|---|
| `bg-assembly.png` | `#screen-assembly` 배경 | — | `640×360` |
| `bg-grill.png` | `#screen-grill` 배경 | — | `640×360` |
| `bg-counter.png` | `#screen-counter` 배경 | — | `640×360` |
| `icon-chicken.png` | 주문표 칸 | 기본 / `.done` / `.next` / `.mismatch` | `16×16` |
| `icon-leek.png` | 주문표 칸 | 같음 | `16×16` |
| `ingredient-chicken.png` | 재료통, 날아가는 재료 | 기본 / `:active` / `.mismatch` | `20×20` |
| `ingredient-leek.png` | 재료통, 날아가는 재료 | 같음 | `20×20` |
| `piece-chicken.png` | 조립 칸 | `.filled-chicken` | `14×14` |
| `piece-leek.png` | 조립 칸 | `.filled-leek` | `14×14` |
| `skewer-empty.png` | 빈 꼬치 막대 | 기본 / `.assembled` | `96×16` |
| `brazier.png` | 그릴 칸 | 기본 | `110×110` |
| `brazier-hot.png` | 그릴 칸 | `.hot` (가열 중) | `110×110` |
| `skewer-negima-raw.png` | 접시 위 꼬치, 셰이더 대체 | `under` | `64×64` |
| `skewer-negima-cooking.png` | 셰이더 대체 | `under` 후반 | `64×64` |
| `skewer-negima-perfect.png` | 접시 위 꼬치, 셰이더 대체 | `perfect` | `64×64` |
| `skewer-negima-over.png` | 접시 위 꼬치, 셰이더 대체 | `over` | `64×64` |
| `skewer-negima-burnt.png` | 셰이더 대체 | `burnt` | `64×64` |
| `plate.png` | 접시, 접시 놓는 자리 | 기본 / `.selected` / `.serving` | `60×60` |
| `order-mat.png` | 손님 주문 매트 | 기본 / `.highlight` | `100×70` |
| `customer-idle.png` | 손님 | 대기 | `40×48` |
| `customer-happy.png` | 손님 | 좋은 반응 | `40×48` |
| `customer-meh.png` | 손님 | 낮은 품질 반응 | `40×48` |
| `vfx-smoke.png` | 그릴 연기 | 익힘 단계별 농도 | `16×16` |
| `vfx-ember.png` | 불씨 | — | `8×8` |
| `vfx-gloss.png` | 윤기 | 적정 구간 진입 | `24×24` |
| `vfx-pierce.png` | 관통 스파크 | 4프레임 시트 | `64×16` |

그릴 위 조리 중인 꼬치는 위 래스터가 아니라 `art/skewer-negima-pixel.png` 텍스처와
익힘 셰이더로 그립니다. 래스터 5종은 WebGL2를 쓸 수 없는 환경의 대체 경로이며,
`perfect`와 `over`는 접시 위 표현에도 함께 사용합니다.

전체 전송 크기는 약 `16KB`로 목표 `5MB`를 크게 밑돌고, 최대 한 변은 `640px`로
제한 `1024px` 안에 있습니다.

`art/archive/`는 런타임에서 로드하지 않습니다. 초기 실험의 중간 산출물만 들어 있습니다.

### 화면별 안전 영역

주문표(상단 `약 53px`)와 공정 탭(하단 `약 65px`)을 제외한 중앙 영역이 작업 대상 배치 구간입니다.
`tests/e2e/layout.spec.js`가 이 경계와 최소 클릭 영역 `44×44`를 두 뷰포트에서 자동 검사하고,
`tests/e2e/assets.spec.js`가 에셋 404·콘솔 오류·최근접 보간을 검사하므로,
에셋을 교체하면 두 테스트가 모두 통과해야 합니다.

조리 상태 이름은 `src/config/recipe.js`의 `DONENESS` 값을 그대로 씁니다:
`under`, `perfect`, `over`, `burnt`. 화면에서는 `.doneness-*` 클래스로 노출됩니다.

## 알려진 한계

- **에셋은 코드로 생성한 픽셀 아트입니다.** `ART-001`의 팔레트·광원·상태 구분 규칙은
  지키지만, 콘셉트 시트의 회화적 밀도에는 미치지 못합니다. 같은 파일명으로 교체하면
  코드 수정 없이 반영됩니다.
- **배경은 `cover`로 늘어납니다.** 정수 배율이 아니므로 배경에는 1px 디테일을 넣지 않고
  넓은 면과 부드러운 밝기 변화만 사용합니다. 조작 대상 스프라이트는 최근접 보간을 유지합니다.
- 헤드리스 환경에는 GPU가 없어 종단 테스트는 SwiftShader로 WebGL2를 소프트웨어 렌더링합니다
  (`playwright.config.js`). 성능 측정 용도로는 쓸 수 없습니다.
- 모바일 브라우저, 터치 입력과 모바일 뷰포트는 `UI-001` 범위에서 제외되어 대응하지 않습니다.
