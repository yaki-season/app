# YAKI SEASON

> 작은 야키토리 가게의 하루를 운영하며 꼬치를 굽고, 술을 따르고, 손님을 맞이하는 웹 기반 조리 시뮬레이션입니다.

![YAKI SEASON](public/assets/core/s0/story/s0-aki-reopened-shop-full-scene-r1-b1.png)

YAKI SEASON은 가게를 다시 여는 프롤로그에서 시작해 날짜별 영업을 이어가는 게임입니다. 플레이어는 주문을 확인하고 재료 조립, 숯불 조리, 음료 준비, 서빙과 정리를 직접 수행합니다. 날짜가 지날수록 손님과 메뉴가 늘어나며 새로운 조리 공정이 해금됩니다.

현재 저장소에는 S0 프롤로그부터 D3 영업까지의 플레이 흐름이 구현되어 있습니다.

## 공개 배포

- 게임 플레이: <https://yakiseason.vercel.app/>
- 공개 shell 직접 주소: <https://yakiseason.vercel.app/public-shell.html>

Vercel Production 배포는 2026-08-11에 Chromium 1280×720·1920×1080 기준으로 확인했습니다. 사이트 루트와 공개 shell 부팅, CSS·JavaScript·이미지 로딩, 오디오 MP3/WAV fallback, 새 게임에서 S0 프롤로그로 이어지는 흐름이 정상 동작합니다.

## 주요 기능

- 닭고기와 대파를 순서대로 끼우는 네기마 조립
- 앞면과 뒷면의 익힘 상태를 따로 관리하는 숯불 조리
- 모모 조립 및 조리
- 맥주와 거품 비율을 조절하는 생맥주 따르기
- 여러 손님의 주문, 착석, 서빙, 식사와 자리 정리
- 영업 종료 후 정산 및 다음 영업일 전환
- 브라우저 저장소를 이용한 캠페인과 진행 상태 복구
- 키보드와 포인터 입력, 주요 UI의 접근성 상태 제공

## 메뉴

가게를 운영하며 기본 메뉴부터 시작해 새로운 꼬치와 음료를 차례로 늘려갈 예정입니다. 아래의 `현재 구현`은 지금 플레이할 수 있는 메뉴이며, `추가 예정`은 기획과 개발 과정에서 세부 내용이 바뀔 수 있습니다.

### 꼬치와 음식

| 상태 | 메뉴 | 설명 |
|---|---|---|
| 현재 구현 | 네기마 | 닭다리살과 대파를 번갈아 끼워 굽는 기본 꼬치입니다. |
| 현재 구현 | 모모 | 닭다리살만으로 구성되어 불 조절과 익힘 정도에 집중하는 꼬치입니다. |
| 추가 예정 | 츠쿠네 | 닭고기 반죽을 빚어 굽고 달걀노른자에 곁들이는 닭경단 꼬치입니다. |
| 추가 예정 | 카와 | 닭껍질을 겹쳐 끼워 바삭한 식감을 살리는 꼬치입니다. |
| 추가 예정 | 난코츠 | 오독한 식감의 닭 연골을 사용하는 꼬치입니다. |
| 추가 예정 | 삼겹살말이 | 아스파라거스, 방울토마토, 깻잎 등의 재료를 삼겹살로 말아 굽는 꼬치입니다. |

꼬치 외에도 양배추 간장 사라다, 에다마메처럼 바로 제공하는 안주와 가라아게, 구운 오니기리 등의 메뉴 확장을 계획하고 있습니다.

### 음료

| 상태 | 메뉴 | 설명 |
|---|---|---|
| 현재 구현 | 생맥주 | 맥주와 거품의 비율을 조절해 완성하는 기본 음료입니다. |
| 추가 예정 | 하이볼 | 얼음, 위스키, 탄산수와 레몬을 순서대로 조합하는 음료입니다. |
| 추가 예정 | 사와 | 영업 중 빠르게 만들 수 있는 상큼한 탄산 주류로 추가할 예정입니다. |
| 추가 예정 | 우롱차 | 주류를 주문하지 않는 손님을 위한 기본 무알코올 음료입니다. |

## 게임 진행

```text
프롤로그
   ↓
영업 시작
   ↓
주문 확인 → 조립 → 굽기/음료 준비 → 서빙
   ↑                                  ↓
   └──────── 다음 주문과 자리 정리 ────┘
   ↓
마감 → 정산 → 다음 날
```

날짜별 핵심 변화는 다음과 같습니다.

| 구간 | 주요 내용 |
|---|---|
| S0 | 폐점 상태의 가게를 다시 열고 첫 영업을 준비합니다. |
| D1 | 네기마와 생맥주를 중심으로 기본 영업 흐름을 익힙니다. |
| D2 | 모모 메뉴와 늘어난 손님을 운영합니다. |
| D3 | 새로운 조리법과 확장된 영업 흐름이 추가됩니다. |

