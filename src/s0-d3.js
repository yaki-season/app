import {
  D3_EPILOGUE_PAGES,
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
import { installGameAudio, loopOn, setBgm, sfx } from './audio/gameAudio.js';

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

const errors = validateS0D3Content();
errors.push(...validateS0ExteriorBackgroundBindingContract());
if (errors.length) throw new Error(`S0~D3 콘텐츠 오류:\n${errors.join('\n')}`);

const heading = document.querySelector('#screen-heading');
const storyPortrait = document.querySelector('#story-portrait');
const storyIllustration = document.querySelector('#story-illustration');
const storyBackground = document.querySelector('#story-background');
const content = document.querySelector('#content-panel');
const actions = document.querySelector('#actions');
const visualPlaceholder = document.querySelector('#visual-placeholder');
const s0ArtCamera = document.querySelector('#s0-art-camera');
const exteriorBackground = document.querySelector('#s0-exterior-background');
const interactionVisual = document.querySelector('#s0-interaction-visual');

let mode = 's0';
let s0Index = 0;
let storyIndex = 0;
let lineIndex = 0;
let returnMode = null;
let dayId = 'S0';
let epilogueIndex = 0;
let campaignBridge = null;
let approvedRuntimeAssets = new Map();
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
const S0_STORY_ILLUSTRATION_ASSET_ID = 'IL-S0-AKI-REOPENED-SHOP';
const STORY_ILLUSTRATION_BY_DIALOGUE_ID = Object.freeze({
  'DLG-D1-PRE-001': Object.freeze({
    assetId: 'IL-D1-PREOPEN-AKI',
    alt: '영업을 앞두고 첫 손님을 기다리는 아사노 아키',
  }),
  'DLG-D1-PRE-002': Object.freeze({
    assetId: 'IL-D1-PREOPEN-TSUKIOKA',
    alt: '다시 문을 연 가게를 찾아온 츠키오카 세이지',
  }),
  'DLG-D1-PRE-003': Object.freeze({
    assetId: 'IL-D1-PREOPEN-AKI',
    alt: '첫 손님을 위해 정성껏 준비하는 아사노 아키',
  }),
});

function hideStoryIllustration() {
  storyIllustration.hidden = true;
  storyIllustration.removeAttribute('src');
  delete document.body.dataset.storyIllustrationAssetId;
}

function renderStoryIllustration(activeDayId, dialogueId) {
  const binding = activeDayId === 'S0'
    ? { assetId: S0_STORY_ILLUSTRATION_ASSET_ID, alt: '비 갠 밤, 다시 연 가게 앞에 선 아사노 아키' }
    : STORY_ILLUSTRATION_BY_DIALOGUE_ID[dialogueId];
  if (!binding) {
    hideStoryIllustration();
    return false;
  }
  const asset = resolveApprovedRuntimeAsset(approvedRuntimeAssets, binding.assetId);
  if (!asset) {
    hideStoryIllustration();
    return false;
  }
  storyIllustration.src = asset.url;
  storyIllustration.alt = binding.alt;
  storyIllustration.hidden = false;
  document.body.dataset.storyIllustrationAssetId = asset.id;
  return true;
}

function hideStoryBackground() {
  storyBackground.hidden = true;
  storyBackground.removeAttribute('src');
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
  storyBackground.src = asset.url;
  storyBackground.dataset.requiredAssetId = asset.id;
  storyBackground.alt = activeDayId === 'S0' ? '비 갠 밤의 가게 외관' : '밤의 야키토리 가게 내부';
  storyBackground.hidden = false;
  document.body.dataset.storyBackgroundAssetId = asset.id;
}

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
    visualPlaceholder.dataset.assetMode = 'placeholder';
    return;
  }
  storyPortrait.src = asset.url;
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
    exteriorBackground.removeAttribute('src');
    interactionVisual.hidden = true;
    interactionVisual.removeAttribute('src');
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
    : '열쇠를 쥔 손이 차가웠다. 한 번 숨을 고르고 돌리자, 오래 닫혀 있던 문이 뻑뻑한 소리를 내며 열렸다.';
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
  const story = S0_D3_STORY_SCENES[storyIndex];
  const line = story.lines[lineIndex];
  const speaker = speakerById(line.speakerId);
  syncStoryAudio(line.dialogueId);
  dayId = story.dayId;
  const storyHeadings = {
    S0: '다시 불을 켜는 밤',
    'D1-pre-open': '첫날, 문을 열기 전에',
    'D1-post-settlement': '첫날의 불을 끄며',
    'D2-pre-open': '둘째 날, 조금 익숙해진 손',
    'D2-post-settlement': '둘째 날의 문을 닫으며',
    'D3-pre-open': '셋째 날, 가게에 밴 온기',
    'D3-post-settlement': '셋째 날의 불빛',
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
  exteriorBackground.removeAttribute('src');
  interactionVisual.hidden = true;
  interactionVisual.removeAttribute('src');
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
  const nextLabel = lastLine && story.dayId === 'D1' && story.timing === 'pre-open'
    ? '첫 손님 맞이하기'
    : '다음 이야기';
  actions.replaceChildren(
    button('이 장면 건너뛰기', () => { mode = 'summary'; returnMode = 'story'; render(); }),
    button(nextLabel, async () => {
      sfx('SFX-S0-STORY-PAGE');
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
    navigateToBusinessDay(story.dayId);
    return;
  }
  const alreadyCompleted = campaignBridge.getState()?.campaign?.completedDayIds
    ?.includes(story.dayId.toLowerCase());
  if (story.timing === 'post-settlement' && alreadyCompleted) {
    if (story.dayId === 'D3') {
      epilogueIndex = 0;
      mode = 'epilogue';
    }
    else storyIndex += 1;
    return;
  }
  const completed = await campaignBridge.completeDay(story.dayId);
  if (!completed.ok) throw new Error(completed.error.message);
  if (story.dayId === 'D3') {
    epilogueIndex = 0;
    mode = 'epilogue';
  }
  else storyIndex += 1;
}

function renderSummary() {
  const story = S0_D3_STORY_SCENES[storyIndex];
  heading.textContent = '잠시 돌아보며';
  hideStoryPortrait();
  hideStoryIllustration();
  renderStoryBackground(story.dayId);
  setIds({ screen: story.screenId, state: `${story.dayId}-skip-summary`, scene: story.sceneId, dialogue: 'SUMMARY-3-LINES' });
  content.innerHTML = `<ol class="summary">${story.skipSummary.map((line) => `<li>${line}</li>`).join('')}</ol>`;
  actions.replaceChildren(button('이어서', async () => {
    mode = returnMode;
    await advanceAfterStory(story);
    render();
  }, true));
}

function renderBusiness() {
  heading.textContent = '오늘의 영업';
  hideStoryPortrait();
  hideStoryIllustration();
  hideStoryBackground();
  setIds({ screen: 'SCR-SVC-CUSTOMERS', state: `${dayId}-business-placeholder`, scene: 'none', dialogue: 'none' });
  content.innerHTML = '<p class="scene-narration">문을 연 동안 있었던 일들을 천천히 되짚어 본다.</p>';
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
  content.innerHTML = '<p class="scene-narration">불을 낮추고 가게를 정리한다. 숯 향이 밴 하루가 조용히 저물어 간다.</p>';
  actions.replaceChildren(button('정산 후 이야기', () => {
    storyIndex += 1;
    lineIndex = 0;
    mode = 'story';
    render();
  }, true));
}

function navigateToMainScreen() {
  window.location.assign(new URL('./public-shell.html', window.location.href));
}

function renderEpilogue() {
  const page = D3_EPILOGUE_PAGES[epilogueIndex];
  heading.textContent = '사흘째 밤, 남겨 둔 불빛';
  hideStoryPortrait();
  hideStoryIllustration();
  renderStoryBackground('D3');
  setIds({
    screen: 'SCR-POST-EPILOGUE',
    state: `D3-epilogue-${epilogueIndex + 1}`,
    scene: 'SCN-D3-EPILOGUE',
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
  progress.textContent = `${epilogueIndex + 1} / ${D3_EPILOGUE_PAGES.length}`;
  article.append(progress);
  content.replaceChildren(article);

  const epilogueActions = [];
  if (epilogueIndex > 0) {
    epilogueActions.push(button('이전 장면', () => {
      epilogueIndex -= 1;
      render();
    }));
  }
  const lastPage = epilogueIndex === D3_EPILOGUE_PAGES.length - 1;
  epilogueActions.push(button(lastPage ? '메인 화면으로' : '다음 장면', () => {
    if (lastPage) {
      navigateToMainScreen();
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
  actions.replaceChildren();
}

function restorePresentationPosition(position, { postDayId = null } = {}) {
  if (postDayId) {
    const normalizedDayId = postDayId.toUpperCase();
    const alreadyCompleted = campaignBridge.getState()?.campaign?.completedDayIds
      ?.includes(postDayId.toLowerCase());
    const postIndex = S0_D3_STORY_SCENES.findIndex((story) => (
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
    dayId = 'D3';
    epilogueIndex = 0;
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
  else renderEpilogue();
}

async function initialize() {
  await loadRuntimeAssets();
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
  render();
}

await initialize();
window.__s0d3Debug = {
  getState: () => ({ mode, s0Index, storyIndex, lineIndex, dayId, epilogueIndex }),
  campaignState: () => campaignBridge?.getState() ?? null,
  contentErrors: errors,
};
