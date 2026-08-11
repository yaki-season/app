import { expect, test } from '@playwright/test';
import {
  CampaignRuntime,
  CampaignSaveRepository,
  MemoryStorageAdapter,
  SAVE_STORAGE_KEYS,
  sealSaveEnvelope,
  serializeSaveEnvelope,
  validateCampaignState,
} from '../../src/campaign-runtime.js';
import {
  S0_D3_CONTENT_VERSION,
  S0_D3_STORAGE_PREFIX,
  createS0D3CampaignDefinition,
} from '../../src/scenario/s0-d3-campaign.js';

async function makeSave({
  campaignId = 'public-shell-test',
  completedDays = 0,
  balance = 0,
} = {}) {
  const storage = new MemoryStorageAdapter();
  const definition = createS0D3CampaignDefinition();
  let minute = 0;
  const repository = new CampaignSaveRepository({
    storage,
    clock: () => new Date(Date.UTC(2026, 6, 30, 0, minute++)),
    validatePayload: (payload) => validateCampaignState(payload, definition),
    acceptsContentVersion: (version) => version === S0_D3_CONTENT_VERSION,
  });
  const runtime = new CampaignRuntime({ definition, saveRepository: repository });
  runtime.startNewCampaign({
    campaignId,
    contentVersion: S0_D3_CONTENT_VERSION,
    seed: 7,
  });
  runtime.finishPrologue();
  await runtime.startDay();
  for (let day = 1; day <= completedDays; day += 1) {
    runtime.closeDayForSettlement();
    await runtime.completeDay({
      dayId: `d${day}`,
      completionId: `${campaignId}:d${day}`,
      reward: { balance: day === completedDays ? balance : 0 },
    });
    if (day < completedDays) await runtime.startDay();
  }
  return storage.get(SAVE_STORAGE_KEYS.ACTIVE);
}

async function installStorage(page, entries) {
  await page.addInitScript(({ prefix, values }) => {
    localStorage.clear();
    for (const [key, value] of Object.entries(values)) {
      if (value !== null) localStorage.setItem(`${prefix}${key}`, value);
    }
  }, { prefix: S0_D3_STORAGE_PREFIX, values: entries });
}

async function openShell(page) {
  await page.goto('/src/public-shell.html');
  await expect(page.locator('body')).toHaveAttribute('data-screen-id', 'SCR-SYS-START');
}

