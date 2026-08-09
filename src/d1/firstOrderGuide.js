export const FIRST_ORDER_GUIDE_STATUS = Object.freeze({
  COMPLETE: 'complete',
  CURRENT: 'current',
  PENDING: 'pending',
});

const BASE_STEPS = Object.freeze([
  ['order.accept', '주문 접수', 'SCR-SVC-CUSTOMERS', 'serve-target-seat-01', '츠키오카를 눌러 주문을 받으세요.'],
  ['beer.glass', '빈 잔 놓기', 'SCR-SVC-DRINK', 'glassRack', '빈 잔을 눌러 노즐 아래에 놓으세요.'],
  ['beer.pour', '생맥주 따르기', 'SCR-SVC-DRINK', 'drinkLeverDrag', '중립 레버를 아래로 드래그해 맥주를, 위로 드래그해 거품을 채우세요.'],
  ['beer.finish', '생맥주 완성', 'SCR-SVC-DRINK', 'drink-finish', '완성 버튼을 눌러 생맥주를 준비 목록에 놓으세요.'],
  ['negima.assemble.1', '네기마 1 조립', 'SCR-SVC-ASSEMBLY', 'assembly-ingredient', '닭-파-닭-파-닭 순서로 첫 꼬치를 완성하세요.'],
  ['negima.transfer.1', '네기마 1 트레이 이동', 'SCR-SVC-ASSEMBLY', 'jigSkewer', '완성된 첫 꼬치 자체를 눌러 전달 트레이로 옮기세요.'],
  ['negima.assemble.2', '네기마 2 조립', 'SCR-SVC-ASSEMBLY', 'assembly-ingredient', '같은 순서로 두 번째 꼬치를 완성하세요.'],
  ['negima.transfer.2', '네기마 2 트레이 이동', 'SCR-SVC-ASSEMBLY', 'jigSkewer', '완성된 두 번째 꼬치 자체를 눌러 전달 트레이로 옮기세요.'],
  ['grill.place.1', '1번 칸 staged', 'SCR-SVC-GRILL', 'grillWaitTray', '네기마를 눌러 1번 칸에 올리세요. 아직 타이머는 멈춰 있습니다.'],
  ['grill.place.2', '2번 칸 동시 시작', 'SCR-SVC-GRILL', 'grillWaitTray', '두 번째 네기마를 올려 두 칸의 앞면 조리를 함께 시작하세요.'],
  ['grill.flip.1', '첫 꼬치 뒤집기', 'SCR-SVC-GRILL', 'grill-slot-priority', '안내 테두리가 있는 먼저 준비된 꼬치를 뒤집으세요.'],
  ['grill.flip.2', '둘째 꼬치 뒤집기', 'SCR-SVC-GRILL', 'grill-slot-priority', '다음 안내 꼬치를 뒤집으세요.'],
  ['grill.retrieve.1', '첫 꼬치 회수', 'SCR-SVC-GRILL', 'grill-slot-priority', '양면이 준비된 안내 꼬치를 눌러 회수하세요.'],
  ['grill.retrieve.2', '둘째 꼬치 회수', 'SCR-SVC-GRILL', 'grill-slot-priority', '남은 꼬치를 눌러 회수하세요.'],
  ['order.complete', '첫 주문 완료', 'SCR-SVC-CUSTOMERS', 'first-order-guide', '생맥주 1잔과 네기마 2개, 총 3항목을 모두 제공하세요.'],
].map(([id, label, targetScreenId, targetControlId, nextAction]) => Object.freeze({
  id, label, targetScreenId, targetControlId, nextAction,
})));

const clone = (value) => structuredClone(value);

function serveSteps(menu, ordinal) {
  const menuLabel = menu === 'beer' ? '생맥주' : '네기마';
  const prefix = `serve.${menu}.${ordinal}`;
  return [
    { id: `${prefix}.card`, label: `${menuLabel} 완성품 선택`, targetScreenId: 'SCR-SVC-CUSTOMERS', targetControlId: `dock-card-${menu}`, nextAction: `${menuLabel} 완성품 카드를 선택하세요.` },
    { id: `${prefix}.customer`, label: `${menuLabel} 대상 손님`, targetScreenId: 'SCR-SVC-CUSTOMERS', targetControlId: 'serve-target-seat-01', nextAction: '테두리와 ‘제공 대상’ 문구가 있는 츠키오카를 선택하세요.' },
    { id: `${prefix}.quantity`, label: `${menuLabel} 수량 확정`, targetScreenId: 'SCR-SVC-CUSTOMERS', targetControlId: 'serve-quantity', nextAction: '1개만 제공 또는 다 주기를 눌러 전달하세요.' },
  ];
}

