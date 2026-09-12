import { SettingsRepository } from '../campaign-runtime.js';
import { createS0D3StoragePort } from '../scenario/s0-d3-campaign.js';
import { DEFAULT_PUBLIC_SETTINGS, validatePublicSettings } from '../public-shell/publicShellContract.js';

export async function loadPresentationSettings() {
  let settings = DEFAULT_PUBLIC_SETTINGS;
  try {
    const repository = new SettingsRepository({ storage:createS0D3StoragePort(window.localStorage), validate:validatePublicSettings });
    const result = await repository.load(DEFAULT_PUBLIC_SETTINGS);
    if (result.ok) settings = result.value;
  } catch { /* 설정 오류가 저장 복구·화면 진입을 막지 않는다. */ }
  for (const key of ['largeHitArea', 'highContrast', 'reducedMotion']) document.body.dataset[key] = String(settings[key]);
  return settings;
}
