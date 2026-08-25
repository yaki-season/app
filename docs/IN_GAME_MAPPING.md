# In-game customer mapping

`OFFICE-A~E`는 런타임 내부 슬롯 식별자이며, 실제 파일은 아래 캐릭터 경로로 관리한다.

| 내부 슬롯 | 지정한 교체 원본 절대경로 | 최종 app waiting / eating / drinking 경로 |
|---|---|---|
| Tsukioka | 기존 유지: `C:\Users\KwonYeongmin\Work\Project\YakiSeason\app\public\assets\core\customer\d1-tsukioka-waiting-r3-b1.png` | 기존 츠키오카 런타임 세트 |
| OFFICE-A → Developer A | `C:\Users\KwonYeongmin\Work\Project\YakiSeason\lora-art-generator\datasets\references\characters\developer-a\` | `C:\Users\KwonYeongmin\Work\Project\YakiSeason\app\public\assets\core\customer\in-game-mapping\developer-a-{waiting,eating-negima,drinking-beer}-r6-b1.png` |
| OFFICE-B → Developer B | `C:\Users\KwonYeongmin\Work\Project\YakiSeason\lora-art-generator\datasets\references\characters\developer-b\` | `C:\Users\KwonYeongmin\Work\Project\YakiSeason\app\public\assets\core\customer\in-game-mapping\developer-b-{waiting,eating-negima,drinking-beer}-r6-b1.png` |
| OFFICE-C → 젊은 배달원 | `C:\Users\KwonYeongmin\Work\Project\YakiSeason\lora-art-generator\datasets\references\characters\tsukioka-style-training-v1\tsukioka-style-young-man-delivery-*-reference-v1.png` | `C:\Users\KwonYeongmin\Work\Project\YakiSeason\app\public\assets\core\customer\in-game-mapping\young-man-delivery-{waiting,eating-negima,drinking-beer}-r6-b1.png` |
| OFFICE-D → 체격 있는 중년 남성 | `C:\Users\KwonYeongmin\Work\Project\YakiSeason\lora-art-generator\datasets\references\characters\tsukioka-style-training-v1\tsukioka-style-stocky-middle-aged-man-*-reference-v1.png` | `C:\Users\KwonYeongmin\Work\Project\YakiSeason\app\public\assets\core\customer\in-game-mapping\stocky-middle-aged-man-{waiting,eating-negima,drinking-beer}-r6-b1.png` |
| OFFICE-E → 중년 여성 | `C:\Users\KwonYeongmin\Work\Project\YakiSeason\lora-art-generator\datasets\references\characters\tsukioka-style-training-v1\tsukioka-style-middle-aged-woman-*-reference-v1.png` | `C:\Users\KwonYeongmin\Work\Project\YakiSeason\app\public\assets\core\customer\in-game-mapping\middle-aged-woman-{waiting,eating-negima,drinking-beer}-r6-b1.png` |

각 캐릭터는 `waiting`, `eating-negima`, `drinking-beer` 상태를 사용한다. 서버 캐릭터는 손님 매핑에서 제외한다.