export function createFirstOrderGuide(saved = null) {
  let completed = new Set(saved?.completed ?? []);
  let prepared = clone(saved?.prepared ?? []);
  let attempts = { ...(saved?.attempts ?? {}) };
  let sequence = Number(saved?.sequence ?? 0);
  let lastFeedback = saved?.lastFeedback ?? null;

  function branchDefinitions() {
    return prepared
      .slice()
      .sort((a, b) => a.readyAt - b.readyAt || a.sequence - b.sequence)
      .flatMap((item) => serveSteps(item.menu, item.ordinal));
  }

  function allDefinitions() {
    const branches = branchDefinitions();
    return [...BASE_STEPS.slice(0, -1), ...branches, BASE_STEPS.at(-1)];
  }

  function currentDefinition() {
    const readyBranch = branchDefinitions().find((step) => !completed.has(step.id));
    if (readyBranch) return readyBranch;
    return BASE_STEPS.find((step) => !completed.has(step.id)) ?? null;
  }

  function view() {
    const current = currentDefinition();
    const steps = allDefinitions().map((step) => ({
      ...step,
      status: completed.has(step.id)
        ? FIRST_ORDER_GUIDE_STATUS.COMPLETE
        : step.id === current?.id
          ? FIRST_ORDER_GUIDE_STATUS.CURRENT
          : FIRST_ORDER_GUIDE_STATUS.PENDING,
      completionSignal: completed.has(step.id) ? `domain:${step.id}` : null,
    }));
    return {
      id: 'D1-ORDER-001',
      itemTotal: 3,
      complete: completed.has('order.complete'),
      steps,
      currentStepId: current?.id ?? null,
      targetScreenId: current?.targetScreenId ?? null,
      targetControlId: current?.targetControlId ?? null,
      nextAction: current?.nextAction ?? '첫 주문의 세 항목을 모두 제공했습니다.',
      feedback: lastFeedback,
    };
  }

  function complete(stepId) {
    if (!allDefinitions().some((step) => step.id === stepId)) return false;
    completed.add(stepId);
    attempts[stepId] = 0;
    lastFeedback = null;
    return true;
  }

  function preparedItem(menu, readyAt = 0) {
    const ordinal = prepared.filter((item) => item.menu === menu).length + 1;
    const item = { menu, ordinal, readyAt, sequence: ++sequence };
    prepared.push(item);
    return clone(item);
  }

  function selectedCard(menu) {
    const branch = prepared.find((item) => item.menu === menu
      && !completed.has(`serve.${menu}.${item.ordinal}.quantity`));
    return branch ? complete(`serve.${menu}.${branch.ordinal}.card`) : false;
  }

  function selectedCustomer(menu) {
    const branch = prepared.find((item) => item.menu === menu
      && completed.has(`serve.${menu}.${item.ordinal}.card`)
      && !completed.has(`serve.${menu}.${item.ordinal}.quantity`));
    return branch ? complete(`serve.${menu}.${branch.ordinal}.customer`) : false;
  }

  function served(menu, count = 1) {
    let remaining = count;
    for (const item of prepared) {
      if (remaining <= 0 || item.menu !== menu) continue;
      const prefix = `serve.${menu}.${item.ordinal}`;
      if (completed.has(`${prefix}.quantity`)) continue;
      completed.add(`${prefix}.card`);
      completed.add(`${prefix}.customer`);
      completed.add(`${prefix}.quantity`);
      remaining -= 1;
    }
    const servedCount = prepared.filter((item) => completed.has(`serve.${item.menu}.${item.ordinal}.quantity`)).length;
    if (servedCount === 3) completed.add('order.complete');
    lastFeedback = null;
    return count - remaining;
  }

  function invalid(reason = '현재 단계의 대상이 아닙니다.', autoComplete = null) {
    const current = currentDefinition();
    if (!current) return { attempt: 0, autoCompleted: false, feedback: null };
    const attempt = (attempts[current.id] ?? 0) + 1;
    attempts[current.id] = attempt;
    if (attempt >= 3) {
      const applied = typeof autoComplete === 'function' ? autoComplete(current.id) !== false : true;
      if (!applied) {
        attempts[current.id] = 2;
        lastFeedback = `시범 대기 · ${current.nextAction}`;
        return { attempt, autoCompleted: false, stepId: current.id, feedback: lastFeedback };
      }
      completed.add(current.id);
      lastFeedback = `시범 완료 · ${current.label} 단계만 자동 진행했습니다.`;
      return { attempt, autoCompleted: true, stepId: current.id, feedback: lastFeedback };
    }
    lastFeedback = attempt === 1
      ? `원인 · ${reason}`
      : `목표 · ${current.nextAction} 판정 대상은 ${current.targetControlId}입니다.`;
    return { attempt, autoCompleted: false, stepId: current.id, feedback: lastFeedback };
  }

  return {
    view,
    complete,
    preparedItem,
    selectedCard,
    selectedCustomer,
    served,
    invalid,
    snapshot: () => clone({ stateVersion: 1, completed: [...completed], prepared, attempts, sequence, lastFeedback }),
  };
}

export const FIRST_ORDER_BASE_STEP_IDS = Object.freeze(BASE_STEPS.map((step) => step.id));
