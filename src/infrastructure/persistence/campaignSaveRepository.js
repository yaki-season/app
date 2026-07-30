import { canonicalStringify } from '../../core/canonicalJson.js';
import {
  PERSISTENCE_ERROR_CODE,
  StoragePortError,
  assertStoragePort,
  createPersistenceError,
} from '../../application/ports/persistence.js';
import {
  CHECKPOINT_TYPE,
  FIRST_PUBLIC_SAVE_SCHEMA_VERSION,
  createMigrationRegistry,
  sealSaveEnvelope,
  serializeSaveEnvelope,
  validateSerializedSave,
} from '../../application/persistence/saveEnvelope.js';

export const SAVE_STORAGE_KEYS = Object.freeze({
  ACTIVE: 'yaki-season.save.active',
  PENDING: 'yaki-season.save.pending',
  BACKUP_1: 'yaki-season.save.backup.1',
  BACKUP_2: 'yaki-season.save.backup.2',
  SETTINGS: 'yaki-season.settings',
  DIAGNOSTICS_LAST_ERROR: 'yaki-season.diagnostics.last-error',
  RECOVERY_SOURCE: 'yaki-season.save.recovery-source',
});

function failureFrom(cause, fallbackCode, message, details = {}) {
  const code = cause instanceof StoragePortError ? cause.code : fallbackCode;
  return {
    ok: false,
    error: createPersistenceError(code, cause?.message ?? message, { cause, details }),
  };
}

async function restoreRaw(port, key, raw) {
  if (raw === null) await port.remove(key);
  else await port.set(key, raw);
}

function summaryOf(validation, slot) {
  if (!validation.ok) return null;
  const { envelope, sourceVersion, migrated } = validation.value;
  return {
    slot,
    campaignId: envelope.campaignId,
    checkpointType: envelope.checkpointType,
    completedDayId: envelope.completedDayId,
    writtenAt: envelope.writtenAt,
    sourceSchemaVersion: sourceVersion,
    saveSchemaVersion: envelope.saveSchemaVersion,
    migrated,
  };
}

export class CampaignSaveRepository {
  constructor({
    storage,
    clock = () => new Date(),
    schemaVersion = FIRST_PUBLIC_SAVE_SCHEMA_VERSION,
    migrations = {},
    validatePayload,
    acceptsContentVersion,
  }) {
    this.storage = assertStoragePort(storage);
    this.clock = clock;
    this.migrationRegistry = createMigrationRegistry({
      currentVersion: schemaVersion,
      migrations,
    });
    this.validatePayload = validatePayload;
    this.acceptsContentVersion = acceptsContentVersion;
  }

  validate(text) {
    return validateSerializedSave(text, {
      migrationRegistry: this.migrationRegistry,
      validatePayload: this.validatePayload,
      acceptsContentVersion: this.acceptsContentVersion,
    });
  }

  async readRaw(key) {
    try {
      return { ok: true, value: await this.storage.get(key) };
    } catch (cause) {
      return failureFrom(cause, PERSISTENCE_ERROR_CODE.READ_FAILED, '저장 데이터를 읽지 못했습니다.', { key });
    }
  }

  async loadActive() {
    const activeRead = await this.readRaw(SAVE_STORAGE_KEYS.ACTIVE);
    if (!activeRead.ok) return activeRead;
    if (activeRead.value === null) {
      return {
        ok: false,
        error: createPersistenceError(
          PERSISTENCE_ERROR_CODE.SAVE_MISSING,
          '이어할 캠페인 저장이 없습니다.',
          { actions: ['new-campaign'], preserve: { active: false } },
        ),
      };
    }

    const active = this.validate(activeRead.value);
    if (active.ok) return active;

    const candidates = [];
    for (const [slot, key] of [
      ['backup-1', SAVE_STORAGE_KEYS.BACKUP_1],
      ['backup-2', SAVE_STORAGE_KEYS.BACKUP_2],
    ]) {
      const read = await this.readRaw(key);
      if (!read.ok) return read;
      if (read.value === null) continue;
      const validation = this.validate(read.value);
      const summary = summaryOf(validation, slot);
      if (summary) candidates.push(summary);
    }

    return {
      ok: false,
      error: createPersistenceError(
        PERSISTENCE_ERROR_CODE.ACTIVE_INVALID,
        candidates.length > 0
          ? '활성 저장이 손상됐습니다. 검증된 백업으로 복구할 수 있습니다.'
          : '활성 저장이 손상됐고 검증된 백업이 없습니다.',
        {
          cause: active.error.message,
          details: { activeError: active.error, recoveryCandidates: candidates },
          actions: candidates.length > 0
            ? ['restore-backup', 'export-original', 'new-campaign']
            : ['export-original', 'new-campaign'],
        },
      ),
    };
  }

