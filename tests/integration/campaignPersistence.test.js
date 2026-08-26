import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CAMPAIGN_PHASE,
  CHECKPOINT_TYPE,
  CampaignRuntime,
  CampaignSaveRepository,
  LocalStorageAdapter,
  MemoryStorageAdapter,
  PERSISTENCE_ERROR_CODE,
  SAVE_STORAGE_KEYS,
  SettingsRepository,
  StoragePortError,
  assertEarlyCampaignDefinition,
  createCampaignDefinition,
  createSaveFilePort,
  sealSaveEnvelope,
  serializeSaveEnvelope,
  validateCampaignState,
} from '../../src/campaign-runtime.js';

const campaignRecords = JSON.parse(readFileSync(
  fileURLToPath(new URL('../fixtures/campaign/s0-d5-preview.json', import.meta.url)),
  'utf8',
));
const definition = assertEarlyCampaignDefinition(createCampaignDefinition(campaignRecords));

function createHarness(storage = new MemoryStorageAdapter()) {
  let tick = 0;
  const repository = new CampaignSaveRepository({
    storage,
    clock: () => new Date(Date.UTC(2026, 6, 30, 0, tick++)),
    validatePayload: (payload) => validateCampaignState(payload, definition),
    acceptsContentVersion: (version) => version === 'content-s0-d3-r1',
  });
  const runtime = new CampaignRuntime({ definition, saveRepository: repository });
  runtime.startNewCampaign({
    campaignId: 'campaign-integration',
    contentVersion: 'content-s0-d3-r1',
    seed: 17,
  });
  runtime.finishPrologue();
  return { storage, repository, runtime };
}

async function readEnvelope(storage, key) {
  const raw = await storage.get(key);
  return raw === null ? null : JSON.parse(raw);
}

describe('자동 체크포인트와 정산 원자성', () => {
  it('day-start 저장 뒤에만 영업을 열고 중단 복귀는 영업 전 상태를 사용한다', async () => {
    const { storage, repository, runtime } = createHarness();
    const started = await runtime.startDay();
    expect(started.ok).toBe(true);
    expect(runtime.getState().campaign.phase).toBe(CAMPAIGN_PHASE.BUSINESS);

    const active = await readEnvelope(storage, SAVE_STORAGE_KEYS.ACTIVE);
    expect(active.checkpointType).toBe(CHECKPOINT_TYPE.DAY_START);
    expect(active.payload.campaign).toMatchObject({ nodeId: 'd1', phase: CAMPAIGN_PHASE.PRE_OPEN });

    const reloaded = await repository.loadActive();
    expect(reloaded.ok).toBe(true);
    expect(reloaded.value.envelope.payload.campaign.phase).toBe(CAMPAIGN_PHASE.PRE_OPEN);
  });

  it('day-complete 검증 성공 뒤에만 보상과 다음 날짜를 commit한다', async () => {
    const { storage, runtime } = createHarness();
    await runtime.startDay();
    runtime.closeDayForSettlement();
    const result = await runtime.completeDay({
      dayId: 'd1',
      completionId: 'campaign-integration:d1',
      reward: { balance: 300, reputation: 2, unlockIds: ['momo'] },
    });
    expect(result.ok).toBe(true);
    expect(runtime.getState()).toMatchObject({
      campaign: { nodeId: 'd2', phase: CAMPAIGN_PHASE.PRE_OPEN },
      economy: { balance: 300, reputation: 2 },
    });

    const active = await readEnvelope(storage, SAVE_STORAGE_KEYS.ACTIVE);
    expect(active).toMatchObject({
      checkpointType: CHECKPOINT_TYPE.DAY_COMPLETE,
      completedDayId: 'd1',
      payload: { campaign: { nodeId: 'd2' } },
    });
  });

  it('저장 실패 시 active와 메모리 보상을 모두 보존한다', async () => {
    const { storage, runtime } = createHarness();
    await runtime.startDay();
    const activeBefore = await storage.get(SAVE_STORAGE_KEYS.ACTIVE);
    runtime.closeDayForSettlement();
    storage.failNext('set', new StoragePortError(
      PERSISTENCE_ERROR_CODE.WRITE_FAILED,
      '저장 공간 부족',
    ));

    const result = await runtime.completeDay({
      dayId: 'd1',
      completionId: 'campaign-integration:d1',
      reward: { balance: 999 },
    });
    expect(result.ok).toBe(false);
    expect(result.error.uiState).toMatchObject({
      screenId: 'SCR-SYS-RECOVERY',
      variant: 'storage',
    });
    expect(runtime.getState()).toMatchObject({
      campaign: { nodeId: 'd1', phase: CAMPAIGN_PHASE.SETTLEMENT },
      economy: { balance: 0, settlements: [] },
    });
    expect(await storage.get(SAVE_STORAGE_KEYS.ACTIVE)).toBe(activeBefore);
  });

  it('같은 완료 ID 재시도는 저장과 보상을 한 번만 만든다', async () => {
    const { storage, runtime } = createHarness();
    await runtime.startDay();
    runtime.closeDayForSettlement();
    const first = await runtime.completeDay({
      dayId: 'd1',
      completionId: 'campaign-integration:d1',
      reward: { balance: 400 },
    });
    const activeAfterFirst = await storage.get(SAVE_STORAGE_KEYS.ACTIVE);
    const duplicate = await runtime.completeDay({
      dayId: 'd1',
      completionId: 'campaign-integration:d1',
      reward: { balance: 9000 },
    });
    expect(first.duplicate).toBe(false);
    expect(duplicate).toMatchObject({ ok: true, duplicate: true });
    expect(runtime.getState().economy.balance).toBe(400);
    expect(runtime.getState().economy.settlements).toHaveLength(1);
    expect(await storage.get(SAVE_STORAGE_KEYS.ACTIVE)).toBe(activeAfterFirst);
  });
});

