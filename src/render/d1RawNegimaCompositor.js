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
  if (!bundle?.traySprite) throw new Error('RAW negima assembly tray sprite manifest binding is missing');
  const plan = [
    { role: 'composition', asset: bundle.composition },
    { role: 'tray-sprite', asset: bundle.traySprite },
  ];
  for (const [stage, sprite] of Object.entries(bundle.stageSprites ?? {})) {
    plan.push({ role: `stage-${stage}`, asset: sprite });
  }
  for (const [name, source] of Object.entries(bundle.sources ?? {})) {
    plan.push(
      { role: `${name}-model`, asset: source.model },
      { role: `${name}-albedo`, asset: source.albedo },
    );
  }
  if (plan.length !== 13) throw new Error(`RAW negima exact asset count mismatch: ${plan.length}/13`);
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

  const chickenSource = bindNearestPixelAlbedo(models.chicken, textures.chicken);
  const chickenBackingMesh = chickenSource.getObjectByName('chicken-body');
  if (!chickenBackingMesh?.isMesh) {
    throw new Error('Chicken pixel backing mesh is missing: chicken-body');
  }
  // The approved alpha sprite is the complete chicken visual. The low-poly body was only a
  // modeling aid and otherwise leaks through transparent edge pixels as a pale white cap.
  chickenBackingMesh.visible = false;
  chickenBackingMesh.userData.hiddenBehindApprovedPixelSprite = true;

  const ingredientSources = {
    chicken: chickenSource,
    'green-onion': bindNearestPixelAlbedo(models.negi, textures.negi),
  };
  for (const [index, ingredient] of composition.sequence.entries()) {
    const component = ingredientSources[ingredient].clone(true);
    component.name = `${ingredient}-${String(index + 1).padStart(2, '0')}`;
    component.scale.setScalar(composition.ingredientScaleRelativeToBase);
    // 조립대에서는 먼저 꽂은 재료가 항상 위에 남고, 새 재료는 그 아래로 들어간다.
    // 모든 픽셀 plane이 depthTest=false이므로 명시적인 renderOrder가 곧 겹침 계약이다.
    const renderOrder = 200 + composition.sequence.length - index;
    component.traverse((node) => {
      if (node.isMesh) node.renderOrder = renderOrder;
    });
    component.userData.assemblyRenderOrder = renderOrder;
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

function applyAssemblyIngredientPose(root) {
  D1_RAW_NEGIMA_SEQUENCE.forEach((ingredient, index) => {
    if (ingredient !== 'green-onion') return;
    const component = root.getObjectByName(
      `${ingredient}-${String(index + 1).padStart(2, '0')}`,
    );
    const pixelPlane = component?.getObjectByName('pixel-material-plane');
    if (!pixelPlane) throw new Error(`조립대 파 pixel plane 누락: ${index + 1}`);
    // R3의 격리 검토용 -26° 기울기를 조립대에서만 상쇄한다.
    // 슬롯 원점과 plane 중심을 그대로 유지해 가로 꼬치가 파 몸통 중앙을 관통한다.
    pixelPlane.rotation.z = 0;
    component.userData.assemblyPixelPlaneRotationZ = 0;
  });
}

const GRILL_BODY_COLORS = Object.freeze({
  'bamboo-shaft': 0x9d5920,
  'bamboo-tip': 0xd69a40,
  'handle-cap': 0x2a1509,
  'handle-ring-1': 0xd69a40,
  'handle-ring-2': 0xd69a40,
  'chicken-body': 0x73301e,
  'negi-body': 0x315b17,
});

function applyGrillIngredientPose(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    const materials = (Array.isArray(node.material) ? node.material : [node.material])
      .map((sourceMaterial) => {
        const material = sourceMaterial.clone();
        material.side = THREE.DoubleSide;
        material.depthTest = true;
        material.depthWrite = true;
        if (material.map) {
          material.color.setRGB(1, 0.94, 0.86);
          material.transparent = true;
          material.alphaTest = 0.02;
        } else {
          const bodyColor = GRILL_BODY_COLORS[node.name];
          if (bodyColor != null) material.color.setHex(bodyColor);
          material.transparent = false;
          material.opacity = 1;
        }
        material.needsUpdate = true;
        return material;
      });
    node.material = Array.isArray(node.material) ? materials : materials[0];
    node.renderOrder = 0;
    node.visible = true;
  });
}

