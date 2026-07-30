// Developer 2와 후속 gameplay 작업이 사용하는 공개 진입점.
// UI 부팅 파일에는 자동 연결하지 않으며 port와 adapter를 조립하는 쪽에서 명시적으로 import한다.
export {
  CAMPAIGN_NODE_KIND,
  CAMPAIGN_PHASE,
  EARLY_CAMPAIGN_NODE_IDS,
  assertEarlyCampaignDefinition,
  beginBusinessDay,
  completeBusinessDay,
  completePrologue,
  createCampaignDefinition,
  createCampaignState,
  enterSettlement,
  validateCampaignState,
} from './domain/campaign/campaign.js';
export { CampaignRuntime } from './application/campaign/campaignRuntime.js';
export {
  CHECKPOINT_TYPE,
  FIRST_PUBLIC_SAVE_SCHEMA_VERSION,
  createMigrationRegistry,
  sealSaveEnvelope,
  serializeSaveEnvelope,
  validateSerializedSave,
} from './application/persistence/saveEnvelope.js';
export {
  PERSISTENCE_ERROR_CODE,
  StoragePortError,
  assertStoragePort,
  createPersistenceError,
} from './application/ports/persistence.js';
export { createSaveFilePort } from './application/ports/saveFile.js';
export {
  CampaignSaveRepository,
  DiagnosticsRepository,
  SAVE_STORAGE_KEYS,
  SettingsRepository,
} from './infrastructure/persistence/campaignSaveRepository.js';
export {
  LocalStorageAdapter,
  MemoryStorageAdapter,
} from './infrastructure/persistence/storageAdapters.js';