  createEnvelope({ checkpointType, state, completedDayId = null }) {
    return sealSaveEnvelope({
      saveSchemaVersion: this.migrationRegistry.currentVersion,
      contentVersion: state.meta.contentVersion,
      writtenAt: this.clock().toISOString(),
      checkpointType,
      campaignId: state.meta.campaignId,
      completedDayId,
      payload: state,
    });
  }

  async saveCheckpoint({ checkpointType, state, completedDayId = null }) {
    if (!Object.values(CHECKPOINT_TYPE).includes(checkpointType)) {
      throw new TypeError(`지원하지 않는 체크포인트입니다: ${checkpointType}`);
    }
    const envelope = this.createEnvelope({ checkpointType, state, completedDayId });
    return this.commitEnvelope(envelope);
  }

  async commitEnvelope(envelope, {
    allowInvalidActive = false,
    preserveInvalidActive = false,
  } = {}) {
    const pendingRaw = serializeSaveEnvelope(envelope);
    const selfValidation = this.validate(pendingRaw);
    if (!selfValidation.ok) return selfValidation;

    const snapshot = {};
    for (const key of [
      SAVE_STORAGE_KEYS.PENDING,
      SAVE_STORAGE_KEYS.ACTIVE,
      SAVE_STORAGE_KEYS.BACKUP_1,
      SAVE_STORAGE_KEYS.BACKUP_2,
    ]) {
      const read = await this.readRaw(key);
      if (!read.ok) return read;
      snapshot[key] = read.value;
    }

    const activeValidation = snapshot[SAVE_STORAGE_KEYS.ACTIVE] === null
      ? null
      : this.validate(snapshot[SAVE_STORAGE_KEYS.ACTIVE]);
    if (activeValidation && !activeValidation.ok && !allowInvalidActive) {
      return {
        ok: false,
        error: createPersistenceError(
          PERSISTENCE_ERROR_CODE.ACTIVE_INVALID,
          '손상된 활성 저장을 자동으로 덮어쓰지 않았습니다.',
          { cause: activeValidation.error.message },
        ),
      };
    }

    const backup1Validation = snapshot[SAVE_STORAGE_KEYS.BACKUP_1] === null
      ? null
      : this.validate(snapshot[SAVE_STORAGE_KEYS.BACKUP_1]);
    const touched = [];
    try {
      await this.storage.set(SAVE_STORAGE_KEYS.PENDING, pendingRaw);
      touched.push(SAVE_STORAGE_KEYS.PENDING);

      const pendingRead = await this.storage.get(SAVE_STORAGE_KEYS.PENDING);
      const pendingValidation = pendingRead === null ? null : this.validate(pendingRead);
      if (!pendingValidation?.ok) {
        throw new StoragePortError(
          PERSISTENCE_ERROR_CODE.INVALID_ENVELOPE,
          'pending 저장 재검증에 실패했습니다.',
        );
      }

      if (activeValidation?.ok) {
        if (backup1Validation?.ok) {
          await this.storage.set(SAVE_STORAGE_KEYS.BACKUP_2, snapshot[SAVE_STORAGE_KEYS.BACKUP_1]);
          touched.push(SAVE_STORAGE_KEYS.BACKUP_2);
        }
        await this.storage.set(SAVE_STORAGE_KEYS.BACKUP_1, snapshot[SAVE_STORAGE_KEYS.ACTIVE]);
        touched.push(SAVE_STORAGE_KEYS.BACKUP_1);
      } else if (snapshot[SAVE_STORAGE_KEYS.ACTIVE] !== null && preserveInvalidActive) {
        await this.storage.set(SAVE_STORAGE_KEYS.RECOVERY_SOURCE, snapshot[SAVE_STORAGE_KEYS.ACTIVE]);
      }

      await this.storage.set(SAVE_STORAGE_KEYS.ACTIVE, pendingRead);
      touched.push(SAVE_STORAGE_KEYS.ACTIVE);
    } catch (cause) {
      const rollbackErrors = [];
      for (const key of [...touched].reverse()) {
        try {
          await restoreRaw(this.storage, key, snapshot[key]);
        } catch (rollbackCause) {
          rollbackErrors.push({ key, message: rollbackCause.message });
        }
      }
      return failureFrom(
        cause,
        PERSISTENCE_ERROR_CODE.WRITE_FAILED,
        '체크포인트 저장에 실패했습니다.',
        { rollbackErrors, activePreserved: !touched.includes(SAVE_STORAGE_KEYS.ACTIVE) || rollbackErrors.length === 0 },
      );
    }

    let cleanupPendingFailed = false;
    try {
      await this.storage.remove(SAVE_STORAGE_KEYS.PENDING);
    } catch {
      // active 교체가 끝난 뒤 pending 정리만 실패한 경우 저장 성공을 되돌리지 않는다.
      cleanupPendingFailed = true;
    }
    return {
      ok: true,
      value: {
        envelope: selfValidation.value.envelope,
        cleanupPendingFailed,
      },
    };
  }

