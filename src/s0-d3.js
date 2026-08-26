import {
  D4_EPILOGUE_PAGES,
  FIXED_CHARACTER,
  S0_D4_STORY_SCENES,
  S0_INTERACTIONS,
  speakerById,
  validateS0D4Content,
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
import { S0_D3_STORY_ILLUSTRATION_BY_SCENE_KEY } from './assets/s0D3StoryIllustrationBindingContract.js';
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

const errors = validateS0D4Content();
errors.push(...validateS0ExteriorBackgroundBindingContract());
if (errors.length) throw new Error(`S0~D4 콘텐츠 오류:\n${errors.join('\n')}`);

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
let grillSlotConfig = null;
let grillSlotConfigError = null;
let dayPrepFeedback = '';
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
function storyIllustrationBinding(activeDayId, dialogueId) {
  if (activeDayId === 'S0') return S0_D3_STORY_ILLUSTRATION_BY_SCENE_KEY.S0;
  const timing = dialogueId?.includes('-POST-') ? 'POST' : 'PRE';
  return S0_D3_STORY_ILLUSTRATION_BY_SCENE_KEY[`${activeDayId}-${timing}`];
}

function hideStoryIllustration() {
  storyIllustration.hidden = true;
  storyIllustration.removeAttribute('src');
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

async function loadGrillSlotConfig() {
  try {
    const response = await fetch('/content/progression/grill-slots.json');
    if (!response.ok) throw new Error(`그릴 업그레이드 데이터 응답 오류: ${response.status}`);
    grillSlotConfig = await response.json();
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
  const story = S0_D4_STORY_SCENES[storyIndex];
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
    'D3-pre-open': '셋째 날, 타레 메뉴 추가',
    'D3-post-settlement': '셋째 날 영업을 마치고',
    'D4-pre-open': '넷째 날, 사라다와 하이볼 추가',
    'D4-post-settlement': '넷째 날 영업을 마치고',
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
  const dayStartLabels = {
    D1: '첫 손님 맞이하기',
    D2: '둘째 영업 시작',
    D3: '셋째 영업 시작',
    D4: '영업 준비',
  };
  const nextLabel = lastLine && story.timing === 'pre-open'
    ? dayStartLabels[story.dayId]
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
    if (story.dayId === 'D4') {
      dayPrepFeedback = '';
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
  heading.textContent = '넷째 날 영업 준비';
  hideStoryPortrait();
  hideStoryIllustration();
  renderStoryBackground('D4');
  setIds({
    screen: 'SCR-DAY-BRIEFING',
    state: 'D4-pre-open-upgrade',
    scene: 'SCN-D4-DAY-PREP',
    dialogue: 'none',
  });

  const campaignState = campaignBridge.getState();
  const reputation = campaignState.economy.reputation;
  const claimedSlots = campaignState.progression.claimedGrillSlots;
  const tier = grillSlotConfig?.tiers?.find((item) => item.slots === 3) ?? null;
  const upgrade = grillSlotConfig
    ? campaignBridge.getGrillSlotUpgradeState(grillSlotConfig)
    : null;
  const alreadyClaimed = claimedSlots >= 3;
  const cardState = grillSlotConfigError
    ? 'unavailable'
    : alreadyClaimed
      ? 'claimed'
      : upgrade?.pending
        ? 'claimable'
        : 'locked';

  const article = document.createElement('article');
  article.className = 'day-prep-card';
  article.dataset.testid = 'd4-grill-upgrade-card';
  article.dataset.upgradeState = cardState;

  const copy = document.createElement('div');
  copy.className = 'day-prep-copy';
  copy.innerHTML = `
    <p class="day-prep-kicker">명성 업그레이드</p>
    <h2>그릴 한 칸 확장</h2>
    <p>동시에 구울 수 있는 꼬치가 두 개에서 세 개로 늘어납니다.</p>
    <p class="day-prep-no-spend">명성과 골드는 조건 확인에만 사용되며 차감되지 않습니다.</p>
  `;

  const details = document.createElement('div');
  details.className = 'day-prep-details';
  details.innerHTML = `
    <div class="grill-slot-flow" aria-label="그릴 칸 2개에서 3개로 확장">
      <strong data-testid="d4-grill-current-slots">${claimedSlots}칸</strong>
      <span aria-hidden="true">→</span>
      <strong>${alreadyClaimed ? claimedSlots : tier?.slots ?? 3}칸</strong>
    </div>
    <dl class="upgrade-requirements">
      <div><dt>현재 명성</dt><dd data-testid="d4-current-reputation">${reputation}</dd></div>
      <div><dt>필요 명성</dt><dd data-testid="d4-required-reputation">${tier?.reputation ?? 10}</dd></div>
    </dl>
  `;

  const status = document.createElement('p');
  status.className = 'day-prep-status';
  status.dataset.testid = 'd4-grill-upgrade-status';
  status.setAttribute('role', 'status');
  if (dayPrepFeedback) status.textContent = dayPrepFeedback;
  else if (grillSlotConfigError) {
    status.textContent = '업그레이드 정보를 불러오지 못했습니다. 현재 칸으로 영업을 시작할 수 있습니다.';
  } else if (alreadyClaimed) status.textContent = '그릴 3칸 확장이 적용되었습니다.';
  else if (upgrade?.pending) status.textContent = '지금 확장할 수 있습니다.';
  else if (upgrade?.blockedBy === 'reputation') {
    status.textContent = `명성 ${Math.max(0, (upgrade.requiredReputation ?? 10) - reputation)}이 더 필요합니다.`;
  } else if (upgrade?.blockedBy === 'unlock') {
    status.textContent = '넷째 날 해금 조건을 먼저 완료해야 합니다.';
  } else status.textContent = '현재 적용할 수 있는 확장이 없습니다.';

  article.append(copy, details, status);
  content.replaceChildren(article);

  const claimButton = button('3칸 확장 적용', async () => {
    const result = await campaignBridge.claimGrillSlots(grillSlotConfig);
    if (!result.ok) {
      dayPrepFeedback = `저장하지 못했습니다. 확장은 적용되지 않았습니다. ${result.error?.message ?? ''}`.trim();
    } else if (result.applied) {
      dayPrepFeedback = '그릴을 3칸으로 확장했습니다. 명성과 골드는 그대로입니다.';
    } else {
      dayPrepFeedback = '현재는 확장을 적용할 수 없습니다.';
    }
    renderDayPrep();
  }, true);
  claimButton.dataset.testid = 'd4-claim-grill-upgrade';
  claimButton.disabled = !upgrade?.pending;

  const startButton = button(`${claimedSlots}칸으로 넷째 영업 시작`, async () => {
    const started = await campaignBridge.startDay();
    if (!started.ok) {
      dayPrepFeedback = `영업 시작 상태를 저장하지 못했습니다. ${started.error?.message ?? ''}`.trim();
      renderDayPrep();
      return;
    }
    navigateToBusinessDay('D4');
  });
  startButton.dataset.testid = 'd4-start-business-day';
  actions.replaceChildren(claimButton, startButton);
}

function renderSummary() {
  const story = S0_D4_STORY_SCENES[storyIndex];
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
  const page = D4_EPILOGUE_PAGES[epilogueIndex];
  heading.textContent = '넷째 날 마감 후';
  hideStoryPortrait();
  hideStoryIllustration();
  renderStoryBackground('D4');
  setIds({
    screen: 'SCR-POST-EPILOGUE',
    state: `D4-epilogue-${epilogueIndex + 1}`,
    scene: 'SCN-D4-EPILOGUE',
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
  progress.textContent = `${epilogueIndex + 1} / ${D4_EPILOGUE_PAGES.length}`;
  article.append(progress);
  content.replaceChildren(article);

  const epilogueActions = [];
  if (epilogueIndex > 0) {
    epilogueActions.push(button('이전 장면', () => {
      epilogueIndex -= 1;
      render();
    }));
  }
  const lastPage = epilogueIndex === D4_EPILOGUE_PAGES.length - 1;
  epilogueActions.push(button(lastPage ? 'D5 영업으로' : '다음 장면', () => {
    if (lastPage) {
      navigateToBusinessDay('D5');
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
    const postIndex = S0_D4_STORY_SCENES.findIndex((story) => (
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
    dayId = 'D4';
    epilogueIndex = 0;
    return;
  }
  dayId = position.dayId;
  storyIndex = S0_D4_STORY_SCENES.findIndex((story) => (
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
  else if (mode === 'day-prep') renderDayPrep();
  else renderEpilogue();
}

async function initialize() {
  await Promise.all([loadRuntimeAssets(), loadGrillSlotConfig()]);
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
  grillUpgradeState: () => grillSlotConfig
    ? campaignBridge?.getGrillSlotUpgradeState(grillSlotConfig) ?? null
    : null,
  contentErrors: errors,
};
