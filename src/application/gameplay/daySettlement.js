// 영업일 정산 (순수 계산, GPL-002/005 §정산).
//
// 손님 운영 결과 기록(customerOps.records)과 경제 수치로 방문·제공·이탈·품질 분포·매출·팁·합계·평균
// 만족도를 낸다. 판매가·팁 공식은 businessDay와 같은 원본을 재사용해 시뮬레이터·게임 괴리를 막는다.

import { revenueFor, tipFor } from '../../state/businessDay.js';
import { SATISFACTION } from '../../state/customer/customer.js';

const SAT_SCORE = { good: 100, low: 40 }; // 만족 점수 (GPL-004 §49: Good=40 근사, 여기선 good/low 2단계)

export function settleDay(records, economy) {
  let served = 0;
  let lost = 0;
  let good = 0;
  let low = 0;
  let revenue = 0;
  let tip = 0;
  let satisfactionSum = 0;

  for (const r of records) {
    if (!r.served) { lost += 1; continue; }
    served += 1;
    if (r.good) good += 1; else low += 1;
    revenue += revenueFor(r.good ? SATISFACTION.GOOD : SATISFACTION.LOW, economy);
    tip += tipFor({ waitSec: r.waitSec, patienceSec: r.patienceSec, tipMultiplier: r.tipMultiplier, economy });
    satisfactionSum += r.good ? SAT_SCORE.good : SAT_SCORE.low;
  }

  return {
    visited: served + lost,
    served,
    lost,
    quality: { good, low },
    revenue: Math.round(revenue),
    tip: Math.round(tip),
    total: Math.round(revenue + tip),
    avgSatisfaction: served ? Math.round(satisfactionSum / served) : 0,
  };
}
