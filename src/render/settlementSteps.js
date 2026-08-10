// 정산 5단계에 실제로 무엇을 보여줄지 정한다.
//
// 단계마다 "확인"만 찍혀 있어서 하루를 어떻게 보냈는지 알 수 없었다. 필요한 숫자는 이미
// summarizeD1Settlement가 전부 들고 있으므로, 여기서 단계별로 골라 문장으로 만든다.
// 계산이 없는 순수 함수라 단위 테스트가 표 하나로 계약을 지킨다.

export const SETTLEMENT_STEP_LABEL = Object.freeze({
  'customers-orders': '1. 방문 손님과 완료 주문',
  'quality-wait': '2. 조리 품질과 대기',
  'revenue-tip': '3. 매출과 팁',
  'reputation-review': '4. 명성과 리뷰',
  'recipe-goal': '5. 레시피와 다음 목표',
});

const QUALITY_ORDER = ['Perfect', 'Good', 'OK', 'Fail'];

function seconds(ms) {
  return `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)}초`;
}

// 명성은 잘 낸 주문마다 오르고 놓친 손님마다 깎인다. 숫자만 두면 좋은 값인지 알 수 없어
// 부호를 붙인다.
function signed(value) {
  const amount = Number(value) || 0;
  return amount > 0 ? `+${amount}` : `${amount}`;
}

function customersAndOrders(summary) {
  const { customers, orders } = summary;
  const lines = [
    `방문 ${customers.visited}명 · 주문 수락 ${orders.accepted}건 · 완료 ${orders.completed}건`,
  ];
  if (customers.lost > 0 || orders.abandoned > 0) {
    lines.push(`놓친 손님 ${customers.lost}명 · 포기된 주문 ${orders.abandoned}건`);
  } else {
    lines.push('놓친 손님 없이 받은 주문을 모두 끝냈습니다.');
  }
  return lines;
}

function qualityAndWait(summary) {
  const quality = summary.quality ?? {};
  const served = QUALITY_ORDER.reduce((sum, key) => sum + (quality[key] ?? 0), 0);
  const detail = QUALITY_ORDER
    .filter((key) => (quality[key] ?? 0) > 0)
    .map((key) => `${key} ${quality[key]}`)
    .join(' · ');
  return [
    served > 0 ? `제공 ${served}개 — ${detail}` : '제공한 항목이 없습니다.',
    `평균 대기 ${seconds(summary.wait?.averageMs)}`,
  ];
}

function revenueAndTip(summary) {
  const { revenue, tip, total } = summary.economy;
  const lines = [`매출 ${revenue} + 팁 ${tip} = ${total}`];
  const disposed = summary.operations?.disposedPreparedItems ?? 0;
  lines.push(disposed > 0
    ? `남아서 폐기한 준비품 ${disposed}개`
    : '폐기한 준비품이 없습니다.');
  return lines;
}

// 리뷰 문구는 아직 콘텐츠가 없다. 명성이 어디서 왔는지만 정직하게 보여준다.
function reputationAndReview(summary) {
  const reputation = summary.economy.reputation ?? 0;
  const lines = [`오늘 명성 ${signed(reputation)}`];
  if (reputation > 0) lines.push('좋은 품질로 낸 주문이 평판을 올렸습니다.');
  else if (reputation < 0) lines.push('놓친 손님이 평판을 깎았습니다.');
  else lines.push('평판은 그대로입니다.');
  return lines;
}

function recipeAndGoal(summary, { nextDayLabel = null, unlockLabels = [] } = {}) {
  const lines = [];
  lines.push(unlockLabels.length > 0
    ? `해금 · ${unlockLabels.join(' · ')}`
    : '새로 해금된 레시피는 없습니다.');
  const peak = summary.operations?.peakActiveOrders ?? 0;
  lines.push(nextDayLabel
    ? `다음 목표 · ${nextDayLabel} (오늘 동시 주문 최대 ${peak}건)`
    : `오늘 동시 주문 최대 ${peak}건`);
  return lines;
}

const STEP_BODY = Object.freeze({
  'customers-orders': customersAndOrders,
  'quality-wait': qualityAndWait,
  'revenue-tip': revenueAndTip,
  'reputation-review': reputationAndReview,
  'recipe-goal': recipeAndGoal,
});

export function settlementStepDetail(stepId, summary, context = {}) {
  const label = SETTLEMENT_STEP_LABEL[stepId] ?? stepId;
  const body = STEP_BODY[stepId];
  if (!body || !summary) return { label, lines: [] };
  return { label, lines: body(summary, context) };
}
