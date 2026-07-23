// 밸런스 튜닝 도구용 시뮬레이터 어댑터.
//
// 정식 영업일 루프 로직은 이제 src/state/businessDay.js에 있다(개발자 1 작업 007).
// 이 파일은 도구의 평면 데이터(balance-data.json)를 그 루프의 config로 매핑하는 얇은 어댑터다.
// SYS-005 §8 "게임과 같은 로직 재사용"을 만족한다.

import { simulateBusinessDay, deriveCookTimeSec } from '../src/state/businessDay.js';

const val = (v, group, key) => v.groups[group][key].value;

// 평면 튜닝 데이터 → businessDay config
function toConfig(v) {
  return {
    customerCount: val(v, '영업일', 'customerCount'),
    spawnIntervalSec: val(v, '손님', 'spawnIntervalSec'),
    cookTimeSec: deriveCookTimeSec({
      thresholdsSec: {
        perfect: val(v, '조리', 'perfectStartSec'),
        over: val(v, '조리', 'overStartSec'),
      },
      timingSec: {
        assembly: val(v, '조리', 'assemblySec'),
        eat: val(v, '손님', 'eatSec'),
      },
    }),
    autoPolicySuccessRate: val(v, '자동정책', 'successRate'),
    economy: {
      basePrice: val(v, '경제', 'basePrice'),
      qualityMultGood: val(v, '경제', 'qualityMultGood'),
      qualityMultLow: val(v, '경제', 'qualityMultLow'),
      tipBase: val(v, '경제', 'tipBase'),
    },
    // 평면 데이터는 유형 구분이 없으므로 단일 유형(인내심 하나, 팁 배율 1)으로 본다.
    types: [{ id: 'default', patienceSec: val(v, '손님', 'patienceSec'), tipMultiplier: 1 }],
  };
}

export function runBusinessDay(v, seed = 1) {
  return simulateBusinessDay(toConfig(v), seed);
}

// 도구 UI 표시용 (기존 시그니처 유지)
export function cookTimePerOrder(v) {
  return deriveCookTimeSec({
    thresholdsSec: { perfect: val(v, '조리', 'perfectStartSec'), over: val(v, '조리', 'overStartSec') },
    timingSec: { assembly: val(v, '조리', 'assemblySec'), eat: val(v, '손님', 'eatSec') },
  });
}
