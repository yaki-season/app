import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBusinessDayDefinition, createD1BusinessDayState, dispatchD1Command, advanceD1BusinessDay } from '../../src/domain/businessDay/d1BusinessDay.js';
import { buildGuestMemoryFlags, normalizeGuestStoryProgress, guestSceneId } from '../../src/domain/businessDay/guestMemory.js';
import { buildGuestScene, guestJournalEntries } from '../../src/scenario/guestStories.js';

function state(dayId = 'd1', first = 'beer', quality = 'Perfect') {
  return { dayId, customers: { REGULAR_TSUKIOKA: { id: 'REGULAR_TSUKIOKA', orderId: 'order', seatId: 'seat-05' } },
    orders: { order: { id: 'order', acceptedAtMs: 100, status: quality === 'Fail' ? 'failed' : 'completed',
      lines: [{ menuId: first, quantity: 1, servedQualities: [quality] }] } },
    guestServings: [{ customerId: 'REGULAR_TSUKIOKA', menuId: first, quality }],
    guestStory: { completedIds: [guestSceneId(dayId, 'departure')], active: null } };
}
const text = scene => scene.lines.map(line => line.text).join(' ');

describe('손님 서사의 실제 경험과 기억', () => {
  it.each(['beer', 'negima', 'highball', 'cabbage-salad'])('첫 %s 제공이 다음 방문 인사에 반영된다', first => {
    const flags = buildGuestMemoryFlags(state('d1', first));
    const scene = buildGuestScene({ dayId: 'd2', beat: 'arrival', flagIds: flags, business: state('d2') });
    expect(flags).toContain(`guest:tsukioka:d1:first:${first}`);
    expect(scene.lines[0].text).toContain({ beer: '맥주부터', negima: '네기마부터', highball: '하이볼부터', 'cabbage-salad': '사라다부터' }[first]);
  });

  it('구형 저장은 첫 제공 순서를 추측하거나 지난 일을 꾸며내지 않는다', () => {
    const legacy = state(); delete legacy.guestServings; delete legacy.guestStory;
    expect(buildGuestMemoryFlags(legacy).some(flag => flag.includes(':first:'))).toBe(false);
    const scene = buildGuestScene({ dayId: 'd2', beat: 'arrival', flagIds: ['d1-complete'], business: state('d2') });
    expect(scene.lines[0].text).not.toMatch(/지난번|어제/);
  });

  it.each(['d1', 'd2', 'd3', 'd4', 'd5', 'd6'])('%s 랜덤 좌석의 하이볼 주문과 배웅이 꼬치·맥주로 바뀌지 않는다', dayId => {
    const business = state(dayId, 'highball');
    const arrival = buildGuestScene({ dayId, beat: 'arrival', business });
    expect(arrival.lines.at(-1).text).toBe('하이볼 1잔 부탁하네.');
    const departure = buildGuestScene({ dayId, beat: 'departure', business });
    expect(departure.lines[0].text).toContain('레몬');
    expect(departure.lines[0].text).not.toMatch(/꼬치|맥주/);
    expect(arrival.sceneId).not.toBe(departure.sceneId);
  });

  it('실패 배웅에 성공 맛 묘사가 없으며 재방문 이야기는 잠기지 않는다', () => {
    const business = state('d1', 'negima', 'Fail');
    const departure = buildGuestScene({ dayId: 'd1', beat: 'departure', business });
    expect(text(departure)).toContain('먹기 어렵');
    expect(text(departure)).not.toMatch(/달게|바삭|잘 먹/);
    const next = buildGuestScene({ dayId: 'd2', beat: 'arrival', flagIds: buildGuestMemoryFlags(business), business: state('d2') });
    expect(text(next)).toContain('오늘은 오늘');
    expect(text(next)).toContain('버스');
    expect(guestJournalEntries({ business })[0].note).not.toContain('버스');
  });

  it('음료 실패는 꼬치 실패로 표현하지 않는다', () => {
    expect(text(buildGuestScene({ dayId: 'd1', beat: 'departure', business: state('d1', 'beer', 'Fail') })))
      .toContain('맥주는 마시기 어렵');
  });

  it('미방문·미완료 장면은 기록에서 미래 사실을 누설하지 않는다', () => {
    expect(buildGuestMemoryFlags({ dayId: 'd1' })).toEqual([]);
    expect(guestJournalEntries({ flagIds: ['d1-complete'] })).toEqual([]);
    const business = state(); business.guestStory.completedIds = [];
    expect(guestJournalEntries({ business })).toHaveLength(1);
    expect(guestJournalEntries({ business })[0].note).toContain('다 듣지 않았다');
  });

  it('중복 완료·잘못된 날짜·잘못된 줄 번호를 복구 시 정규화한다', () => {
    const id = guestSceneId('d1', 'arrival');
    expect(normalizeGuestStoryProgress({ completedIds: [id, id, guestSceneId('d6', 'departure')], active: { sceneId: id, lineIndex: 1 } }, 'd1'))
      .toEqual({ completedIds: [id], active: null, pendingIds: [] });
    expect(normalizeGuestStoryProgress({ active: { sceneId: id, lineIndex: -1 } }, 'd1').active).toBeNull();
  });

  it('무료 사라다도 실제 성공 입력만 저장하며 중복·거절은 기록을 늘리지 않는다', () => {
    const record = JSON.parse(readFileSync(new URL('../../content/releases/d4-business-day-domain.v1.json', import.meta.url), 'utf8'));
    const definition = createBusinessDayDefinition(record, { expectedId: 'd4' });
    let business = advanceD1BusinessDay(createD1BusinessDayState({ definition, runId: 'memory-test' }), definition, 6000);
    const customer = Object.values(business.customers)[0];
    business = dispatchD1Command(business, definition, { eventId: 'accept', type: 'accept-order', orderId: customer.orderId }).state;
    const command = { eventId: 'salad', type: 'serve-item', customerId: customer.id, menuId: 'cabbage-salad', quality: null };
    const served = dispatchD1Command(business, definition, command);
    expect(served.applied).toBe(true);
    expect(served.state.guestServings).toEqual([expect.objectContaining({ menuId: 'cabbage-salad', quality: null })]);
    expect(served.state.ledger.some(entry => entry.menuId === 'cabbage-salad')).toBe(false);
    expect(dispatchD1Command(served.state, definition, command).state.guestServings).toHaveLength(1);
    const rejected = dispatchD1Command(served.state, definition, { ...command, eventId: 'bad', menuId: 'missing' });
    expect(rejected.applied).toBe(false);
    expect(rejected.state.guestServings).toHaveLength(1);
  });
});
