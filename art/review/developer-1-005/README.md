# 개발자 1 작업 005 장면 검수

- 생성일: `2026-07-25`
- 기준: `SYS-002 v2.0.0`, `QA-001 v1.2.0`
- 생성 명령: `CAPTURE_STATES=1 npx playwright test tests/e2e/capture-states.spec.js --workers=1`

## 캡처

`captures/chromium-1280x720/`, `captures/chromium-1920x1080/`에 각 8장, 총 16장을 저장한다.

1. `01-assembly-start.png`
2. `02-assembly-complete.png`
3. `03-grill-perfect.png`
4. `04-plate-selected.png`
5. `05-tasting.png`
6. `06-satisfied.png`
7. `07-low-quality.png`
8. `08-burnt-failure.png`

캡처 테스트는 실제 게임 상태 전이 함수를 사용하며, 파일당 10KB 초과와 같은 뷰포트 내
8개 이미지의 SHA-256 해시가 모두 다른지 확인한다.

## 자동 성능 측정

| 뷰포트 | 드로우콜 | 삼각형 | 선 | DPR | 평균 FPS |
|---|---:|---:|---:|---:|---:|
| `1280×720` | 11 | 20 | 122 | 1 | 58.9 |
| `1920×1080` | 11 | 20 | 122 | 1 | 58.9 |

측정 환경은 Playwright Chromium의 SwiftShader다. 드로우콜 30, 삼각형 50,000, DPR 1.5,
평균 30 FPS 자동 예산은 통과했다. 실제 GPU 수동 측정은 별도로 남아 있다.
