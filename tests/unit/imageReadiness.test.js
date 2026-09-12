import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImagePreloader, waitForPresentation } from '../../src/presentation/imageReadiness.js';

afterEach(() => vi.useRealTimers());

function fakeImages() {
  const images = [];
  return { images, createImage: () => {
    const img = { naturalWidth:1920, decode:vi.fn().mockResolvedValue(undefined) };
    images.push(img); return img;
  } };
}

describe('장면 표시 준비', () => {
  it('load가 끝나도 decode가 끝나기 전에는 공개하지 않고 중복 요청을 공유한다', async () => {
    const { images, createImage } = fakeImages();
    const loader = createImagePreloader({ createImage });
    const promise = loader.load('/scene.png');
    let finishDecode; images[0].decode = () => new Promise(resolve => { finishDecode = resolve; });
    let ready = false; promise.then(() => { ready = true; });
    expect(loader.load('/scene.png')).toBe(promise);
    images[0].onload();
    await Promise.resolve(); expect(ready).toBe(false);
    finishDecode(); await promise;
    expect(ready).toBe(true); expect(images).toHaveLength(1);
  });

  it('실패한 그림은 다음 요청에서 다시 받아 복구한다', async () => {
    const { images, createImage } = fakeImages();
    const loader = createImagePreloader({ createImage });
    const failure = loader.load('/scene.png');
    images[0].onerror(); await expect(failure).rejects.toThrow('불러오지');
    const retry = loader.load('/scene.png');
    images[1].onload(); await expect(retry).resolves.toBe(images[1]);
    expect(images).toHaveLength(2);
  });

  it('끝나지 않는 요청은 유한 시간 뒤 복구 가능하게 실패한다', async () => {
    vi.useFakeTimers();
    const { images, createImage } = fakeImages();
    const loader = createImagePreloader({ createImage, timeoutMs:100 });
    const failure = expect(loader.load('/slow.png')).rejects.toThrow('지연');
    await vi.advanceTimersByTimeAsync(100); await failure;
    expect(images[0].onload).toBeNull();
  });

  it('깨진 decode와 빈 이미지를 정상 장면으로 취급하지 않는다', async () => {
    const { images, createImage } = fakeImages();
    const loader = createImagePreloader({ createImage });
    const result = loader.load('/broken.png');
    images[0].naturalWidth = 0; images[0].onload();
    await expect(result).rejects.toThrow('표시');
  });

  it('준비된 화면에는 의무 대기 없이 바로 진행한다', async () => {
    await expect(waitForPresentation(() => true)).resolves.toBeUndefined();
  });

  it('영업 준비 실패와 무한 대기를 각각 보고한다', async () => {
    await expect(waitForPresentation(() => { throw new Error('그림 오류'); })).rejects.toThrow('그림 오류');
    vi.useFakeTimers();
    const failure = expect(waitForPresentation(() => false, { timeoutMs:100 })).rejects.toThrow('지연');
    await vi.advanceTimersByTimeAsync(100); await failure;
  });
});