test('FHD/720 title에서 키보드·마우스로 설정·도움·일시정지를 사용할 수 있다', async ({ page }) => {
  await installStorage(page, {});
  await openShell(page);

  await expect(page.getByRole('button', { name: '이어하기' })).toBeDisabled();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.locator('dialog')).toHaveAttribute('data-overlay-id', 'OVR-SETTINGS');
  await expect(page.locator('dialog')).not.toContainText('오디오 볼륨');
  await page.getByLabel('큰 입력 영역').check();
  await page.getByRole('button', { name: '설정 저장' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-large-hit-area', 'true');

  await page.getByRole('button', { name: '도움', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog')).toHaveAttribute('data-overlay-id', 'OVR-HELP');
  await page.keyboard.press('Escape');

  await page.locator('#pause-button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog')).toHaveAttribute('data-overlay-id', 'OVR-PAUSE');
  await page.getByRole('button', { name: '재개' }).click();

  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    buttons: [...document.querySelectorAll('button')]
      .filter((node) => node.getClientRects().length > 0)
      .every((node) => node.getBoundingClientRect().height >= 44),
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  expect(layout.buttons).toBe(true);
});

test('검증된 저장을 다운로드하고 호환 파일 교체 전 기존 active를 backup-1로 보존한다', async ({ page }) => {
  const existing = await makeSave({ campaignId: 'existing', completedDays: 0 });
  const imported = await makeSave({ campaignId: 'imported', completedDays: 1, balance: 77 });
  await installStorage(page, { [SAVE_STORAGE_KEYS.ACTIVE]: existing });
  await openShell(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '저장 파일 다운로드' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('yaki-season-existing');

  await page.getByRole('button', { name: '저장 파일 불러오기' }).click();
  await page.locator('#save-file-input').setInputFiles({
    name: 'compatible-save.json',
    mimeType: 'application/json',
    buffer: Buffer.from(imported),
  });
  await expect(page.getByText('검증 완료 · 아직 교체하지 않음')).toBeVisible();
  expect(await page.evaluate(
    ({ prefix, key }) => localStorage.getItem(`${prefix}${key}`),
    { prefix: S0_D3_STORAGE_PREFIX, key: SAVE_STORAGE_KEYS.ACTIVE },
  )).toBe(existing);

  await page.getByRole('button', { name: '검증된 저장으로 교체' }).click();
  await expect(page.getByText('저장 교체 완료')).toBeVisible();
  const stored = await page.evaluate(({ prefix, active, backup }) => ({
    active: localStorage.getItem(`${prefix}${active}`),
    backup: localStorage.getItem(`${prefix}${backup}`),
  }), {
    prefix: S0_D3_STORAGE_PREFIX,
    active: SAVE_STORAGE_KEYS.ACTIVE,
    backup: SAVE_STORAGE_KEYS.BACKUP_1,
  });
  expect(stored.active).toBe(imported);
  expect(stored.backup).toBe(existing);
});

test('이어하기는 공개 S0~D3 화면에서 정상 체크포인트를 재개한다', async ({ page }) => {
  const existing = await makeSave({ campaignId: 'continue-reader' });
  await installStorage(page, { [SAVE_STORAGE_KEYS.ACTIVE]: existing });
  await openShell(page);

  await page.getByRole('button', { name: '이어하기' }).click();
  await expect(page).toHaveURL(/\/src\/s0-d3\.html$/);
  await expect(page.locator('body')).toHaveAttribute('data-screen-id', 'SCR-STORY-BEAT');
  expect(await page.evaluate(
    ({ prefix, key }) => localStorage.getItem(`${prefix}${key}`),
    { prefix: S0_D3_STORAGE_PREFIX, key: SAVE_STORAGE_KEYS.ACTIVE },
  )).toBe(existing);
});

test('기존 저장의 새 게임은 확인 뒤 force-new로 열고 첫 체크포인트 전에는 원본을 보존한다', async ({ page }) => {
  const existing = await makeSave({ campaignId: 'new-game-backup-source' });
  await installStorage(page, { [SAVE_STORAGE_KEYS.ACTIVE]: existing });
  await openShell(page);

  await page.getByRole('button', { name: '새 게임', exact: true }).click();
  await expect(page.locator('dialog')).toHaveAttribute('data-overlay-id', 'OVR-CONFIRM');
  await page.getByRole('button', { name: '새 게임 시작' }).click();
  await expect(page).toHaveURL(/\/src\/s0-d3\.html\?new=1$/);
  await expect(page.locator('body')).toHaveAttribute('data-screen-id', 'SCR-STORY-PROLOGUE');
  await expect(page.locator('body')).toHaveAttribute('data-state-id', 'S0-STATE-KEY');
  expect(await page.evaluate(
    ({ prefix, key }) => localStorage.getItem(`${prefix}${key}`),
    { prefix: S0_D3_STORAGE_PREFIX, key: SAVE_STORAGE_KEYS.ACTIVE },
  )).toBe(existing);
});

test('비호환 저장 파일을 거부하고 기존 저장·백업을 변경하지 않는다', async ({ page }) => {
  const existing = await makeSave({ campaignId: 'preserved' });
  const parsed = JSON.parse(existing);
  const future = serializeSaveEnvelope(sealSaveEnvelope({
    ...parsed,
    saveSchemaVersion: 99,
  }));
  const originalBackup = '{"preserved-backup":true}';
  await installStorage(page, {
    [SAVE_STORAGE_KEYS.ACTIVE]: existing,
    [SAVE_STORAGE_KEYS.BACKUP_1]: originalBackup,
  });
  await openShell(page);

  await page.getByRole('button', { name: '저장 파일 불러오기' }).click();
  await page.locator('#save-file-input').setInputFiles({
    name: 'future-save.json',
    mimeType: 'application/json',
    buffer: Buffer.from(future),
  });
  await expect(page.locator('body')).toHaveAttribute('data-screen-id', 'SCR-SYS-RECOVERY');
  await expect(page.getByText('비호환 파일을 거부했으며')).toBeVisible();
  const stored = await page.evaluate(({ prefix, active, backup }) => ({
    active: localStorage.getItem(`${prefix}${active}`),
    backup: localStorage.getItem(`${prefix}${backup}`),
  }), {
    prefix: S0_D3_STORAGE_PREFIX,
    active: SAVE_STORAGE_KEYS.ACTIVE,
    backup: SAVE_STORAGE_KEYS.BACKUP_1,
  });
  expect(stored).toEqual({ active: existing, backup: originalBackup });
});

test('손상 active에서 검증된 백업을 복원하고 원본을 복구 영역에 보존한다', async ({ page }) => {
  const backup = await makeSave({ campaignId: 'backup-source' });
  const broken = '{"broken-active"';
  await installStorage(page, {
    [SAVE_STORAGE_KEYS.ACTIVE]: broken,
    [SAVE_STORAGE_KEYS.BACKUP_1]: backup,
  });
  await openShell(page);

  await page.getByRole('button', { name: '저장 복구' }).click();
  await page.getByRole('button', { name: 'backup-1 복원' }).click();
  await expect(page.getByText('백업 복구 완료')).toBeVisible();
  const stored = await page.evaluate(({ prefix, active, recovery }) => ({
    active: localStorage.getItem(`${prefix}${active}`),
    recovery: localStorage.getItem(`${prefix}${recovery}`),
  }), {
    prefix: S0_D3_STORAGE_PREFIX,
    active: SAVE_STORAGE_KEYS.ACTIVE,
    recovery: SAVE_STORAGE_KEYS.RECOVERY_SOURCE,
  });
  expect(stored.active).toBe(backup);
  expect(stored.recovery).toBe(broken);
});

test('D3 완료 뒤 메인 화면은 미출시 D4 대신 후일담 재진입만 제공한다', async ({ page }) => {
  const d4Save = await makeSave({ campaignId: 'd4-reader', completedDays: 3, balance: 42 });
  await installStorage(page, { [SAVE_STORAGE_KEYS.ACTIVE]: d4Save });
  await openShell(page);

  const before = await page.evaluate(() => JSON.stringify(localStorage));
  await expect(page.getByRole('button', { name: 'D4 개발 예고' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '후일담 다시 보기' })).toBeVisible();
  await expect(page.getByText('사흘의 영업을 마쳤습니다')).toBeVisible();
  await expect(page.getByText('PUBLIC WEB SHELL')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-screen-id', 'SCR-SYS-START');
  const after = await page.evaluate(() => JSON.stringify(localStorage));
  expect(after).toBe(before);
});

test('진단 다운로드에는 로컬 경로·저장 payload·원본 콘텐츠가 없다', async ({ page }) => {
  await installStorage(page, { [SAVE_STORAGE_KEYS.ACTIVE]: '{"broken"' });
  await openShell(page);
  await page.getByRole('button', { name: '저장 복구' }).click();
  await page.getByRole('button', { name: '진단 정보' }).click();
  await expect(page.getByText('개인정보, 브라우저 경로, 저장 payload')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일 다운로드', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const text = await import('node:fs/promises').then(({ readFile }) => readFile(path, 'utf8'));
  expect(text).not.toContain('/Users/');
  expect(text).not.toContain('payload');
  expect(text).not.toContain('broken');
  expect(JSON.parse(text)).toMatchObject({
    format: 'yaki-season-diagnostic-v1',
    remoteCollection: false,
  });
});