  async validateImport(text) {
    const result = this.validate(text);
    if (!result.ok) return result;
    return {
      ok: true,
      value: {
        ...result.value,
        summary: summaryOf(result, 'import'),
      },
    };
  }

  async importSave(text) {
    const validation = await this.validateImport(text);
    if (!validation.ok) return validation;
    return this.commitEnvelope(validation.value.envelope, {
      allowInvalidActive: true,
      preserveInvalidActive: true,
    });
  }

  async exportActiveSave() {
    const activeRead = await this.readRaw(SAVE_STORAGE_KEYS.ACTIVE);
    if (!activeRead.ok) return activeRead;
    if (activeRead.value === null) {
      return {
        ok: false,
        error: createPersistenceError(PERSISTENCE_ERROR_CODE.SAVE_MISSING, '내보낼 활성 저장이 없습니다.'),
      };
    }
    const validation = this.validate(activeRead.value);
    if (!validation.ok) return validation;
    const { envelope } = validation.value;
    const safeCampaignId = envelope.campaignId.replace(/[^a-zA-Z0-9_-]/g, '-');
    return {
      ok: true,
      value: {
        fileName: `yaki-season-${safeCampaignId}-${envelope.checkpointType}.json`,
        mediaType: 'application/json',
        text: serializeSaveEnvelope(envelope),
        summary: summaryOf(validation, 'active'),
      },
    };
  }

  async restoreBackup(slot) {
    const key = slot === 1 || slot === 'backup-1'
      ? SAVE_STORAGE_KEYS.BACKUP_1
      : slot === 2 || slot === 'backup-2'
        ? SAVE_STORAGE_KEYS.BACKUP_2
        : null;
    if (!key) throw new TypeError(`지원하지 않는 백업 slot입니다: ${slot}`);

    const read = await this.readRaw(key);
    if (!read.ok) return read;
    if (read.value === null) {
      return {
        ok: false,
        error: createPersistenceError(PERSISTENCE_ERROR_CODE.BACKUP_INVALID, '선택한 백업이 없습니다.'),
      };
    }
    const validation = this.validate(read.value);
    if (!validation.ok) {
      return {
        ok: false,
        error: createPersistenceError(
          PERSISTENCE_ERROR_CODE.BACKUP_INVALID,
          '선택한 백업이 손상됐습니다.',
          { cause: validation.error.message },
        ),
      };
    }
    return this.commitEnvelope(validation.value.envelope, {
      allowInvalidActive: true,
      preserveInvalidActive: true,
    });
  }

