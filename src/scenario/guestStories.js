import { earlierGuestMemory, guestSceneId, guestVisit, normalizeGuestStoryProgress } from '../domain/businessDay/guestMemory.js';
import { STORY_GUESTS } from '../domain/businessDay/storyGuests.js';
import { DEVELOPER_EPISODES, developerGuestScene } from './developerGuestStories.js';
import { NEIGHBORHOOD_EPISODES } from './neighborhoodGuestStories.js';
const ALL_EPISODES = { ...DEVELOPER_EPISODES, ...NEIGHBORHOOD_EPISODES };

const tsukioka = text => ({ speakerName: '츠키오카 세이지', text });
const aki = text => ({ speakerName: '아사노 아키', text });
const MENU = { negima: '네기마', momo: '모모', kawa: '토리카와', beer: '생맥주', highball: '하이볼', 'cabbage-salad': '양배추 사라다' };
export const GUEST_EPISODES = Object.freeze({
  d1: { title: '골목이 보이는 자리', note: '골목의 버스 소리에 시간을 알아챘다. 오늘은 서둘러 갈 곳이 없다고 했다.' },
  d2: { title: '몸에 남은 시간표', note: '시내버스 일을 그만뒀지만 저녁이면 아직 시간을 확인한다.' },
  d3: { title: '쓰다 지운 한 줄', note: '함께 운전하던 동료에게 연락하려다 말을 고르고 있었다.' },
  d4: { title: '답장을 기다리는 저녁', note: '옛 동료에게 연락했다. 답장에는 아직 같은 노선을 돈다는 말이 있었다.' },
  d5: { title: '비워 둔 시간', note: '동료와 만나기로 했다. 이번에는 자신이 상대의 퇴근 시간을 기다린다.' },
  d6: { title: '돌아오는 길', note: '옛 동료를 만날 약속을 남겼다. 함께 이 골목에 올지도 모른다.' },
});

function actualOrder(order) {
  return (order?.lines ?? []).map(line => {
    const name = `${line.seasoning === 'tare' ? '타레 ' : line.seasoning === 'salt' || line.menuId === 'kawa' ? '소금 ' : ''}${MENU[line.menuId] ?? '음식'}`;
    return `${name} ${line.quantity}${['beer', 'highball'].includes(line.menuId) ? '잔' : '개'}`;
  }).join(', ');
}

function returnGreeting(memory) {
  if (!memory.dayId) return tsukioka('저녁에 이 골목을 걷다 보니 여기까지 왔군.');
  if (memory.has('failed')) return tsukioka('지난번 일은 너무 마음에 두지 말게. 오늘은 오늘 것이지.');
  if (memory.has('left-waiting')) return tsukioka('지난번엔 먼저 일어났지. 오늘은 앉아서 주문부터 하겠네.');
  if (memory.first === 'beer') return tsukioka('지난번엔 맥주부터 내줬지. 한 모금 마시니 어깨가 좀 풀리더군.');
  if (memory.first === 'highball') return tsukioka('지난번엔 하이볼부터 받았지. 잔을 잡으니 손이 시원하더군.');
  if (memory.first === 'cabbage-salad') return tsukioka('지난번에 사라다부터 내줬지. 아삭해서 입맛이 돌더군.');
  if (memory.first) return tsukioka(`지난번엔 ${MENU[memory.first]}부터 받았지. 불 앞에서 바쁘더군.`);
  return tsukioka('또 왔네. 오늘은 뭘 먹을까.');
}