## 기술 구성

- JavaScript ES Modules
- Three.js 기반 2.5D 스테이션 렌더링
- Vite 개발 서버 및 프로덕션 빌드
- Vitest 단위·통합 테스트
- Playwright 브라우저 E2E 테스트
- JSON 기반 콘텐츠 정의와 런타임 에셋 manifest

게임 규칙과 화면 렌더링은 가능한 한 분리되어 있습니다. 조리 및 캠페인 규칙은 순수 도메인 모듈에서 판정하고, 브라우저 진입점이 입력·오디오·Three.js 화면과 연결합니다.

## 로컬 실행

Node.js와 npm이 필요합니다.

```bash
npm install
npm run dev
```

개발 서버가 실행되면 다음 주소를 엽니다.

- 게임 시작: <http://127.0.0.1:8777/>

기존 공개 shell 주소인 <http://127.0.0.1:8777/src/public-shell.html>도 호환 경로로 유지됩니다.

## 테스트

전체 단위·통합 테스트:

```bash
npm test
```

브라우저 E2E 테스트:

```bash
npm run test:e2e
```

D1 핵심 흐름 검증:

```bash
npm run verify:d1-core
```

런타임 에셋과 시각 기준 검증:

```bash
npm run assets:validate
npm run visual:references:validate
```

## Vercel 배포

Vercel에서 GitHub 저장소를 가져오면 저장소 루트의 `vercel.json`이 다음 설정을 적용합니다.

- Framework Preset: Vite
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `dist`
- Node.js: `24.x`
- 환경 변수: 없음

프로젝트의 Root Directory는 저장소 루트인 `./`로 둡니다. 배포 주소의 `/`는 공개 시작 화면인 `public-shell.html`로 연결되며, 기존 `/src/*`와 `/public/*` 주소도 호환됩니다.

GitHub의 `main` 브랜치를 Production Branch로 지정하면 이후 `main` 푸시마다 프로덕션 배포가 자동으로 갱신됩니다. 기능 브랜치나 Pull Request의 푸시는 별도의 Preview Deployment로 확인할 수 있습니다.

## Docker 배포

프로덕션 정적 파일은 멀티 스테이지 이미지 안에서 빌드되며, 컨테이너의 `/`는 공개 시작 화면을 제공합니다.

```bash
docker build -t yaki-season-app:local .
docker run --rm -p 8080:80 yaki-season-app:local
```

Node 기반 이미지를 내려받을 수 없는 오프라인 환경에서는 호스트 빌드 결과로 같은 런타임 이미지를 만들 수 있습니다.

```bash
npm ci
npm run build
docker build -f deploy/Dockerfile.prebuilt -t yaki-season-app:local .
```

배포 서버로 옮길 이미지 tar는 다음과 같이 만들고 불러올 수 있습니다.

```bash
docker save -o yaki-season-app.tar yaki-season-app:local
docker load -i yaki-season-app.tar
```

전체 진단은 아래 명령으로 실행할 수 있습니다.

```bash
npm run verify:full-diagnostic
```

## 프로젝트 구조

| 위치 | 역할 |
|---|---|
| `src/` | 게임 진입점, 도메인 로직, 렌더링, 오디오와 콘텐츠 소비 코드 |
| `content/` | 캠페인과 영업일 콘텐츠 데이터 |
| `public/assets/` | 런타임에서 사용하는 승인 에셋과 manifest |
| `tests/unit/` | 순수 규칙과 UI 계약 단위 테스트 |
| `tests/integration/` | 캠페인·영업일 모듈 통합 테스트 |
| `tests/e2e/` | 실제 브라우저 플레이 흐름 검증 |
| `tools/` | 콘텐츠 빌드, 에셋 검증·승격, 개발 지원 도구 |

요구사항, 게임 기획, UI·아트·오디오 명세와 작업 기록은 별도 [YAKI SEASON 문서 저장소](https://github.com/yaki-season/docs)에서 관리합니다.

## 에셋 관리

런타임 에셋은 제작 파일을 바로 복사하지 않고 검수와 승격 절차를 거칩니다. 승인된 handoff만 `public/assets/`와 runtime manifest에 등록할 수 있습니다.

```bash
npm run assets:validate
npm run assets:promote -- --handoff <runtime-handoff.json>
```

원본·후보 이미지와 제작 중간 결과는 앱 저장소 밖의 아트 작업 공간에서 관리하며, 이 저장소에는 실제 게임 실행에 필요한 최종 전달물만 포함합니다.

## 개발 상태

현재는 웹 프로토타입을 지속적으로 개발하는 단계입니다. 기능과 에셋 경로, 밸런스 값은 변경될 수 있으며 회귀 방지를 위해 주요 플레이 흐름을 자동 테스트로 관리합니다.
