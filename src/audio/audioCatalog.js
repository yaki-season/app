// AUD-002가 정한 78개 오디오 자산의 단일 출처.
//
// 아트와 달리 오디오는 manifest를 거치지 않는다. 아트 manifest는 승인 증적과 SHA 대조가 목적인데,
// 오디오는 "약속된 경로에 파일을 놓으면 울린다"가 요구사항이라 중간 등록 단계가 오히려 걸림돌이다.
// 대신 이 카탈로그가 ID와 경로의 단일 출처가 되고, 단위 테스트가 AUD-002 목록과 대조한다.
//
// 파일이 없으면 엔진이 조용히 넘어간다. AUD-001의 "오디오 실패가 진행을 막지 않는다"가 기본 동작이다.

export const AUDIO_BUS = Object.freeze({
  BGM: 'bgm',
  AMBIENCE: 'ambience',
  SFX: 'sfx',
  WARNING: 'warning',
});

// AUD-001 11항의 잠정 우선순위. 숫자가 클수록 먼저다.
// 조리 실패 임박 → 손님 이탈 임박 → 일반 주문.
export const WARNING_PRIORITY = Object.freeze({
  COOK_FAIL: 3,
  CUSTOMER_LEAVE: 2,
  ORDER: 1,
});

function group(dir, bus, entries) {
  return entries.map(([id, file, options = {}]) => Object.freeze({
    id,
    url: `/assets/audio/${dir}/${file}-r1-b1.ogg`,
    bus,
    loop: options.loop === true,
    priority: options.priority ?? null,
  }));
}

// 현재는 6개 상태가 모두 같은 곡을 쓴다. 상태별 곡이 준비되면 여기 파일 이름만 갈라주면 되고,
// ID는 그대로 두므로 호출부는 손대지 않는다.
const BGM_SHARED_FILE = 'main';

const BGM = group('bgm', AUDIO_BUS.BGM, [
  ['BGM-S0-ALLEY', BGM_SHARED_FILE, { loop: true }],
  ['BGM-PREP', BGM_SHARED_FILE, { loop: true }],
  ['BGM-SERVICE-QUIET', BGM_SHARED_FILE, { loop: true }],
  ['BGM-SERVICE-RUSH-LAYER', BGM_SHARED_FILE, { loop: true }],
  ['BGM-CLOSING', BGM_SHARED_FILE, { loop: true }],
  ['BGM-SETTLEMENT', BGM_SHARED_FILE, { loop: true }],
]);

const AMBIENCE = group('ambience', AUDIO_BUS.AMBIENCE, [
  ['AMB-ALLEY-NIGHT', 'alley-night', { loop: true }],
  ['AMB-SHOP-INTERIOR', 'shop-interior', { loop: true }],
  ['AMB-DOOR-OPEN', 'door-open'],
  ['AMB-DOOR-CLOSE', 'door-close'],
  // 손님 1명은 군중음 없음. 혼자 앉은 손님 뒤에서 웅성거리면 좌석 상태와 어긋난다.
  ['AMB-CROWD-L1', 'crowd-l1', { loop: true }],  // 2~4석
  ['AMB-CROWD-L2', 'crowd-l2', { loop: true }],  // 5석 이상
  ['AMB-CHARCOAL-BED', 'charcoal-bed', { loop: true }],
]);

const S0 = group('sfx/s0', AUDIO_BUS.SFX, [
  ['SFX-S0-TRAIN-PASS', 'train-pass'],
  ['SFX-S0-WET-TIRE', 'wet-tire'],
  ['SFX-S0-DISTANT-SHOP', 'distant-shop', { loop: true }],
  ['SFX-S0-KEY-PICK', 'key-pick'],
  ['SFX-S0-GATE-OPEN', 'gate-open'],
  ['SFX-S0-STORY-PAGE', 'story-page'],
]);

const PREP = group('sfx/prep', AUDIO_BUS.SFX, [
  ['SFX-PREP-CHARCOAL-IGNITE', 'charcoal-ignite'],
  ['SFX-PREP-FAN', 'fan'],
  ['SFX-PREP-FIRST-SIZZLE', 'first-sizzle'],
]);

const ASSEMBLY = group('sfx/assembly', AUDIO_BUS.SFX, [
  ['SFX-ASM-PIERCE', 'pierce'],
  ['SFX-ASM-REJECT', 'reject'],
  ['SFX-ASM-REMOVE', 'remove'],
  ['SFX-ASM-COMPLETE', 'complete'],
]);

const GRILL = group('sfx/grill', AUDIO_BUS.SFX, [
  ['SFX-GRILL-PLACE-METAL', 'place-metal'],
  ['SFX-GRILL-PLACE-SIZZLE', 'place-sizzle'],
  ['SFX-GRILL-COOK-LOOP', 'cook-loop', { loop: true }],
  ['SFX-GRILL-CRACKLE-A', 'crackle-a'],
  ['SFX-GRILL-CRACKLE-B', 'crackle-b'],
  ['SFX-GRILL-CRACKLE-C', 'crackle-c'],
  ['SFX-GRILL-PROPER-ENTER', 'proper-enter'],
  ['SFX-GRILL-FLIP', 'flip'],
  ['SFX-GRILL-RETRIEVE', 'retrieve'],
  ['SFX-GRILL-BURNT', 'burnt'],
]);

