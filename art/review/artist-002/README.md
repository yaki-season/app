# Artist 002 review index

- 작업 기준: `artist/002 v2.0.2`
- spec 기준: `ART-003/ART-002/UI-002/SYS-003 v2.0.0`, `SCN-002 v1.0.0`
- 상태: 기술 검증 완료, 사용자 시각 리뷰 대기

## 교정 에셋 위치

| ID | runtime | source | 생성·alpha 원본 |
|---|---|---|---|
| `BG-SEATING-6` | [`public/assets/core/background/bg-seating-6.png`](../../../public/assets/core/background/bg-seating-6.png) | [`art/source/environment/bg-seating-6-r3.html`](../../source/environment/bg-seating-6-r3.html) | [`r3/generated.png`](bg-seating-6/r3/generated.png), [`r3/alpha.png`](bg-seating-6/r3/alpha.png) |
| `BG-BAR-COUNTER-BASE` | [`public/assets/core/background/bg-bar-counter-base.png`](../../../public/assets/core/background/bg-bar-counter-base.png) | [`art/source/environment/bg-bar-counter-base-r1.html`](../../source/environment/bg-bar-counter-base-r1.html) | [`r1/generated.png`](bg-bar-counter-base/r1/generated.png), [`r1/alpha.png`](bg-bar-counter-base/r1/alpha.png) |
| 공용 layout | [`public/assets/core/metadata/p0-environment-layout.json`](../../../public/assets/core/metadata/p0-environment-layout.json) | manifest companion | 6석·카운터·가림선·작업 bounds·전달 경로 |

개발자는 파일 경로를 직접 하드코딩하지 않고 [`manifest.json`](../../../public/assets/manifest.json)의 ID를 사용한다. 영업 장면 합성 순서는 `BG-INTERIOR-BASE` -> `BG-SEATING-6`·캐릭터 -> `BG-BAR-COUNTER-BASE` -> 활성 `ST-*` -> `BG-FOREGROUND-FRAME`이다.

## 검수 합성

| 대상 | 데스크톱 | 모바일 가로 |
|---|---|---|
| 빈 영업 장면·손님 가림 | [`interior-1920x1080.png`](composites/interior-1920x1080.png), [`interior-1280x720.png`](composites/interior-1280x720.png) | [`interior-mobile-844x390.png`](composites/interior-mobile-844x390.png) |
| 조립 | [`station-assembly-1280x720.png`](composites/station-assembly-1280x720.png) | [`station-assembly-mobile-844x390.png`](composites/station-assembly-mobile-844x390.png) |
| 그릴 | [`station-grill-1280x720.png`](composites/station-grill-1280x720.png) | [`station-grill-mobile-844x390.png`](composites/station-grill-mobile-844x390.png) |
| 드링크 | [`station-drink-1280x720.png`](composites/station-drink-1280x720.png) | [`station-drink-mobile-844x390.png`](composites/station-drink-mobile-844x390.png) |
| 서빙 | [`station-service-1280x720.png`](composites/station-service-1280x720.png) | [`station-service-mobile-844x390.png`](composites/station-service-mobile-844x390.png) |

재현 가능한 합성 원본은 [`composites/preview.html`](composites/preview.html)이다. 이전 `BG-SEATING-6` revision 1·2 생성본은 리뷰 이력으로만 보존하며 runtime에서 사용하지 않는다.
