import { canonicalStringify, checksumFor } from '../../core/canonicalJson.js';
import {
  PERSISTENCE_ERROR_CODE,
  createPersistenceError,
} from '../ports/persistence.js';

export const FIRST_PUBLIC_SAVE_SCHEMA_VERSION = 1;
export const CHECKPOINT_TYPE = Object.freeze({
  DAY_START: 'day-start',
  DAY_COMPLETE: 'day-complete',
});

function withoutChecksum(envelope) {
  const { checksum: _checksum, ...rest } = envelope;
  return rest;
}

export function sealSaveEnvelope(fields) {
  const unsigned = {
    saveSchemaVersion: fields.saveSchemaVersion,
    contentVersion: fields.contentVersion,
    writtenAt: fields.writtenAt,
    checkpointType: fields.checkpointType,
    campaignId: fields.campaignId,
    completedDayId: fields.completedDayId ?? null,
    payload: fields.payload,
  };
  return { ...unsigned, checksum: checksumFor(unsigned) };
}

export function serializeSaveEnvelope(envelope) {
  return canonicalStringify(envelope);
}

function validateEnvelopeShape(envelope) {
  const errors = [];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return ['저장 envelope가 객체가 아닙니다.'];
  }
  if (!Number.isInteger(envelope.saveSchemaVersion) || envelope.saveSchemaVersion < 1) {
    errors.push('saveSchemaVersion이 올바르지 않습니다.');
  }
  if (typeof envelope.contentVersion !== 'string' || envelope.contentVersion.length === 0) {
    errors.push('contentVersion이 올바르지 않습니다.');
  }
  if (typeof envelope.writtenAt !== 'string' || !Number.isFinite(Date.parse(envelope.writtenAt))) {
    errors.push('writtenAt이 ISO 날짜 문자열이 아닙니다.');
  }
  if (!Object.values(CHECKPOINT_TYPE).includes(envelope.checkpointType)) {
    errors.push('checkpointType이 올바르지 않습니다.');
  }
  if (typeof envelope.campaignId !== 'string' || envelope.campaignId.length === 0) {
    errors.push('campaignId가 올바르지 않습니다.');
  }
  if (envelope.completedDayId !== null && typeof envelope.completedDayId !== 'string') {
    errors.push('completedDayId는 문자열 또는 null이어야 합니다.');
  }
  if (!envelope.payload || typeof envelope.payload !== 'object' || Array.isArray(envelope.payload)) {
    errors.push('payload가 객체가 아닙니다.');
  }
  if (typeof envelope.checksum !== 'string') errors.push('checksum이 없습니다.');
  return errors;
}

export function createMigrationRegistry({
  currentVersion = FIRST_PUBLIC_SAVE_SCHEMA_VERSION,
  migrations = {},
} = {}) {
  if (!Number.isInteger(currentVersion) || currentVersion < FIRST_PUBLIC_SAVE_SCHEMA_VERSION) {
    throw new TypeError('현재 저장 schema 버전이 올바르지 않습니다.');
  }
  const steps = new Map(
    Object.entries(migrations).map(([from, migrate]) => [Number(from), migrate]),
  );
  for (const [from, migrate] of steps) {
    if (!Number.isInteger(from) || from < FIRST_PUBLIC_SAVE_SCHEMA_VERSION || typeof migrate !== 'function') {
      throw new TypeError('마이그레이션은 vN을 key로 하는 함수여야 합니다.');
    }
  }

  return Object.freeze({
    currentVersion,
    migrate(envelope) {
      if (envelope.saveSchemaVersion > currentVersion) {
        return {
          ok: false,
          error: createPersistenceError(
            PERSISTENCE_ERROR_CODE.FUTURE_SCHEMA,
            `미래 저장 schema v${envelope.saveSchemaVersion}는 현재 v${currentVersion}에서 열 수 없습니다.`,
            { details: { sourceVersion: envelope.saveSchemaVersion, currentVersion } },
          ),
        };
      }

      const sourceVersion = envelope.saveSchemaVersion;
      let next = envelope;
      while (next.saveSchemaVersion < currentVersion) {
        const from = next.saveSchemaVersion;
        const migrate = steps.get(from);
        if (!migrate) {
          return {
            ok: false,
            error: createPersistenceError(
              PERSISTENCE_ERROR_CODE.MIGRATION_MISSING,
              `저장 schema v${from} -> v${from + 1} 마이그레이션이 없습니다.`,
              { details: { fromVersion: from, toVersion: from + 1 } },
            ),
          };
        }
        try {
          const migrated = migrate(structuredClone(next));
          next = sealSaveEnvelope({
            ...migrated,
            saveSchemaVersion: from + 1,
          });
        } catch (cause) {
          return {
            ok: false,
            error: createPersistenceError(
              PERSISTENCE_ERROR_CODE.MIGRATION_FAILED,
              `저장 schema v${from} -> v${from + 1} 마이그레이션에 실패했습니다.`,
              { cause, details: { fromVersion: from, toVersion: from + 1 } },
            ),
          };
        }
      }
      return {
        ok: true,
        value: {
          envelope: next,
          sourceVersion,
          migrated: sourceVersion !== currentVersion,
        },
      };
    },
  });
}

