import { describe, expect, it } from 'vitest';
import { selectArrivalSeats } from '../../src/domain/businessDay/seatSelection.js';
import { grillStatusLayout, publicGrillLayout } from '../../src/config/d1GrillLayout.js';

const state = () => ({ dayId:'d6', seatingSeed:7, seats:Array.from({length:6}, (_, i) => ({id:`seat-0${i+1}`, status:'empty'})) });
describe('사람의 빈자리 선택', () => {
  it('같은 상태에서 결정적이고 여러 인물이 맨 왼쪽에만 모이지 않는다', () => {
    const places = new Set();
    for (let i=0;i<40;i++) {
      const s = state(), guest = [{id:`guest-${i}`}];
      const first = selectArrivalSeats(s, guest);
      expect(selectArrivalSeats(s, guest)).toEqual(first);
      places.add(first[0].id);
      expect(s.seats.every(seat=>seat.status==='empty')).toBe(true);
    }
    expect(places.size).toBeGreaterThanOrEqual(4);
  });
  it('점유·청소 자리를 건드리지 않으며 그룹은 연속된 빈자리만 쓴다', () => {
    const s = state(); s.seats[1].status='occupied';s.seats[4].status='cleanup';
    const group = selectArrivalSeats(s,[{id:'a'},{id:'b'}]);
    expect(group.map(seat=>seat.id)).toEqual(['seat-03','seat-04']);
    expect(selectArrivalSeats(s,[{id:'a'},{id:'b'},{id:'c'}])).toBeNull();
  });
  it('가능하면 뒤에 오는 3인 일행의 연속 자리를 보존한다', () => {
    const s=state();s.seats[0].status='occupied';s.seats[4].status='cleanup';
    expect(selectArrivalSeats(s,[{id:'solo'}],{upcomingGroupSize:3})[0].id).toBe('seat-06');
  });
  it('D1 입문용 첫 좌석을 유지한다', () => {
    expect(selectArrivalSeats({...state(),dayId:'d1'},[{id:'REGULAR_TSUKIOKA'}])[0].id).toBe('seat-01');
  });
  it('저장 복구나 인내심 추첨은 빈자리 선호를 바꾸지 않는다', () => {
    const s = state(), guests = [{id:'D6-SOLO-6'}];
    expect(selectArrivalSeats({...JSON.parse(JSON.stringify(s)), randomState:12345}, guests)).toEqual(selectArrivalSeats(s, guests));
    delete s.seatingSeed; s.runId = 'legacy-d6';
    expect(selectArrivalSeats(JSON.parse(JSON.stringify(s)), guests)).toEqual(selectArrivalSeats(s, guests));
  });
});

describe('꼬치별 상태 카드 위치', () => {
  for(let n=2;n<=6;n++) it(`${n}칸의 카드는 해당 꼬치 중심 아래에 겹치지 않게 놓인다`,()=>{
    const layout=publicGrillLayout(n), cards=grillStatusLayout(layout);
    cards.forEach((card,i)=>{
      const food=layout.slots[i].approvedVisualRect;
      expect(card.center).toBeCloseTo(food.x+food.width/2);
      expect(card.top).toBeGreaterThan(food.y+food.height);
      if(i) expect(cards[i-1].center+cards[i-1].width/2).toBeLessThan(card.center-card.width/2);
    });
  });
});
