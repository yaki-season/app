// 영업일 표기 정본. 화면 문구는 내부 ID(`D6`)가 아니라 한국어 서수로 읽힌다.
// 이야기 머리말이 이미 '첫째 날'~'여섯째 날'을 쓰므로 준비 화면·시작 버튼도 같은 표기를 쓴다.
const ORDINALS = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째'];

export function dayOrdinal(dayId) {
  const matched = String(dayId ?? '').match(/(\d+)/);
  const index = matched ? Number(matched[1]) : NaN;
  return Number.isInteger(index) && index >= 1 && index <= ORDINALS.length ? ORDINALS[index - 1] : null;
}

// '여섯째 날'. 알 수 없는 날짜는 원래 표기를 그대로 돌려준다.
export function dayOrdinalDay(dayId) {
  const ordinal = dayOrdinal(dayId);
  return ordinal ? `${ordinal} 날` : String(dayId ?? '');
}