  async resetDevelopmentSaves({ releasePhase }) {
    if (releasePhase !== 'pre-public-development') {
      return {
        ok: false,
        error: createPersistenceError(
          PERSISTENCE_ERROR_CODE.DEVELOPMENT_RESET_FORBIDDEN,
          '첫 공개 이후 저장은 개발 초기화할 수 없습니다.',
          { actions: ['cancel'] },
        ),
      };
    }
    try {
      for (const key of [
        SAVE_STORAGE_KEYS.ACTIVE,
        SAVE_STORAGE_KEYS.PENDING,
        SAVE_STORAGE_KEYS.BACKUP_1,
        SAVE_STORAGE_KEYS.BACKUP_2,
        SAVE_STORAGE_KEYS.RECOVERY_SOURCE,
      ]) {
        await this.storage.remove(key);
      }
      return { ok: true, value: { settingsPreserved: true, diagnosticsPreserved: true } };
    } catch (cause) {
      return failureFrom(cause, PERSISTENCE_ERROR_CODE.REMOVE_FAILED, '개발 저장 초기화에 실패했습니다.');
    }
  }
}

export class SettingsRepository {
  constructor({ storage, validate = () => ({ valid: true, errors: [] }) }) {
    this.storage = assertStoragePort(storage);
    this.validateSettings = validate;
  }

  async load(defaults = {}) {
    try {
      const raw = await this.storage.get(SAVE_STORAGE_KEYS.SETTINGS);
      if (raw === null) return { ok: true, value: structuredClone(defaults) };
      const value = JSON.parse(raw);
      const validation = this.validateSettings(value);
      if (!validation.valid) {
        return {
          ok: false,
          error: createPersistenceError(
            PERSISTENCE_ERROR_CODE.INVALID_PAYLOAD,
            '설정 저장이 올바르지 않습니다.',
            { details: { errors: validation.errors }, preserve: { active: true, settings: true } },
          ),
        };
      }
      return { ok: true, value };
    } catch (cause) {
      return failureFrom(cause, PERSISTENCE_ERROR_CODE.READ_FAILED, '설정을 읽지 못했습니다.');
    }
  }

  async save(settings) {
    const validation = this.validateSettings(settings);
    if (!validation.valid) {
      return {
        ok: false,
        error: createPersistenceError(
          PERSISTENCE_ERROR_CODE.INVALID_PAYLOAD,
          '설정을 저장하기 전에 검증하지 못했습니다.',
          { details: { errors: validation.errors } },
        ),
      };
    }
    try {
      await this.storage.set(SAVE_STORAGE_KEYS.SETTINGS, canonicalStringify(settings));
      return { ok: true, value: settings };
    } catch (cause) {
      return failureFrom(cause, PERSISTENCE_ERROR_CODE.WRITE_FAILED, '설정을 저장하지 못했습니다.');
    }
  }
}

export class DiagnosticsRepository {
  constructor({ storage, clock = () => new Date() }) {
    this.storage = assertStoragePort(storage);
    this.clock = clock;
  }

  async record(error) {
    const diagnostic = {
      occurredAt: this.clock().toISOString(),
      code: String(error?.code ?? 'UNKNOWN'),
      variant: String(error?.uiState?.variant ?? 'unknown'),
    };
    try {
      await this.storage.set(SAVE_STORAGE_KEYS.DIAGNOSTICS_LAST_ERROR, canonicalStringify(diagnostic));
      return { ok: true, value: diagnostic };
    } catch (cause) {
      return failureFrom(cause, PERSISTENCE_ERROR_CODE.WRITE_FAILED, '진단 상태를 저장하지 못했습니다.');
    }
  }
}