function servingResponse(visit) {
  const failed = visit.servings.find(item => item.quality === 'Fail');
  if (failed) return [tsukioka(['negima', 'momo', 'kawa'].includes(failed.menuId)
    ? '이 꼬치는 먹기 어렵겠네. 오늘은 여기까지 하지.'
    : failed.menuId === 'beer' ? '이 맥주는 마시기 어렵군. 오늘은 여기까지 하지.'
      : '이 잔은 마시기 어렵군. 오늘은 여기까지 하지.'), aki('죄송해요. 다음에는 더 잘 살필게요.')];
  if (visit.order?.status === 'failed') return [tsukioka('오늘 것은 먹기 어렵겠네. 다음에 다시 들르지.'), aki('죄송해요. 다음에는 더 잘 살필게요.')];
  if (visit.order?.status === 'abandoned') return [tsukioka('미안하지만 오늘은 먼저 일어나겠네.'), aki('오래 기다리게 해서 죄송해요. 조심히 가세요.')];
  const food = visit.servings.filter(item => ['negima', 'momo', 'kawa'].includes(item.menuId))
    .sort((a, b) => ['OK', 'Good', 'Perfect'].indexOf(a.quality) - ['OK', 'Good', 'Perfect'].indexOf(b.quality))[0];
  if (food) {
    const text = food.quality === 'Perfect'
      ? ({ negima: '파가 달게 익었군. 닭하고 번갈아 먹으니 좋네.', momo: '겉은 노릇하고 속은 촉촉하군.', kawa: '껍질 끝이 바삭하군. 씹을수록 고소해.' })[food.menuId]
      : food.quality === 'Good' ? '따뜻할 때 먹으니 좋군.' : '조금 더 살펴 구우면 좋겠네. 잘 먹었네.';
    return [tsukioka(text)];
  }
  if (visit.servings.some(item => item.menuId === 'highball')) return [tsukioka('레몬 향이 남는군. 잘 마셨네.')];
  if (visit.servings.some(item => item.menuId === 'beer')) return [tsukioka('잘 마셨네. 잔을 내려놓으니 저녁이 좀 조용해졌군.')];
  if (visit.servings.length) return [tsukioka('잘 먹었네. 오늘은 이만 일어나야겠군.')];
  // 구형 저장은 순서를 추측하지 않는다. 실제 주문의 제공 여부만 확인한다.
  return [tsukioka(visit.order?.lines.some(line => line.servedQualities?.length) ? '잘 먹었네.' : '오늘은 이만 가 보겠네.')];
}

