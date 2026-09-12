const aki = text => ({ speakerName: '아사노 아키', text });
const guest = text => ({ text });
const episode = (title, note, arrival, departure) => ({ title, note, arrival, departure });

export const DEVELOPER_EPISODES = Object.freeze({
  ren: {
    d1: episode('가방 속 작은 화면', '렌은 퇴근 뒤에도 자기 작업을 놓지 못했다. 가방 안에는 아직 보여 주지 않은 게임이 있다.',
      [guest('렌이라고 해요. 퇴근했는데 머리는 아직 사무실에 있네요.'), aki('가방은 내려놓으셔도 돼요.'), guest('아, 네. 이걸 메고 있으면 계속 일하는 기분이라.')],
      [guest('회사 일 말고 따로 만드는 게 있어요. 화면 한 장짜리 게임인데.'), aki('어떤 화면이에요?'), guest('걷다가 불 켜진 집을 보는 거요. 아직은 걷기밖에 안 돼요.')]),
    d2: episode('걷기만 하는 게임', '화려한 기능보다 걷는 느낌을 먼저 만들고 싶다고 했다.',
      [guest('제가 집에서 작은 게임을 만들어요. 어젯밤엔 걷는 속도만 바꿨네요.'), aki('빨라졌어요?'), guest('오히려 조금 느리게요. 창문을 그냥 지나치길래.')],
      [guest('사람한테 보여 주려면 뭔가 더 있어야 할 것 같아서요.'), aki('그 창문 안에는 뭐가 있어요?'), guest('아직은 불빛뿐이요. 일단 그거부터 끝내 볼까 싶네요.')]),
    d3: episode('한 골목만', '렌은 새 기능 목록을 접고 한 골목을 끝내기로 했다.',
      [guest('개인 게임에 넣고 싶은 걸 적었더니 노트 두 장이 됐어요.'), aki('두 장이면 꽤 길겠네요.'), guest('그래서 오늘은 한 골목만 남겼어요. 나머지는 뒤 페이지로요.')],
      [guest('집에 가면 마지막 창문 하나만 붙일 거예요.'), aki('그다음에는요?'), guest('오늘은 끄려고요. 끝나는 데도 있어야죠.')]),
    d4: episode('보내기 버튼', '친구 한 명에게 처음으로 플레이할 수 있는 파일을 보냈다.',
      [guest('제 게임, 오늘 친구한테 보냈어요. 제목은 아직 임시지만요.'), aki('직접 해 볼 수 있게요?'), guest('네. 보내고 나서야 소리가 너무 큰가 싶더라고요.')],
      [guest('답이 아직 없네요. 다시 보내지 말고 기다려야겠어요.'), aki('밥 먹고 있을 수도 있죠.'), guest('그렇겠네요. 저처럼.')]),
    d5: episode('작은 감상 하나', '친구는 창문 앞에서 멈췄다고 했다. 렌은 그 한 장면을 조금 더 다듬고 싶어졌다.',
      [guest('게임 보낸 친구한테 답이 왔어요. 창문 앞에서 좀 서 있었대요.'), aki('불빛을 봤군요.'), guest('네. 제가 오래 붙잡고 있던 곳인데, 알아보니까 신기하네요.')],
      [guest('다음에는 창문이 한 번 열리게 해 보려고요.'), aki('안에서 누가 나와요?'), guest('아뇨. 커튼만 조금 움직여도 될 것 같아요.')]),
    d6: episode('다음 창문', '렌은 작게 공개한 게임을 서두르지 않고 이어 가기로 했다. 오늘 저녁은 작업 목록 밖에 두었다.',
      [guest('작은 게임 파일을 친구 둘한테 더 보냈어요. 이제 어디서 멈추는지 궁금해요.'), aki('새 기능도 넣으셨어요?'), guest('커튼 하나요. 목록은 더 안 늘렸어요.')],
      [guest('오늘은 노트북을 안 가져왔어요.'), aki('가방이 가볍겠네요.'), guest('네. 다음 장면 생각은 걸어가면서 해도 되니까요.')]),
  },
  mio: {
    d1: episode('알림은 가방 안에', '미오는 식사할 때 휴대폰을 가방 안에 두었다. 퇴근 뒤까지 이어지는 질문이 많다고 했다.',
      [guest('전 미오예요. 주문하기 전에 잠깐만요. 폰부터 넣고요.'), aki('충전이 필요하세요?'), guest('아뇨. 지금은 안 보려고요. 책상 위에선 계속 보게 돼서.')],
      [guest('회사에서 질문을 많이 받는 편이에요. 퇴근한 뒤에도 손이 가네요.'), aki('오늘도 연락이 와요?'), guest('아마요. 일단 먹고 확인할래요.')]),
    d2: episode('질문 세 개', '신입에게 답하다 점심을 놓쳤다. 미오는 자신이 꼭 답해야 하는 질문인지 생각하기 시작했다.',
      [guest('오늘 점심을 세 번 데웠어요. 신입이 질문할 때마다 일어나서요.'), aki('결국 드셨어요?'), guest('반은요. 제가 바로 답해 버리는 버릇도 있긴 해요.')],
      [guest('내일은 어디까지 해 봤는지 먼저 물어보려고요.'), aki('같이 보면 다를까요?'), guest('저도 그 사람이 뭘 아는지 좀 알아야겠더라고요.')]),
    d3: episode('같이 찾은 답', '질문을 받은 미오가 먼저 설명하지 않고 기다리자, 동료가 스스로 답을 찾았다.',
      [guest('오늘 신입이 자기 화면을 보여 주다가 답을 찾았어요.'), aki('설명하다가요?'), guest('네. 저는 고개만 끄덕였는데요. 그렇게도 되더라고요.')],
      [guest('제가 빨리 끝내려고 대신 해 준 적이 많았나 봐요.'), aki('오늘은 안 그러셨네요.'), guest('입을 다무는 데 힘이 좀 들었어요. 하하.')]),
    d4: episode('메모의 빈칸', '미오는 혼자 쓰던 인수인계 메모를 동료와 함께 고쳤다.',
      [guest('제가 쓴 안내 메모를 동료한테 읽어 달라고 했어요.'), aki('어땠대요?'), guest('두 번째 줄부터 모르겠대요. 저는 당연한 줄 알았는데.')],
      [guest('오늘은 같이 고쳤어요. 메모가 길어지진 않았고 순서만 바뀌었어요.'), aki('다시 읽어 봤어요?'), guest('네. 저도 그쪽이 낫더라고요.')]),
    d5: episode('먼저 나와도', '미오가 먼저 퇴근한 뒤에도 팀은 남은 일을 이어 갔다. 확인 메시지를 보내지 않고 저녁을 먹었다.',
      [guest('오늘은 제가 먼저 사무실에서 나왔어요. 아직 불은 켜져 있던데.'), aki('두고 온 일이 생각나요?'), guest('조금요. 그래도 누가 이어서 하는지는 알고 나왔어요.')],
      [guest('괜찮냐고 메시지 쓸 뻔했는데 지웠어요.'), aki('연락이 왔어요?'), guest('아직요. 그럼 괜찮은 걸로 두려고요.')]),
    d6: episode('일 말고 저녁', '미오는 다음 만남에 업무 이야기를 가져오지 않기로 했다. 저녁을 비워 둘 시간이 생겼다.',
      [guest('다음 주엔 팀 사람들이랑 일 말고 저녁 한번 먹기로 했어요.'), aki('장소는 정하셨어요?'), guest('아직요. 날짜부터 비웠어요. 그걸 자꾸 나중으로 미뤘거든요.')],
      [guest('오늘도 폰은 가방 안에 있었네요.'), aki('찾으실 줄 알았어요.'), guest('아, 이제 알았어요. 한동안 알림 생각을 안 했네요.')]),
  },
});

