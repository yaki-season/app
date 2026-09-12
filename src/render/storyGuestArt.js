import { storyGuestForCustomer } from '../domain/businessDay/storyGuests.js';
import { indexApprovedRuntimeAssets, resolveApprovedRuntimeAsset } from '../assets/runtimeAssetResolver.js';
import { resolveD1OfficeCustomerFrame, D1_OFFICE_CUSTOMER_FRAME_INTERVAL_MS } from './d1OfficeCustomerArt.js';

export const NEIGHBORHOOD_CUSTOMER_ASSET_IDS = Object.freeze({
  akane: 'CH-GUEST-AKANE-SERVICE', naoko: 'CH-GUEST-NAOKO-SERVICE',
  shun: 'CH-GUEST-SHUN-SERVICE', daichi: 'CH-GUEST-DAICHI-SERVICE',
});

// 인물 신원은 날짜·방문 유형·숫자 순번과 분리한다. 미승인 파일을 경로 추측으로 읽지 않는다.
export function createStoryGuestArt(runtimeAssets) {
  const index = indexApprovedRuntimeAssets(runtimeAssets.manifest);
  const added = Object.fromEntries(Object.entries(NEIGHBORHOOD_CUSTOMER_ASSET_IDS)
    .map(([key, id]) => [key, resolveApprovedRuntimeAsset(index, id)]));
  return {
    pendingAssetIds: Object.entries(added).filter(([, asset]) => !asset).map(([key]) => NEIGHBORHOOD_CUSTOMER_ASSET_IDS[key]),
    assets: Object.values(added).filter(Boolean),
    resolve(options) {
      const profile = storyGuestForCustomer(options.customerId);
      if (!profile?.artVariant) return null;
      if (/^[a-e]$/.test(profile.artVariant)) return resolveD1OfficeCustomerFrame(runtimeAssets.COMMUTER_CUSTOMER,
        { ...options, customerId: `D1-OFFICE-${profile.artVariant.toUpperCase()}` });
      const waiting = added[profile.key];
      if (!waiting) return null; // 승격 대기. 호출자는 기존 출시 호환 경로를 명시적으로 유지한다.
      const actions = [];
      if (options.servedNegima) actions.push('eating-negima');
      if (options.servedBeer) actions.push('drinking-beer');
      if (!actions.length) return { ...waiting, frameRole: `${profile.key}-waiting` };
      const state = actions[Math.floor(Math.max(0, options.nowMs ?? 0) / D1_OFFICE_CUSTOMER_FRAME_INTERVAL_MS) % actions.length];
      const frame = waiting.companions.find(c => c.role === state);
      return frame ? { ...frame, frameRole: `${profile.key}-${state}` } : { ...waiting, frameRole: `${profile.key}-waiting` };
    },
  };
}
