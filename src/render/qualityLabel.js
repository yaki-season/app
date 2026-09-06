// 저장·판정 ID는 유지하고 플레이어에게 보이는 품질 이름만 번역한다.
export const QUALITY_LABELS = Object.freeze({ Perfect: '완벽', Good: '좋음', OK: '보통', Fail: '실패' });
export function qualityLabel(quality) { return QUALITY_LABELS[quality] ?? quality ?? ''; }
