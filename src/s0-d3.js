import {
  FIXED_CHARACTER,
  S0_D3_STORY_SCENES,
  S0_INTERACTIONS,
  speakerById,
  validateS0D3Content,
} from './scenario/s0-d3-content.js';
import { S0D3CampaignBridge } from './scenario/s0-d3-campaign.js';
import { S0_ART_BINDING_INVENTORY } from './assets/s0D1ArtBindingContract.js';
import {
  S0_EXTERIOR_BACKGROUND_BINDINGS,
  validateS0ExteriorBackgroundBindingContract,
} from './assets/s0ExteriorBackgroundBindingContract.js';
import {
  indexApprovedRuntimeAssets,
  resolveApprovedRuntimeAsset,
} from './assets/runtimeAssetResolver.js';
import {
  S0_AKI_STORY_DIALOGUE_VARIANTS,
  S0_AKI_STORY_PORTRAIT_BINDING,
} from './assets/s0AkiStoryPortraitBindingContract.js';
import {
  S0_TSUKIOKA_STORY_DIALOGUE_VARIANTS,
  S0_TSUKIOKA_STORY_PORTRAIT_BINDING,
} from './assets/s0TsukiokaStoryPortraitBindingContract.js';
import { clearFirstOrderRuntime } from './d1/firstOrderRuntimeStorage.js';

const errors = validateS0D3Content();
errors.push(...validateS0ExteriorBackgroundBindingContract());
if (errors.length) throw new Error(`S0~D3 콘텐츠 오류:\n${errors.join('\n')}`);

const heading = document.querySelector('#screen-heading');
const screenId = document.querySelector('#screen-id');
const stateId = document.querySelector('#state-id');
const sceneId = document.querySelector('#scene-id');
const dialogueId = document.querySelector('#dialogue-id');
const visualTitle = document.querySelector('#visual-title');
const visualDescription = document.querySelector('#visual-description');
const portrait = document.querySelector('#portrait-placeholder');
const storyPortrait = document.querySelector('#story-portrait');
const content = document.querySelector('#content-panel');
const actions = document.querySelector('#actions');
const visualPlaceholder = document.querySelector('#visual-placeholder');
const s0ArtCamera = document.querySelector('#s0-art-camera');
const exteriorBackground = document.querySelector('#s0-exterior-background');
const interactionVisual = document.querySelector('#s0-interaction-visual');
const developmentLabel = document.querySelector('#development-label');

let mode = 's0';
let s0Index = 0;
let storyIndex = 0;
let lineIndex = 0;
let returnMode = null;
let dayId = 'S0';
let campaignBridge = null;
let approvedRuntimeAssets = new Map();

function hideStoryPortrait() {
  storyPortrait.hidden = true;
  storyPortrait.removeAttribute('src');
  storyPortrait.removeAttribute('data-state-variant');
}

function renderStoryPortrait(speaker, activeDialogueId) {
  const isAki = speaker.id === FIXED_CHARACTER.AKI.id;
  const isTsukioka = speaker.id === FIXED_CHARACTER.TSUKIOKA.id;
  const binding = isAki
    ? S0_AKI_STORY_PORTRAIT_BINDING
    : isTsukioka ? S0_TSUKIOKA_STORY_PORTRAIT_BINDING : null;
  const variants = isAki
    ? S0_AKI_STORY_DIALOGUE_VARIANTS
    : isTsukioka ? S0_TSUKIOKA_STORY_DIALOGUE_VARIANTS : {};
  const asset = binding
    ? resolveApprovedRuntimeAsset(
      approvedRuntimeAssets,
      binding.requiredAssetId,
    )
    : null;
  if (!asset) {
    hideStoryPortrait();
    portrait.hidden = false;
    portrait.textContent = isAki ? '秋' : speaker.id === FIXED_CHARACTER.TSUKIOKA.id ? '誠' : '客';
    developmentLabel.hidden = false;
    visualPlaceholder.dataset.assetMode = 'placeholder';
    return;
  }
  portrait.hidden = true;
  storyPortrait.src = asset.url;
  storyPortrait.alt = `${speaker.displayName} 이야기 초상`;
  storyPortrait.dataset.stateVariant = variants[activeDialogueId] ?? (isAki ? 'fatigue' : 'calm');
  storyPortrait.hidden = false;
  developmentLabel.hidden = true;
  visualPlaceholder.dataset.assetMode = 'approved';
  document.body.dataset.componentId = binding.componentId;
  document.body.dataset.requiredAssetId = asset.id;
  document.body.dataset.stateVariant = storyPortrait.dataset.stateVariant;
  document.body.dataset.semanticOwner = binding.semanticOwner;
  document.body.dataset.cameraId = binding.camera.cameraId;
  document.body.dataset.assetMode = 'approved';
}

