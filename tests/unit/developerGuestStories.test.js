import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { storyGuestForCustomer } from '../../src/domain/businessDay/storyGuests.js';
import { guestSceneId, normalizeGuestStoryProgress, guestVisit, buildGuestMemoryFlags } from '../../src/domain/businessDay/guestMemory.js';
import { buildGuestScene, guestJournalEntries } from '../../src/scenario/guestStories.js';
import { d1OfficeCustomerVariant } from '../../src/render/d1OfficeCustomerArt.js';
import { randomizeBusinessDayRecord } from '../../src/domain/businessDay/randomizeBusinessDay.js';

const ids = day => day === 'd6' ? ['D6-OFFICE-1', 'D6-OFFICE-7'] : [`${day.toUpperCase()}-OFFICE-A`, `${day.toUpperCase()}-OFFICE-B`];
function visit(dayId = 'd1', shared = false) {
  const [ren, mio] = ids(dayId);
  return { dayId, customers: {
    [ren]: { id: ren, orderId: 'a', seatId: 'seat-01' },
    [mio]: { id: mio, orderId: shared ? 'a' : 'b', seatId: 'seat-02' },
  }, orders: {
    a: { id: 'a', acceptedAtMs: 10, status: 'completed', lines: [{ menuId: 'negima', seasoning: 'salt', quantity: 1 }] },
    b: { id: 'b', acceptedAtMs: 10, status: 'completed', lines: [{ menuId: 'highball', quantity: 1 }] },
  }, guestServings: [{ customerId: ren, menuId: 'negima', quality: 'Perfect' },
    { customerId: mio, menuId: 'highball', quality: 'Perfect' }] };
}
const text = scene => scene.lines.map(line => line.text).join(' ');
describe('렌·미오의 여섯 저녁', () => {
  it.each(['d1', 'd2', 'd3', 'd4', 'd5', 'd6'])('%s 랜덤 방문에서도 승인 외형 A/B와 인물이 일치한다', day => {
    const released = JSON.parse(readFileSync(new URL(`../../content/releases/${day}-business-day-${day === 'd1' ? 'definition' : 'domain'}.v1.json`, import.meta.url), 'utf8'));
    const record = day === 'd1' ? released.domain ?? released : released;
    for (const seed of [1, 3, 42, 777]) {
      const customers = randomizeBusinessDayRecord(record, { seed }).waves.flatMap(wave => wave.customers);
      for (const [index, key] of ['ren', 'mio'].entries()) {
        const selected = customers.filter(customer => storyGuestForCustomer(customer.id)?.key === key);
        expect(selected).toHaveLength(1);
        expect(d1OfficeCustomerVariant(selected[0].id)).toBe(['a', 'b'][index]);
      }
    }
  });
  it.each(['d1', 'd2', 'd3', 'd4', 'd5', 'd6'])('%s 두 인물의 인사·배웅은 실제 각자의 메뉴를 읽는다', dayId => {
    const business = visit(dayId);
    for (const key of ['ren', 'mio']) {
      const arrival = buildGuestScene({ dayId, key, beat: 'arrival', business });
      expect(arrival.customerId).toBe(ids(dayId)[key === 'ren' ? 0 : 1]);
      expect(arrival.lines.at(-1).text).toContain(key === 'ren' ? '소금 네기마 1개' : '하이볼 1잔');
      const departure = buildGuestScene({ dayId, key, beat: 'departure', business });
      expect(departure.lines[0].text).toContain(key === 'ren' ? '파가 달' : '레몬');
      expect(departure.lines.length).toBeGreaterThanOrEqual(4);
    }
  });
  it('같은 주문을 공유한 동행만 음식 기억을 공유한다', () => {
    expect(guestVisit(visit(), 'mio').first.menuId).toBe('highball');
    expect(guestVisit(visit('d1', true), 'mio').first.menuId).toBe('negima');
    const flags = buildGuestMemoryFlags(visit());
    expect(flags).toContain('guest:mio:d1:first:highball');
    expect(flags).not.toContain('guest:mio:d1:served:negima');
    const next = buildGuestScene({ dayId: 'd2', key: 'mio', beat: 'arrival', business: visit('d2'), flagIds: flags });
    expect(next.lines[0].text).toContain('하이볼부터');
    expect(next.lines[0].text).not.toContain('네기마');
  });
  it.each(['ren', 'mio'])('%s 실패는 칭찬 없이 끝내되 다음 날 이야기를 막지 않는다', key => {
    const business = visit();
    business.orders[key === 'ren' ? 'a' : 'b'].status = 'failed';
    business.guestServings[key === 'ren' ? 0 : 1].quality = 'Fail';
    const scene = buildGuestScene({ dayId: 'd1', key, beat: 'departure', business });
    expect(text(scene)).toContain('어렵');
    expect(text(scene)).not.toMatch(/달네요|잘 먹|잘 마|레몬/);
    expect(scene.lines).toHaveLength(2);
    const next = buildGuestScene({ dayId: 'd2', key, beat: 'arrival', business: visit('d2'), flagIds: buildGuestMemoryFlags(business) });
    expect(next.lines[0].text).toContain('다시 부탁');
    expect(next.lines.length).toBeGreaterThan(4);
  });
  it('대기열은 읽던 인물·중복·날짜·완료를 구분해 복구한다', () => {
    const a = guestSceneId('d1', 'arrival', 'ren'), b = guestSceneId('d1', 'arrival', 'mio');
    const c = guestSceneId('d1', 'departure', 'ren');
    expect(normalizeGuestStoryProgress({ completedIds: [c], active: { sceneId: a, lineIndex: 2 },
      pendingIds: [a, b, b, c, guestSceneId('d6', 'arrival', 'mio'), 'bad'] }, 'd1'))
      .toEqual({ completedIds: [c], active: { sceneId: a, lineIndex: 2 }, pendingIds: [b] });
  });
  it('수첩은 인물별로 기록하고 아직 듣지 않은 미래를 누설하지 않는다', () => {
    const business = visit();
    business.guestStory = { completedIds: [guestSceneId('d1', 'departure', 'ren')] };
    const entries = guestJournalEntries({ business });
    expect(entries.map(entry => entry.key)).toEqual(['ren', 'mio']);
    expect(entries[0].note).toContain('게임');
    expect(entries[1].note).toContain('다 듣지 않았다');
    expect(entries.some(entry => entry.dayId !== 'd1')).toBe(false);
  });
});
