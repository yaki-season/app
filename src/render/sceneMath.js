// 2.5D 장면 공용 수학. 테스트 화면(sceneRenderer)과 프로덕션 화면(productionRenderer)이 공유한다.
//
// 모델: 16:9 고정 원근 카메라. 정규화 화면 앵커(top-left, x·y ∈ 0..1)를 특정 깊이 z의 월드 좌표로
// 역투영하고, 그 깊이에서 화면을 꽉 채우는 평면(빌보드)을 만든다. 카메라는 대략 -z를 바라본다고 가정한다.

import * as THREE from 'three';

export const ASPECT = 16 / 9; // 기준 뷰포트(1280×720·1920×1080 모두 16:9)
export const FOV = 42;
export const TAN_HALF = Math.tan((FOV / 2) * (Math.PI / 180));

// 고정 원근 카메라 하나를 만든다. eye에서 look을 바라본다.
export function makeCamera(eye, look) {
  const c = new THREE.PerspectiveCamera(FOV, ASPECT, 0.1, 200);
  c.position.copy(eye);
  c.lookAt(look);
  c.updateMatrixWorld(true);
  c.updateProjectionMatrix();
  return c;
}

// 정규화 화면 앵커(nx,ny top-left) → 카메라에서 쏜 광선이 평면 z=const를 만나는 월드 좌표.
const _v = new THREE.Vector3();
export function worldAtScreen(cam, nx, ny, z) {
  _v.set(nx * 2 - 1, -(ny * 2 - 1), 0.5).unproject(cam);
  _v.sub(cam.position);
  const t = (z - cam.position.z) / _v.z;
  return cam.position.clone().add(_v.multiplyScalar(t));
}

// 카메라를 향한 빌보드 평면. rect(정규화 top-left)만큼의 화면을 덮도록 z 거리에 맞춰 크기 계산.
export function billboard(cam, rect, z, material) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const center = worldAtScreen(cam, cx, cy, z);
  const dist = center.distanceTo(cam.position);
  const fullH = 2 * dist * TAN_HALF; // 이 거리에서 화면 전체 높이
  const geo = new THREE.PlaneGeometry(fullH * ASPECT * rect.width, fullH * rect.height);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(center);
  mesh.quaternion.copy(cam.quaternion); // 카메라 정면을 향함
  return mesh;
}

// 앵커(nx,ny)를 깊이 z의 월드 좌표 + 그 깊이의 화면 채움 크기(fw,fh)로. 핫스팟·오브젝트 배치용.
export function anchorToWorld(cam, nx, ny, z) {
  const p = worldAtScreen(cam, nx, ny, z);
  const dist = p.distanceTo(cam.position);
  const fullH = 2 * dist * TAN_HALF;
  return { x: p.x, y: p.y, z: p.z, fw: fullH * ASPECT, fh: fullH };
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
