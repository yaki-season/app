// 하루의 손님 구성을 매 판 다르게 뽑는다(D2부터).
//
// 무엇을 바꾸고 무엇을 그대로 두는지가 이 모듈의 전부다.
//
// 바꾸는 것 : 엑스트라 손님의 유형(솔로·직장인 2인·통근객…)과 각 주문의 메뉴 구성.
// 그대로 두는 것: 웨이브 수·도착 시각·선행 주문 조건·좌석 그룹 구조, 주문 건수, 주문별 항목 수와
//                수량, 그리고 첫 손님(고정 캐릭터). 총량이 유지되므로 하루 목표 매출과 정산
//                계약은 흔들리지 않고 "오늘은 누가 올까"만 달라진다.
//
// 같은 seed면 같은 하루가 나온다. 영업 중 새로고침해도 같은 손님이 앉아 있어야 하기 때문이다.

const MENU_CATEGORY = Object.freeze({
  beer: 'drink',
  negima: 'skewer',
  momo: 'skewer',
});

// xorshift32. 저장에 실어도 재현되는 작은 결정적 난수열이면 충분하다.
function createRandom(seed) {
  let state = (Number(seed) || 1) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}

const pick = (random, items) => items[Math.floor(random() * items.length) % items.length];

function menusByCategory(availableMenuIds, menuCategory) {
  const byCategory = new Map();
  for (const menuId of availableMenuIds) {
    const category = menuCategory[menuId];
    if (!category) continue;
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(menuId);
  }
  return byCategory;
}

// 엑스트라 런타임 id는 아트 결선이 접두사로 종류를 읽는다(D2-OFFICE-A 같은 꼴).
// 유형이 바뀌면 id도 그 유형을 따라가야 그림이 맞는다.
function extraId(dayId, typeId, ordinal) {
  return `${dayId.toUpperCase()}-${typeId.toUpperCase()}-${String.fromCharCode(65 + ordinal)}`;
}

// 뽑을 수 있는 손님 유형을 그날 정의가 이미 쓰고 있는 것들에서 모은다. 콘텐츠를 따로 더
// 받아오지 않아도 되고, 아트 결선이 준비된 유형만 나온다는 보장이 덤으로 따라온다.
export function customerTypesFromRecord(record, fixedCustomerIds = ['REGULAR_TSUKIOKA']) {
  const fixed = new Set(fixedCustomerIds);
  const found = new Map();
  for (const wave of record.waves ?? []) {
    const sharedCount = new Map();
    for (const customer of wave.customers) {
      sharedCount.set(customer.order.id, (sharedCount.get(customer.order.id) ?? 0) + 1);
    }
    for (const customer of wave.customers) {
      if (fixed.has(customer.id) || found.has(customer.typeId)) continue;
      found.set(customer.typeId, {
        id: customer.typeId,
        groupSize: sharedCount.get(customer.order.id) ?? 1,
        patienceSec: customer.patienceMs / 1000,
      });
    }
  }
  return [...found.values()];
}

export function randomizeBusinessDayRecord(record, {
  seed = 1,
  customerTypes = customerTypesFromRecord(record),
  availableMenuIds = Object.keys(record?.economy?.menuPrices ?? {}),
  fixedCustomerIds = ['REGULAR_TSUKIOKA'],
  menuCategory = MENU_CATEGORY,
} = {}) {
  const next = structuredClone(record);
  const fixed = new Set(fixedCustomerIds);
  const byCategory = menusByCategory(availableMenuIds, menuCategory);
  const usableTypes = customerTypes.filter((type) => type.active !== false);
  if (usableTypes.length === 0 || byCategory.size === 0) return next;

  const random = createRandom(seed);
  const ordinalByType = new Map();
  const dayId = next.id;

  for (const wave of next.waves) {
    // 고정 캐릭터가 섞인 웨이브는 손대지 않는다. 첫 손님은 이야기가 걸려 있다.
    if (wave.customers.some((customer) => fixed.has(customer.id))) continue;

    // 한 주문을 함께 받는 사람들은 한 팀이다. 팀은 유형을 같이 골라야 그룹 id와 주문이
    // 어긋나지 않는다(정의 검증이 "공유 주문은 같은 그룹·같은 항목"을 요구한다).
    const teams = new Map();
    for (const customer of wave.customers) {
      if (!teams.has(customer.order.id)) teams.set(customer.order.id, []);
      teams.get(customer.order.id).push(customer);
    }

    for (const [, members] of teams) {
      const candidates = usableTypes.filter((type) => (type.groupSize ?? 1) === members.length);
      const type = candidates.length > 0 ? pick(random, candidates) : null;

      // 주문은 항목 수와 수량을 그대로 두고 같은 갈래(음료/꼬치) 안에서 메뉴만 다시 고른다.
      const lines = members[0].order.lines.map((line) => {
        const pool = byCategory.get(menuCategory[line.menuId]) ?? [];
        return { ...line, menuId: pool.length > 0 ? pick(random, pool) : line.menuId };
      });

      for (const customer of members) {
        if (type) {
          const ordinal = ordinalByType.get(type.id) ?? 0;
          ordinalByType.set(type.id, ordinal + 1);
          customer.typeId = type.id;
          customer.patienceMs = type.patienceSec * 1000;
          customer.id = extraId(dayId, type.id, ordinal);
          if (customer.groupId) {
            customer.groupId = `${dayId.toUpperCase()}-GROUP-${type.id.toUpperCase()}`;
          }
          if (customer.source?.kind === 'extra-type') customer.source.customerTypeId = type.id;
        }
        customer.order.lines = structuredClone(lines);
      }
    }
  }

  return next;
}
