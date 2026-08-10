# 오디오 납품 위치

`AUD-002 S0~S2 사운드 제작 목록과 파일 계약`의 83개 자산을 여기에 넣는다.
길이·루프·재생 조건·무음 대체는 `AUD-002`가 단일 출처이며 이 문서는 경로 체크리스트다.

## 규칙 요약

- **확장자는 자유다.** 런타임이 `.ogg` → `.m4a` → `.mp3` → `.wav` 순으로 찾아 먼저 있는 것을 쓴다.
  아래 목록은 `.ogg`로 적었지만 `select-r1-b1.mp3`를 넣어도 울린다.
- **다만 루프 자산에 `mp3`는 쓰지 말 것.** 인코더 패딩 때문에 루프가 도는 지점마다 틈이 생긴다.
  루프는 `ogg`, `m4a`, `wav` 중 하나로. 단발음은 아무거나 상관없다.
- 48kHz 권장. BGM·환경음 스테레오, 단발 SFX 모노.
- 이름은 `<케밥>-r1-b1.<확장자>`. 개정 시 `r` 증가, 런타임 재빌드 시 `b` 증가.
- 루프 자산은 파일에 페이드를 굽지 않는다. 시작·끝 경계가 맞아야 한다.
- 라우드니스 BGM `-18` / 환경음 `-24` / SFX `-16` / 경고 `-14` LUFS, 트루피크 `-1 dBTP` 이하.
- 경고 4종은 `2kHz` 이상 성분 필수. 생맥주 액체음에 묻히면 안 된다.
- 변형본은 `-a`, `-b` 접미로 최대 3개까지. 일부만 넣어도 된다.

## bgm/ (6)

- [ ] `s0-alley-r1-b1.ogg`
- [ ] `prep-r1-b1.ogg`
- [ ] `service-quiet-r1-b1.ogg`
- [ ] `service-rush-layer-r1-b1.ogg` — `service-quiet`와 동일 길이·동일 템포
- [ ] `closing-r1-b1.ogg`
- [ ] `settlement-r1-b1.ogg`

## ambience/ (8)

- [ ] `alley-night-r1-b1.ogg`
- [ ] `shop-interior-r1-b1.ogg`
- [ ] `door-open-r1-b1.ogg`
- [ ] `door-close-r1-b1.ogg`
- [ ] `crowd-l1-r1-b1.ogg`
- [ ] `crowd-l2-r1-b1.ogg`
- [ ] `crowd-l3-r1-b1.ogg`
- [ ] `charcoal-bed-r1-b1.ogg`

## sfx/s0/ (6)

- [ ] `train-pass-r1-b1.ogg`
- [ ] `wet-tire-r1-b1.ogg`
- [ ] `distant-shop-r1-b1.ogg`
- [ ] `key-pick-r1-b1.ogg`
- [ ] `gate-open-r1-b1.ogg`
- [ ] `story-page-r1-b1.ogg`

## sfx/prep/ (3)

- [ ] `charcoal-ignite-r1-b1.ogg`
- [ ] `fan-r1-b1.ogg`
- [ ] `first-sizzle-r1-b1.ogg`

## sfx/assembly/ (8)

- [ ] `pick-chicken-r1-b1.ogg`
- [ ] `pick-leek-r1-b1.ogg`
- [ ] `pierce-chicken-r1-b1.ogg`
- [ ] `pierce-leek-r1-b1.ogg`
- [ ] `skewer-rebound-r1-b1.ogg`
- [ ] `reject-r1-b1.ogg`
- [ ] `remove-r1-b1.ogg`
- [ ] `complete-r1-b1.ogg`

## sfx/grill/ (11)

- [ ] `place-metal-r1-b1.ogg`
- [ ] `place-sizzle-r1-b1.ogg`
- [ ] `cook-loop-low-r1-b1.ogg` — 아래 3종 동일 길이·동일 위상
- [ ] `cook-loop-mid-r1-b1.ogg`
- [ ] `cook-loop-high-r1-b1.ogg`
- [ ] `proper-enter-r1-b1.ogg`
- [ ] `flip-tong-r1-b1.ogg`
- [ ] `flip-turn-r1-b1.ogg`
- [ ] `flip-oilspit-r1-b1.ogg`
- [ ] `retrieve-r1-b1.ogg`
- [ ] `burnt-r1-b1.ogg`

## sfx/drink/ (13)

- [ ] `glass-set-r1-b1.ogg`
- [ ] `tray-tap-r1-b1.ogg`
- [ ] `beer-lever-on-r1-b1.ogg`
- [ ] `beer-flow-r1-b1.ogg`
- [ ] `beer-lever-off-r1-b1.ogg`
- [ ] `foam-lever-on-r1-b1.ogg`
- [ ] `foam-flow-r1-b1.ogg`
- [ ] `foam-lever-off-r1-b1.ogg`
- [ ] `fill-pitch-r1-b1.ogg` — 피치 변화를 파일에 굽지 않는다
- [ ] `glass-resonance-r1-b1.ogg`
- [ ] `complete-r1-b1.ogg`
- [ ] `overflow-r1-b1.ogg`
- [ ] `serve-r1-b1.ogg`

## sfx/tare/ (7)

- [ ] `brush-r1-b1.ogg`
- [ ] `sizzle-r1-b1.ogg`
- [ ] `torch-ignite-r1-b1.ogg`
- [ ] `torch-loop-r1-b1.ogg`
- [ ] `torch-sweep-r1-b1.ogg`
- [ ] `torch-extinguish-r1-b1.ogg`
- [ ] `torch-overheat-r1-b1.ogg` — 경고. 2kHz 이상 필수

## sfx/serve/ (9)

- [ ] `plate-lift-light-r1-b1.ogg`
- [ ] `plate-lift-heavy-r1-b1.ogg`
- [ ] `counter-slide-r1-b1.ogg`
- [ ] `arrive-r1-b1.ogg`
- [ ] `cleanup-plate-r1-b1.ogg`
- [ ] `cleanup-glass-r1-b1.ogg`
- [ ] `cust-react-good-r1-b1.ogg`
- [ ] `cust-react-neutral-r1-b1.ogg`
- [ ] `cust-react-bad-r1-b1.ogg`

## sfx/ui/ (12)

- [ ] `select-r1-b1.ogg`
- [ ] `disabled-r1-b1.ogg`
- [ ] `error-r1-b1.ogg`
- [ ] `confirm-r1-b1.ogg`
- [ ] `screen-switch-r1-b1.ogg`
- [ ] `judge-perfect-r1-b1.ogg`
- [ ] `judge-good-r1-b1.ogg`
- [ ] `judge-ok-r1-b1.ogg`
- [ ] `judge-fail-r1-b1.ogg`
- [ ] `warn-t3-r1-b1.ogg` — 경고. 2kHz 이상 필수
- [ ] `warn-t1-r1-b1.ogg` — 경고. 2kHz 이상 필수
- [ ] `warn-customer-leave-r1-b1.ogg` — 경고. 2kHz 이상 필수

## 부분 납품

전부 채울 필요 없다. 하나만 넣어도 그 신호만 소리가 나고 나머지는 무음 대체로 돈다.
없는 파일을 다른 소리로 대신 재생하지 않는다. 특히 경고 4종은 절대 대체하지 않는다.
