# Editable art sources

Artist 작업의 편집 원본만 보관한다. Aseprite, PSD, Krita, Blender 등 제작 도구 파일과 사람이 검수 가능한 로고 문자 레이어를 에셋 ID별 디렉터리에 둔다.

```text
art/source/<kind>/<asset-id-lowercase>/
```

생성 전용 입력, 실패본과 검토 출력은 `art/review/`에 두고, 런타임 export는 `public/assets/`에 둔다. 원본을 추가할 때는 `art/ASSET-CATALOG.md`의 source 링크와 provenance JSON을 같은 커밋에서 갱신한다.
