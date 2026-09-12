import {
  D4_EPILOGUE_PAGES,
  D5_EPILOGUE_PAGES,
  D6_EPILOGUE_PAGES,
  D6_PREOPEN_SCENE,
  FIXED_CHARACTER,
  S0_D4_STORY_SCENES,
  S0_INTERACTIONS,
  speakerById,
  validateS0D4Content,
} from './scenario/s0-d3-content.js';
import { S0D3CampaignBridge } from './scenario/s0-d3-campaign.js';
import { renderReputationMarket } from './render/reputationMarketUi.js';
import { assertGrillMarketConfig } from './domain/progression/grillSlots.js';
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
import { S0_D3_STORY_ILLUSTRATION_BY_SCENE_KEY } from './assets/s0D3StoryIllustrationBindingContract.js';
import { clearFirstOrderRuntime, hasInProgressBusiness } from './d1/firstOrderRuntimeStorage.js';
import { installGameAudio, loopOn, setBgm, sfx } from './audio/gameAudio.js';
import { createImagePreloader } from './presentation/imageReadiness.js';
import { finishPageEntry, failPageEntry } from './presentation/pageEntry.js';
import { loadPresentationSettings } from './presentation/settings.js';

installGameAudio(window);
setBgm('BGM-S0-ALLEY');
loopOn('AMB-ALLEY-NIGHT');
loopOn('SFX-S0-DISTANT-SHOP');

const S0_AMBIENT_ONESHOTS = ['SFX-S0-WET-TIRE', 'SFX-S0-TRAIN-PASS'];
let s0AmbientIndex = 0;
function scheduleS0AmbientOneShot() {
  const delayMs = 6_000 + Math.random() * 12_000;
  window.setTimeout(() => {
    if (mode === 's0' || (mode === 'story' && dayId === 'S0')) {
      sfx(S0_AMBIENT_ONESHOTS[s0AmbientIndex % S0_AMBIENT_ONESHOTS.length]);
      s0AmbientIndex += 1;
    }
    scheduleS0AmbientOneShot();
  }, delayMs);
}
scheduleS0AmbientOneShot();

const STORY_SCENES = [...S0_D4_STORY_SCENES, D6_PREOPEN_SCENE];
const errors = validateS0D4Content();
errors.push(...validateS0ExteriorBackgroundBindingContract());
if (errors.length) throw new Error(`S0~D4 콘텐츠 오류:\n${errors.join('\n')}`);

const heading = document.querySelector('#screen-heading');
let storyPortrait = document.querySelector('#story-portrait');
let storyIllustration = document.querySelector('#story-illustration');
let storyBackground = document.querySelector('#story-background');
const content = document.querySelector('#content-panel');
const actions = document.querySelector('#actions');
const visualPlaceholder = document.querySelector('#visual-placeholder');
const s0ArtCamera = document.querySelector('#s0-art-camera');
let exteriorBackground = document.querySelector('#s0-exterior-background');
let interactionVisual = document.querySelector('#s0-interaction-visual');

let mode = 's0';
let s0Index = 0;
let storyIndex = 0;
let lineIndex = 0;
let dayId = 'S0';
let epilogueIndex = 0;
let campaignBridge = null;
let approvedRuntimeAssets = new Map();
let grillSlotConfig = null;
let grillSlotConfigError = null;
const sceneImages = createImagePreloader();
let presentationBusy = false;
let actionBusy = false;
let returnFocusToAction = false;
const playedStoryAudio = new Set();

function syncStoryAudio(dialogueId) {
  if (playedStoryAudio.has(dialogueId)) return;
  playedStoryAudio.add(dialogueId);
  if (dialogueId === 'DLG-S0-003') {
    sfx('SFX-PREP-CHARCOAL-IGNITE');
    window.setTimeout(() => sfx('SFX-PREP-FAN'), 350);
  }
}

const STORY_BACKGROUND_ASSET_IDS = Object.freeze({
  S0: 'BG-EXTERIOR-S0-GATE-OPEN',
  DEFAULT: 'BG-INTERIOR-BASE',
});

