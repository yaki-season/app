export const PUBLIC_SHELL_VERSION = 'public-shell-v1';
export const DIAGNOSTIC_FORMAT = 'yaki-season-diagnostic-v1';

export const DEFAULT_PUBLIC_SETTINGS = Object.freeze({
  largeHitArea: false,
  highContrast: false,
  reducedMotion: false,
  helpEnabled: true,
});

export function validatePublicSettings(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['설정은 객체여야 합니다.'] };
  }
  for (const key of Object.keys(DEFAULT_PUBLIC_SETTINGS)) {
    if (typeof value[key] !== 'boolean') errors.push(`${key}는 boolean이어야 합니다.`);
  }
  const unknownKeys = Object.keys(value).filter((key) => !(key in DEFAULT_PUBLIC_SETTINGS));
  if (unknownKeys.length > 0) errors.push(`지원하지 않는 설정: ${unknownKeys.join(', ')}`);
  return { valid: errors.length === 0, errors };
}

export function viewportBucket({ width, height }) {
  if (width >= 1800 && height >= 1000) return 'fhd';
  if (width >= 1200 && height >= 680) return 'hd';
  return 'other';
}

export function buildSafeDiagnostic({
  error,
  screenId,
  saveState,
  viewport,
  occurredAt = new Date().toISOString(),
} = {}) {
  return Object.freeze({
    format: DIAGNOSTIC_FORMAT,
    shellVersion: PUBLIC_SHELL_VERSION,
    occurredAt,
    code: String(error?.code ?? 'NONE'),
    variant: String(error?.uiState?.variant ?? 'none'),
    screenId: String(screenId ?? 'SCR-SYS-START'),
    saveState: String(saveState ?? 'unknown'),
    viewport: viewportBucket(viewport ?? { width: 0, height: 0 }),
    remoteCollection: false,
  });
}

export function serializeSafeDiagnostic(diagnostic) {
  const allowedKeys = [
    'format',
    'shellVersion',
    'occurredAt',
    'code',
    'variant',
    'screenId',
    'saveState',
    'viewport',
    'remoteCollection',
  ];
  const safe = Object.fromEntries(allowedKeys.map((key) => [key, diagnostic[key]]));
  return `${JSON.stringify(safe, null, 2)}\n`;
}

export function isCampaignCompleteSave(loadResult) {
  return Boolean(
    loadResult?.ok
      && loadResult.value?.envelope?.payload?.campaign?.nodeId === 'd5-preview'
      && loadResult.value.envelope.payload.campaign.phase === 'preview',
  );
}

export function saveSummary(loadResult) {
  if (!loadResult?.ok) return null;
  const envelope = loadResult.value.envelope;
  const nodeId = envelope.payload.campaign.nodeId;
  return Object.freeze({
    checkpointType: envelope.checkpointType,
    completedDayId: envelope.completedDayId,
    nodeId,
    dayLabel: nodeId === 'd5-preview' ? 'D4 완료' : nodeId.toUpperCase(),
    writtenAt: envelope.writtenAt,
  });
}