function syncS0ArtCamera() {
  const stage = visualPlaceholder.getBoundingClientRect();
  const scale = Math.min(stage.width / 1920, stage.height / 1080);
  s0ArtCamera.style.width = `${1920 * scale}px`;
  s0ArtCamera.style.height = `${1080 * scale}px`;
}

new ResizeObserver(syncS0ArtCamera).observe(visualPlaceholder);

async function loadRuntimeAssets() {
  try {
    const manifestUrl = window.location.pathname.startsWith('/src/')
      ? '/public/assets/manifest.json'
      : '/assets/manifest.json';
    const response = await fetch(manifestUrl);
    if (!response.ok) return;
    approvedRuntimeAssets = indexApprovedRuntimeAssets(await response.json());
  } catch {
    approvedRuntimeAssets = new Map();
  }
}

function renderS0ExteriorBackground(backgroundBinding, interactionBinding) {
  const backgroundAsset = resolveApprovedRuntimeAsset(
    approvedRuntimeAssets,
    backgroundBinding.requiredAssetId,
  );
  const interactionAsset = interactionBinding.stateId === 'S0-STATE-KEY'
    ? resolveApprovedRuntimeAsset(approvedRuntimeAssets, interactionBinding.requiredAssetId)
    : null;
  const interactionVisualRequired = interactionBinding.stateId === 'S0-STATE-KEY';
  const approved = Boolean(
    backgroundAsset && (!interactionVisualRequired || interactionAsset),
  );
  exteriorBackground.hidden = !backgroundAsset;
  if (backgroundAsset) {
    exteriorBackground.src = backgroundAsset.url;
  } else {
    exteriorBackground.removeAttribute('src');
  }
  interactionVisual.hidden = !interactionAsset;
  if (interactionAsset) {
    const bounds = interactionBinding.bounds.fhd.visualBounds;
    interactionVisual.src = interactionAsset.url;
    interactionVisual.style.left = `${bounds.x / 19.2}%`;
    interactionVisual.style.top = `${bounds.y / 10.8}%`;
    interactionVisual.style.width = `${bounds.width / 19.2}%`;
    interactionVisual.style.height = `${bounds.height / 10.8}%`;
  } else {
    interactionVisual.removeAttribute('src');
    interactionVisual.removeAttribute('style');
  }
  visualPlaceholder.dataset.assetMode = approved ? 'approved' : 'placeholder';
  syncS0ArtCamera();
  visualPlaceholder.dataset.runtimeVisualLayerCount =
    String(backgroundBinding.compositionPolicy.runtimeVisualLayerCount);
  developmentLabel.hidden = approved;
  document.body.dataset.componentId = backgroundBinding.componentId;
  document.body.dataset.requiredAssetId = backgroundBinding.requiredAssetId;
  document.body.dataset.stateVariant = backgroundBinding.stateVariant;
  document.body.dataset.semanticOwner = backgroundBinding.semanticOwner;
  document.body.dataset.bodyPartCount = String(backgroundBinding.bodyPartCount);
  document.body.dataset.cameraId = backgroundBinding.camera.cameraId;
  document.body.dataset.assetMode = approved ? 'approved' : 'placeholder';
  document.body.dataset.runtimeVisualLayerCount =
    String(backgroundBinding.compositionPolicy.runtimeVisualLayerCount);
  document.body.dataset.interactionComponentId = interactionBinding.componentId;
  document.body.dataset.interactionReferenceAssetId = interactionBinding.requiredAssetId;
  document.body.dataset.interactionAssetMode = interactionVisualRequired
    ? interactionAsset ? 'approved' : 'placeholder'
    : 'reference-only';
  document.body.dataset.interactionRuntimeUrl = interactionAsset?.url ?? '';
  document.body.dataset.prShopGateRuntimeVisual = String(
    backgroundBinding.compositionPolicy.provenanceInteractionReference
      ?.runtimeVisualLayerAllowed ?? false,
  );
  document.body.dataset.openGateOutlineCount =
    String(backgroundBinding.compositionPolicy.openGateOutlineCount);
  document.body.dataset.closedGateResidualPixelCount =
    String(backgroundBinding.compositionPolicy.closedGateResidualPixelCount);
}