// 미리 decode한 실제 노드를 부착한다. src 재지정/clone은 캐시가 없는 연결에서
// 두 번째 요청을 만들어 대사만 먼저 나타날 수 있다. 숨긴 이미지의 src도 보존한다.
function attachPreparedImage(previous, url) {
  const image = sceneImages.get(url);
  if (!image) throw new Error('장면 이미지가 아직 준비되지 않았습니다.');
  if (image === previous) return previous;
  for (const attr of [...image.attributes]) if (attr.name !== 'src') image.removeAttribute(attr.name);
  for (const attr of previous.attributes) if (attr.name !== 'src') image.setAttribute(attr.name, attr.value);
  previous.replaceWith(image);
  return image;
}
function storyIllustrationBinding(activeDayId, dialogueId) {
  if (activeDayId === 'S0') return S0_D3_STORY_ILLUSTRATION_BY_SCENE_KEY.S0;
  const timing = dialogueId?.includes('-POST-') ? 'POST' : 'PRE';
  return S0_D3_STORY_ILLUSTRATION_BY_SCENE_KEY[`${activeDayId}-${timing}`];
}

function hideStoryIllustration() {
  storyIllustration.hidden = true;
  delete document.body.dataset.storyIllustrationAssetId;
}

function renderStoryIllustration(activeDayId, dialogueId) {
  const binding = storyIllustrationBinding(activeDayId, dialogueId);
  if (!binding) {
    hideStoryIllustration();
    return false;
  }
  const asset = resolveApprovedRuntimeAsset(approvedRuntimeAssets, binding.requiredAssetId);
  if (!asset) {
    hideStoryIllustration();
    return false;
  }
  storyIllustration = attachPreparedImage(storyIllustration, asset.url);
  storyIllustration.alt = binding.alt;
  storyIllustration.hidden = false;
  document.body.dataset.storyIllustrationAssetId = asset.id;
  return true;
}

function renderEpilogueIllustration(assetId) {
  const asset = resolveApprovedRuntimeAsset(approvedRuntimeAssets, assetId);
  if (!asset) {
    hideStoryIllustration();
    return false;
  }
  storyIllustration = attachPreparedImage(storyIllustration, asset.url);
  storyIllustration.alt = '';
  storyIllustration.hidden = false;
  document.body.dataset.storyIllustrationAssetId = asset.id;
  return true;
}

function hideStoryBackground() {
  storyBackground.hidden = true;
  storyBackground.removeAttribute('data-required-asset-id');
  delete document.body.dataset.storyBackgroundAssetId;
}

function renderStoryBackground(activeDayId) {
  const requiredAssetId = activeDayId === 'S0'
    ? STORY_BACKGROUND_ASSET_IDS.S0
    : STORY_BACKGROUND_ASSET_IDS.DEFAULT;
  const asset = resolveApprovedRuntimeAsset(approvedRuntimeAssets, requiredAssetId);
  if (!asset) {
    hideStoryBackground();
    return;
  }
  storyBackground = attachPreparedImage(storyBackground, asset.url);
  storyBackground.dataset.requiredAssetId = asset.id;
  storyBackground.alt = activeDayId === 'S0' ? '비 갠 밤의 가게 외관' : '밤의 야키토리 가게 내부';
  storyBackground.hidden = false;
  document.body.dataset.storyBackgroundAssetId = asset.id;
}

function hideStoryPortrait() {
  storyPortrait.hidden = true;
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
    visualPlaceholder.dataset.assetMode = 'placeholder';
    return;
  }
  storyPortrait = attachPreparedImage(storyPortrait, asset.url);
  storyPortrait.alt = `${speaker.displayName} 이야기 초상`;
  storyPortrait.dataset.stateVariant = variants[activeDialogueId] ?? (isAki ? 'fatigue' : 'calm');
  storyPortrait.hidden = false;
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
    const response = await fetch(manifestUrl, { signal:AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('장면 목록을 불러오지 못했습니다.');
    approvedRuntimeAssets = indexApprovedRuntimeAssets(await response.json());
  } catch (error) {
    throw new Error('장면을 준비하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.', { cause:error });
  }
}

