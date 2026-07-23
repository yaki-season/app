// GPL-002 영업일 루프 게임 로직 (골격).
//
// 렌더링·DOM과 분리된 순수 로직. 영업 시작 → 손님 도착 → 주문 → 서빙 → 결과 집계 → 반복 →
// 영업 종료의 흐름을 데이터 수치로 구동한다. 게임·시뮬레이터·자동 테스트가 함께 쓰는 단일 원본이다.
//
// 손님 판정은 customer.js의 baseJudge를 재사용해 "시뮬레이터에서는 되는데 게임에서는 다른"
// 괴리를 막는다. 좌석·2인 그룹·대기 게이지의 완전한 GPL-003 구현은 손님 재정렬(작업 006) 범위이며,
// 이 골격은 단일 서버 대기열의 최소 손님 모델을 쓴다.

import { SATISFACTION, baseJudge } from './customer/customer.js';

// 결정적 의사난수. 같은 시드는 같은 결과를 낸다.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// 자동 정책은 적정을 노린다. 각 면을 적정 구간 초반에 회수한다고 보고 주문당 시간을 도출한다.
export function deriveCookTimeSec({ thresholdsSec, timingSec }) {
  const perSide = thresholdsSec.perfect + 0.4 * Math.max(0, thresholdsSec.over - thresholdsSec.perfect);
  return timingSec.assembly + 2 * perSide + timingSec.eat;
}

// 검증된 콘텐츠 번들에서 영업일 시뮬레이션 config를 만든다 (DAT-001 데이터 구동).
// bundle: { processes, days, customers } 형태(loader.js 결과). dayId·processId로 대상 선택.
export function buildConfigFromContent(bundle, { dayId, processId = 'grill-negima' } = {}) {
  const day = (bundle.days || []).find((d) => d.id === dayId) ?? bundle.days?.[0];
  const grill = (bundle.processes || []).find((p) => p.id === processId);
  if (!day || !grill) throw new Error('영업일 또는 조리 공정 데이터를 찾을 수 없습니다.');

  const pool = (bundle.customers || []).filter((c) => day.customerPool.includes(c.id));
  if (pool.length === 0) throw new Error('영업일 손님 풀이 비어 있습니다.');

  return {
    customerCount: day.customerCount,
    spawnIntervalSec: day.spawnIntervalSec,
    cookTimeSec: deriveCookTimeSec({ thresholdsSec: grill.faceThresholdsSec, timingSec: day.timingSec }),
    autoPolicySuccessRate: day.autoPolicySuccessRate,
    economy: day.economy,
    types: pool.map((c) => ({ id: c.id, patienceSec: c.patienceSec, tipMultiplier: c.tipMultiplier })),
  };
}

// 판매가는 품질에만 반영한다 (GPL-003 §19).
export function revenueFor(satisfaction, economy) {
  const mult = satisfaction === SATISFACTION.GOOD ? economy.qualityMultGood : economy.qualityMultLow;
  return economy.basePrice * mult;
}

// 팁은 대기 잔량과 손님 유형에만 반영한다 (GPL-003 §18). 품질과 중복 가산하지 않는다 (§21).
export function tipFor({ waitSec, patienceSec, tipMultiplier, economy }) {
  return economy.tipBase * tipMultiplier * clamp01(1 - waitSec / patienceSec);
}

/**
 * 한 영업일을 자동 정책으로 시뮬레이션한다.
 *
 * 모델: 요리사는 한 번에 한 꼬치만 굽는다(단일 서버 대기열). 손님은 간격마다 도착하고 유형 풀을
 * 순환한다. 요리사가 자기 차례에 굽기 시작해 완성되기까지의 시간이 그 손님의 인내심을 넘으면
 * 화내며 떠난다(이탈). 서빙받으면 품질은 자동 정책 성공률로 정하고, 판매가는 품질에, 팁은 대기
 * 잔량과 유형에 반영한다.
 */
export function simulateBusinessDay(config, seed = 1) {
  const rng = mulberry32(seed);
  const n = Math.round(config.customerCount);
  const spawn = config.spawnIntervalSec;
  const cook = config.cookTimeSec;
  const p = config.autoPolicySuccessRate;
  const economy = config.economy;
  const types = config.types;

  let chefFreeAt = 0;
  let served = 0;
  let left = 0;
  let revenue = 0;
  let tip = 0;
  let good = 0;
  let low = 0;
  const waits = [];

  for (let i = 0; i < n; i++) {
    const type = types[i % types.length]; // 유형 풀 순환
    const arrival = i * spawn;
    const serviceStart = Math.max(chefFreeAt, arrival);
    const servedReady = serviceStart + cook;
    const wait = servedReady - arrival;

    if (wait > type.patienceSec) {
      left++; // 완성 전에 인내심 소진 → 이탈. 요리사 시간은 쓰지 않는다.
      continue;
    }

    chefFreeAt = servedReady;
    waits.push(wait);
    served++;

    const front = rng() < p ? 'perfect' : 'over';
    const back = rng() < p ? 'perfect' : 'over';
    const sat = baseJudge({ recipeMatched: true, frontResult: front, backResult: back });

    revenue += revenueFor(sat, economy);
    tip += tipFor({ waitSec: wait, patienceSec: type.patienceSec, tipMultiplier: type.tipMultiplier, economy });

    if (sat === SATISFACTION.GOOD) good++;
    else low++;
  }

  const avgWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;

  return {
    customers: n,
    served,
    left,
    leaveRate: n ? left / n : 0,
    revenue: Math.round(revenue),
    tip: Math.round(tip),
    total: Math.round(revenue + tip),
    avgWaitSec: Number(avgWait.toFixed(1)),
    good,
    low,
    cookTimePerOrderSec: Number(cook.toFixed(1)),
  };
}
