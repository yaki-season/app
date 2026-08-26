import * as THREE from 'three';
import { tareCoatMultiplier } from './grillShaderParams.js';
import { runtimeAssetUrl } from '../assets/runtimeAssetResolver.js';

const WHITE_TINT = new THREE.Color(0xffffff);
// 타레 갈색은 익힘 셰이더와 같은 정본을 쓴다. 라스터 단계(모모·토리카와)와 GLSL 단계(네기마)가
// 서로 다른 갈색이면 같은 타레 꼬치가 화면마다 다른 색으로 보인다.
const TARE_TINT = new THREE.Color().setRGB(...tareCoatMultiplier(), THREE.LinearSRGBColorSpace);

export const D2_MOMO_RUNTIME_URLS = Object.freeze({
  raw: '/assets/campaign/d2/spr-momo-grill-raw-r1-b1.png',
  cooking: '/assets/campaign/d2/spr-momo-grill-cooking-r1-b1.png',
  proper: '/assets/campaign/d2/spr-momo-grill-proper-r1-b1.png',
  overcooked: '/assets/campaign/d2/spr-momo-grill-overcooked-r1-b1.png',
  burnt: '/assets/campaign/d2/spr-momo-grill-burnt-r1-b1.png',
  order: '/assets/campaign/d2/order-icon-momo-r1-b1.png',
  servedPlate: '/assets/campaign/d2/pr-served-momo-plate-r1-b1.png',
  assemblyProgress: Object.freeze(Array.from(
    { length: 6 },
    (_, index) => `/assets/campaign/d2/spr-momo-assembly-progress-${index}-r1-b1.png`,
  )),
});

function spriteInstance(textures, slotMesh, sourceTransform, initialStage, assetId) {
  const holder = new THREE.Group();
  holder.name = `d2MomoSprite:${slotMesh.userData.objectKey}`;
  holder.userData.objectKey = slotMesh.userData.objectKey;
  holder.visible = false;

  const root = new THREE.Group();
  root.name = 'd2MomoSpriteRoot';
  root.userData.assetId = assetId;
  root.rotation.set(
    sourceTransform.rootRotationRadians.x,
    sourceTransform.rootRotationRadians.y,
    sourceTransform.rootRotationRadians.z,
  );
  root.scale.set(sourceTransform.horizontalScale, sourceTransform.verticalScale, 1);
  const flipPivot = new THREE.Group();
  flipPivot.name = 'flipPivot';
  root.add(flipPivot);

  const planes = {};
  Object.entries(textures).forEach(([stage, texture], index) => {
    const width = Number(texture.image?.naturalWidth ?? texture.image?.width ?? 109);
    const height = Number(texture.image?.naturalHeight ?? texture.image?.height ?? 494);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(width / height, 1),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.02,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    plane.name = `d2MomoSprite:${stage}`;
    plane.renderOrder = 360 + index;
    plane.frustumCulled = false;
    plane.raycast = () => {};
    plane.visible = stage === initialStage;
    planes[stage] = plane;
    flipPivot.add(plane);
  });

  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  root.position.sub(center);
  holder.add(root);

  slotMesh.geometry.computeBoundingBox();
  const targetSize = slotMesh.geometry.boundingBox.getSize(new THREE.Vector3());
  const sx = targetSize.x / size.x;
  const sy = targetSize.y / size.y;
  if (sourceTransform.fit === 'contain') holder.scale.setScalar(Math.min(sx, sy));
  else holder.scale.set(sx, sy, Math.min(sx, sy));
  holder.position.copy(slotMesh.position);
  holder.quaternion.copy(slotMesh.userData.grillBaseQuaternion ?? slotMesh.quaternion);
  holder.userData.stage = initialStage;
  holder.updateMatrixWorld(true);

  return {
    holder,
    root,
    flipPivot,
    targetSize,
    setStage(stage) {
      const normalized = Object.hasOwn(planes, String(stage)) ? String(stage) : initialStage;
      Object.entries(planes).forEach(([key, plane]) => { plane.visible = key === normalized; });
      holder.userData.stage = normalized;
      return normalized;
    },
    setTare(amount = 0) {
      const mix = Math.max(0, Math.min(1, Number(amount) || 0));
      Object.values(planes).forEach((plane) => {
        plane.material.color.copy(WHITE_TINT).lerp(TARE_TINT, mix);
      });
    },
    stage: () => holder.userData.stage,
  };
}

async function loadTexture(loader, url) {
  const texture = await loader.loadAsync(runtimeAssetUrl(url));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export async function loadSkewerSpriteRuntime({
  urls,
  status = 'approved',
  assetId,
  textureLoader = new THREE.TextureLoader(),
} = {}) {
  const [stageEntries, assemblyEntries] = await Promise.all([
    Promise.all(['raw', 'cooking', 'proper', 'overcooked', 'burnt'].map(async (stage) => [
      stage,
      await loadTexture(textureLoader, urls[stage]),
    ])),
    Promise.all(urls.assemblyProgress.map(async (url, index) => [
      String(index),
      await loadTexture(textureLoader, url),
    ])),
  ]);
  const stageTextures = Object.freeze(Object.fromEntries(stageEntries));
  const assemblyTextures = Object.freeze(Object.fromEntries(assemblyEntries));
  return Object.freeze({
    status,
    urls,
    createGrillInstance: (slotMesh, sourceTransform) => (
      spriteInstance(stageTextures, slotMesh, sourceTransform, 'raw', assetId)
    ),
    createAssemblyInstance: (slotMesh, sourceTransform) => {
      const instance = spriteInstance(assemblyTextures, slotMesh, sourceTransform, '0', assetId);
      return {
        ...instance,
        setIngredientCount: (count) => instance.setStage(Math.max(0, Math.min(5, Math.trunc(Number(count) || 0)))),
        ingredientCount: () => Number(instance.stage()),
      };
    },
    createTrayInstance: (slotMesh, sourceTransform) => {
      const instance = spriteInstance(
        { raw: stageTextures.raw },
        slotMesh,
        sourceTransform,
        'raw',
        assetId,
      );
      return { ...instance, ingredientCount: () => 5 };
    },
  });
}

export async function loadD2MomoSpriteRuntime({ textureLoader = new THREE.TextureLoader() } = {}) {
  return loadSkewerSpriteRuntime({
    urls: D2_MOMO_RUNTIME_URLS,
    status: 'approved',
    assetId: 'MDL-MOMO-GRILL-R1-CANDIDATE',
    textureLoader,
  });
}