function grillSpriteInstanceForSlot(stageTextures, slotMesh, sourceTransform) {
  const holder = new THREE.Group();
  holder.name = `grillNegimaSpriteSlot:${slotMesh.userData.objectKey}`;
  holder.userData.objectKey = slotMesh.userData.objectKey;
  holder.visible = false;

  const root = new THREE.Group();
  root.name = 'grillNegimaSpriteRoot';
  root.userData.assetId = D1_RAW_NEGIMA_COMPOSITION_ID;
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
  Object.entries(stageTextures).forEach(([stage, texture], index) => {
    const imageWidth = Number(texture.image?.width ?? 109);
    const imageHeight = Number(texture.image?.height ?? 494);
    const geometry = new THREE.PlaneGeometry(imageWidth / imageHeight, 1);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.02,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.name = `approvedGrillNegimaSprite:${stage}`;
    // ImageBitmap upload reverses this standalone artwork plane. Rotate the plane only so
    // the sharp tip stays at the authored top and the handle remains at the bottom.
    plane.rotation.z = Math.PI;
    plane.renderOrder = 320 + index;
    plane.frustumCulled = false;
    plane.raycast = () => {};
    plane.visible = stage === 'raw';
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
  const uniformScale = Math.min(sx, sy);
  holder.scale.setScalar(uniformScale);
  holder.position.copy(slotMesh.position);
  holder.quaternion.copy(slotMesh.userData.grillBaseQuaternion ?? slotMesh.quaternion);
  holder.userData.stage = 'raw';
  holder.updateMatrixWorld(true);

  return {
    holder,
    root,
    flipPivot,
    targetSize,
    setStage(stage) {
      const normalized = Object.hasOwn(planes, stage) ? stage : 'raw';
      Object.entries(planes).forEach(([key, plane]) => {
        plane.visible = key === normalized;
      });
      holder.userData.stage = normalized;
      return normalized;
    },
    stage: () => holder.userData.stage,
    ingredientCount: () => D1_RAW_NEGIMA_SEQUENCE.length,
    // 승인 원본 평면에 굽는 셰이더를 직접 입힌다. 셰이더를 별도 mesh(pgSlot)에 두면 그쪽은
    // 슬롯 rect 비율이라 같은 텍스처가 다른 실루엣으로 늘어나고, 단계가 바뀌는 순간 이미지가
    // 통째로 교체된 것처럼 보인다. 평면을 하나만 쓰면 교체 자체가 존재하지 않는다.
    // 굽기 전에는 승인 원본 재질을 그대로 쓰고, 굽기 시작하면 같은 평면의 재질만 셰이더로
    // 바꾼다. 평면(지오메트리·위치)이 하나라 실루엣이 변하지 않고, 생것은 승인 색 그대로다.
    setCooking(active) {
      const next = active ? holder.userData.cookingMaterialRef : holder.userData.rawMaterialRef;
      if (!next || planes.raw.material === next) return false;
      planes.raw.material = next;
      return true;
    },
    applyCookingMaterial(material) {
      if (!material || holder.userData.cookingMaterialRef === material) return false;
      // 승인 평면이 쓰던 렌더 상태를 그대로 물려준다. 특히 toneMapped를 켜두면 three가
      // 출력 색을 한 번 더 변환해 승인 아트의 생고기·생파 색이 따뜻하게 밀린다.
      material.toneMapped = false;
      material.transparent = true;
      material.depthTest = false;
      material.depthWrite = false;
      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
      holder.userData.rawMaterialRef ??= planes.raw.material;
      holder.userData.cookingMaterialRef = material;
      Object.entries(planes).forEach(([key, plane]) => { plane.visible = key === 'raw'; });
      holder.userData.stage = 'raw';
      holder.userData.cookingMaterial = true;
      return true;
    },
    usesCookingMaterial: () => holder.userData.cookingMaterial === true,
  };
}

function instanceForSlot(
  sourceRoot,
  slotMesh,
  sourceTransform,
  initialIngredientCount,
  { assemblyPose = false } = {},
) {
  const holder = new THREE.Group();
  holder.name = `rawNegimaSlot:${slotMesh.userData.objectKey}`;
  holder.userData.objectKey = slotMesh.userData.objectKey;
  holder.visible = false;
  const root = sourceRoot.clone(true);
  if (assemblyPose) applyAssemblyIngredientPose(root);
  else applyGrillIngredientPose(root);
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
    ingredientRenderOrders: () => ingredientRoots.map((component) => (
      component.userData.assemblyRenderOrder
    )),
  };
  instance.setIngredientCount(initialIngredientCount);
  return instance;
}

function trayInstanceForSlot(texture, slotMesh, sourceTransform, stackIndex) {
  const holder = new THREE.Group();
  holder.name = `assemblyTrayNegimaSlot:${slotMesh.userData.objectKey}`;
  holder.userData.objectKey = slotMesh.userData.objectKey;
  holder.visible = false;

  const root = new THREE.Group();
  root.name = 'assemblyTrayNegimaRoot';
  root.userData.assetId = 'SPR-ASSEMBLY-TRAY-NEGIMA';
  root.rotation.set(
    sourceTransform.rootRotationRadians.x,
    sourceTransform.rootRotationRadians.y,
    sourceTransform.rootRotationRadians.z,
  );
  root.scale.set(sourceTransform.horizontalScale, sourceTransform.verticalScale, 1);

  const imageWidth = Number(texture.image?.width ?? 256);
  const imageHeight = Number(texture.image?.height ?? 512);
  const geometry = new THREE.PlaneGeometry(imageWidth / imageHeight, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const plane = new THREE.Mesh(geometry, material);
  plane.name = 'approvedAssemblyTrayNegimaSprite';
  // ImageBitmap texture upload reverses this standalone plane relative to the approved PNG.
  // Rotate only the artwork plane so the sharp tip remains at the landmarked top end.
  plane.rotation.z = Math.PI;
  plane.renderOrder = 300 + stackIndex;
  plane.frustumCulled = false;
  plane.raycast = () => {};
  root.add(plane);

  const addLandmark = (name, y) => {
    const node = new THREE.Object3D();
    node.name = name;
    node.position.y = y;
    root.add(node);
  };
  addLandmark('handle', -0.453);
  addLandmark('tip', 0.453);
  [0.24, 0.12, 0, -0.12, -0.24].forEach((y, index) => {
    addLandmark(`slot-${String(index + 1).padStart(2, '0')}`, y);
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
  if (sourceTransform.fit === 'contain') {
    holder.scale.setScalar(Math.min(sx, sy));
  } else {
    holder.scale.set(sx, sy, Math.min(sx, sy));
  }
  holder.position.copy(slotMesh.position);
  holder.quaternion.copy(slotMesh.quaternion);
  holder.userData.ingredientCount = D1_RAW_NEGIMA_SEQUENCE.length;
  holder.userData.stackIndex = stackIndex;
  holder.updateMatrixWorld(true);
  return {
    holder,
    root,
    targetSize,
    ingredientCount: () => holder.userData.ingredientCount,
  };
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
    const [
      skewerBase,
      chicken,
      negi,
      skewerAlbedo,
      chickenAlbedo,
      negiAlbedo,
      traySprite,
    ] = await Promise.all([
      parseGltf(gltfLoader, bytesByRole['skewerBase-model']),
      parseGltf(gltfLoader, bytesByRole['chicken-model']),
      parseGltf(gltfLoader, bytesByRole['negi-model']),
      textureFromPng(bytesByRole['skewerBase-albedo'], createImageBitmapImpl),
      textureFromPng(bytesByRole['chicken-albedo'], createImageBitmapImpl),
      textureFromPng(bytesByRole['negi-albedo'], createImageBitmapImpl),
      textureFromPng(bytesByRole['tray-sprite'], createImageBitmapImpl),
    ]);
    const stageTextures = Object.freeze(Object.fromEntries(await Promise.all(
      Object.keys(bundle.stageSprites).map(async (stage) => [
        stage,
        await textureFromPng(bytesByRole[`stage-${stage}`], createImageBitmapImpl),
      ]),
    )));
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
      traySpriteCount: 1,
      grillStageSpriteCount: Object.keys(stageTextures).length,
      composedIngredientCount: composition.sequence.length,
      triangleCount: built.triangles,
      materialCount: materialCount(built.root),
      rootNode: built.root.name,
      flipPivotNode: built.flipPivot.name,
    });
    return Object.freeze({
      diagnostics,
      // D1 cooking uses this approved raw sprite as the immutable shader source.
      // Legacy cooked sprites remain in the bundle for compatibility/audit only.
      grillRawTexture: stageTextures.raw,
      createInstance: (slotMesh, sourceTransform) => (
        grillSpriteInstanceForSlot(stageTextures, slotMesh, sourceTransform)
      ),
      createAssemblyInstance: (slotMesh, sourceTransform) => (
        instanceForSlot(built.root, slotMesh, sourceTransform, 0, { assemblyPose: true })
      ),
      createTrayInstance: (slotMesh, sourceTransform, stackIndex = 0) => (
        trayInstanceForSlot(traySprite, slotMesh, sourceTransform, stackIndex)
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
