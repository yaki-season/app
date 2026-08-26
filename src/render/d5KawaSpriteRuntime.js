import * as THREE from 'three';
import { loadSkewerSpriteRuntime } from './d2MomoSpriteRuntime.js';

export const D5_KAWA_RUNTIME_URLS = Object.freeze({
  raw: '/assets/campaign/d5/spr-kawa-grill-raw-r1-b1.png',
  cooking: '/assets/campaign/d5/spr-kawa-grill-cooking-r1-b1.png',
  proper: '/assets/campaign/d5/spr-kawa-grill-proper-r1-b1.png',
  overcooked: '/assets/campaign/d5/spr-kawa-grill-overcooked-r1-b1.png',
  burnt: '/assets/campaign/d5/spr-kawa-grill-burnt-r1-b1.png',
  order: '/assets/campaign/d5/order-icon-kawa-r1-b1.png',
  servedPlate: '/assets/campaign/d5/pr-served-kawa-plate-r1-b1.png',
  assemblyStation: '/assets/campaign/d5/st-assembly-torikawa-r1-b1.png',
  assemblyProgress: Object.freeze(Array.from(
    { length: 6 },
    (_, index) => `/assets/campaign/d5/spr-kawa-assembly-progress-${index}-r1-b1.png`,
  )),
});

export async function loadD5KawaSpriteRuntime({
  textureLoader = new THREE.TextureLoader(),
} = {}) {
  return loadSkewerSpriteRuntime({
    urls: D5_KAWA_RUNTIME_URLS,
    status: 'approved',
    assetId: 'SPR-KAWA-D5-R1',
    textureLoader,
  });
}