describe('pending 검증과 정상 백업 2개', () => {
  it('pending→검증→backup 회전→active 교체 순서로 최근 정상 저장 2개를 유지한다', async () => {
    const { storage, repository, runtime } = createHarness();
    await runtime.startDay();
    const d1Start = await storage.get(SAVE_STORAGE_KEYS.ACTIVE);
    runtime.closeDayForSettlement();
    await runtime.completeDay({
      dayId: 'd1',
      completionId: 'campaign-integration:d1',
      reward: { balance: 10 },
    });
    const d1Complete = await storage.get(SAVE_STORAGE_KEYS.ACTIVE);
    await runtime.startDay();

    expect(await storage.get(SAVE_STORAGE_KEYS.PENDING)).toBeNull();
    expect(await storage.get(SAVE_STORAGE_KEYS.BACKUP_1)).toBe(d1Complete);
    expect(await storage.get(SAVE_STORAGE_KEYS.BACKUP_2)).toBe(d1Start);
    expect((await repository.loadActive()).value.envelope.checkpointType).toBe(CHECKPOINT_TYPE.DAY_START);
  });

  it('pending 재검증이 실패하면 active와 backup을 교체하지 않는다', async () => {
    class CorruptPendingAdapter extends MemoryStorageAdapter {
      constructor() {
        super();
        this.corruptNextPendingRead = false;
      }

      async set(key, value) {
        await super.set(key, value);
        if (key === SAVE_STORAGE_KEYS.PENDING) this.corruptNextPendingRead = true;
      }

      async get(key) {
        if (key === SAVE_STORAGE_KEYS.PENDING && this.corruptNextPendingRead) {
          this.corruptNextPendingRead = false;
          return '{"truncated"';
        }
        return super.get(key);
      }
    }

    const storage = new CorruptPendingAdapter();
    const { runtime } = createHarness(storage);
    const result = await runtime.startDay();
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe(PERSISTENCE_ERROR_CODE.INVALID_ENVELOPE);
    expect(await storage.get(SAVE_STORAGE_KEYS.ACTIVE)).toBeNull();
    expect(await storage.get(SAVE_STORAGE_KEYS.BACKUP_1)).toBeNull();
  });
});

describe('손상 복구와 원본 보존', () => {
  let harness;

  beforeEach(async () => {
    harness = createHarness();
    await harness.runtime.startDay();
    harness.runtime.closeDayForSettlement();
    await harness.runtime.completeDay({
      dayId: 'd1',
      completionId: 'campaign-integration:d1',
      reward: { balance: 10 },
    });
    await harness.runtime.startDay();
  });

  it('active 손상 시 backup 1을 첫 복구 후보로 제시한다', async () => {
    await harness.storage.set(SAVE_STORAGE_KEYS.ACTIVE, '{"broken"');
    const result = await harness.repository.loadActive();
    expect(result.error.code).toBe(PERSISTENCE_ERROR_CODE.ACTIVE_INVALID);
    expect(result.error.details.recoveryCandidates.map((item) => item.slot))
      .toEqual(['backup-1', 'backup-2']);
    expect(result.error.uiState.actions).toContain('restore-backup');
  });

  it('backup 1도 손상되면 backup 2만 정상 후보로 유지한다', async () => {
    await harness.storage.set(SAVE_STORAGE_KEYS.ACTIVE, '{"broken"');
    await harness.storage.set(SAVE_STORAGE_KEYS.BACKUP_1, '{"also-broken"');
    const result = await harness.repository.loadActive();
    expect(result.error.details.recoveryCandidates.map((item) => item.slot))
      .toEqual(['backup-2']);
  });

  it('백업 복원 전에 손상 active 원문을 별도 보존한다', async () => {
    const corruptActive = '{"broken-active"';
    await harness.storage.set(SAVE_STORAGE_KEYS.ACTIVE, corruptActive);
    const restored = await harness.repository.restoreBackup(2);
    expect(restored.ok).toBe(true);
    expect(await harness.storage.get(SAVE_STORAGE_KEYS.RECOVERY_SOURCE)).toBe(corruptActive);
    expect((await harness.repository.loadActive()).ok).toBe(true);
  });
});

