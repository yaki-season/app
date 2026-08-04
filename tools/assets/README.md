# Runtime asset gate

이 디렉터리는 `../art-workspace`의 최종 handoff를 `public/assets`로 승격하는 유일한
경로다. provenance의 허용 값을 사람이 바꾸거나 manifest를 직접 편집하지 않는다.

## 1. 전체 runtime 검증

```bash
npm run assets:validate
```

다음을 실패시킨다.

- schema 오류, 중복 stable ID·URL
- 파일·SHA-256·byte·raster 치수 불일치
- manifest 미등록 payload
- 작업용 `source`, `review`, `generated`, `chroma`, `rejected` 경로
- URL에 `-r{sourceRevision}-b{runtimeBuild}`가 없는 항목
- standalone raster·alpha·atlas의 손실 압축

manifest에는 stable ID별 활성 runtime build 하나만 둔다. 이전 build는 art 저장소와 Git
history에만 남는다.

## 2. read-only preflight

```bash
npm run assets:promote -- \
  --handoff ../art-workspace/review/.../metadata/runtime-handoff.json
```

handoff에는 사용자 승인 provenance, 프로필 승인 보고서, 소비 화면 FHD/720p 재조립,
최적화, 소비 화면 최종 승인과 bundle 전체 해시가 있어야 한다. finalizer가 모든 선행
게이트를 확인해 `runtimeRegistrationAllowed=true`를 파생한 handoff만 통과한다.

`--write`를 빼면 handoff·evidence·SHA-256·bundle·manifest 후보를 모두
검증하지만 파일, manifest, staging, receipt를 생성하지 않는 read-only
preflight다. 시간창과 일회성 영수증은 파이프라인 v8에서 폐기됐다.

## 3. 명시적 write

```bash
npm run assets:promote -- \
  --handoff ../art-workspace/review/.../metadata/runtime-handoff.json \
  --write
```

도구는 같은 프로세스에서 모든 입력을 다시 검증한 직후 쓰기를 시작한다.
단일 파일도 bundle transaction으로 처리하고, 새 파일 전체와 manifest를 staging한 뒤
한 번에 반영하고 최종 검증을 실행한다. 어느 단계든 실패하면 기존 파일과 manifest를
모두 복구한다.

`--receipt`는 호환 옵션으로 무시하지 않고 폐기된 인자라는 명확한 오류로
종료한다.

원본은 이동하거나 수정하지 않으며, 승인·최적화된 사본만 `public/assets`에 설치한다.
