export const PERSISTENCE_ERROR_CODE = Object.freeze({
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
  READ_FAILED: 'READ_FAILED',
  WRITE_FAILED: 'WRITE_FAILED',
  REMOVE_FAILED: 'REMOVE_FAILED',
  SAVE_MISSING: 'SAVE_MISSING',
  INVALID_JSON: 'INVALID_JSON',
  INVALID_ENVELOPE: 'INVALID_ENVELOPE',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  ACTIVE_INVALID: 'ACTIVE_INVALID',
  BACKUP_INVALID: 'BACKUP_INVALID',
  FUTURE_SCHEMA: 'FUTURE_SCHEMA',
  MIGRATION_MISSING: 'MIGRATION_MISSING',
  MIGRATION_FAILED: 'MIGRATION_FAILED',
  DEVELOPMENT_RESET_FORBIDDEN: 'DEVELOPMENT_RESET_FORBIDDEN',
});

const RECOVERY_VARIANT = Object.freeze({
  [PERSISTENCE_ERROR_CODE.STORAGE_UNAVAILABLE]: 'storage',
  [PERSISTENCE_ERROR_CODE.READ_FAILED]: 'storage',
  [PERSISTENCE_ERROR_CODE.WRITE_FAILED]: 'storage',
  [PERSISTENCE_ERROR_CODE.REMOVE_FAILED]: 'storage',
  [PERSISTENCE_ERROR_CODE.INVALID_JSON]: 'save-invalid',
  [PERSISTENCE_ERROR_CODE.INVALID_ENVELOPE]: 'save-invalid',
  [PERSISTENCE_ERROR_CODE.CHECKSUM_MISMATCH]: 'save-invalid',
  [PERSISTENCE_ERROR_CODE.INVALID_PAYLOAD]: 'save-invalid',
  [PERSISTENCE_ERROR_CODE.ACTIVE_INVALID]: 'save-invalid',
  [PERSISTENCE_ERROR_CODE.BACKUP_INVALID]: 'save-invalid',
  [PERSISTENCE_ERROR_CODE.FUTURE_SCHEMA]: 'migration',
  [PERSISTENCE_ERROR_CODE.MIGRATION_MISSING]: 'migration',
  [PERSISTENCE_ERROR_CODE.MIGRATION_FAILED]: 'migration',
});

export class StoragePortError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'StoragePortError';
    this.code = code;
  }
}

export function createPersistenceError(code, message, {
  cause,
  details = {},
  actions,
  preserve = {},
} = {}) {
  const variant = RECOVERY_VARIANT[code] ?? 'unknown';
  const defaultActions = variant === 'storage'
    ? ['retry', 'export-diagnostic']
    : variant === 'migration'
      ? ['export-original', 'new-campaign']
      : ['retry', 'restore-backup', 'export-original', 'new-campaign'];

  return {
    code,
    message,
    recoverable: variant !== 'unknown',
    details,
    cause: cause instanceof Error ? cause.message : cause,
    uiState: {
      screenId: 'SCR-SYS-RECOVERY',
      variant,
      actions: actions ?? defaultActions,
      preserve: {
        active: preserve.active ?? true,
        backups: preserve.backups ?? true,
        settings: preserve.settings ?? true,
      },
    },
  };
}

export function assertStoragePort(port) {
  for (const method of ['get', 'set', 'remove']) {
    if (typeof port?.[method] !== 'function') {
      throw new TypeError(`StoragePort.${method} 구현이 필요합니다.`);
    }
  }
  return port;
}
