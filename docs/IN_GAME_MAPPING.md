# In-game customer mapping

`OFFICE-A~E`는 런타임 내부 슬롯 식별자이며, 실제 파일은 아래 캐릭터 경로로 관리한다.

| 내부 슬롯 | 실제 파일 경로의 캐릭터 |
|---|---|
| Tsukioka | 기존 츠키오카 에셋 유지 |
| OFFICE-A | `in-game-mapping/developer-a-*` |
| OFFICE-B | `in-game-mapping/developer-b-*` |
| OFFICE-C | `in-game-mapping/young-man-delivery-*` |
| OFFICE-D | `in-game-mapping/stocky-middle-aged-man-*` |
| OFFICE-E | `in-game-mapping/middle-aged-woman-*` |

각 캐릭터는 `waiting`, `eating-negima`, `drinking-beer` 상태를 사용한다. 서버 캐릭터는 손님 매핑에서 제외한다.