export function validateSerializedSave(text, {
  migrationRegistry = createMigrationRegistry(),
  normalizePayload = (payload) => payload,
  validatePayload = () => ({ valid: true, errors: [] }),
  acceptsContentVersion = () => true,
} = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    return {
      ok: false,
      error: createPersistenceError(
        PERSISTENCE_ERROR_CODE.INVALID_JSON,
        '저장 파일 JSON을 읽을 수 없습니다.',
        { cause },
      ),
    };
  }

  const shapeErrors = validateEnvelopeShape(parsed);
  if (shapeErrors.length > 0) {
    return {
      ok: false,
      error: createPersistenceError(
        PERSISTENCE_ERROR_CODE.INVALID_ENVELOPE,
        '저장 envelope 형식이 올바르지 않습니다.',
        { details: { errors: shapeErrors } },
      ),
    };
  }
  if (checksumFor(withoutChecksum(parsed)) !== parsed.checksum) {
    return {
      ok: false,
      error: createPersistenceError(
        PERSISTENCE_ERROR_CODE.CHECKSUM_MISMATCH,
        '저장 체크섬이 일치하지 않습니다.',
      ),
    };
  }
  if (!acceptsContentVersion(parsed.contentVersion)) {
    return {
      ok: false,
      error: createPersistenceError(
        PERSISTENCE_ERROR_CODE.INVALID_PAYLOAD,
        `호환되지 않는 콘텐츠 버전입니다: ${parsed.contentVersion}`,
        { details: { contentVersion: parsed.contentVersion } },
      ),
    };
  }

  const migration = migrationRegistry.migrate(parsed);
  if (!migration.ok) return migration;

  let normalizedPayload;
  try {
    normalizedPayload = normalizePayload(migration.value.envelope.payload);
  } catch (cause) {
    return {
      ok: false,
      error: createPersistenceError(
        PERSISTENCE_ERROR_CODE.INVALID_PAYLOAD,
        '저장 payload 호환 변환에 실패했습니다.',
        { cause },
      ),
    };
  }
  const payloadNormalized = normalizedPayload !== migration.value.envelope.payload;
  const normalizedEnvelope = payloadNormalized
    ? sealSaveEnvelope({ ...migration.value.envelope, payload: normalizedPayload })
    : migration.value.envelope;
  const payloadResult = validatePayload(normalizedEnvelope.payload);
  if (!payloadResult?.valid) {
    return {
      ok: false,
      error: createPersistenceError(
        PERSISTENCE_ERROR_CODE.INVALID_PAYLOAD,
        '저장 payload가 현재 캠페인 계약과 맞지 않습니다.',
        { details: { errors: payloadResult?.errors ?? ['payload 검증 실패'] } },
      ),
    };
  }
  return {
    ...migration,
    value: {
      ...migration.value,
      envelope: normalizedEnvelope,
      migrated: migration.value.migrated || payloadNormalized,
    },
  };
}