describe('저장 파일 import/export port', () => {
  it('UI가 파일 API 없이 사용할 application port를 제공한다', async () => {
    const { repository, runtime } = createHarness();
    await runtime.startDay();
    const port = createSaveFilePort(repository);
    const exported = await port.exportFile();
    expect(exported.ok).toBe(true);
    expect((await port.validateImportFile(exported.value.text)).ok).toBe(true);
    expect((await port.loadForContinue()).ok).toBe(true);
  });

  it('호환 저장을 검증·내보내고 기존 정상 active를 backup 1로 보낸다', async () => {
    const target = createHarness();
    await target.runtime.startDay();
    const previousActive = await target.storage.get(SAVE_STORAGE_KEYS.ACTIVE);

    const source = createHarness();
    await source.runtime.startDay();
    source.runtime.closeDayForSettlement();
    await source.runtime.completeDay({
      dayId: 'd1',
      completionId: 'campaign-integration:d1-import',
      reward: { balance: 77 },
    });
    const exported = await source.repository.exportActiveSave();
    expect(exported.ok).toBe(true);
    expect(exported.value).toMatchObject({
      mediaType: 'application/json',
      summary: { checkpointType: CHECKPOINT_TYPE.DAY_COMPLETE },
    });

    const inspected = await target.repository.validateImport(exported.value.text);
    expect(inspected.ok).toBe(true);
    expect(await target.storage.get(SAVE_STORAGE_KEYS.ACTIVE)).toBe(previousActive);

    const imported = await target.repository.importSave(exported.value.text);
    expect(imported.ok).toBe(true);
    expect(await target.storage.get(SAVE_STORAGE_KEYS.BACKUP_1)).toBe(previousActive);
    expect((await target.repository.loadActive()).value.envelope.payload.economy.balance).toBe(77);
  });

  it('손상·미래 버전 import는 기존 저장을 전혀 바꾸지 않는다', async () => {
    const { storage, repository, runtime } = createHarness();
    await runtime.startDay();
    const before = storage.snapshot();

    const corrupt = await repository.importSave('{"not-json"');
    expect(corrupt.error.code).toBe(PERSISTENCE_ERROR_CODE.INVALID_JSON);
    expect(storage.snapshot()).toEqual(before);

    const current = (await repository.loadActive()).value.envelope;
    const future = sealSaveEnvelope({ ...current, saveSchemaVersion: 99 });
    const rejected = await repository.importSave(serializeSaveEnvelope(future));
    expect(rejected.error.code).toBe(PERSISTENCE_ERROR_CODE.FUTURE_SCHEMA);
    expect(storage.snapshot()).toEqual(before);
  });
});

describe('저장 영역 분리와 공개 전 초기화', () => {
  it('설정은 캠페인 저장 손상과 독립적으로 유지된다', async () => {
    const { storage, repository, runtime } = createHarness();
    const settings = new SettingsRepository({
      storage,
      validate: (value) => ({ valid: typeof value.largeHitArea === 'boolean', errors: [] }),
    });
    await settings.save({ largeHitArea: true });
    await runtime.startDay();
    await storage.set(SAVE_STORAGE_KEYS.ACTIVE, '{"broken"');

    expect((await repository.loadActive()).ok).toBe(false);
    expect(await settings.load()).toEqual({ ok: true, value: { largeHitArea: true } });
  });

  it('첫 공개 전 명시적 모드에서만 개발 저장을 초기화하고 설정·진단은 보존한다', async () => {
    const { storage, repository, runtime } = createHarness();
    await runtime.startDay();
    await storage.set(SAVE_STORAGE_KEYS.SETTINGS, '{"largeHitArea":true}');
    await storage.set(SAVE_STORAGE_KEYS.DIAGNOSTICS_LAST_ERROR, '{"code":"TEST"}');

    const forbidden = await repository.resetDevelopmentSaves({ releasePhase: 'public' });
    expect(forbidden.error.code).toBe(PERSISTENCE_ERROR_CODE.DEVELOPMENT_RESET_FORBIDDEN);
    expect(await storage.get(SAVE_STORAGE_KEYS.ACTIVE)).not.toBeNull();

    const reset = await repository.resetDevelopmentSaves({ releasePhase: 'pre-public-development' });
    expect(reset).toEqual({ ok: true, value: { settingsPreserved: true, diagnosticsPreserved: true } });
    expect(await storage.get(SAVE_STORAGE_KEYS.ACTIVE)).toBeNull();
    expect(await storage.get(SAVE_STORAGE_KEYS.SETTINGS)).not.toBeNull();
    expect(await storage.get(SAVE_STORAGE_KEYS.DIAGNOSTICS_LAST_ERROR)).not.toBeNull();
  });

  it('localStorage 예외를 구조화된 port 오류로 바꾼다', async () => {
    const quotaStorage = {
      getItem: () => null,
      setItem: () => {
        const error = new Error('quota');
        error.name = 'QuotaExceededError';
        throw error;
      },
      removeItem: () => {},
    };
    const adapter = new LocalStorageAdapter(quotaStorage);
    await expect(adapter.set('key', 'value')).rejects.toMatchObject({
      code: PERSISTENCE_ERROR_CODE.WRITE_FAILED,
      message: '브라우저 저장 공간이 부족합니다.',
    });
  });
});
