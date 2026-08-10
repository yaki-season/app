import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBusinessDayDefinition } from '../../src/campaign-runtime.js';
import { randomizeBusinessDayRecord } from '../../src/domain/businessDay/randomizeBusinessDay.js';

const record = JSON.parse(readFileSync(new URL(
  '../../content/releases/d2-business-day-domain.v1.json', import.meta.url,
), 'utf8'));
const customerTypes = JSON.parse(readFileSync(new URL(
  '../../content/customers/types.json', import.meta.url,
), 'utf8'));
const AVAILABLE = ['negima', 'beer', 'momo'];

const roll = (seed) => randomizeBusinessDayRecord(record, {
  seed,
  customerTypes,
  availableMenuIds: AVAILABLE,
});

const customersOf = (day) => day.waves.flatMap((wave) => wave.customers);
const ordersOf = (day) => new Map(customersOf(day).map((customer) => [customer.order.id, customer.order]));
const itemCount = (day) => [...ordersOf(day).values()]
  .reduce((sum, order) => sum + order.lines.reduce((lines, line) => lines + line.quantity, 0), 0);

describe('하루 손님 구성 뽑기', () => {
  it('같은 seed는 같은 하루를 만든다', () => {
    expect(roll(7)).toEqual(roll(7));
  });

  it('seed가 다르면 손님 구성이 달라진다', () => {
    const rolls = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => JSON.stringify(customersOf(roll(seed))
      .map(({ typeId, order }) => [typeId, order.lines.map((line) => line.menuId).join('/')])));
    expect(new Set(rolls).size).toBeGreaterThan(1);
  });

  it('첫 손님(고정 캐릭터)과 그 주문은 건드리지 않는다', () => {
    for (const seed of [1, 2, 3, 9]) {
      const day = roll(seed);
      expect(day.waves[0].customers[0]).toEqual(record.waves[0].customers[0]);
    }
  });

  it('손님 수·주문 건수·총 항목 수는 그대로 둔다', () => {
    for (const seed of [1, 5, 11, 23]) {
      const day = roll(seed);
      expect(customersOf(day)).toHaveLength(customersOf(record).length);
      expect(ordersOf(day).size).toBe(ordersOf(record).size);
      expect(itemCount(day)).toBe(itemCount(record));
    }
  });

  it('도착 시각과 선행 주문 조건은 그대로 둔다', () => {
    const day = roll(4);
    expect(day.waves.map(({ id, atMs, requiresOrderCompletionIds }) => ({ id, atMs, requiresOrderCompletionIds })))
      .toEqual(record.waves.map(({ id, atMs, requiresOrderCompletionIds }) => ({ id, atMs, requiresOrderCompletionIds })));
  });

  it('해금된 메뉴만 주문한다', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const order of ordersOf(roll(seed)).values()) {
        for (const line of order.lines) expect(AVAILABLE).toContain(line.menuId);
      }
    }
  });

  it('음료 자리는 음료로, 꼬치 자리는 꼬치로만 바뀐다', () => {
    const skewers = new Set(['negima', 'momo']);
    for (const seed of [1, 6, 12]) {
      const day = roll(seed);
      for (const [orderId, order] of ordersOf(day)) {
        const before = ordersOf(record).get(orderId);
        order.lines.forEach((line, index) => {
          const wasSkewer = skewers.has(before.lines[index].menuId);
          expect(skewers.has(line.menuId)).toBe(wasSkewer);
          expect(line.quantity).toBe(before.lines[index].quantity);
        });
      }
    }
  });

  it('공유 주문은 두 사람이 같은 항목을 보고 그룹 구조도 유지한다', () => {
    for (const seed of [1, 2, 3, 8, 13]) {
      const day = roll(seed);
      const shared = customersOf(day).filter((customer) => customer.order.id === 'D2-ORDER-002');
      expect(shared).toHaveLength(2);
      expect(shared[0].order.lines).toEqual(shared[1].order.lines);
      expect(shared[0].groupId).toBe(shared[1].groupId);
      expect(shared[0].groupId).toBeTruthy();
    }
  });

  it('뽑은 하루도 영업일 정의 검증을 통과한다', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      expect(() => createBusinessDayDefinition(roll(seed), { expectedId: 'd2' })).not.toThrow();
    }
  });

  it('엑스트라 id는 아트가 읽는 유형 접두사를 따른다', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const customer of customersOf(roll(seed))) {
        if (customer.id === 'REGULAR_TSUKIOKA') continue;
        expect(customer.id).toMatch(/^D2-(SOLO|OFFICE|COMMUTER|REGULAR|BLOGGER|COUPLE)-[A-Z]$/);
        expect(customer.id.split('-')[1].toLowerCase()).toBe(customer.typeId);
      }
    }
  });
});

describe('정의만으로 뽑기', () => {
  it('콘텐츠를 더 받지 않아도 그날 정의에서 유형과 메뉴를 모은다', () => {
    const bare = randomizeBusinessDayRecord(record, { seed: 5 });
    const definition = createBusinessDayDefinition(bare, { expectedId: 'd2' });
    expect(definition.waves[0].customers[0].id).toBe('REGULAR_TSUKIOKA');
    const extras = customersOf(bare).filter(({ id }) => id !== 'REGULAR_TSUKIOKA');
    expect(extras.length).toBe(5);
    // 정의에 이미 있던 유형만 나온다(아트 결선이 준비된 것들).
    const known = new Set(['office', 'solo', 'commuter']);
    for (const extra of extras) expect(known.has(extra.typeId)).toBe(true);
  });
});
