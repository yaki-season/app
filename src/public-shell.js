import {
  CampaignSaveRepository,
  DiagnosticsRepository,
  PERSISTENCE_ERROR_CODE,
  SAVE_STORAGE_KEYS,
  SettingsRepository,
  createSaveFilePort,
  validateCampaignState,
} from './campaign-runtime.js';
import {
  S0_D3_CONTENT_VERSION,
  createS0D3CampaignDefinition,
  createS0D3StoragePort,
} from './scenario/s0-d3-campaign.js';
import {
  DEFAULT_PUBLIC_SETTINGS,
  buildSafeDiagnostic,
  isD4PreviewSave,
  saveSummary,
  serializeSafeDiagnostic,
  validatePublicSettings,
} from './public-shell/publicShellContract.js';
import {
  downloadTextFile,
  readTextFile,
} from './public-shell/browserFiles.js';
import { createPublicShellDialogs } from './public-shell/publicShellDialogs.js';
import {
  indexApprovedRuntimeAssets,
  resolveApprovedRuntimeAsset,
  runtimeAssetUrl,
} from './assets/runtimeAssetResolver.js';

// UI-003 SCR-SYS-START의 start.scene은 "가게 외관 또는 간결한 브랜드 배경"이고 프롤로그 외관
// 재사용을 허용한다. 전용 브랜드 아트(BR-LOGO-*)는 아직 미제작이라 승인된 S0 폐점 외관을 쓴다.
// 파일명이 아니라 manifest stable ID로 연결한다.
const START_SCENE_ASSET_ID = 'BG-EXTERIOR-S0-CLOSED';

const SCREEN = Object.freeze({
  START: 'SCR-SYS-START',
  RECOVERY: 'SCR-SYS-RECOVERY',
  D4_PREVIEW: 'SCR-SYS-D4-PREVIEW',
});

const screen = document.querySelector('#shell-screen');
const shell = document.querySelector('#public-shell');
const fileInput = document.querySelector('#save-file-input');

let storagePort;
let savePort;
let settingsRepository;
let diagnosticsRepository;
let loadResult;
let settings = { ...DEFAULT_PUBLIC_SETTINGS };
let currentScreenId = SCREEN.START;
let lastDiagnostic = buildSafeDiagnostic();
let lastOperation = 'booting';
let d4Before = null;
let d4Invariant = null;
let shellDialogs;

function element(tag, {
  className,
  text,
  attributes = {},
} = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) node.setAttribute(name, String(value));
  }
  return node;
}

function actionButton(label, handler, {
  primary = false,
  disabled = false,
  id,
} = {}) {
  const button = element('button', {
    className: primary ? 'primary' : '',
    text: label,
    attributes: { type: 'button', id },
  });
  button.disabled = disabled;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await handler();
    } catch (error) {
      await showRecovery(error, { preserveMessage: '현재 저장과 설정을 변경하지 않았습니다.' });
    } finally {
      if (button.isConnected) button.disabled = disabled;
    }
  });
  return button;
}

function setScreen(id) {
  currentScreenId = id;
  document.body.dataset.screenId = id;
  screen.dataset.screenId = id;
  screen.replaceChildren();
}

function applySettings() {
  document.body.dataset.largeHitArea = String(settings.largeHitArea);
  document.body.dataset.highContrast = String(settings.highContrast);
  document.body.dataset.reducedMotion = String(settings.reducedMotion);
}

function operationStatus(className, title, text) {
  const card = element('div', { className: `status-card ${className}` });
  card.append(
    element('strong', { text: title }),
    element('p', { text }),
  );
  return card;
}

function currentSaveState() {
  if (loadResult?.ok) return 'available';
  if (loadResult?.error?.code === PERSISTENCE_ERROR_CODE.SAVE_MISSING) return 'missing';
  return 'invalid';
}