function navigateToBusinessDay(dayId) {
  const url = new URL('./d1-game.html', import.meta.url);
  if (dayId !== 'D1') url.searchParams.set('day', dayId.toLowerCase());
  window.location.assign(url);
}

function button(label, handler, primary = false) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  if (primary) node.className = 'primary';
  node.addEventListener('click', async () => {
    node.disabled = true;
    try {
      await handler();
    } catch (error) {
      renderCampaignError(error);
    }
  });
  return node;
}

function setIds({ screen, state = 'none', scene = 'none', dialogue = 'none' }) {
  screenId.textContent = screen;
  stateId.textContent = state;
  sceneId.textContent = scene;
  dialogueId.textContent = dialogue;
  document.body.dataset.screenId = screen;
  document.body.dataset.stateId = state;
  document.body.dataset.sceneId = scene;
  document.body.dataset.dialogueId = dialogue;
}

function renderS0() {
  const step = S0_INTERACTIONS[s0Index];
  const binding = S0_ART_BINDING_INVENTORY.find(
    (entry) => entry.interactionId === step.interactionId,
  );
  if (!binding) throw new Error(`S0 binding 누락: ${step.interactionId}`);
  const exteriorBackgroundBinding = S0_EXTERIOR_BACKGROUND_BINDINGS.find(
    (entry) => entry.stateId === step.stateId,
  );
  heading.textContent = 'S0 · 남겨진 열쇠';
  visualTitle.textContent = step.phaseId === 'exterior-key'
    ? '비 갠 골목과 닫힌 가게'
    : '열린 대문과 빈 카운터';
  visualDescription.textContent = exteriorBackgroundBinding
    ? '승인된 exact 외관 배경 한 장과 DOM 상호작용으로 표시합니다.'
    : '정식 S0 아트는 Artist 023 handoff 전까지 단순 도형으로 표시합니다.';
  portrait.hidden = true;
  hideStoryPortrait();
  if (exteriorBackgroundBinding) {
    renderS0ExteriorBackground(exteriorBackgroundBinding, binding);
  } else {
    exteriorBackground.hidden = true;
    exteriorBackground.removeAttribute('src');
    interactionVisual.hidden = true;
    interactionVisual.removeAttribute('src');
    interactionVisual.removeAttribute('style');
    visualPlaceholder.dataset.assetMode = 'placeholder';
    developmentLabel.hidden = false;
    document.body.dataset.componentId = binding.componentId;
    document.body.dataset.requiredAssetId = binding.requiredAssetId;
    document.body.dataset.stateVariant = binding.stateVariant;
    document.body.dataset.semanticOwner = binding.semanticOwner;
    document.body.dataset.bodyPartCount = String(binding.bodyPartCount);
    for (const name of [
      'cameraId',
      'assetMode',
      'runtimeVisualLayerCount',
      'interactionComponentId',
      'interactionReferenceAssetId',
      'interactionAssetMode',
      'interactionRuntimeUrl',
      'prShopGateRuntimeVisual',
      'openGateOutlineCount',
      'closedGateResidualPixelCount',
    ]) delete document.body.dataset[name];
  }
  setIds({ screen: step.screenId, state: step.stateId, scene: 'SCN-S0-INTERACTION', dialogue: 'none' });
  content.innerHTML = `<h2>무실패 2클릭 · ${s0Index + 1}/${S0_INTERACTIONS.length}</h2><p>${step.resultText}</p><ol class="step-list">${S0_INTERACTIONS.map((item, index) => `<li class="${index < s0Index ? 'done' : index === s0Index ? 'current' : ''}">${item.actionLabel}</li>`).join('')}</ol>`;
  actions.replaceChildren(button(step.actionLabel, () => {
    if (s0Index < S0_INTERACTIONS.length - 1) s0Index += 1;
    else {
      mode = 'story';
      storyIndex = 0;
      lineIndex = 0;
    }
    render();
  }, true));
}

