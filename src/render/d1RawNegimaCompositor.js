import * as THREE from 'three';
import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

export const D1_RAW_NEGIMA_COMPOSITION_ID = 'MDL-NEGIMA-GRILL-RAW';
export const D1_RAW_NEGIMA_SEQUENCE = Object.freeze([
  'chicken',
  'green-onion',
  'chicken',
  'green-onion',
  'chicken',
]);
export const D1_RAW_NEGIMA_TRIANGLE_COUNT = 476;

function hex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(bytes, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle) throw new Error('WebCrypto SHA-256을 사용할 수 없습니다');
  return hex(await cryptoImpl.subtle.digest('SHA-256', bytes));
}

function exactAssetPlan(bundle) {
  if (!bundle?.composition) throw new Error('RAW 네기마 composition manifest binding이 없습니다');
  const plan = [{ role: 'composition', asset: bundle.composition }];
  for (const [name, source] of Object.entries(bundle.sources ?? {})) {
    plan.push(
      { role: `${name}-model`, asset: source.model },
      { role: `${name}-albedo`, asset: source.albedo },
    );
  }
  if (plan.length !== 7) throw new Error(`RAW 네기마 exact asset 수 불일치: ${plan.length}/7`);
  for (const item of plan) {
    if (!item.asset?.url || !item.asset?.sha256) {
      throw new Error(`RAW 네기마 exact manifest metadata 누락: ${item.role}`);
    }
  }
  return Object.freeze(plan.map((item) => Object.freeze(item)));
}

async function fetchExactAsset(item, fetchImpl, cryptoImpl, network) {
  const response = await fetchImpl(item.asset.url);
  const record = {
    role: item.role,
    url: item.asset.url,
    expectedSha256: item.asset.sha256,
    status: response.status,
    ok: response.ok,
  };
  network.push(record);
  if (!response.ok) {
    throw new Error(`${item.role} 로드 실패 (${response.status}): ${item.asset.url}`);
  }
  const bytes = await response.arrayBuffer();
  record.bytes = bytes.byteLength;
  record.actualSha256 = await sha256(bytes, cryptoImpl);
  record.sha256Match = record.actualSha256 === item.asset.sha256;
  if (!record.sha256Match) {
    throw new Error(`${item.role} SHA-256 불일치: ${item.asset.url}`);
  }
  return bytes;
}

function parseGltf(gltfLoader, bytes) {
  return new Promise((resolve, reject) => {
    gltfLoader.parse(bytes, '', resolve, reject);
  });
}

async function textureFromPng(bytes, createImageBitmapImpl) {
  if (typeof createImageBitmapImpl !== 'function') {
    throw new Error('PNG nearest albedo decode를 위한 createImageBitmap이 없습니다');
  }
  const image = await createImageBitmapImpl(new Blob([bytes], { type: 'image/png' }));
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function bindNearestPixelAlbedo(gltf, albedo) {
  const root = gltf.scene;
  const decal = root.getObjectByName('pixel-material-plane');
  if (!decal?.isMesh) {
    throw new Error('승인 source model에 pixel-material-plane이 없습니다');
  }
  decal.material = decal.material.clone();
  decal.material.map = albedo;
  decal.material.needsUpdate = true;
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.frustumCulled = false;
    node.raycast = () => {};
    // 승인 station은 투명 full-frame plane이므로 기본 opaque GLB pass보다 뒤에 그려진다.
    // food를 같은 transparent pass의 명시적 overlay로 보내 station 위에서 보이게 한다.
    node.renderOrder = 100;
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      if (material?.color) material.color.setRGB(1, 0.94, 0.86);
      if (material) {
        material.side = THREE.DoubleSide;
        material.transparent = true;
        material.depthTest = false;
        material.depthWrite = false;
        material.needsUpdate = true;
      }
    }
  });
  return root;
}

function triangleCount(root) {
  let total = 0;
  root.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    const count = node.geometry.index?.count ?? node.geometry.attributes.position?.count ?? 0;
    total += count / 3;
  });
  return total;
}

function materialCount(root) {
  const materials = new Set();
  root.traverse((node) => {
    if (!node.isMesh) return;
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      if (material) materials.add(material);
    }
  });
  return materials.size;
}

export function validateD1RawNegimaComposition(composition) {
  const valid = (
    composition?.id === D1_RAW_NEGIMA_COMPOSITION_ID
    && composition?.sourceRevision === 1
    && composition?.rootNode === 'grillNegimaRoot'
    && composition?.flipPivot?.node === 'flipPivot'
    && composition?.triangleCount === D1_RAW_NEGIMA_TRIANGLE_COUNT
    && composition?.ingredientScaleRelativeToBase === 1.4
    && JSON.stringify(composition?.sequence) === JSON.stringify(D1_RAW_NEGIMA_SEQUENCE)
  );
  if (!valid) throw new Error('RAW 네기마 composition 계약이 승인 R1과 다릅니다');
  return composition;
}

