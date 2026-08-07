import { describe, expect, it } from 'vitest';
import {
  assertPromotionSemanticOwnerAlignment,
  auditPromotionSemanticOwnerAlignment,
} from '../../src/assets/artSemanticOwnerContract.js';
import { D1_RUNTIME_COMPONENT_INVENTORY } from '../../src/assets/d1RuntimeInventory.js';
import { ART_SEMANTIC_OWNER_ID } from '../../src/assets/artSemanticOwnerIds.js';

const existingApprovedIds = [
  'ARTIST-010-BACKGROUND-COMPLETE',
  'BG-SEATING-6',
  'BG-SERVICE-TABLE-ARTIST009',
  'D1-TSUKIOKA-WAITING',
  'D1-TSUKIOKA-PARTIAL-BEER-WAITING',
  'D1-TSUKIOKA-RECEIVED-EATING',
  'UI-CUSTOMER-ORDER-WAIT-PANEL',
  'UI-CUSTOMER-ORDER-ICON-NEGIMA',
  'UI-CUSTOMER-ORDER-ICON-DRAFT-BEER',
];

describe('art semanticOwner promotion preflight', () => {
  it('runtime inventory의 축약 owner를 fully-qualified machine ID로 통일한다', () => {
    expect(new Set(D1_RUNTIME_COMPONENT_INVENTORY.map((entry) => entry.semanticOwner))).toEqual(
      new Set([
        ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING,
        ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE,
      ]),
    );
    expect(D1_RUNTIME_COMPONENT_INVENTORY.some(
      (entry) => entry.semanticOwner === 'artist-1' || entry.semanticOwner === 'artist-3',
    )).toBe(false);
  });

  it('기존 승인 순서를 유지한 채 통근 손님과 D1 조립·그릴 배치본을 bound에 추가한다', () => {
    const boundRows = D1_RUNTIME_COMPONENT_INVENTORY.filter(
      (entry) => entry.bindingState === 'bound',
    );
    const boundIds = boundRows.map((entry) => entry.requiredAssetId);
    // 이 테스트가 지키는 것은 "기존 승인 순서 보존"이다. 전체 목록을 박아두면 아트가 하나
    // 붙을 때마다 여기까지 고쳐야 해서 불변식만 남긴다. 새 binding의 정합성은
    // auditD1RuntimeAssetBindingContract(inventory↔resolver 대조)와 assets:validate(파일·SHA)가
    // 이미 강제한다.
    expect(boundIds.slice(0, existingApprovedIds.length)).toEqual(existingApprovedIds);
    expect(new Set(boundIds).size).toBe(boundIds.length);
    expect(boundIds.length).toBeGreaterThanOrEqual(existingApprovedIds.length);
  });

  it('Artist metadata·binding·runtime owner가 일치할 때만 promotion을 허용한다', () => {
    expect(auditPromotionSemanticOwnerAlignment({
      assetId: 'BG-WORKSPACE-DRINK',
      metadataSemanticOwner: ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE,
    })).toMatchObject({
      valid: true,
      bindingOwners: [ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE],
      runtimeOwners: [ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE],
    });
    expect(auditPromotionSemanticOwnerAlignment({
      assetId: 'BG-EXTERIOR-S0-CLOSED',
      metadataSemanticOwner: ART_SEMANTIC_OWNER_ID.ARTIST_2_S0_PROLOGUE,
    })).toMatchObject({
      valid: true,
      bindingOwners: [ART_SEMANTIC_OWNER_ID.ARTIST_2_S0_PROLOGUE],
      runtimeOwners: [],
    });
    expect(auditPromotionSemanticOwnerAlignment({
      assetId: 'BG-EXTERIOR-S0-GATE-OPEN',
      metadataSemanticOwner: ART_SEMANTIC_OWNER_ID.ARTIST_2_S0_PROLOGUE,
    })).toMatchObject({
      valid: true,
      bindingOwners: [ART_SEMANTIC_OWNER_ID.ARTIST_2_S0_PROLOGUE],
      runtimeOwners: [],
    });
  });

  it('축약 metadata owner와 cross-repo owner 불일치를 receipt 전에 거부한다', () => {
    expect(() => assertPromotionSemanticOwnerAlignment({
      assetId: 'BG-WORKSPACE-DRINK',
      metadataSemanticOwner: 'artist-3',
    })).toThrow(/not fully qualified/);
    expect(() => assertPromotionSemanticOwnerAlignment({
      assetId: 'BG-WORKSPACE-DRINK',
      metadataSemanticOwner: ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING,
    })).toThrow(/metadata\/binding\/runtime owner mismatch/);

    const audit = auditPromotionSemanticOwnerAlignment({
      assetId: 'BG-WORKSPACE-DRINK',
      metadataSemanticOwner: ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE,
      artBindings: [{
        requiredAssetId: 'BG-WORKSPACE-DRINK',
        semanticOwner: ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING,
      }],
      runtimeInventory: [{
        requiredAssetId: 'BG-WORKSPACE-DRINK',
        semanticOwner: ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE,
      }],
    });
    expect(audit.valid).toBe(false);
    expect(audit.errors).toContain(
      `binding/runtime owner mismatch for BG-WORKSPACE-DRINK: `
      + `${ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING}, `
      + ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE,
    );
  });
});