async function recordDiagnostic(error) {
  lastDiagnostic = buildSafeDiagnostic({
    error,
    screenId: currentScreenId,
    saveState: currentSaveState(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
  });
  await diagnosticsRepository?.record(error);
  return lastDiagnostic;
}

function diagnosticText() {
  lastDiagnostic = buildSafeDiagnostic({
    error: loadResult?.ok ? null : loadResult?.error,
    screenId: currentScreenId,
    saveState: currentSaveState(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
  });
  return serializeSafeDiagnostic(lastDiagnostic);
}

function navigateToScenario({ forceNew = false } = {}) {
  const target = new URL('./s0-d3.html', import.meta.url);
  if (forceNew) target.searchParams.set('new', '1');
  window.location.assign(target);
}

function requestNewGame() {
  if (currentSaveState() === 'missing') {
    navigateToScenario({ forceNew: true });
    return;
  }
  shellDialogs.open({
    overlayId: 'OVR-CONFIRM',
    kicker: '새 게임 확인',
    title: '새 캠페인을 시작할까요?',
    content: [
      element('p', { text: '현재 저장은 새 캠페인의 첫 정상 체크포인트가 만들어질 때 백업된 뒤 교체됩니다.' }),
      element('p', { className: 'warning', text: '확인 전에는 기존 저장을 변경하지 않습니다.' }),
    ],
    actions: [
      actionButton('취소', shellDialogs.close),
      actionButton('새 게임 시작', () => navigateToScenario({ forceNew: true }), { primary: true }),
    ],
  });
}

async function downloadSave() {
  const exported = await savePort.exportFile();
  if (!exported.ok) {
    await recordDiagnostic(exported.error);
    await showRecovery(exported.error, { preserveMessage: '활성 저장을 변경하지 않았습니다.' });
    return;
  }
  downloadTextFile(exported.value);
  lastOperation = 'save-exported';
  renderStart(operationStatus('success', '저장 파일 다운로드 준비 완료', '검증된 활성 저장만 JSON 파일로 내려받았습니다.'));
}

function importButton() {
  return actionButton('저장 파일 불러오기', () => fileInput.click());
}

function summaryDefinition(summary) {
  const list = element('dl', { className: 'summary-list' });
  for (const [term, value] of [
    ['진행 위치', summary.dayLabel],
    ['체크포인트', summary.checkpointType],
    ['완료 날짜', summary.completedDayId ?? '없음'],
    ['저장 시각', summary.writtenAt],
  ]) {
    list.append(element('dt', { text: term }), element('dd', { text: value }));
  }
  return list;
}

function renderStart(extraStatus = null) {
  setScreen(SCREEN.START);
  const valid = Boolean(loadResult?.ok);
  const missing = loadResult?.error?.code === PERSISTENCE_ERROR_CODE.SAVE_MISSING;
  const summary = saveSummary(loadResult);
  const intro = element('div');
  intro.append(
    element('p', { className: 'eyebrow', text: '아사노 아키의 작은 야키토리 가게' }),
    element('h1', { text: 'YAKI SEASON' }),
    element('p', {
      className: 'lead',
      text: '남겨진 열쇠로 문을 열고, 숯을 피워 하루의 가게를 이어갑니다.',
    }),
  );
  if (extraStatus) intro.append(extraStatus);
  else if (valid) {
    const card = operationStatus('success', '이어할 저장이 있습니다', `${summary.dayLabel} · ${summary.checkpointType}`);
    card.append(summaryDefinition(summary));
    intro.append(card);
  } else if (missing) {
    intro.append(operationStatus('warning', '첫 캠페인을 시작할 수 있습니다', '이 브라우저에는 이어할 저장이 없습니다.'));
  } else {
    intro.append(operationStatus('error', '저장 복구가 필요합니다', loadResult?.error?.message ?? '저장 상태를 읽지 못했습니다.'));
  }

  const menu = element('nav', {
    className: 'menu',
    attributes: { 'aria-label': '시작 메뉴' },
  });
  menu.append(
    actionButton('새 게임', requestNewGame, { primary: !valid, id: 'new-game-button' }),
    actionButton('이어하기', () => navigateToScenario(), {
      disabled: !valid,
      primary: valid,
      id: 'continue-button',
    }),
  );
  if (!valid && !missing) {
    menu.append(actionButton('저장 복구', () => showRecovery(loadResult.error), {
      primary: true,
      id: 'recovery-button',
    }));
  }
  menu.append(
    actionButton('설정', () => shellDialogs.openSettings('start')),
    actionButton('도움', shellDialogs.openHelp),
    actionButton('일시정지', shellDialogs.openPause),
    actionButton('저장 파일 다운로드', downloadSave, { disabled: !valid, id: 'export-save-button' }),
    importButton(),
    actionButton('진단 정보', shellDialogs.openDiagnostics),
    actionButton('D4 개발 예고', requestD4Preview, {
      disabled: !isD4PreviewSave(loadResult),
      id: 'd4-preview-button',
    }),
  );
  const grid = element('div', { className: 'screen-grid' });
  grid.append(intro, menu);
  screen.append(grid);
  screen.focus({ preventScroll: true });
}

async function restoreBackup(slot) {
  const restored = await savePort.restoreBackup(slot);
  if (!restored.ok) {
    await recordDiagnostic(restored.error);
    await showRecovery(restored.error, { preserveMessage: '손상 저장을 덮어쓰지 않았습니다.' });
    return;
  }
  lastOperation = `backup-restored:${slot}`;
  await refreshLoadResult();
  renderStart(operationStatus('success', '백업 복구 완료', '검증된 백업을 활성 저장으로 복원했습니다. 기존 손상 원본은 복구 원본 영역에 보존했습니다.'));
}

async function showRecovery(error, {
  preserveMessage = '현재 활성 저장과 설정은 자동으로 변경하지 않았습니다.',
} = {}) {
  setScreen(SCREEN.RECOVERY);
  await recordDiagnostic(error);
  const article = element('article');
  article.append(
    element('p', { className: 'eyebrow', text: '저장 복구' }),
    element('h1', { text: '안전하게 복구하기' }),
    element('p', { className: 'error', text: error?.message ?? '저장 작업을 완료하지 못했습니다.' }),
    element('p', { className: 'notice', text: preserveMessage }),
  );
  const candidates = error?.details?.recoveryCandidates ?? [];
  if (candidates.length > 0) {
    article.append(element('h2', { text: '검증된 백업' }));
    for (const candidate of candidates) {
      const card = element('div', { className: 'summary-card' });
      card.append(
        element('strong', { text: candidate.slot }),
        element('p', { text: `${candidate.checkpointType} · ${candidate.completedDayId ?? '시작 전'}` }),
        actionButton(`${candidate.slot} 복원`, () => restoreBackup(candidate.slot), { primary: candidate.slot === 'backup-1' }),
      );
      article.append(card);
    }
  }
  const actions = element('nav', { className: 'menu', attributes: { 'aria-label': '복구 행동' } });
  actions.append(
    actionButton('다시 확인', async () => {
      await refreshLoadResult();
      if (loadResult.ok || loadResult.error.code === PERSISTENCE_ERROR_CODE.SAVE_MISSING) renderStart();
      else showRecovery(loadResult.error);
    }),
    importButton(),
    actionButton('진단 정보', shellDialogs.openDiagnostics),
    actionButton('새 게임', requestNewGame),
    actionButton('시작 화면으로', () => renderStart()),
  );
  const grid = element('div', { className: 'screen-grid' });
  grid.append(article, actions);
  screen.append(grid);
  screen.focus({ preventScroll: true });
}

function renderImportReview(validation, text) {
  setScreen(SCREEN.RECOVERY);
  const summary = validation.value.summary;
  const article = element('article');
  article.append(
    element('p', { className: 'eyebrow', text: '저장 파일 검증' }),
    element('h1', { text: '호환 저장 확인' }),
    element('p', { className: 'read-only-mark', text: '검증 완료 · 아직 교체하지 않음' }),
    summaryDefinition({
      dayLabel: summary.completedDayId?.toUpperCase() ?? '시작 전',
      checkpointType: summary.checkpointType,
      completedDayId: summary.completedDayId,
      writtenAt: summary.writtenAt,
    }),
  );
  const actions = element('nav', { className: 'menu', attributes: { 'aria-label': '저장 교체 확인' } });
  actions.append(
    actionButton('취소', () => renderStart()),
    actionButton('검증된 저장으로 교체', async () => {
      const imported = await savePort.importFile(text);
      if (!imported.ok) {
        await showRecovery(imported.error, { preserveMessage: '기존 정상 저장은 그대로 유지했습니다.' });
        return;
      }
      lastOperation = 'save-imported-with-backup';
      await refreshLoadResult();
      renderStart(operationStatus('success', '저장 교체 완료', '기존 정상 저장을 backup-1로 보존한 뒤 검증된 파일을 활성화했습니다.'));
    }, { primary: true, id: 'confirm-import-button' }),
  );
  const grid = element('div', { className: 'screen-grid' });
  grid.append(article, actions);
  screen.append(grid);
  screen.focus({ preventScroll: true });
}

async function handleSelectedFile(file) {
  let text;
  try {
    text = await readTextFile(file);
  } catch (error) {
    error.code = 'FILE_READ_REJECTED';
    await showRecovery(error, { preserveMessage: '파일을 읽기 전에 기존 저장을 그대로 보존했습니다.' });
    return;
  }
  const validation = await savePort.validateImportFile(text);
  if (!validation.ok) {
    lastOperation = `save-import-rejected:${validation.error.code}`;
    await showRecovery(validation.error, { preserveMessage: '비호환 파일을 거부했으며 기존 저장과 백업은 변경하지 않았습니다.' });
    return;
  }
  lastOperation = 'save-import-validated';
  renderImportReview(validation, text);
}

async function storageSnapshot() {
  const entries = await Promise.all([
    SAVE_STORAGE_KEYS.ACTIVE,
    SAVE_STORAGE_KEYS.BACKUP_1,
    SAVE_STORAGE_KEYS.BACKUP_2,
    SAVE_STORAGE_KEYS.RECOVERY_SOURCE,
  ].map(async (key) => [key, await storagePort.get(key)]));
  return Object.fromEntries(entries);
}

function requestD4Preview() {
  if (!isD4PreviewSave(loadResult)) return;
  shellDialogs.open({
    overlayId: 'OVR-CONFIRM',
    kicker: '개발 중 콘텐츠',
    title: 'D4 예고를 열까요?',
    content: [
      element('p', { text: '이 화면은 읽기 전용입니다. 주문·조리·보상·저장을 변경하지 않습니다.' }),
      element('p', { className: 'warning', text: '실제 D4 gameplay는 아직 제공하지 않습니다.' }),
    ],
    actions: [
      actionButton('취소', shellDialogs.close),
      actionButton('읽기 전용 예고 열기', async () => {
        shellDialogs.close();
        d4Before = await storageSnapshot();
        d4Invariant = null;
        renderD4Preview();
      }, { primary: true }),
    ],
  });
}

function renderD4Preview() {
  setScreen(SCREEN.D4_PREVIEW);
  const article = element('article');
  article.append(
    element('span', { className: 'development-label', text: '개발 중' }),
    element('p', { className: 'eyebrow', text: 'D4 · READ-ONLY PREVIEW' }),
    element('h1', { text: '다음 영업의 징후' }),
    element('p', { className: 'lead', text: '가게의 흐름이 넓어지고, 새로운 즉시 제공 동선이 열릴 예정입니다.' }),
    element('p', { className: 'read-only-mark', text: '읽기 전용 · gameplay 0 · 보상 0 · 저장 write 0' }),
  );
  const details = element('div', { className: 'summary-card' });
  details.append(
    element('h2', { text: '예고 범위' }),
    element('p', { text: '화면 구조와 다음 목표만 안내합니다. 수치, 주문, 해금 소유권은 확정하거나 변경하지 않습니다.' }),
  );
  const actions = element('nav', { className: 'menu', attributes: { 'aria-label': 'D4 예고 행동' } });
  actions.append(actionButton('시작 화면으로 돌아가기', async () => {
    const after = await storageSnapshot();
    d4Invariant = JSON.stringify(d4Before) === JSON.stringify(after);
    lastOperation = d4Invariant ? 'd4-read-only-preserved' : 'd4-invariant-failed';
    await refreshLoadResult();
    renderStart(operationStatus(
      d4Invariant ? 'success' : 'error',
      d4Invariant ? 'D4 예고 종료 · 저장 불변' : 'D4 예고 저장 불변식 오류',
      d4Invariant ? '예고 전후 활성 저장·백업·복구 원본이 모두 같습니다.' : '진단 정보를 확인해 주세요.',
    ));
  }, { primary: true }));
  const grid = element('div', { className: 'screen-grid' });
  grid.append(article, details, actions);
  screen.append(grid);
  screen.focus({ preventScroll: true });
}

async function refreshLoadResult() {
  loadResult = await savePort.loadForContinue();
  return loadResult;
}

// 시작 화면 배경을 승인 manifest에서 해석해 CSS 변수로 넘긴다. 셸 부팅을 막으면 안 되므로
// 실패는 조용히 삼킨다 — 변수가 없으면 CSS가 기본 그라데이션을 그대로 쓴다.
async function applyStartSceneBackground(fetchImpl = globalThis.fetch) {
  try {
    // /src/ 아래에서 열리면 /public/assets/… 로 해석된다(정션에 의존하지 않는다).
    const response = await fetchImpl(runtimeAssetUrl('/assets/manifest.json'));
    if (!response.ok) return null;
    const asset = resolveApprovedRuntimeAsset(
      indexApprovedRuntimeAssets(await response.json()),
      START_SCENE_ASSET_ID,
    );
    if (!asset) return null;
    document.body.style.setProperty('--start-scene', `url("${asset.url}")`);
    document.body.dataset.startSceneAssetId = asset.id;
    return asset;
  } catch {
    return null;
  }
}

export async function bootPublicShell() {
  void applyStartSceneBackground();
  const definition = createS0D3CampaignDefinition();
  storagePort = createS0D3StoragePort(window.localStorage);
  const repository = new CampaignSaveRepository({
    storage: storagePort,
    validatePayload: (payload) => validateCampaignState(payload, definition),
    acceptsContentVersion: (version) => version === S0_D3_CONTENT_VERSION,
  });
  savePort = createSaveFilePort(repository);
  settingsRepository = new SettingsRepository({
    storage: storagePort,
    validate: validatePublicSettings,
  });
  diagnosticsRepository = new DiagnosticsRepository({ storage: storagePort });
  shellDialogs = createPublicShellDialogs({
    element,
    actionButton,
    settingsRepository,
    getSettings: () => settings,
    setSettings: (next) => {
      settings = { ...next };
      applySettings();
    },
    getDiagnosticText: diagnosticText,
    onOperation: (operation) => {
      lastOperation = operation;
    },
  });

  const loadedSettings = await settingsRepository.load(DEFAULT_PUBLIC_SETTINGS);
  if (loadedSettings.ok) settings = { ...loadedSettings.value };
  else {
    settings = { ...DEFAULT_PUBLIC_SETTINGS };
    await recordDiagnostic(loadedSettings.error);
  }
  applySettings();
  await refreshLoadResult();

  document.querySelector('#pause-button').addEventListener('click', shellDialogs.openPause);
  document.querySelector('#refresh-button').addEventListener('click', () => window.location.reload());
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files;
    fileInput.value = '';
    if (file) await handleSelectedFile(file);
  });
  renderStart();
  shell.setAttribute('aria-busy', 'false');
  lastOperation = 'ready';
  window.__publicShellDebug = Object.freeze({
    getState: () => ({
      screenId: currentScreenId,
      overlayId: document.body.dataset.overlayId ?? null,
      saveState: currentSaveState(),
      lastOperation,
      d4Invariant,
      settings: { ...settings },
    }),
    refresh: async () => {
      await refreshLoadResult();
      renderStart();
    },
  });
}
