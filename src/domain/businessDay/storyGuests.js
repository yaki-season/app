// SCN-004: 날짜/좌석/방문 순서와 분리된 고정 인물. 원본 runtime ID와 승인 외형은 유지한다.
export const STORY_GUESTS = Object.freeze({
  tsukioka: Object.freeze({ key: 'tsukioka', name: '츠키오카 세이지', characterId: 'CHAR-TSUKIOKA', role: '퇴직한 시내버스 기사' }),
  ren: Object.freeze({ key: 'ren', name: '후지타 렌', characterId: 'CHAR-REN', role: '작은 게임을 만들고 있는 앱 개발자', artVariant: 'a' }),
  mio: Object.freeze({ key: 'mio', name: '이시다 미오', characterId: 'CHAR-MIO', role: '일을 나누는 법을 연습하는 개발자', artVariant: 'b' }),
  sae: Object.freeze({ key:'sae', name:'모리 사에', characterId:'CHAR-SAE', role:'골목 꽃집을 운영하는 사람', artVariant:'e' }),
  hayato: Object.freeze({ key:'hayato', name:'오노 하야토', characterId:'CHAR-HAYATO', role:'이 동네를 도는 배송 기사', artVariant:'d' }),
  genji: Object.freeze({ key:'genji', name:'시바타 겐지', characterId:'CHAR-GENJI', role:'작은 철물점을 맡고 있는 사람', artVariant:'c' }),
  akane: Object.freeze({ key:'akane', name:'고바야시 아카네', characterId:'CHAR-AKANE', role:'옷 수선을 배우는 사람', artVariant:'akane' }),
  naoko: Object.freeze({ key:'naoko', name:'세키 나오코', characterId:'CHAR-NAOKO', role:'오래된 라디오를 수리하는 사람', artVariant:'naoko' }),
  shun: Object.freeze({ key:'shun', name:'미즈노 슌', characterId:'CHAR-SHUN', role:'자전거 가게에서 일하는 사람', artVariant:'shun' }),
  daichi: Object.freeze({ key:'daichi', name:'기타 다이치', characterId:'CHAR-DAICHI', role:'헌책방의 문을 닫고 오는 사람', artVariant:'daichi' }),
});
const D6_GUESTS = Object.freeze({
  'OFFICE-1':'ren', 'SOLO-2':'sae', 'OFFICE-3':'hayato', 'SOLO-4':'akane',
  'OFFICE-5':'genji', 'SOLO-6':'naoko', 'OFFICE-7':'mio', 'SOLO-8':'shun', 'OFFICE-9':'daichi',
});
const EARLY_GUESTS = Object.freeze({
  'OFFICE-A':'ren', 'OFFICE-B':'mio', 'SOLO-A':'sae', 'SOLO-B':'akane',
  'SOLO-C':'naoko', 'SOLO-D':'shun', 'COMMUTER-A':'hayato', 'COMMUTER-B':'genji',
});
export function storyGuestForCustomer(customerId) {
  if (customerId === 'REGULAR_TSUKIOKA') return STORY_GUESTS.tsukioka;
  const match = /^D([1-6])-(.+)$/.exec(customerId ?? '');
  return match ? STORY_GUESTS[(match[1] === '6' ? D6_GUESTS : EARLY_GUESTS)[match[2]]] ?? null : null;
}