async function loadGrillSlotConfig() {
  try {
    const response = await fetch('/content/progression/grill-slots.json', { signal:AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`그릴 업그레이드 데이터 응답 오류: ${response.status}`);
    grillSlotConfig = assertGrillMarketConfig(await response.json());
    grillSlotConfigError = null;
  } catch (error) {
    grillSlotConfig = null;
    grillSlotConfigError = error;
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
    exteriorBackground = attachPreparedImage(exteriorBackground, backgroundAsset.url);
  }
  interactionVisual.hidden = !interactionAsset;
  if (interactionAsset) {
    const bounds = interactionBinding.bounds.fhd.visualBounds;
    interactionVisual = attachPreparedImage(interactionVisual, interactionAsset.url);
    interactionVisual.style.left = `${bounds.x / 19.2}%`;
    interactionVisual.style.top = `${bounds.y / 10.8}%`;
    interactionVisual.style.width = `${bounds.width / 19.2}%`;
    interactionVisual.style.height = `${bounds.height / 10.8}%`;
  } else {
    interactionVisual.removeAttribute('style');
  }
  visualPlaceholder.dataset.assetMode = approved ? 'approved' : 'placeholder';
  syncS0ArtCamera();
  visualPlaceholder.dataset.runtimeVisualLayerCount =
    String(backgroundBinding.compositionPolicy.runtimeVisualLayerCount);
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
  const url = new URL('./d1-game.html', window.location.href);
  if (dayId !== 'D1') url.searchParams.set('day', dayId.toLowerCase());
  window.location.assign(url);
}

function button(label, handler, primary = false) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  if (primary) node.className = 'primary';
  node.addEventListener('click', async (event) => {
    if (presentationBusy || actionBusy || event.detail > 1) return;
    actionBusy = true;
    returnFocusToAction = actions.contains(document.activeElement);
    node.disabled = true;
    try {
      await handler();
    } catch (error) {
      renderCampaignError(error);
    } finally {
      actionBusy = false;
      if (node.isConnected) node.disabled = false;
    }
  });
  return node;
}

function setIds({ screen, state = 'none', scene = 'none', dialogue = 'none' }) {
  document.body.dataset.screenId = screen;
  document.body.dataset.stateId = state;
  document.body.dataset.sceneId = scene;
  document.body.dataset.dialogueId = dialogue;
}

function waitingExteriorBinding(step) {
  // GATE의 열린 문 아트 계약은 동작 완료 모습이다. 공개 조작 대기 중에는
  // 열쇠만 손에 든 닫힌 문을 유지하고, 클릭 뒤 S0 이야기에서 열린 문을 보여준다.
  const visualState = step.stateId === 'S0-STATE-GATE' ? 'S0-STATE-KEY' : step.stateId;
  return S0_EXTERIOR_BACKGROUND_BINDINGS.find(binding => binding.stateId === visualState);
}

