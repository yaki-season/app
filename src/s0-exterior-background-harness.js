import {
  S0_EXTERIOR_BACKGROUND_BINDINGS,
  S0_EXTERIOR_BACKGROUND_BINDING_CONTRACT,
  S0_EXTERIOR_BACKGROUND_BINDING_CONTRACT_VERSION,
  validateS0ExteriorBackgroundBindingContract,
} from './assets/s0ExteriorBackgroundBindingContract.js';
import {
  indexApprovedRuntimeAssets,
  resolveApprovedRuntimeAsset,
} from './assets/runtimeAssetResolver.js';

const errors = validateS0ExteriorBackgroundBindingContract();
if (errors.length) throw new Error(`S0 exterior background contract 오류:\n${errors.join('\n')}`);

const params = new URLSearchParams(window.location.search);
const requestedStateId = params.get('stateId') ?? 'S0-STATE-KEY';
const mode = params.get('mode') === 'approved' ? 'approved' : 'placeholder';
const binding = S0_EXTERIOR_BACKGROUND_BINDINGS.find(
  ({ stateId }) => stateId === requestedStateId,
);
if (!binding) throw new Error(`알 수 없는 S0 exterior stateId: ${requestedStateId}`);

async function resolveApprovedAssetUrl(requiredAssetId) {
  const injectedUrl = window.__S0_EXTERIOR_APPROVED_ASSETS__?.[requiredAssetId] ?? null;
  if (injectedUrl) return injectedUrl;
  if (mode !== 'approved') return null;
  try {
    const manifestUrl = window.location.pathname.startsWith('/src/')
      ? '/public/assets/manifest.json'
      : '/assets/manifest.json';
    const response = await fetch(manifestUrl);
    if (!response.ok) return null;
    const manifest = await response.json();
    const asset = resolveApprovedRuntimeAsset(
      indexApprovedRuntimeAssets(manifest),
      requiredAssetId,
    );
    return asset?.url ?? null;
  } catch {
    return null;
  }
}

const fhd = binding.bounds.fhd;
const stage = document.querySelector('#logical-stage');
const camera = document.querySelector('#art-camera');
const semanticDom = document.querySelector('#semantic-dom');
const approvedAsset = document.querySelector('#approved-asset');
const placeholder = document.querySelector('#asset-placeholder');
const domSafe = document.querySelector('#dom-safe');
const stateAction = document.querySelector('#state-action');

const setRect = (node, rect) => {
  node.style.left = `${rect.x}px`;
  node.style.top = `${rect.y}px`;
  node.style.width = `${rect.width}px`;
  node.style.height = `${rect.height}px`;
};

setRect(approvedAsset, fhd.visualBounds);
setRect(placeholder, fhd.visualBounds);
setRect(domSafe, fhd.domSafeRect);

const approvedAssetUrl = await resolveApprovedAssetUrl(binding.requiredAssetId);
const renderApproved = mode === 'approved' && Boolean(approvedAssetUrl);
approvedAsset.hidden = !renderApproved;
placeholder.hidden = renderApproved;
if (renderApproved) approvedAsset.src = approvedAssetUrl;

document.querySelector('#contract-version').textContent =
  `v${S0_EXTERIOR_BACKGROUND_BINDING_CONTRACT_VERSION}`;
document.querySelector('#asset-id').textContent = binding.requiredAssetId;
document.querySelector('#source-master').textContent = binding.sourceMasterId;
document.querySelector('#state-identity').textContent =
  `${binding.stateId} · ${binding.phaseId} · ${binding.stateVariant}`;
document.querySelector('#state-action').textContent = binding.interactionId;

document.body.dataset.contractVersion = S0_EXTERIOR_BACKGROUND_BINDING_CONTRACT_VERSION;
document.body.dataset.requiredAssetId = binding.requiredAssetId;
document.body.dataset.assetMode = renderApproved ? 'approved' : 'placeholder';
document.body.dataset.cameraId = binding.camera.cameraId;
document.body.dataset.semanticOwner = binding.semanticOwner;
document.body.dataset.sourceMasterId = binding.sourceMasterId;
document.body.dataset.bodyPartCount = String(binding.bodyPartCount);
document.body.dataset.stateId = binding.stateId;
document.body.dataset.backgroundContractMode = 'state-specific';
document.body.dataset.forbiddenAssetId = binding.compositionPolicy.forbiddenAssetId;
document.body.dataset.runtimeVisualLayerCount =
  String(binding.compositionPolicy.runtimeVisualLayerCount);
document.body.dataset.openGateOutlineCount =
  String(binding.compositionPolicy.openGateOutlineCount);
document.body.dataset.closedGateResidualPixelCount =
  String(binding.compositionPolicy.closedGateResidualPixelCount);
document.body.dataset.prShopGateRuntimeVisual = String(
  binding.compositionPolicy.provenanceInteractionReference?.runtimeVisualLayerAllowed ?? false,
);
camera.dataset.cameraId = binding.camera.cameraId;
semanticDom.dataset.domContract = `${binding.screenId}:${binding.stateId}`;

const resizeStage = () => {
  const viewport = S0_EXTERIOR_BACKGROUND_BINDING_CONTRACT.logicalViewport;
  const scale = Math.min(window.innerWidth / viewport.width, window.innerHeight / viewport.height);
  stage.style.transform = `scale(${scale})`;
};
resizeStage();
window.addEventListener('resize', resizeStage);

window.__s0ExteriorBackgroundHarness = Object.freeze({
  contractVersion: S0_EXTERIOR_BACKGROUND_BINDING_CONTRACT_VERSION,
  binding,
  requestedMode: mode,
  renderedMode: renderApproved ? 'approved' : 'placeholder',
  snapshot: () => Object.freeze({
    cameraId: camera.dataset.cameraId,
    domContract: semanticDom.dataset.domContract,
    stageRect: stage.getBoundingClientRect().toJSON(),
    cameraRect: camera.getBoundingClientRect().toJSON(),
    semanticDomRect: semanticDom.getBoundingClientRect().toJSON(),
    assetRect: (renderApproved ? approvedAsset : placeholder).getBoundingClientRect().toJSON(),
    domSafeRect: domSafe.getBoundingClientRect().toJSON(),
    actionRect: stateAction.getBoundingClientRect().toJSON(),
    approvedVisualCount: Number(!approvedAsset.hidden),
    separateGateVisualCount: document.querySelectorAll(
      '[data-runtime-visual-asset-id="PR-SHOP-GATE-S0"]',
    ).length,
  }),
});