const DRINK = group('sfx/drink', AUDIO_BUS.SFX, [
  ['SFX-DRINK-GLASS-SET', 'glass-set'],
  ['SFX-DRINK-TRAY-TAP', 'tray-tap'],
  ['SFX-DRINK-BEER-LEVER-ON', 'beer-lever-on'],
  ['SFX-DRINK-BEER-FLOW', 'beer-flow', { loop: true }],
  ['SFX-DRINK-BEER-LEVER-OFF', 'beer-lever-off'],
  ['SFX-DRINK-FOAM-LEVER-ON', 'foam-lever-on'],
  ['SFX-DRINK-FOAM-FLOW', 'foam-flow', { loop: true }],
  ['SFX-DRINK-FOAM-LEVER-OFF', 'foam-lever-off'],
  ['SFX-DRINK-FILL-PITCH', 'fill-pitch', { loop: true }],
  ['SFX-DRINK-GLASS-RESONANCE', 'glass-resonance'],
  ['SFX-DRINK-COMPLETE', 'complete'],
  ['SFX-DRINK-OVERFLOW', 'overflow'],
  ['SFX-DRINK-SERVE', 'serve'],
]);

const TARE = [
  ...group('sfx/tare', AUDIO_BUS.SFX, [
    ['SFX-TARE-BRUSH', 'brush'],
    ['SFX-TARE-SIZZLE', 'sizzle'],
    ['SFX-TORCH-IGNITE', 'torch-ignite'],
    ['SFX-TORCH-LOOP', 'torch-loop', { loop: true }],
    ['SFX-TORCH-SWEEP', 'torch-sweep', { loop: true }],
    ['SFX-TORCH-EXTINGUISH', 'torch-extinguish'],
  ]),
  ...group('sfx/tare', AUDIO_BUS.WARNING, [
    ['SFX-TORCH-OVERHEAT', 'torch-overheat', { priority: WARNING_PRIORITY.COOK_FAIL }],
  ]),
];

const SERVE = group('sfx/serve', AUDIO_BUS.SFX, [
  ['SFX-SERVE-PLATE-LIFT-LIGHT', 'plate-lift-light'],
  ['SFX-SERVE-PLATE-LIFT-HEAVY', 'plate-lift-heavy'],
  ['SFX-SERVE-COUNTER-SLIDE', 'counter-slide'],
  ['SFX-SERVE-ARRIVE', 'arrive'],
  ['SFX-SERVE-CLEANUP-PLATE', 'cleanup-plate'],
  ['SFX-SERVE-CLEANUP-GLASS', 'cleanup-glass'],
  ['SFX-CUST-REACT-GOOD', 'cust-react-good'],
  ['SFX-CUST-REACT-NEUTRAL', 'cust-react-neutral'],
  ['SFX-CUST-REACT-BAD', 'cust-react-bad'],
]);

const UI = [
  ...group('sfx/ui', AUDIO_BUS.SFX, [
    ['SFX-UI-SELECT', 'select'],
    ['SFX-INGAME-SELECT', 'ingame-select'],
    ['SFX-UI-DISABLED', 'disabled'],
    ['SFX-UI-ERROR', 'error'],
    ['SFX-UI-CONFIRM', 'confirm'],
    ['SFX-UI-SCREEN-SWITCH', 'screen-switch'],
    ['SFX-JUDGE-PERFECT', 'judge-perfect'],
    ['SFX-JUDGE-GOOD', 'judge-good'],
    ['SFX-JUDGE-OK', 'judge-ok'],
    ['SFX-JUDGE-FAIL', 'judge-fail'],
  ]),
  ...group('sfx/ui', AUDIO_BUS.WARNING, [
    ['SFX-WARN-T3', 'warn-t3', { priority: WARNING_PRIORITY.COOK_FAIL }],
    ['SFX-WARN-T1', 'warn-t1', { priority: WARNING_PRIORITY.COOK_FAIL }],
    ['SFX-WARN-CUSTOMER-LEAVE', 'warn-customer-leave', { priority: WARNING_PRIORITY.CUSTOMER_LEAVE }],
  ]),
];

export const AUDIO_CATALOG = Object.freeze([
  ...BGM, ...AMBIENCE, ...S0, ...PREP, ...ASSEMBLY,
  ...GRILL, ...DRINK, ...TARE, ...SERVE, ...UI,
]);

const BY_ID = new Map(AUDIO_CATALOG.map((entry) => [entry.id, entry]));

export function audioEntry(id) {
  return BY_ID.get(id) ?? null;
}

// 착석 인원에 맞는 군중음. 1명 이하는 null이며 이때는 아무것도 재생하지 않는다.
export function crowdAmbienceId(seatedCount) {
  const seated = Number(seatedCount) || 0;
  if (seated >= 5) return 'AMB-CROWD-L2';
  if (seated >= 2) return 'AMB-CROWD-L1';
  return null;
}

export function audioIdsByBus(bus) {
  return AUDIO_CATALOG.filter((entry) => entry.bus === bus).map((entry) => entry.id);
}