export function buildGuestScene({ dayId, beat, flagIds = [], business, key = 'tsukioka' }) {
  if (key !== 'tsukioka') {
    const profile = STORY_GUESTS[key];
    const visit = guestVisit(business, key);
    if (beat === 'arrival' && visit.order?.acceptedAtMs == null) return null;
    if (!profile || !visit.customer || !['arrival', 'departure'].includes(beat)) return null;
    const result = developerGuestScene({ profile, dayId, beat, visit,
      memory: earlierGuestMemory(flagIds, dayId, key), orderText: actualOrder(visit.order), episodes: ALL_EPISODES });
    return result ? { ...result, sceneId: guestSceneId(dayId, beat, key), dayId, beat, key, customerId: visit.customer.id } : null;
  }
  const episode = GUEST_EPISODES[dayId];
  const visit = guestVisit(business);
  if (beat === 'arrival' && visit.order?.acceptedAtMs == null) return null;
  if (!episode || !visit.customer || !['arrival', 'departure'].includes(beat)) return null;
  const memory = earlierGuestMemory(flagIds, dayId);
  const introductions = {
    d1: [tsukioka('여기 앉아도 되겠나? 골목이 보이는 쪽이 좋아서.'), aki('네. 문이 열릴 때 바람이 좀 들어와요.'), tsukioka('괜찮네. 밖에서 오는 소리도 들리고.')],
    d2: [returnGreeting(memory), aki('오늘도 시계를 보고 오셨어요?'), tsukioka('버스 운전하던 버릇이지. 그만둔 뒤에도 몸은 출근 시간을 기억하더군.')],
    d3: [tsukioka(memory.has('scene:departure') ? '이젠 시간표를 안 봐도 되는데, 주머니에 그대로 있군.' : '버스 일을 그만두고도 시간표를 들고 다니네.'), aki('새 시간표예요?'), tsukioka('아니. 같이 일하던 친구 번호를 뒤에 적어 뒀거든.')],
    d4: [tsukioka('아까 옛 동료한테 문자를 보냈네.'), aki('뭐라고 쓰셨어요?'), tsukioka('밥은 먹었냐고. 보내고 보니 아직 운전 중일 시간이더군.')],
    d5: [tsukioka('예전 동료하고 저녁 한 번 먹기로 했네.'), aki('언제로요?'), tsukioka('그 친구 퇴근 시간에 맞춰야지. 나는 이제 시간표가 없으니까.')],
    d6: [tsukioka('오늘은 나 혼자 먼저 왔네. 친구 만나는 건 내일이고.'), aki('약속 시간을 정하셨군요.'), tsukioka('응. 이번에는 내가 조금 먼저 가서 기다리려고.')],
  };
  const departures = {
    d1: [tsukioka('저 버스는 아직 이 골목으로 다니는군.'), aki('소리만 듣고 아세요?'), tsukioka('오래 들었으니까. 그런데 오늘은 서둘러 갈 곳이 없네.')],
    d2: [tsukioka('집에서는 이 시간이면 괜히 현관 쪽을 보게 돼.'), aki('나가실 시간 같아서요?'), tsukioka('그런 모양이야. 갈 곳은 내가 정하면 되는데 말이지.')],
    d3: [tsukioka('밥 한번 먹자고 쓰는 데 이렇게 오래 걸릴 줄은 몰랐군.'), aki('문자요?'), tsukioka('응. 바쁜 사람 붙잡는 건가 싶어서 지웠다 썼다 했네.')],
    d4: [tsukioka('답이 왔군. 아직 그 노선 돈다고.'), aki('뭐라고 더 쓰셨어요?'), tsukioka('왜 이제 연락하냐고. 나만 말을 고르고 있었나 봐.')],
    d5: [tsukioka('퇴근이 늦어져도 기다리겠다고 했네.'), aki('그동안 뭘 하실 거예요?'), tsukioka('글쎄. 이번엔 시계 안 보고 걸어 볼까.')],
    d6: [tsukioka('친구 만나고 오는 길에 여기도 보여 주려고.'), aki('알겠어요. 자리 있으면 나란히 앉으세요.'), tsukioka('없으면 다음에 오지. 이제 이 골목은 아니까.')],
  };
  const failedVisit = ['failed', 'abandoned'].includes(visit.order?.status);
  const lines = beat === 'arrival'
    ? [...(dayId !== 'd2' && memory.dayId ? [returnGreeting(memory)] : []),
      ...introductions[dayId], tsukioka(`${actualOrder(visit.order)} 부탁하네.`)]
    : [...servingResponse(visit), ...(failedVisit ? [tsukioka('다음에 불이 켜져 있으면 또 들르지.')] : departures[dayId])];
  return {
    sceneId: guestSceneId(dayId, beat), dayId, beat, key, customerId: visit.customer.id, title: episode.title, lines,
    summary: beat === 'arrival' ? introductions[dayId][0].text
      : failedVisit ? '오늘은 식사를 마치지 못했다. 다음 방문의 이야기는 계속 이어진다.' : episode.note,
  };
}

export function guestJournalEntries({ flagIds = [], business }) {
  const flags = new Set(flagIds);
  const entries = [];
  for (const profile of Object.values(STORY_GUESTS)) {
  const episodes = profile.key === 'tsukioka' ? GUEST_EPISODES : ALL_EPISODES[profile.key] ?? {};
  for (const [dayId, episode] of Object.entries(episodes)) {
    const current = business?.dayId === dayId;
    const visit = current ? guestVisit(business, profile.key) : null;
    const prefix = `guest:${profile.key}:${dayId}:`;
    if (!flags.has(prefix + 'visited') && !visit?.customer) continue;
    const completed = current ? normalizeGuestStoryProgress(business.guestStory, dayId).completedIds : [];
    const departed = flags.has(prefix + 'scene:departure') || completed.includes(guestSceneId(dayId, 'departure', profile.key));
    const failed = flags.has(prefix + 'failed') || flags.has(prefix + 'left-waiting')
      || ['failed', 'abandoned'].includes(visit?.order?.status);
    const menus = current ? [...new Set(visit.servings.map(item => item.menuId))]
      : Object.keys(MENU).filter(menu => flags.has(prefix + 'served:' + menu));
    entries.push({ dayId, key: profile.key, name: profile.name, title: episode.title,
      note: departed ? (failed ? '오늘은 식사를 마치지 못했다. 다음에는 차분히 대접하고 싶다.' : episode.note)
        : '아직 이 저녁의 이야기를 다 듣지 않았다.',
      served: menus.map(menu => MENU[menu]).join(' · ') || '기록된 제공 없음',
    });
  }
  }
  return entries;
}
