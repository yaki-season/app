import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { STORY_GUESTS, storyGuestForCustomer } from '../../src/domain/businessDay/storyGuests.js';
import { randomizeBusinessDayRecord } from '../../src/domain/businessDay/randomizeBusinessDay.js';
import { guestSceneId, normalizeGuestStoryProgress, buildGuestMemoryFlags } from '../../src/domain/businessDay/guestMemory.js';
import { NEIGHBORHOOD_EPISODES } from '../../src/scenario/neighborhoodGuestStories.js';
import { buildGuestScene, guestJournalEntries } from '../../src/scenario/guestStories.js';

const record = day => {
  const raw = JSON.parse(readFileSync(new URL(`../../content/releases/${day}-business-day-${day === 'd1' ? 'definition' : 'domain'}.v1.json`, import.meta.url), 'utf8'));
  return raw.domain ?? raw;
};
function visit(dayId, key) {
  const customer = record(dayId).waves.flatMap(w => w.customers).find(c => storyGuestForCustomer(c.id)?.key === key);
  return { dayId, customers: { [customer.id]: { ...customer, orderId: 'order' } },
    orders: { order: { id: 'order', status: 'completed', acceptedAtMs: 1, lines: [{ menuId: 'momo', seasoning: 'tare', quantity: 2 }] } },
    guestServings: [{ customerId: customer.id, menuId: 'momo', quality: 'Good' }] };
}
describe('동네 손님의 인물·이야기 정합성', () => {
  it.each(['d1', 'd2', 'd3', 'd4', 'd5', 'd6'])('%s 방문 순서를 바꿔도 각 손님은 고유한 인물·외형을 유지한다', day => {
    for (const seed of [1, 7, 42, 777]) {
      const guests = randomizeBusinessDayRecord(record(day), { seed }).waves.flatMap(w => w.customers).map(c => storyGuestForCustomer(c.id));
      expect(guests.every(Boolean)).toBe(true);
      expect(new Set(guests.map(g => g.key)).size).toBe(guests.length);
      expect(new Set(guests.map(g => g.artVariant ?? 'tsukioka')).size).toBe(guests.length);
    }
  });
  for (const [key, episodes] of Object.entries(NEIGHBORHOOD_EPISODES)) {
    for (const dayId of Object.keys(episodes)) it(`${key}/${dayId}: 실제 주문·제공을 읽고 장면/기억을 저장한다`, () => {
      const business = visit(dayId, key);
      const arrival = buildGuestScene({ dayId, key, beat: 'arrival', business });
      expect(arrival.lines.at(-1).text).toContain('타레 모모 2개');
      const departure = buildGuestScene({ dayId, key, beat: 'departure', business });
      expect(departure.lines[0].text).toContain('따뜻할 때');
      expect(departure.lines.every(l => [STORY_GUESTS[key].name, '아사노 아키'].includes(l.speakerName))).toBe(true);
      business.guestStory = normalizeGuestStoryProgress({ completedIds: [departure.sceneId], active: { sceneId: arrival.sceneId, lineIndex: 2 } }, dayId);
      expect(business.guestStory.active.lineIndex).toBe(2);
      expect(buildGuestMemoryFlags(business)).toContain(`guest:${key}:${dayId}:scene:departure`);
      expect(guestJournalEntries({ business }).find(e => e.key === key).note).toBe(episodes[dayId].note);
      business.orders.order.acceptedAtMs = null;
      expect(buildGuestScene({ dayId, key, beat: 'arrival', business })).toBeNull();
    });
  }
  it('실패한 식사를 칭찬하거나 미래 이야기를 수첩에 미리 쓰지 않는다', () => {
    const business = visit('d6', 'naoko');
    business.orders.order.status = 'failed';
    business.guestServings[0].quality = 'Fail';
    const scene = buildGuestScene({ dayId: 'd6', key: 'naoko', beat: 'departure', business });
    expect(scene.lines).toHaveLength(2);
    expect(scene.lines[0].text).toContain('먹기 어렵');
    const entries = guestJournalEntries({ business });
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toContain('다 듣지 않았다');
    expect(normalizeGuestStoryProgress({ pendingIds: [guestSceneId('d6', 'arrival', 'naoko'), 'SCN-D6-UNKNOWN-ARRIVAL'] }, 'd6').pendingIds).toHaveLength(1);
  });
});
