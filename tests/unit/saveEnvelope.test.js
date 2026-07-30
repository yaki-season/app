import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CHECKPOINT_TYPE,
  PERSISTENCE_ERROR_CODE,
  createMigrationRegistry,
  sealSaveEnvelope,
  serializeSaveEnvelope,
  validateSerializedSave,
} from '../../src/campaign-runtime.js';

function readFixture(name) {
  return JSON.parse(readFileSync(
    fileURLToPath(new URL(`../fixtures/saves/${name}`, import.meta.url)),
    'utf8',
  ));
}

function envelope(payload, saveSchemaVersion = 1) {
  return sealSaveEnvelope({
    saveSchemaVersion,
    contentVersion: 'content-r1',
    writtenAt: '2026-07-30T00:00:00.000Z',
    checkpointType: CHECKPOINT_TYPE.DAY_START,
    campaignId: 'campaign-1',
    completedDayId: null,
    payload,
  });
}

describe('저장 envelope 검증', () => {
  it('결정적 직렬화와 체크섬을 검증한다', () => {
    const first = envelope({ z: 1, a: { y: 2, x: 3 } });
    const second = envelope({ a: { x: 3, y: 2 }, z: 1 });
    expect(first.checksum).toBe(second.checksum);
    expect(serializeSaveEnvelope(first)).toBe(serializeSaveEnvelope(second));
    expect(validateSerializedSave(serializeSaveEnvelope(first)).ok).toBe(true);
  });

  it('잘린 JSON과 체크섬 변조를 구분한다', () => {
    const valid = envelope({ stateVersion: 1 });
    const truncated = validateSerializedSave('{"saveSchemaVersion":1');
    expect(truncated.error.code).toBe(PERSISTENCE_ERROR_CODE.INVALID_JSON);

    const modified = { ...valid, payload: { stateVersion: 2 } };
    const mismatch = validateSerializedSave(JSON.stringify(modified));
    expect(mismatch.error.code).toBe(PERSISTENCE_ERROR_CODE.CHECKSUM_MISMATCH);
  });

  it('미래 schema를 원본 변경 없이 거부한다', () => {
    const futureText = serializeSaveEnvelope(envelope({ stateVersion: 1 }, 3));
    const result = validateSerializedSave(futureText, {
      migrationRegistry: createMigrationRegistry({ currentVersion: 2 }),
    });
    expect(result.error.code).toBe(PERSISTENCE_ERROR_CODE.FUTURE_SCHEMA);
    expect(futureText).toContain('"saveSchemaVersion":3');
  });
});

describe('vN→vN+1 순차 마이그레이션 fixture', () => {
  it('v1 payload fixture를 v2 fixture로 순수 변환한다', () => {
    const sourcePayload = readFixture('schema-v1-payload.json');
    const expectedPayload = readFixture('schema-v2-expected-payload.json');
    const registry = createMigrationRegistry({
      currentVersion: 2,
      migrations: {
        1: (source) => ({
          ...source,
          payload: {
            economy: source.payload.profile,
            story: { flagIds: source.payload.flags },
          },
        }),
      },
    });

    const sourceText = serializeSaveEnvelope(envelope(sourcePayload, 1));
    const result = validateSerializedSave(sourceText, {
      migrationRegistry: registry,
      validatePayload: (payload) => ({
        valid: 'economy' in payload && 'story' in payload,
        errors: [],
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.value.sourceVersion).toBe(1);
    expect(result.value.migrated).toBe(true);
    expect(result.value.envelope.saveSchemaVersion).toBe(2);
    expect(result.value.envelope.payload).toEqual(expectedPayload);
    expect(validateSerializedSave(serializeSaveEnvelope(result.value.envelope), {
      migrationRegistry: registry,
    }).ok).toBe(true);
  });

  it('중간 단계가 없으면 원본을 덮어쓰지 않고 실패한다', () => {
    const source = envelope({ legacy: true }, 1);
    const text = serializeSaveEnvelope(source);
    const result = validateSerializedSave(text, {
      migrationRegistry: createMigrationRegistry({ currentVersion: 3, migrations: { 1: (value) => value } }),
    });
    expect(result.error.code).toBe(PERSISTENCE_ERROR_CODE.MIGRATION_MISSING);
    expect(text).toBe(serializeSaveEnvelope(source));
  });
});