function renderS0() {
  const step = S0_INTERACTIONS[s0Index];
  const binding = S0_ART_BINDING_INVENTORY.find(
    (entry) => entry.interactionId === step.interactionId,
  );
  if (!binding) throw new Error(`S0 binding 누락: ${step.interactionId}`);
  const exteriorBackgroundBinding = waitingExteriorBinding(step);
  heading.textContent = step.phaseId === 'exterior-key'
    ? '비 그친 골목에서'
    : '오래 닫힌 문';
  hideStoryPortrait();
  hideStoryIllustration();
  hideStoryBackground();
  if (exteriorBackgroundBinding) {
    renderS0ExteriorBackground(exteriorBackgroundBinding, binding);
  } else {
    exteriorBackground.hidden = true;
    interactionVisual.hidden = true;
    interactionVisual.removeAttribute('style');
    visualPlaceholder.dataset.assetMode = 'placeholder';
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
  const narration = step.phaseId === 'exterior-key'
    ? '비가 막 그친 골목 끝에 가게가 있었다. 문 앞에 서자 발치의 황동 열쇠가 먼저 눈에 들어왔다. 할아버지가 쓰던 열쇠였다.'
    : '열쇠를 쥔 손이 차가웠다. 자물쇠 앞에서 잠시 멈췄다. 문 너머에는 할아버지가 쓰던 카운터와 차가운 화로가 기다리고 있었다.';
  content.innerHTML = `<p class="scene-narration">${narration}</p>`;
  actions.replaceChildren(button(step.actionLabel, () => {
    sfx(s0Index === 0 ? 'SFX-S0-KEY-PICK' : 'SFX-S0-GATE-OPEN');
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
  const story = STORY_SCENES[storyIndex];
  const line = story.lines[lineIndex];
  const speaker = speakerById(line.speakerId);
  syncStoryAudio(line.dialogueId);
  dayId = story.dayId;
  const storyHeadings = {
    S0: '가게 문을 다시 열다',
    'D1-pre-open': '첫째 날 영업 준비',
    'D1-post-settlement': '첫째 날 영업을 마치고',
    'D2-pre-open': '둘째 날 영업 준비',
    'D2-post-settlement': '둘째 날 영업을 마치고',
    'D3-pre-open': '셋째 날, 앞치마에 남은 향',
    'D3-post-settlement': '셋째 날 영업을 마치고',
    'D4-pre-open': '넷째 날, 얼음이 부딪히는 소리',
    'D4-post-settlement': '넷째 날 영업을 마치고',
    'D6-pre-open': '여섯째 날, 여섯 자리',
  };
  heading.textContent = storyHeadings[story.dayId === 'S0' ? 'S0' : `${story.dayId}-${story.timing}`];
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
  interactionVisual.hidden = true;
  interactionVisual.removeAttribute('style');
  if (renderStoryIllustration(story.dayId, line.dialogueId)) {
    hideStoryBackground();
    hideStoryPortrait();
    visualPlaceholder.dataset.assetMode = 'approved';
  } else {
    renderStoryBackground(story.dayId);
    renderStoryPortrait(speaker, line.dialogueId);
  }
  setIds({ screen: story.screenId, state: `${story.dayId}-${story.timing}`, scene: story.sceneId, dialogue: line.dialogueId });
  content.innerHTML = `<p class="speaker">${speaker.displayName}</p><p class="dialogue">${line.text}</p>`;
  const lastLine = lineIndex === story.lines.length - 1;
  const dayStartLabels = {
    D1: '영업 준비',
    D2: '영업 준비',
    D3: '영업 준비',
    D4: '영업 준비',
    D6: '영업 준비',
  };
  const nextLabel = lastLine && story.timing === 'pre-open'
    ? dayStartLabels[story.dayId]
    : '다음 이야기';
  actions.replaceChildren(
    button('이 장면 건너뛰기', async () => { await advanceAfterStory(story); render(); }),
    button(nextLabel, async () => {
      sfx('SFX-S0-STORY-PAGE');
      if (lineIndex < story.lines.length - 1) lineIndex += 1;
      else await advanceAfterStory(story);
      render();
    }, true),
  );
  const progress = document.createElement('span');
  progress.className = 'story-progress';
  progress.textContent = `${lineIndex + 1} / ${story.lines.length}`;
  progress.setAttribute('aria-label', `대화 ${lineIndex + 1} / ${story.lines.length}`);
  actions.prepend(progress);
}

async function advanceAfterStory(story) {
  lineIndex = 0;
  if (story.dayId === 'S0') {
    campaignBridge.finishPrologue();
    storyIndex = 1;
    return;
  }
  if (story.timing === 'pre-open') {
    if (['D1', 'D2', 'D3', 'D4', 'D5', 'D6'].includes(story.dayId)) {
      mode = 'day-prep';
      return;
    }
    const started = await campaignBridge.startDay();
    if (!started.ok) throw new Error(started.error.message);
    navigateToBusinessDay(story.dayId);
    return;
  }
  const alreadyCompleted = campaignBridge.getState()?.campaign?.completedDayIds
    ?.includes(story.dayId.toLowerCase());
  if (story.timing === 'post-settlement' && alreadyCompleted) {
    if (story.dayId === 'D4') {
      epilogueIndex = 0;
      mode = 'epilogue';
    }
    else storyIndex += 1;
    return;
  }
  const completed = await campaignBridge.completeDay(story.dayId);
  if (!completed.ok) throw new Error(completed.error.message);
  if (story.dayId === 'D4') {
    epilogueIndex = 0;
    mode = 'epilogue';
  }
  else storyIndex += 1;
}

function renderDayPrep() {
  heading.textContent = `${dayId} 영업 준비`;
  hideStoryPortrait();
  hideStoryIllustration();
  hideStoryBackground();
  setIds({ screen: 'SCR-DAY-BRIEFING', state: `${dayId}-reputation-market`, scene: `SCN-${dayId}-DAY-PREP`, dialogue: 'none' });
  renderReputationMarket({
    content, actions, config: grillSlotConfig, error: grillSlotConfigError, bridge: campaignBridge, dayId,
    isBusinessRunning: () => hasInProgressBusiness(window.localStorage, campaignBridge.getState()),
    onStart: async () => {
      const started = await campaignBridge.startDay();
      if (started.ok) navigateToBusinessDay(dayId);
      return started;
    },
    onRetry: async () => { await loadGrillSlotConfig(); renderDayPrep(); },
  });
}

function renderBusiness() {
  heading.textContent = '오늘의 영업';
  hideStoryPortrait();
  hideStoryIllustration();
  hideStoryBackground();
  setIds({ screen: 'SCR-SVC-CUSTOMERS', state: `${dayId}-business-placeholder`, scene: 'none', dialogue: 'none' });
  content.innerHTML = '<p class="scene-narration">오늘 영업 결과를 확인합니다.</p>';
  actions.replaceChildren(button('영업 결과 보기', () => {
    campaignBridge.enterSettlement();
    mode = 'settlement';
    render();
  }, true));
}

function renderSettlement() {
  heading.textContent = '영업을 마치고';
  hideStoryIllustration();
  renderStoryBackground(dayId);
  renderStoryPortrait(FIXED_CHARACTER.AKI, 'DLG-D1-POST-002');
  setIds({ screen: 'SCR-POST-SETTLEMENT', state: `${dayId}-settlement-placeholder`, scene: 'none', dialogue: 'none' });
  content.innerHTML = '<p class="scene-narration">영업이 끝났습니다. 가게를 정리하고 정산을 시작합니다.</p>';
  actions.replaceChildren(button('정산 후 이야기', () => {
    storyIndex += 1;
    lineIndex = 0;
    mode = 'story';
    render();
  }, true));
}

function renderEpilogue() {
  const completed = dayId === 'D6';
  const pages = completed ? D6_EPILOGUE_PAGES : dayId === 'D5' ? D5_EPILOGUE_PAGES : D4_EPILOGUE_PAGES;
  const page = pages[epilogueIndex];
  heading.textContent = completed ? '여섯째 날 영업을 마치고' : dayId === 'D5' ? '다섯째 날 마감 후' : '넷째 날 마감 후';
  hideStoryPortrait();
  hideStoryIllustration();
  if (renderEpilogueIllustration(page.illustrationAssetId)) {
    hideStoryBackground();
  } else {
    renderStoryBackground('D4');
  }
  setIds({
    screen: 'SCR-POST-EPILOGUE',
    state: `${dayId}-epilogue-${epilogueIndex + 1}`,
    scene: `SCN-${dayId}-EPILOGUE`,
    dialogue: page.pageId,
  });
  document.querySelector('#epilogue-visual-line').textContent = page.visualLine;

  const article = document.createElement('article');
  article.className = 'epilogue-card';
  const kicker = document.createElement('p');
  kicker.className = 'epilogue-kicker';
  kicker.textContent = page.kicker;
  const title = document.createElement('h2');
  title.className = 'epilogue-title';
  title.textContent = page.title;
  article.append(kicker, title);
  for (const paragraph of page.paragraphs) {
    const copy = document.createElement('p');
    copy.className = 'epilogue-copy';
    copy.textContent = paragraph;
    article.append(copy);
  }
  if (page.releaseNote) {
    const releaseNote = document.createElement('p');
    releaseNote.className = 'epilogue-release-note';
    releaseNote.textContent = page.releaseNote;
    article.append(releaseNote);
  }
  const progress = document.createElement('p');
  progress.className = 'epilogue-progress';
  progress.textContent = `${epilogueIndex + 1} / ${pages.length}`;
  article.append(progress);
  content.replaceChildren(article);

  const epilogueActions = [];
  if (epilogueIndex > 0) {
    epilogueActions.push(button('이전 장면', () => {
      epilogueIndex -= 1;
      render();
    }));
  }
  const lastPage = epilogueIndex === pages.length - 1;
  epilogueActions.push(button(completed ? '시작 화면으로' : lastPage ? (dayId === 'D5' ? '여섯째 날 준비' : '다섯째 날 문 열기') : '다음 장면', () => {
    if (completed) { window.location.assign('./public-shell.html'); return; }
    if (lastPage) {
      if (dayId === 'D5') {
        restorePresentationPosition(campaignBridge.getPosition()); render(); return;
      }
      dayId = 'D5'; mode = 'day-prep'; render();
      return;
    }
    epilogueIndex += 1;
    render();
  }, true));
  actions.replaceChildren(...epilogueActions);
}

function renderCampaignError(error) {
  heading.textContent = '저장 상태를 확인할 수 없습니다';
  hideStoryPortrait();
  hideStoryIllustration();
  hideStoryBackground();
  setIds({ screen: 'SCR-SYS-RECOVERY', state: 'campaign-error', scene: 'none', dialogue: 'none' });
  const title = document.createElement('h2');
  title.textContent = '진행을 계속할 수 없습니다';
  const message = document.createElement('p');
  message.textContent = error.message;
  content.replaceChildren(title, message);
  actions.replaceChildren(button('다시 시도', () => window.location.reload(), true), button('시작 화면으로', () => window.location.assign('./public-shell.html')));
  finishPageEntry();
}

function restorePresentationPosition(position, { postDayId = null } = {}) {
  if (postDayId) {
    const normalizedDayId = postDayId.toUpperCase();
    const alreadyCompleted = campaignBridge.getState()?.campaign?.completedDayIds
      ?.includes(postDayId.toLowerCase());
    if (alreadyCompleted && normalizedDayId === 'D5') {
      dayId = 'D5'; mode = 'epilogue'; epilogueIndex = 0; return;
    }
    const postIndex = STORY_SCENES.findIndex((story) => (
      story.dayId === normalizedDayId && story.timing === 'post-settlement'
    ));
    if (alreadyCompleted && postIndex >= 0) {
      dayId = normalizedDayId;
      storyIndex = postIndex;
      lineIndex = 0;
      mode = 'story';
      return;
    }
  }
  if (position.kind === 'prologue') return;
  if (position.kind === 'epilogue') {
    mode = 'epilogue';
    dayId = position.dayId;
    epilogueIndex = 0;
    return;
  }
  dayId = position.dayId;
  if (dayId === 'D5') { mode = 'day-prep'; return; }
  storyIndex = STORY_SCENES.findIndex((story) => (
    story.dayId === position.dayId && story.timing === 'pre-open'
  ));
  lineIndex = 0;
  mode = 'story';
}

function renderCurrentPresentation() {
  if (mode === 's0') renderS0();
  else if (mode === 'story') renderStory();
  else if (mode === 'business') renderBusiness();
  else if (mode === 'settlement') renderSettlement();
  else if (mode === 'day-prep') renderDayPrep();
  else renderEpilogue();
}

function requiredPresentationUrls({ targetMode = mode, targetS0 = s0Index, targetStory = storyIndex, targetLine = lineIndex } = {}) {
  const url = id => {
    const asset = resolveApprovedRuntimeAsset(approvedRuntimeAssets, id);
    if (!asset) throw new Error('필요한 장면이 준비되지 않았습니다. 다시 시도해 주세요.');
    return asset.url;
  };
  if (targetMode === 's0') {
    const step = S0_INTERACTIONS[targetS0];
    const background = waitingExteriorBinding(step);
    const ids = [background.requiredAssetId];
    if (step.stateId === 'S0-STATE-KEY') ids.push(S0_ART_BINDING_INVENTORY.find(binding => binding.interactionId === step.interactionId).requiredAssetId);
    return ids.map(url);
  }
  if (targetMode === 'story') {
    const story = STORY_SCENES[targetStory];
    const line = story.lines[targetLine];
    const illustration = storyIllustrationBinding(story.dayId, line.dialogueId);
    if (illustration) return [url(illustration.requiredAssetId)];
    const speaker = speakerById(line.speakerId);
    const portrait = speaker.id === FIXED_CHARACTER.AKI.id ? S0_AKI_STORY_PORTRAIT_BINDING : S0_TSUKIOKA_STORY_PORTRAIT_BINDING;
    return [url(story.dayId === 'S0' ? STORY_BACKGROUND_ASSET_IDS.S0 : STORY_BACKGROUND_ASSET_IDS.DEFAULT), url(portrait.requiredAssetId)];
  }
  if (targetMode === 'epilogue') {
    const pages = dayId === 'D6' ? D6_EPILOGUE_PAGES : dayId === 'D5' ? D5_EPILOGUE_PAGES : D4_EPILOGUE_PAGES;
    return [url(pages[epilogueIndex].illustrationAssetId ?? STORY_BACKGROUND_ASSET_IDS.DEFAULT)];
  }
  return [];
}

function prefetchNextPresentation() {
  let next = null;
  if (mode === 's0') next = s0Index + 1 < S0_INTERACTIONS.length
    ? { targetS0:s0Index + 1 } : { targetMode:'story', targetStory:0, targetLine:0 };
  else if (mode === 'story' && storyIndex + 1 < STORY_SCENES.length) next = { targetStory:storyIndex + 1, targetLine:0 };
  if (next) {
    try { void sceneImages.prepare(requiredPresentationUrls(next)).catch(() => {}); } catch { /* 다음 장면에서 복구 안내 */ }
  }
}

async function render() {
  presentationBusy = true;
  const keyboardFocus = returnFocusToAction || actions.contains(document.activeElement);
  returnFocusToAction = false;
  actions.inert = true;
  document.querySelector('#scenario-app').setAttribute('aria-busy', 'true');
  const status = document.querySelector('#scene-status');
  status.hidden = true;
  const delayedStatus = setTimeout(() => {
    status.textContent = '다음 장면을 준비하고 있어요…'; status.hidden = false;
  }, 250);
  try {
    await sceneImages.prepare(requiredPresentationUrls());
    renderCurrentPresentation();
    finishPageEntry();
    prefetchNextPresentation();
  } catch (error) {
    if (document.body.dataset.entryState !== 'ready') failPageEntry(error);
    else {
      status.textContent = `${error.message} 이전 장면은 그대로 두었습니다.`;
      actions.replaceChildren(button('장면 다시 불러오기', render, true), button('시작 화면으로', () => window.location.assign('./public-shell.html')));
    }
  } finally {
    clearTimeout(delayedStatus);
    presentationBusy = false;
    actions.inert = false;
    if (keyboardFocus) actions.querySelector('.primary')?.focus({ preventScroll:true });
    document.querySelector('#scenario-app').setAttribute('aria-busy', 'false');
    status.hidden = !actions.textContent.includes('장면 다시 불러오기');
  }
}

const scenarioMenu = document.querySelector('#scenario-menu-dialog');
document.querySelector('#scenario-menu').addEventListener('click', () => scenarioMenu.showModal());
document.querySelector('#scenario-menu-close').addEventListener('click', () => scenarioMenu.close());
document.addEventListener('keydown', event => {
  if (scenarioMenu.open || document.body.dataset.entryState !== 'ready') return;
  if (!['Enter', ' '].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.repeat || presentationBusy || actionBusy) { event.preventDefault(); return; }
  if (event.target.closest('button, a, input, summary')) return;
  if (!['s0', 'story', 'epilogue'].includes(mode)) return;
  event.preventDefault(); actions.querySelector('.primary')?.click();
});

async function initialize() {
  await Promise.all([loadRuntimeAssets(), loadGrillSlotConfig(), loadPresentationSettings()]);
  campaignBridge = new S0D3CampaignBridge({ browserStorage: window.localStorage });
  const params = new URLSearchParams(window.location.search);
  const forceNew = params.get('new') === '1';
  if (forceNew) clearFirstOrderRuntime(window.localStorage);
  const loaded = await campaignBridge.loadOrStart({ forceNew });
  if (!loaded.ok) {
    renderCampaignError(new Error(loaded.error.message));
    return;
  }
  restorePresentationPosition(campaignBridge.getPosition(), { postDayId: params.get('post') });
  await render();
}

try { await initialize(); } catch (error) { failPageEntry(error); }
// BFCache의 영업 시작 직전 DOM/저장 상태를 재사용하지 않는다.
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
window.__s0d3Debug = {
  getState: () => ({ mode, s0Index, storyIndex, lineIndex, dayId, epilogueIndex }),
  campaignState: () => campaignBridge?.getState() ?? null,
  grillUpgradeState: () => grillSlotConfig
    ? campaignBridge?.getGrillSlotUpgradeState(grillSlotConfig) ?? null
    : null,
  contentErrors: errors,
};