function buildComposition({ composition, models, textures }) {
  const root = new THREE.Group();
  root.name = composition.rootNode;
  root.userData.assetId = composition.id;

  const flipPivot = new THREE.Group();
  flipPivot.name = composition.flipPivot.node;
  flipPivot.userData.axis = '+Y skewer length axis';
  flipPivot.userData.face = 0;
  root.add(flipPivot);

  const base = bindNearestPixelAlbedo(models.skewerBase, textures.skewerBase);
  base.name = 'approvedSkewerBase';
  base.rotation.z = 0;
  flipPivot.add(base);

  const ingredientSources = {
    chicken: bindNearestPixelAlbedo(models.chicken, textures.chicken),
    'green-onion': bindNearestPixelAlbedo(models.negi, textures.negi),
  };
  for (const [index, ingredient] of composition.sequence.entries()) {
    const component = ingredientSources[ingredient].clone(true);
    component.name = `${ingredient}-${String(index + 1).padStart(2, '0')}`;
    component.scale.setScalar(composition.ingredientScaleRelativeToBase);
    const slot = base.getObjectByName(`slot-${String(index + 1).padStart(2, '0')}`);
    if (!slot) throw new Error(`승인 꼬치 base slot 누락: ${index + 1}`);
    slot.add(component);
  }
  root.updateMatrixWorld(true);
  const triangles = triangleCount(root);
  if (triangles !== composition.triangleCount) {
    throw new Error(`RAW 네기마 triangle 수 불일치: ${triangles}/${composition.triangleCount}`);
  }
  return { root, flipPivot, triangles };
}

function instanceForSlot(sourceRoot, slotMesh, sourceTransform, initialIngredientCount) {
  const holder = new THREE.Group();
  holder.name = `rawNegimaSlot:${slotMesh.userData.objectKey}`;
  holder.userData.objectKey = slotMesh.userData.objectKey;
  holder.visible = false;
  const root = sourceRoot.clone(true);
  root.rotation.set(
    sourceTransform.rootRotationRadians.x,
    sourceTransform.rootRotationRadians.y,
    sourceTransform.rootRotationRadians.z,
  );
  root.scale.set(sourceTransform.horizontalScale, sourceTransform.verticalScale, 1);
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
  if (sourceTransform.fit === 'contain') {
    const uniformScale = Math.min(sx, sy);
    holder.scale.setScalar(uniformScale);
  } else {
    holder.scale.set(sx, sy, Math.min(sx, sy));
  }
  holder.position.copy(slotMesh.position);
  holder.quaternion.copy(slotMesh.userData.grillBaseQuaternion ?? slotMesh.quaternion);
  holder.updateMatrixWorld(true);
  const flipPivot = root.getObjectByName('flipPivot');
  if (!flipPivot) throw new Error('RAW 네기마 instance flipPivot 누락');
  const ingredientRoots = D1_RAW_NEGIMA_SEQUENCE.map((ingredient, index) => {
    const component = root.getObjectByName(
      `${ingredient}-${String(index + 1).padStart(2, '0')}`,
    );
    if (!component) throw new Error(`RAW 네기마 instance 재료 누락: ${index + 1}`);
    return component;
  });
  const instance = {
    holder,
    root,
    flipPivot,
    targetSize,
    setIngredientCount(count) {
      const normalized = Math.max(0, Math.min(
        D1_RAW_NEGIMA_SEQUENCE.length,
        Math.trunc(Number(count) || 0),
      ));
      ingredientRoots.forEach((component, index) => {
        component.visible = index < normalized;
      });
      holder.userData.ingredientCount = normalized;
      return normalized;
    },
    ingredientCount: () => holder.userData.ingredientCount,
  };
  instance.setIngredientCount(initialIngredientCount);
  return instance;
}

export async function createD1RawNegimaCompositor({
  bundle,
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto,
  gltfLoader = new GLTFLoader(),
  createImageBitmapImpl = globalThis.createImageBitmap,
} = {}) {
  const network = [];
  try {
    const plan = exactAssetPlan(bundle);
    const loaded = await Promise.all(plan.map(async (item) => ({
      item,
      bytes: await fetchExactAsset(item, fetchImpl, cryptoImpl, network),
    })));
    const bytesByRole = Object.fromEntries(loaded.map(({ item, bytes }) => [item.role, bytes]));
    const composition = validateD1RawNegimaComposition(JSON.parse(
      new TextDecoder().decode(bytesByRole.composition),
    ));
    const [skewerBase, chicken, negi, skewerAlbedo, chickenAlbedo, negiAlbedo] = await Promise.all([
      parseGltf(gltfLoader, bytesByRole['skewerBase-model']),
      parseGltf(gltfLoader, bytesByRole['chicken-model']),
      parseGltf(gltfLoader, bytesByRole['negi-model']),
      textureFromPng(bytesByRole['skewerBase-albedo'], createImageBitmapImpl),
      textureFromPng(bytesByRole['chicken-albedo'], createImageBitmapImpl),
      textureFromPng(bytesByRole['negi-albedo'], createImageBitmapImpl),
    ]);
    const built = buildComposition({
      composition,
      models: { skewerBase, chicken, negi },
      textures: { skewerBase: skewerAlbedo, chicken: chickenAlbedo, negi: negiAlbedo },
    });
    const diagnostics = Object.freeze({
      assetId: composition.id,
      sourceRevision: composition.sourceRevision,
      exactLoadReady: true,
      network: Object.freeze(network.map((entry) => Object.freeze({ ...entry }))),
      sourceModelCount: 3,
      sourceAlbedoCount: 3,
      composedIngredientCount: composition.sequence.length,
      triangleCount: built.triangles,
      materialCount: materialCount(built.root),
      rootNode: built.root.name,
      flipPivotNode: built.flipPivot.name,
    });
    return Object.freeze({
      diagnostics,
      createInstance: (slotMesh, sourceTransform) => (
        instanceForSlot(
          built.root,
          slotMesh,
          sourceTransform,
          D1_RAW_NEGIMA_SEQUENCE.length,
        )
      ),
      createAssemblyInstance: (slotMesh, sourceTransform) => (
        instanceForSlot(built.root, slotMesh, sourceTransform, 0)
      ),
    });
  } catch (error) {
    error.diagnostics = Object.freeze({
      exactLoadReady: false,
      network: Object.freeze(network.map((entry) => Object.freeze({ ...entry }))),
    });
    throw error;
  }
}
