// DATA-001 메뉴 카테고리와 주문 규칙.
// 카테고리 정의·스테이션 대응·중복 규칙의 단일 원본. 화면·손님 유형별로 다시 정의하지 않는다.

export const CATEGORY = {
  drink: { id: 'drink', label: '음료', station: 'drink', repeatable: true },
  skewer: { id: 'skewer', label: '꼬치', station: 'grill', repeatable: true },
  fry: { id: 'fry', label: '튀김', station: 'fry', repeatable: false },
  sashimi: { id: 'sashimi', label: '사시미', station: 'sashimi', repeatable: false },
  side: { id: 'side', label: '사이드', station: 'instant', repeatable: false },
};

// 프로토타입에서 실제 구현된 스테이션 (DATA-001 §예외: 현재 꼬치만).
export const IMPLEMENTED_STATIONS = new Set(['grill']);

// 메뉴 항목은 정확히 하나의 카테고리를 가진다 (DATA-001 §상세요구사항 1, 10).
// 즉시제공은 에다마메 대신 양배추.
export const MENU = {
  negima: { id: 'negima', label: '네기마', category: 'skewer' },
  momo: { id: 'momo', label: '모모', category: 'skewer' },
  beer: { id: 'beer', label: '생맥주', category: 'drink' },
  karaage: { id: 'karaage', label: '가라아게', category: 'fry' },
  sashimi: { id: 'sashimi', label: '사시미 모듬', category: 'sashimi' },
  cabbage: { id: 'cabbage', label: '양배추', category: 'side' },
};

export function isRepeatable(category) {
  return !!CATEGORY[category]?.repeatable;
}

export function stationOf(category) {
  return CATEGORY[category]?.station ?? null;
}

// 주문 순서열 검증 (DATA-001 §상세요구사항 5): 미정의 카테고리 거부,
// 중복 불허 카테고리는 최대 1회.
export function validateOrderSequence(sequence) {
  const counts = {};
  for (const category of sequence) {
    if (!CATEGORY[category]) {
      return { valid: false, reason: `미정의 카테고리: ${category}` };
    }
    counts[category] = (counts[category] || 0) + 1;
    if (!CATEGORY[category].repeatable && counts[category] > 1) {
      return { valid: false, reason: `중복 불허 카테고리 ${category}가 ${counts[category]}회` };
    }
  }
  return { valid: true };
}

// 구현되지 않은 스테이션의 카테고리 슬롯을 제거한다 (GPL-002 §예외).
// 예: 드링크 스테이션이 없으면 음료 슬롯을 뺀다.
export function reduceToImplemented(sequence) {
  return sequence.filter((category) => IMPLEMENTED_STATIONS.has(stationOf(category)));
}