function renderStory() {
  const story = S0_D3_STORY_SCENES[storyIndex];
  const line = story.lines[lineIndex];
  const speaker = speakerById(line.speakerId);
  dayId = story.dayId;
  heading.textContent = `${story.dayId} · ${story.timing === 'pre-open' ? '영업 전 이야기' : story.timing === 'post-settlement' ? '정산 후 이야기' : '프롤로그 결심'}`;
  visualTitle.textContent = `${speaker.displayName} · 이야기 초상`;
  visualDescription.textContent = speaker.id === FIXED_CHARACTER.AKI.id
    ? '승인된 CH-AKI-STORY 초상입니다.'
    : `${story.sourceMasterId} 교체 전 semantic placeholder입니다.`;
  for (const name of [
    'componentId',
    'requiredAssetId',
    'stateVariant',
    'semanticOwner',
    'bodyPartCount',
    'cameraId',
    'assetMode',
    'runtimeVisualLayerCount',
    'interactionComponentId',
    'interactionReferenceAssetId',
    'interactionAssetMode',
    'interactionRuntimeUrl',
    'prShopGateRuntimeVisual',
    'openGateOutlineCount',
    'closedGateResidualPixelCount',
  ]) delete document.body.dataset[name];
  exteriorBackground.hidden = true;
  exteriorBackground.removeAttribute('src');
  interactionVisual.hidden = true;
  interactionVisual.removeAttribute('src');
  interactionVisual.removeAttribute('style');
  renderStoryPortrait(speaker, line.dialogueId);
  setIds({ screen: story.screenId, state: `${story.dayId}-${story.timing}`, scene: story.sceneId, dialogue: line.dialogueId });
  content.innerHTML = `<p class="speaker">${speaker.displayName}</p><p class="dialogue">${line.text}</p><p>${lineIndex + 1} / ${story.lines.length}</p>`;
  const nextLabel = lineIndex === story.lines.length - 1 ? '장면 완료' : '다음 대사';
  actions.replaceChildren(
    button('이야기 건너뛰기', () => { mode = 'summary'; returnMode = 'story'; render(); }),
    button(nextLabel, async () => {
      if (lineIndex < story.lines.length - 1) lineIndex += 1;
      else await advanceAfterStory(story);
      render();
    }, true),
  );
}

async function advanceAfterStory(story) {
  lineIndex = 0;
  if (story.dayId === 'S0') {
    campaignBridge.finishPrologue();
    storyIndex = 1;
    return;
  }
  if (story.timing === 'pre-open') {
    const started = await campaignBridge.startDay();
    if (!started.ok) throw new Error(started.error.message);
    if (story.dayId === 'D1' || story.dayId === 'D2') {
      navigateToBusinessDay(story.dayId);
      return;
    }
    mode = 'business';
    return;
  }
  if (story.dayId === 'D3') {
    const completed = await campaignBridge.completeDay(story.dayId);
    if (!completed.ok) throw new Error(completed.error.message);
    mode = 'complete';
    return;
  }
  const completed = await campaignBridge.completeDay(story.dayId);
  if (!completed.ok) throw new Error(completed.error.message);
  storyIndex += 1;
}

function renderSummary() {
  const story = S0_D3_STORY_SCENES[storyIndex];
  heading.textContent = `${story.dayId} · 건너뛰기 요약`;
  visualTitle.textContent = '맥락 · 새 행동 · 목표';
  visualDescription.textContent = '이야기를 건너뛰어도 진행 정보는 세 줄 안에 유지됩니다.';
  portrait.hidden = true;
  hideStoryPortrait();
  setIds({ screen: story.screenId, state: `${story.dayId}-skip-summary`, scene: story.sceneId, dialogue: 'SUMMARY-3-LINES' });
  content.innerHTML = `<h2>3줄 요약</h2><ol class="summary">${story.skipSummary.map((line) => `<li>${line}</li>`).join('')}</ol>`;
  actions.replaceChildren(button('요약 확인', async () => {
    mode = returnMode;
    await advanceAfterStory(story);
    render();
  }, true));
}

function renderBusiness() {
  heading.textContent = `${dayId} · 영업 화면`;
  visualTitle.textContent = '영업·조리 화면 임시 UI';
  visualDescription.textContent = '플레이어 손·팔·몸을 표시하지 않습니다. 실제 영업은 개발자 1 공개 port 연결 뒤 교체됩니다.';
  portrait.hidden = true;
  hideStoryPortrait();
  setIds({ screen: 'SCR-SVC-CUSTOMERS', state: `${dayId}-business-placeholder`, scene: 'none', dialogue: 'none' });
  content.innerHTML = '<h2><span class="development-label">개발 중</span> 영업 결과 대기</h2><p>오디오 없이 주문·위험·결과를 텍스트와 비색상 표식으로 전달할 자리입니다.</p>';
  actions.replaceChildren(button('영업 결과 보기', () => {
    campaignBridge.enterSettlement();
    mode = 'settlement';
    render();
  }, true));
}

