// 익힘 셰이더 실시간 튜너 (개발 도구).
//
// 키 `G`로 토글. GRILL_PARAM_RANGES에 정의된 스칼라 파라미터를 슬라이더로 실시간 조정하고,
// 익힘 단계(날것~탄)를 대기 없이 미리 본다. 조정한 값은 JSON으로 복사해 grillShaderParams.js에
// 붙여넣을 수 있다 — 아티스트/TA가 코드 왕복 없이 값을 잡는 워크플로.
//
// 프로젝트의 밸런스 도구(content 편집)와 같은 철학: 값의 소유권은 데이터에 있고, 도구는 그 데이터를
// 편집한다. 이 튜너는 시각(셰이더) 값 전용이며 판정 시간(gameState)은 건드리지 않는다.

import { GRILL_PARAMS, GRILL_PARAM_RANGES } from './grillShaderParams.js';

const STAGES = [
  ['날것', 0.0],
  ['익는 중', 0.35],
  ['적정', 0.5],
  ['과다', 0.72],
  ['탄 상태', 1.0],
];

export function mountGrillTuner(debug) {
  const live = {}; // 현재 편집값 (스칼라만)
  for (const key of Object.keys(GRILL_PARAM_RANGES)) live[key] = GRILL_PARAMS[key];

  let previewDoneness = 0.5;
  let open = false;

  const panel = document.createElement('div');
  panel.id = 'grillTuner';
  panel.setAttribute('data-testid', 'grill-tuner');
  panel.hidden = true;
  panel.innerHTML = `
    <header>
      <strong>익힘 셰이더 튜너</strong>
      <span class="hintkey">G 로 닫기</span>
    </header>
    <div class="stages" data-testid="tuner-stages"></div>
    <div class="sliders"></div>
    <footer>
      <button data-act="reset" type="button">기본값</button>
      <button data-act="copy" type="button">JSON 복사</button>
      <span class="copied" hidden>복사됨</span>
    </footer>`;
  document.body.appendChild(panel);

  // 익힘 단계 버튼
  const stagesEl = panel.querySelector('.stages');
  STAGES.forEach(([label, value]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.doneness = String(value);
    if (value === previewDoneness) b.classList.add('active');
    b.addEventListener('click', () => {
      previewDoneness = value;
      applyPreview();
      stagesEl.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    });
    stagesEl.appendChild(b);
  });

  // 슬라이더
  const slidersEl = panel.querySelector('.sliders');
  const rows = {};
  for (const [key, [min, max]] of Object.entries(GRILL_PARAM_RANGES)) {
    const row = document.createElement('label');
    row.className = 'row';
    const step = (max - min) / 200;
    row.innerHTML = `
      <span class="k">${key}</span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${live[key]}"
             data-key="${key}" data-testid="tuner-${key}">
      <span class="v">${fmt(live[key])}</span>`;
    const input = row.querySelector('input');
    const vEl = row.querySelector('.v');
    input.addEventListener('input', () => {
      live[key] = parseFloat(input.value);
      vEl.textContent = fmt(live[key]);
      pushParam(key);
    });
    rows[key] = { input, vEl };
    slidersEl.appendChild(row);
  }

  panel.querySelector('[data-act="reset"]').addEventListener('click', () => {
    for (const key of Object.keys(GRILL_PARAM_RANGES)) {
      live[key] = GRILL_PARAMS[key];
      rows[key].input.value = String(live[key]);
      rows[key].vEl.textContent = fmt(live[key]);
      pushParam(key);
    }
  });

  panel.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    const text = JSON.stringify(live, null, 2);
    try { await navigator.clipboard.writeText(text); } catch { /* 클립보드 차단 환경 무시 */ }
    const tag = panel.querySelector('.copied');
    tag.hidden = false;
    setTimeout(() => { tag.hidden = true; }, 1200);
  });

  function pushParam(key) {
    const g = debug.grillMaterial();
    if (g) g.setParam(key, live[key]);
  }
  function applyPreview() {
    debug.setDonenessOverride(open ? previewDoneness : null);
    debug.showGrillSkewer(open ? true : undefined);
  }

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    if (open) {
      // 열면 현재 편집값을 전부 셰이더에 반영하고 미리보기 단계로 고정
      for (const key of Object.keys(live)) pushParam(key);
      debug.showGrillSkewer(true);
      debug.setDonenessOverride(previewDoneness);
    } else {
      debug.setDonenessOverride(null);
      debug.showGrillSkewer(false); // render()가 다음 프레임에 올바른 가시성 복원
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' || e.key === 'G') { setOpen(!open); }
    if (e.key === 'Escape' && open) setOpen(false);
  });

  // 테스트·데모 훅
  window.__grillTuner = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    setParam: (key, value) => {
      if (!(key in live)) return;
      live[key] = value;
      if (rows[key]) { rows[key].input.value = String(value); rows[key].vEl.textContent = fmt(value); }
      pushParam(key);
    },
    getValues: () => ({ ...live }),
    previewStage: (doneness) => { previewDoneness = doneness; applyPreview(); },
  };
}

function fmt(v) {
  return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
