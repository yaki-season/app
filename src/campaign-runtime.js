// Developer 2와 후속 gameplay 작업이 사용하는 공개 진입점.
// UI 부팅 파일에는 자동 연결하지 않으며 port와 adapter를 조립하는 쪽에서 명시적으로 import한다.
export {
  CAMPAIGN_NODE_KIND,
  CAMPAIGN_PHASE,
  D4_CAMPAIGN_NODE_IDS,
  EARLY_CAMPAIGN_NODE_IDS,
  assertD4CampaignDefinition,
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
  D1_BUSINESS_DAY_RELEASE_DEFINITION_URL,
  D1_BUSINESS_DAY_RELEASE_SCHEMA_VERSION,
  D1_DEFINITION_CONSUMER_ERROR_CODE,
  consumeD1BusinessDayReleaseDefinition,
  loadD1BusinessDayReleaseDefinition,
} from './application/ports/d1BusinessDayDefinition.js';
export { D1BusinessDayRuntime } from './application/businessDay/d1BusinessDayRuntime.js';
export {
  D1BusinessDayUiPort,
  D1_UI_ERROR_CODE,
  D1_UI_INTENT,
  buildD1BusinessDayViewModel,
} from './application/businessDay/d1BusinessDayUiPort.js';
export { createD1CookStations } from './render/cookStations.js';
export {
  D1_RUNTIME_COMPONENT_INVENTORY,
  reportD1RuntimeComponentInventory,
} from './assets/d1RuntimeInventory.js';
export {
  BUSINESS_DAY_ARRIVAL_POLICY,
  D1_CUSTOMER_PHASE,
  D1_DAY_PHASE,
  D1_ORDER_STATUS,
  D1_QUALITY,
  D1_SETTLEMENT_STEPS,
  advanceD1BusinessDay,
  buildBusinessDayCampaignReward,
  buildD1CampaignReward,
  createBusinessDayDefinition,
  createD1BusinessDayDefinition,
  createD1BusinessDayState,
  d1DebugView,
  dispatchD1Command,
  markD1BusinessDayComplete,
  summarizeD1Settlement,
  validateD1BusinessDayState,
} from './domain/businessDay/d1BusinessDay.js';
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