function renderSettlement() {
  heading.textContent = `${dayId} · 정산`;
  visualTitle.textContent = '아사노 아키 · 정산 초상';
  visualDescription.textContent = '승인된 CH-AKI-STORY 초상과 정산 결과를 함께 표시합니다.';
  renderStoryPortrait(FIXED_CHARACTER.AKI, 'DLG-D1-POST-002');
  setIds({ screen: 'SCR-POST-SETTLEMENT', state: `${dayId}-settlement-placeholder`, scene: 'none', dialogue: 'none' });
  content.innerHTML = '<h2><span class="development-label">개발 중</span> 오늘의 변화</h2><p>주문 → 품질·기다림 → 매출·팁 → 명성 → 다음 변화 순서로 표시합니다.</p>';
  actions.replaceChildren(button('정산 후 이야기', () => {
    storyIndex += 1;
    lineIndex = 0;
    mode = 'story';
    render();
  }, true));
}

function renderComplete() {
  heading.textContent = 'D3 완료';
  visualTitle.textContent = 'S0~D3 임시 시나리오 종료';
  visualDescription.textContent = 'D4 연결은 developer-2/005 범위이므로 이 화면에서 시작하지 않습니다.';
  portrait.hidden = true;
  hideStoryPortrait();
  setIds({ screen: 'SCR-POST-NEXT-GOAL', state: 'D3-complete', scene: 'none', dialogue: 'none' });
  content.innerHTML = '<h2>S0~D3 확인 완료</h2><p>아사노 아키와 츠키오카 세이지만 고정 인물로 사용했고, 다른 손님은 이름 없는 엑스트라 유형으로 유지했습니다.</p>';
  actions.replaceChildren(button('처음부터 다시 보기', async () => {
    const restarted = await campaignBridge.restartDevelopmentCampaign();
    if (!restarted.ok) throw new Error(restarted.error.message);
    clearFirstOrderRuntime(window.localStorage);
    mode = 's0'; s0Index = 0; storyIndex = 0; lineIndex = 0; dayId = 'S0'; render();
  }));
}

function renderCampaignError(error) {
  heading.textContent = '저장 상태를 확인할 수 없습니다';
  visualTitle.textContent = '캠페인 연결 오류';
  visualDescription.textContent = '진행 상태를 덮어쓰지 않았습니다.';
  portrait.hidden = true;
  hideStoryPortrait();
  setIds({ screen: 'SCR-SYS-RECOVERY', state: 'campaign-error', scene: 'none', dialogue: 'none' });
  const title = document.createElement('h2');
  title.textContent = '진행을 계속할 수 없습니다';
  const message = document.createElement('p');
  message.textContent = error.message;
  content.replaceChildren(title, message);
  actions.replaceChildren();
}

function restorePresentationPosition(position) {
  if (position.kind === 'prologue') return;
  if (position.kind === 'complete') {
    mode = 'complete';
    dayId = 'D3';
    return;
  }
  dayId = position.dayId;
  storyIndex = S0_D3_STORY_SCENES.findIndex((story) => (
    story.dayId === position.dayId && story.timing === 'pre-open'
  ));
  lineIndex = 0;
  mode = 'story';
}

function render() {
  if (mode === 's0') renderS0();
  else if (mode === 'story') renderStory();
  else if (mode === 'summary') renderSummary();
  else if (mode === 'business') renderBusiness();
  else if (mode === 'settlement') renderSettlement();
  else renderComplete();
}

async function initialize() {
  await loadRuntimeAssets();
  campaignBridge = new S0D3CampaignBridge({ browserStorage: window.localStorage });
  const forceNew = new URLSearchParams(window.location.search).get('new') === '1';
  if (forceNew) clearFirstOrderRuntime(window.localStorage);
  const loaded = await campaignBridge.loadOrStart({ forceNew });
  if (!loaded.ok) {
    renderCampaignError(new Error(loaded.error.message));
    return;
  }
  restorePresentationPosition(campaignBridge.getPosition());
  render();
}

await initialize();
window.__s0d3Debug = {
  getState: () => ({ mode, s0Index, storyIndex, lineIndex, dayId }),
  campaignState: () => campaignBridge?.getState() ?? null,
  contentErrors: errors,
};
