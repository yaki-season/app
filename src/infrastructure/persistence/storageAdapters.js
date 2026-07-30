import {
  PERSISTENCE_ERROR_CODE,
  StoragePortError,
} from '../../application/ports/persistence.js';

function mapStorageError(operation, cause) {
  if (cause?.name === 'QuotaExceededError') {
    return new StoragePortError(
      PERSISTENCE_ERROR_CODE.WRITE_FAILED,
      '브라우저 저장 공간이 부족합니다.',
      cause,
    );
  }
  const code = operation === 'get'
    ? PERSISTENCE_ERROR_CODE.READ_FAILED
    : operation === 'remove'
      ? PERSISTENCE_ERROR_CODE.REMOVE_FAILED
      : PERSISTENCE_ERROR_CODE.WRITE_FAILED;
  return new StoragePortError(code, `localStorage ${operation} 작업에 실패했습니다.`, cause);
}

export class LocalStorageAdapter {
  constructor(storage = globalThis.localStorage) {
    if (!storage) {
      throw new StoragePortError(
        PERSISTENCE_ERROR_CODE.STORAGE_UNAVAILABLE,
        'localStorage를 사용할 수 없습니다.',
      );
    }
    this.storage = storage;
  }

  async get(key) {
    try {
      return this.storage.getItem(key);
    } catch (cause) {
      throw mapStorageError('get', cause);
    }
  }

  async set(key, value) {
    try {
      this.storage.setItem(key, value);
    } catch (cause) {
      throw mapStorageError('set', cause);
    }
  }

  async remove(key) {
    try {
      this.storage.removeItem(key);
    } catch (cause) {
      throw mapStorageError('remove', cause);
    }
  }
}

// 브라우저 없는 단위·통합 테스트와 Developer 2의 fixture 조립에 쓰는 adapter다.
export class MemoryStorageAdapter {
  constructor(initialEntries = {}) {
    this.entries = new Map(Object.entries(initialEntries));
    this.failures = [];
  }

  failNext(operation, error = new StoragePortError(
    operation === 'get' ? PERSISTENCE_ERROR_CODE.READ_FAILED : PERSISTENCE_ERROR_CODE.WRITE_FAILED,
    `의도된 ${operation} 실패`,
  )) {
    this.failures.push({ operation, error });
  }

  maybeFail(operation) {
    const index = this.failures.findIndex((failure) => failure.operation === operation);
    if (index < 0) return;
    const [{ error }] = this.failures.splice(index, 1);
    throw error;
  }

  async get(key) {
    this.maybeFail('get');
    return this.entries.get(key) ?? null;
  }

  async set(key, value) {
    this.maybeFail('set');
    this.entries.set(key, value);
  }

  async remove(key) {
    this.maybeFail('remove');
    this.entries.delete(key);
  }

  snapshot() {
    return Object.fromEntries(this.entries);
  }
}
