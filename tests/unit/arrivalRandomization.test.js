import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomizeBusinessDayRecord, randomizeBusinessDayRecordLegacy } from '../../src/domain/businessDay/randomizeBusinessDay.js';
import { createBusinessDayDefinition } from '../../src/domain/businessDay/d1BusinessDay.js';
import { loadD2BusinessDayDefinition } from '../../src/application/ports/d2BusinessDayDefinition.js';
import { loadD3BusinessDayDefinition } from '../../src/application/ports/d3BusinessDayDefinition.js';

const readDay = day => JSON.parse(readFileSync(new URL(`../../content/releases/${day}-business-day-domain.v1.json`, import.meta.url), 'utf8'));
const guests = record => record.waves.flatMap(wave => wave.customers);
const workload = record => ({
  ...record,
  waves: record.waves.map(wave => ({
    ...wave,
    customers: wave.customers.map(({ id, typeId, source, ...slot }) => slot),
  })),
});

describe('방문 인물만 바꾸는 난이도 보존 랜덤화', () => {
  for (const day of ['d2', 'd3', 'd4', 'd5', 'd6']) {
    it(`${day}: 200개 seed에서 난이도·동행·메뉴·인내심과 고유 인물을 보존한다`, () => {
      const original = readDay(day);
      const before = structuredClone(original);
      const firstGuests = new Set();
      const identities = guests(original).map(c => c.id).sort();
      for (let seed = 1; seed <= 200; seed += 1) {
        const rolled = randomizeBusinessDayRecord(original, { seed });
        expect(workload(rolled)).toEqual(workload(original));
        expect(guests(rolled).map(c => c.id).sort()).toEqual(identities);
        expect(new Set(guests(rolled).map(c => c.id)).size).toBe(identities.length);
        expect(() => createBusinessDayDefinition(rolled, { expectedId: day })).not.toThrow();
        expect(randomizeBusinessDayRecord(original, { seed })).toEqual(rolled);
        firstGuests.add(rolled.waves[0].customers[0].id);
      }
      expect(firstGuests.size).toBeGreaterThan(1);
      expect(original).toEqual(before);
    });
  }

  for (const [day, load] of [['d2', loadD2BusinessDayDefinition], ['d3', loadD3BusinessDayDefinition]]) {
    it(`${day}: 이전 저장은 이전 알고리즘의 손님·주문을 그대로 복원한다`, async () => {
      const record = readDay(day);
      const fetchImpl = async () => ({ ok: true, json: async () => structuredClone(record) });
      const old = await load({ fetchImpl, seed: 137, randomizationVersion: 1 });
      expect(old.ok).toBe(true);
      expect(old.definition).toEqual(createBusinessDayDefinition(randomizeBusinessDayRecordLegacy(record, { seed: 137 }), { expectedId: day }));
      const fresh = await load({ fetchImpl, seed: 137 });
      expect(fresh.ok).toBe(true);
      expect(workload(fresh.definition)).toEqual(workload(record));
    });
  }
});
