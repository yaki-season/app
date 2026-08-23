// D1 첫 주문 — 평면 DOM 아트 레이어 진입점. 승인 manifest ID만 실제 이미지로 연결하고,
// handoff가 없는 조리 화면은 명시적 개발 placeholder로 남긴다.
import { loadD1RuntimeAssets } from '../../assets/runtimeAssetResolver.js';
import { mountD1 } from '../../d1/view.js';

const customerArt = document.querySelector('#customer-art');
const artStage = document.querySelector('#customer-art-stage');
const backgroundArt = artStage.querySelector('.art-background');
const seatingArt = artStage.querySelector('.art-seating');
const tableArt = artStage.querySelector('.art-table');
const sceneStatus = document.querySelector('#scene-status');
const sceneTitle = document.querySelector('#scene-title');
const sceneDescription = document.querySelector('#scene-description');

function renderScene({ kind, customerAsset, pendingAssetIds }) {
  if (kind === 'customer') {
    artStage.hidden = false;
    backgroundArt.src = assets.CUSTOMER_BACKGROUND.url;
    customerArt.hidden = false;
    seatingArt.hidden = false;
    tableArt.hidden = false;
    sceneStatus.classList.add('approved');
    sceneStatus.dataset.assetState = 'approved';
    sceneStatus.dataset.manifestId = customerAsset.id;
    sceneStatus.removeAttribute('data-missing-asset-ids');
    sceneTitle.textContent = '승인 runtime 아트 적용';
    sceneDescription.textContent = `gameplay 상태 → ${customerAsset.id}@R${customerAsset.sourceRevision}-B${customerAsset.runtimeBuild}`;
    return;
  }
  if (kind === 'drink') {
    artStage.hidden = false;
    backgroundArt.src = assets.DRINK_BACKGROUND.url;
    customerArt.hidden = true;
    seatingArt.hidden = true;
    tableArt.hidden = true;
    sceneStatus.classList.remove('approved');
    sceneStatus.dataset.assetState = 'partial';
    sceneStatus.dataset.manifestId = assets.DRINK_BACKGROUND.id;
    sceneStatus.dataset.missingAssetIds = pendingAssetIds.join(',');
    sceneTitle.textContent = '승인 생맥주 작업 배경 적용';
    sceneDescription.textContent =
      `gameplay drink.scene → ${assets.DRINK_BACKGROUND.id}@R`
      + `${assets.DRINK_BACKGROUND.sourceRevision}-B${assets.DRINK_BACKGROUND.runtimeBuild}; `
      + `개발 중 asset ID: ${pendingAssetIds.join(', ')}`;
    return;
  }
  artStage.hidden = true;
  sceneStatus.classList.remove('approved');
  sceneStatus.dataset.assetState = 'placeholder';
  sceneStatus.dataset.missingAssetIds = pendingAssetIds.join(',');
  sceneStatus.removeAttribute('data-manifest-id');
  sceneTitle.textContent = kind === 'assembly' ? '네기마 조립 화면' : '숯불 그릴 화면';
  sceneDescription.textContent = `승인됐지만 finalizer runtime handoff가 없어 개발 중 placeholder로 표시합니다. 대기 asset ID: ${pendingAssetIds.join(', ')}`;
}

const assets = await loadD1RuntimeAssets();
document.body.dataset.assetPlaceholderCount = String(assets.readiness.placeholderCount);
document.body.dataset.runtimeAssetsReady = String(assets.readiness.ready);
document.body.dataset.runtimeContractValid = String(assets.readiness.contractAudit.valid);
for (const image of document.querySelectorAll('[data-runtime-asset]')) {
  image.src = assets[image.dataset.runtimeAsset].url;
}
document.documentElement.style.setProperty('--order-panel-skin', `url("${assets.ORDER_PANEL.url}")`);

const session = mountD1({
  assets,
  onArt: (asset) => {
    if (customerArt.getAttribute('src') !== asset.url) customerArt.setAttribute('src', asset.url);
  },
  onScene: renderScene,
});

window.__d1Debug = {
  getState: session.getState,
  now: session.now,
  assetReadiness: () => assets.readiness,
  getRuntimeAssetIds: () => Object.values(assets).filter((asset) => asset?.id).map((asset) => asset.id),
};
