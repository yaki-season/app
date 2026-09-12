export const FIRST_ORDER_RUNTIME_STORAGE_KEY = 'yaki-season:d1-first-order-runtime:v1';

export function hasInProgressBusiness(storage, campaign) {
  try {
    const saved = JSON.parse(storage?.getItem(FIRST_ORDER_RUNTIME_STORAGE_KEY) ?? 'null');
    const business = saved?.business;
    const dayId = campaign?.campaign?.dayId;
    return Boolean(saved?.stateVersion === 1 && business && dayId
      && business.dayId === dayId
      && business.runId === `${campaign.meta.campaignId}:${dayId}`
      && ['open', 'closing-drain', 'charcoal-down', 'settlement'].includes(business.phase)
      && Number.isFinite(business.clock?.elapsedMs));
  } catch { return false; }
}

export function clearFirstOrderRuntime(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(FIRST_ORDER_RUNTIME_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
