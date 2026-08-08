# YAKI SEASON

공개 실행 흐름은 시작 화면에서 새 게임 또는 이어하기를 선택하고, S0 프롤로그를 거쳐 D1 영업으로 이어진다.

## 프로덕션 아트 계약

프로덕션 아트는 `ART-002 v3.6.1`, `ART-003 v5.0.0`의 순서를 따른다.

1. 최신 손님·스테이션 콘셉트 기준 세트로 화면별 승인 통합 콘셉트를 제작한다.
2. 승인 원본에서 배경·상판·작업면·캐릭터·음식·도구를 분리한다.
3. 분리본에 `sourceMasterId`, `styleRefs`, `finishPass`, FHD 재합성 결과를 기록한다.
4. 모든 증빙을 통과한 파일만 runtime manifest에 `approved`로 등록한다.

구형 생성 에셋·아트 검수판·자동 생성 스크립트와 runtime 복사본은 삭제했다. 현재 runtime manifest는
비어 있으며, 테스트 화면은 외부 아트 파일 없이 절차적 더미만 사용한다. 기존 구현을 직접 검증한
화면 기록 36장은 프로덕션 아트와 분리해 `tests/reference-images/`에 보존한다.

## 저장소 경계

`app`에는 실제 구현·테스트와 최종 런타임 전달물만 둔다.

| 위치 | 역할 | Git 추적 |
|---|---|---|
| `src/`, `content/`, `tests/`, `tools/` | 구현·데이터·검증 도구와 고정 검증 이미지 | 추적 |
| `public/assets/` | manifest와 승인·검증을 통과한 런타임 에셋 | 추적 |
| `../docs/` | 요구사항과 작업 상태 | 별도 저장소 |
| `../art-workspace/` | 콘셉트·원본·검수판·provenance·캡처 | 로컬 작업공간, `app`에서 추적하지 않음 |

아트 파일은 개별 승인만으로 런타임에 들어가지 않는다. 프로필별 개별 승인, 소비 화면
FHD/720p 재조립, 최적화, 소비 화면 최종 승인을 모두 확인한 finalizer가 만든 handoff만
승격할 수 있다. provenance의 `runtimeRegistrationAllowed`는 계속 `false`이며 사람이
허용 상태로 편집하지 않는다.

```bash
npm run assets:validate
npm run assets:promote -- \
  --handoff ../art-workspace/review/.../metadata/runtime-handoff.json
# 출력된 30분 유효 일회성 영수증을 사용해:
npm run assets:promote -- \
  --handoff ../art-workspace/review/.../metadata/runtime-handoff.json \
  --write \
  --receipt .asset-promotion-receipts/<receipt>.json
```

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:8777/src/public-shell.html`을 연다.

## 검증

```bash
npm test
npm run test:e2e -- tests/e2e/scene.spec.js --workers=1
npm run assets:validate
npm run visual:references:validate
```

`grill-shader.spec.js`는 제작 아트가 아닌 인라인 절차적 texture로 WebGL2 셰이더만 검증한다.
`tests/reference-images`는 기존 구현의 사람이 보는 고정 비교 자료이며 runtime asset이나
새 아트 생성 기준이 아니다.

## 경계

- 테스트 화면은 `CUSTOMER_SYSTEM_ENABLED=false`를 유지한다.
- 최신 프로덕션은 독립 손님 정보·조립·그릴·드링크·서빙 화면, 다중 손님/주문, 공용 준비 목록을 사용한다.
- 새 아트가 승인될 때까지 사용자 노출 아트 placeholder를 추가하지 않는다.
