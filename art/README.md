# YAKI SEASON art pipeline

구현 기준은 `docs/spec/art/ART-003_런타임_아트_에셋_목록과_제작_계약.md` `v1.1.0`이다. 런타임 단일 원본은 [`public/assets/manifest.json`](../public/assets/manifest.json), 개발자용 조회 인덱스는 [`ASSET-CATALOG.md`](ASSET-CATALOG.md)다.

## 경로 경계

| 경로 | 허용 내용 | 금지 내용 |
|---|---|---|
| `art/source/` | Aseprite·PSD·Krita·Blender 등 편집 원본 | 런타임 코드가 직접 읽는 export |
| `art/review/<asset-id>/<revision>/` | 후보·실패본·chroma·비교 캡처 | production manifest 등록 |
| `art/provenance/` | 프롬프트·참조·후처리·권리·검수 기록 | 게임이 직접 로드하는 파일 |
| `public/assets/core/` | 시작·S0-D1에 필요한 `approved` 파일 | 검토본·원본·미승인 P2 |
| `public/assets/campaign/` | S2-S7 단계별 `approved` 파일 | startup 강제 로드 |
| `public/assets/optional/` | 별도 승인된 P2 파일 | 필수 캠페인 의존 |

`public/assets`의 파일명은 에셋 ID를 소문자 kebab-case로 변환한다. 종류별 하위 디렉터리는 `background`, `stations`, `models`, `textures`, `food`, `characters`, `props`, `ui`, `vfx` 중 하나를 사용한다. 파일명을 코드에 하드코딩하지 않고 manifest `id`로 조회한다.

## 상태 흐름

`planned -> in-production -> review -> approved -> deprecated` 순서를 사용한다. 외부 결정이 없으면 진행할 수 없는 항목만 `blocked`로 둔다. `manifest.json`에는 `approved`만 허용하며 나머지 상태는 카탈로그에만 기록한다.

## 신규·교체 절차

1. [`ASSET-CATALOG.md`](ASSET-CATALOG.md)의 예약 ID, 담당 Artist 태스크와 pack을 확인한다.
2. `art/source/<kind>/<asset-id-lowercase>/`에 편집 원본을, `art/review/<asset-id-lowercase>/r<revision>/`에 export 후보와 비교 자료를 둔다.
3. 규격·alpha·pivot·anchor·clip·모바일 crop을 검수하고 provenance JSON에 도구, 참조, 프롬프트, 후처리, 권리와 결과를 기록한다.
4. 승인 시 runtime 파일을 `public/assets/<pack>/<kind>/`로 export하고 manifest에 실제 SHA-256·바이트·규격을 기록한다.
5. 같은 변경에서 카탈로그 상태와 모든 링크를 갱신한 뒤 `node tools/assets/validate-assets.mjs`를 실행한다.
6. 기존 파일 교체는 ID를 유지하고 `revision`을 올린다. pivot·anchor·clip 계약이 깨지면 호환성 변경과 개발 영향 범위를 provenance에 기록한다.

기존 `art/gameplay/` 경로는 폐기됐다. 이전 음식 PNG 4개는 3D 제작 참고용으로만 `art/review/legacy-gameplay/food/`에 보존한다. `art/test.png`, `art/skewer-negima*.png`는 선행 기술 검증 파일이며 정식 catalog나 runtime 경로로 승격하지 않는다.

## 검증 명령

```sh
node tools/assets/validate-assets.mjs
```

검증기는 manifest 필수 필드, ID·URL 중복, pack·상태, 실제 파일의 SHA-256·바이트·raster 규격, PNG alpha, source·provenance 링크, 카탈로그 동기화, deprecated 파일의 runtime 유입과 미등록 runtime 파일을 검사한다.
