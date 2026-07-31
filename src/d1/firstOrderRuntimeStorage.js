export const FIRST_ORDER_RUNTIME_STORAGE_KEY = 'yaki-season:d1-first-order-runtime:v1';

export function clearFirstOrderRuntime(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(FIRST_ORDER_RUNTIME_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