const MENU = { negima: '네기마', momo: '모모', kawa: '토리카와', beer: '맥주', highball: '하이볼', 'cabbage-salad': '사라다' };
function response(visit) {
  if (visit.order?.status === 'abandoned') return '죄송하지만 오늘은 먼저 가야겠어요. 다음에 다시 올게요.';
  const fail = visit.servings.find(s => s.quality === 'Fail');
  if (fail || visit.order?.status === 'failed') return fail && ['beer', 'highball'].includes(fail.menuId)
    ? '이 잔은 마시기 어렵네요. 오늘은 여기까지 할게요.' : '이건 먹기 어렵네요. 오늘은 여기까지 할게요.';
  const food = visit.servings.filter(s => ['negima', 'momo', 'kawa'].includes(s.menuId))
    .sort((a, b) => ['OK', 'Good', 'Perfect'].indexOf(a.quality) - ['OK', 'Good', 'Perfect'].indexOf(b.quality))[0];
  if (food) return food.quality === 'Perfect' ? {
    negima: '파가 달네요. 닭 사이에 있으니 번갈아 먹게 돼요.',
    momo: '겉은 노릇한데 속은 촉촉하네요. 잘 먹었어요.',
    kawa: '끝이 바삭하네요. 씹을수록 고소해요.',
  }[food.menuId] : food.quality === 'Good' ? '따뜻할 때 잘 먹었어요.' : '조금 더 살펴 구워 주시면 좋겠어요.';
  if (visit.servings.some(s => s.menuId === 'highball')) return '레몬 향이 남네요. 잘 마셨어요.';
  if (visit.servings.some(s => s.menuId === 'beer')) return '잘 마셨어요. 이제 조금 쉬어 가는 기분이네요.';
  return visit.servings.length ? '잘 먹었어요.' : '오늘은 이만 가 볼게요.';
}

export function developerGuestScene({ profile, dayId, beat, visit, memory, orderText, episodes = DEVELOPER_EPISODES }) {
  const ep = episodes[profile.key]?.[dayId];
  if (!ep) return null;
  const say = text => ({ speakerName: profile.name, text });
  const failed = ['failed', 'abandoned'].includes(visit.order?.status);
  const remembered = !memory.dayId ? [] : memory.has('failed') ? [say('지난번에는 식사를 못 마쳤죠. 오늘은 다시 부탁할게요.')]
    : memory.has('left-waiting') ? [say('지난번엔 먼저 갔죠. 오늘은 주문부터 할게요.')]
      : memory.first ? [say(`지난번엔 ${MENU[memory.first]}부터 내주셨죠. 그때 여기 앉아 있었던 게 생각나요.`)] : [];
  const story = (beat === 'arrival' ? ep.arrival : ep.departure).map(line => line.speakerName ? line : say(line.text));
  // 날짜가 아닌 실제 이전 만남을 기준으로 자기소개한다. 첫 방문이 D4여도 이름을 알 수 있다.
  const introduction = beat === 'arrival' && !memory.dayId && !ep.arrival.some(line => line.text.includes(profile.name.split(' ').at(-1)))
    ? [say(`저는 ${profile.name}입니다. 잘 부탁해요.`)] : [];
  return { title: ep.title,
    lines: beat === 'arrival' ? [...introduction, ...remembered, ...story, say(`${orderText} 부탁드려요.`)]
      : failed ? [say(response(visit)), aki('죄송해요. 다음에는 더 잘 살필게요.')]
        : [say(response(visit)), ...story],
    summary: failed ? '오늘은 식사를 마치지 못했다. 다음 방문의 이야기는 이어진다.' : ep.note,
  };
}
