import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PUBLIC_SETTINGS,
  DIAGNOSTIC_FORMAT,
  buildSafeDiagnostic,
  isCampaignCompleteSave,
  serializeSafeDiagnostic,
  validatePublicSettings,
  viewportBucket,
} from '../../src/public-shell/publicShellContract.js';

describe('public shell 설정과 진단 계약', () => {
  it('오디오·원격 설정 없이 네 개의 시각·입력 설정만 허용한다', () => {
    expect(validatePublicSettings(DEFAULT_PUBLIC_SETTINGS)).toEqual({ valid: true, errors: [] });
    expect(validatePublicSettings({ ...DEFAULT_PUBLIC_SETTINGS, audioVolume: 0.5 })).toMatchObject({
      valid: false,
    });
    expect(Object.keys(DEFAULT_PUBLIC_SETTINGS)).toEqual([
      'largeHitArea',
      'highContrast',
      'reducedMotion',
      'helpEnabled',
    ]);
  });

  it('진단 직렬화는 허용 목록만 남겨 경로·payload·원본 콘텐츠를 제외한다', () => {
    const diagnostic = buildSafeDiagnostic({
      error: {
        code: 'INVALID_PAYLOAD',
        message: '/Users/private/save.json',
        payload: { dialogue: '원본 대사' },
        uiState: { variant: 'save-invalid' },
      },
      screenId: 'SCR-SYS-RECOVERY',
      saveState: 'invalid',
      viewport: { width: 1920, height: 1080 },
      occurredAt: '2026-07-30T00:00:00.000Z',
    });
    const text = serializeSafeDiagnostic({
      ...diagnostic,
      localPath: '/Users/private/save.json',
      payload: { dialogue: '원본 대사' },
    });

    expect(diagnostic.format).toBe(DIAGNOSTIC_FORMAT);
    expect(text).not.toContain('/Users');
    expect(text).not.toContain('payload');
    expect(text).not.toContain('원본 대사');
    expect(JSON.parse(text)).toEqual(diagnostic);
  });

  it('FHD와 1280×720 viewport bucket을 구분한다', () => {
    expect(viewportBucket({ width: 1920, height: 1080 })).toBe('fhd');
    expect(viewportBucket({ width: 1280, height: 720 })).toBe('hd');
    expect(viewportBucket({ width: 800, height: 600 })).toBe('other');
  });
});

describe('D5 완료 종착 저장 계약', () => {
  it('정확한 D5 완료 저장만 완료 상태로 허용한다', () => {
    const result = {
      ok: true,
      value: {
        envelope: {
          payload: { campaign: { nodeId: 'd5-complete', phase: 'preview' } },
        },
      },
    };
    expect(isCampaignCompleteSave(result)).toBe(true);
    expect(isCampaignCompleteSave({
      ...result,
      value: { envelope: { payload: { campaign: { nodeId: 'd3', phase: 'pre-open' } } } },
    })).toBe(false);
    expect(isCampaignCompleteSave({ ok: false })).toBe(false);
  });
});
