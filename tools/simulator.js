// 영업일 로직 시뮬레이터 (1차).
//
// SYS-005 로직 시뮬레이터의 첫 버전이다. 렌더링·실제 대기 없이 한 영업일을 돌려
// 수치가 결과에 주는 영향을 본다. 순수 함수라 도구 UI와 자동 테스트가 함께 쓴다.
//
// 주의: 정식 영업일 루프(개발자 1 작업 007)는 아직 없다. 그래서 이 시뮬레이터는
// 조리 판정·손님 판정의 규칙만 재사용하고, 대기열·서비스 시간 모델은 도구 자체에 둔다.
// 작업 007이 생기면 이 큐 모델을 그 루프로 대체한다.

import { SATISFACTION } from '../src/state/customer/customer.js';

// 결정적 의사난수. 같은 시드는 같은 결과를 낸다 (SYS-005 §11).
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

const val = (v, group, key) => v.groups[group][key].value;

// 자동 정책은 적정을 노린다. 각 면을 적정 구간 초반에 회수한다고 보고,
// 한 주문(양면 + 조립)에 걸리는 시간을 도출한다.
export function cookTimePerOrder(v) {
  const perfect = val(v, '조리', 'perfectStartSec');
  const over = val(v, '조리', 'overStartSec');
  const perSide = perfect + 0.4 * Math.max(0, over - perfect);
  return val(v, '조리', 'assemblySec') + 2 * perSide + val(v, '손님', 'eatSec');
}

// 조리 결과 → 만족도. customer.js의 base judge와 같은 규칙:
// 레시피가 맞고(시뮬레이터는 항상 맞음) 과다가 없으면 GOOD, 과다면 LOW.
function judge(front, back) {
  return front === 'over' || back === 'over' ? SATISFACTION.LOW : SATISFACTION.GOOD;
}

/**
 * 한 영업일을 시뮬레이션한다.
 *
 * 모델: 요리사는 한 번에 한 꼬치만 굽는다(단일 서버 대기열). 손님은 일정 간격으로 도착해
 * 순서대로 기다린다. 요리사가 자기 차례에 굽기 시작해 음식이 완성되기까지의 시간이 인내심을
 * 넘으면 그 손님은 화내며 떠난다(이탈, 매출 0). 서빙받으면 품질은 자동 정책 성공률로 정하고,
 * 판매가는 품질에, 팁은 대기 잔량에 반영한다(GPL-003의 역할 분리).
 */
export function runBusinessDay(v, seed = 1) {
  const rng = mulberry32(seed);
  const n = Math.round(val(v, '영업일', 'customerCount'));
  const spawn = val(v, '손님', 'spawnIntervalSec');
  const patience = val(v, '손님', 'patienceSec');
  const cook = cookTimePerOrder(v);
  const p = val(v, '자동정책', 'successRate');

  const basePrice = val(v, '경제', 'basePrice');
  const multGood = val(v, '경제', 'qualityMultGood');
  const multLow = val(v, '경제', 'qualityMultLow');
  const tipBase = val(v, '경제', 'tipBase');

  let chefFreeAt = 0;
  let served = 0;
  let left = 0;
  let revenue = 0;
  let tip = 0;
  let good = 0;
  let low = 0;
  const waits = [];

  for (let i = 0; i < n; i++) {
    const arrival = i * spawn;
    const serviceStart = Math.max(chefFreeAt, arrival);
    const servedReady = serviceStart + cook;
    const wait = servedReady - arrival;

    if (wait > patience) {
      // 음식이 완성되기 전에 인내심이 소진 → 이탈. 요리사 시간은 쓰지 않는다.
      left++;
      continue;
    }

    // 서빙
    chefFreeAt = servedReady;
    waits.push(wait);
    served++;

    const front = rng() < p ? 'perfect' : 'over';
    const back = rng() < p ? 'perfect' : 'over';
    const sat = judge(front, back);

    // 판매가는 품질에만 반영 (GPL-003 §19)
    revenue += basePrice * (sat === SATISFACTION.GOOD ? multGood : multLow);
    // 팁은 대기 잔량에만 반영 (GPL-003 §18)
    const patienceLeftRatio = Math.max(0, 1 - wait / patience);
    tip += tipBase * patienceLeftRatio;

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
