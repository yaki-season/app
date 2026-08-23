import {
  ART_BINDING_LOGICAL_VIEWPORT,
  D1_DRINK_ART_BINDING_INVENTORY,
  S0_ART_BINDING_INVENTORY,
  S0_D1_ART_BINDING_CONTRACT_VERSION,
  validateS0D1ArtBindingContract,
} from '../../../assets/s0D1ArtBindingContract.js';
import {
  indexApprovedRuntimeAssets,
  resolveApprovedRuntimeAsset,
} from '../../../assets/runtimeAssetResolver.js';

const errors = validateS0D1ArtBindingContract();
if (errors.length) throw new Error(`art binding contract 오류:\n${errors.join('\n')}`);

const entries = [...S0_ART_BINDING_INVENTORY, ...D1_DRINK_ART_BINDING_INVENTORY];
const params = new URLSearchParams(window.location.search);
const requestedComponentId = params.get('componentId') ?? S0_ART_BINDING_INVENTORY[0].componentId;
const mode = params.get('mode') === 'approved' ? 'approved' : 'placeholder';
const entry = entries.find((candidate) => candidate.componentId === requestedComponentId);
if (!entry) throw new Error(`알 수 없는 componentId: ${requestedComponentId}`);

async function resolveApprovedAssetUrl(requiredAssetId) {
  const injectedUrl = window.__ART_HARNESS_APPROVED_ASSETS__?.[requiredAssetId] ?? null;
  if (injectedUrl) return injectedUrl;
  if (mode !== 'approved') return null;
  try {
    const manifestUrl = window.location.pathname.startsWith('/src/')
      ? '/public/assets/manifest.json'
      : '/assets/manifest.json';
    const response = await fetch(manifestUrl);
    if (!response.ok) return null;
    const manifest = await response.json();
    return resolveApprovedRuntimeAsset(
      indexApprovedRuntimeAssets(manifest),
      requiredAssetId,
    )?.url ?? null;
  } catch {
    return null;
  }
}

const stage = document.querySelector('#logical-stage');
const camera = document.querySelector('#art-camera');
const semanticDom = document.querySelector('#semantic-dom');
const approvedAsset = document.querySelector('#approved-asset');
const placeholder = document.querySelector('#asset-placeholder');
const interactionBounds = document.querySelector('#interaction-bounds');
const domSafePrimary = document.querySelector('#dom-safe-primary');

const setRect = (node, rect) => {
  node.style.left = `${rect.x}px`;
  node.style.top = `${rect.y}px`;
  node.style.width = `${rect.width}px`;
  node.style.height = `${rect.height}px`;
};

const resizeStage = () => {
  const scale = Math.min(
    window.innerWidth / ART_BINDING_LOGICAL_VIEWPORT.width,
    window.innerHeight / ART_BINDING_LOGICAL_VIEWPORT.height,
  );
  stage.style.transform = `scale(${scale})`;
};

const fhd = entry.bounds.fhd;
setRect(placeholder, fhd.visualBounds);
setRect(approvedAsset, fhd.visualBounds);
setRect(domSafePrimary, fhd.domSafeRect);
if (fhd.interactionBounds) setRect(interactionBounds, fhd.interactionBounds);
else interactionBounds.hidden = true;

const approvedAssetUrl = await resolveApprovedAssetUrl(entry.requiredAssetId);
const renderApproved = mode === 'approved' && approvedAssetUrl;
placeholder.hidden = Boolean(renderApproved);
approvedAsset.hidden = !renderApproved;
if (renderApproved) approvedAsset.src = approvedAssetUrl;

document.querySelector('#contract-version').textContent = `v${S0_D1_ART_BINDING_CONTRACT_VERSION}`;
document.querySelector('#harness-title').textContent = `${entry.screenId} · ${entry.componentId}`;
document.querySelector('#placeholder-asset-id').textContent = entry.requiredAssetId;
document.querySelector('#state-identity').textContent = [
  entry.stateId,
  entry.phaseId,
  entry.interactionId,
  entry.stateVariant,
].filter(Boolean).join(' · ');
document.querySelector('#state-action').textContent = entry.interactionId ?? '시각 상태 확인';

document.body.dataset.contractVersion = S0_D1_ART_BINDING_CONTRACT_VERSION;
document.body.dataset.componentId = entry.componentId;
document.body.dataset.requiredAssetId = entry.requiredAssetId;
document.body.dataset.assetMode = renderApproved ? 'approved' : 'placeholder';
document.body.dataset.cameraId = entry.camera.cameraId;
document.body.dataset.semanticOwner = entry.semanticOwner;
document.body.dataset.bodyPartCount = String(entry.bodyPartCount);
camera.dataset.cameraId = entry.camera.cameraId;
semanticDom.dataset.domContract = `${entry.screenId}:${entry.stateId}`;

resizeStage();
window.addEventListener('resize', resizeStage);

window.__artRecompositionHarness = Object.freeze({
  contractVersion: S0_D1_ART_BINDING_CONTRACT_VERSION,
  entry,
  requestedMode: mode,
  renderedMode: renderApproved ? 'approved' : 'placeholder',
  snapshot: () => ({
    cameraId: camera.dataset.cameraId,
    domContract: semanticDom.dataset.domContract,
    stageRect: stage.getBoundingClientRect().toJSON(),
    cameraRect: camera.getBoundingClientRect().toJSON(),
    semanticDomRect: semanticDom.getBoundingClientRect().toJSON(),
    assetRect: (renderApproved ? approvedAsset : placeholder).getBoundingClientRect().toJSON(),
    interactionRect: fhd.interactionBounds ? interactionBounds.getBoundingClientRect().toJSON() : null,
    domSafeRect: domSafePrimary.getBoundingClientRect().toJSON(),
  }),
});
