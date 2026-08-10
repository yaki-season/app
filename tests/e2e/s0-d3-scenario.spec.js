import { test, expect } from '@playwright/test';

async function skipStory(page) {
  await page.getByRole('button', { name: '이 장면 건너뛰기' }).click();
  await expect(page.getByRole('heading', { name: '잠시 돌아보며' })).toBeVisible();
  await expect(page.locator('.summary li')).toHaveCount(3);
  await page.locator('#actions .primary').click();
}

test('S0: 열쇠→대문 2클릭 뒤 점화 대사를 거쳐 D1로 이어진다', async ({ page }) => {
  await page.goto('/src/s0-d3.html');
  await expect(page.locator('body')).toHaveAttribute('data-screen-id', 'SCR-STORY-PROLOGUE');
  await expect(page.locator('body')).toHaveAttribute('data-state-id', 'S0-STATE-KEY');
  await expect(page.locator('body')).toHaveAttribute(
    'data-component-id',
    'prologue.exterior.background',
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-required-asset-id',
    'BG-EXTERIOR-S0-CLOSED',
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-interaction-component-id',
    'prologue.key',
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-interaction-reference-asset-id',
    'PR-SHOP-KEY',
  );
  await expect(page.locator('body')).toHaveAttribute('data-body-part-count', '0');
  await expect(page.locator('body')).toHaveAttribute('data-asset-mode', 'approved');
  await expect(page.locator('#s0-exterior-background')).toHaveAttribute(
    'src',
    '/public/assets/core/s0/prologue/bg-exterior-s0-closed-r2-b1.png',
  );
  await expect(page.locator('body')).toHaveAttribute('data-interaction-asset-mode', 'approved');
  await expect(page.locator('#s0-interaction-visual')).toHaveAttribute(
    'src',
    '/public/assets/core/s0/prologue/pr-shop-key-placed-r1-b1.png',
  );
  await expect(page.locator('#s0-interaction-visual')).toBeVisible();
  const keyPlacement = await page.evaluate(() => {
    const camera = document.querySelector('#s0-art-camera').getBoundingClientRect();
    const key = document.querySelector('#s0-interaction-visual').getBoundingClientRect();
    return {
      scale: camera.width / 1920,
      x: key.x - camera.x,
      y: key.y - camera.y,
      width: key.width,
      height: key.height,
    };
  });
  expect(keyPlacement.x).toBeCloseTo(256 * keyPlacement.scale, 1);
  expect(keyPlacement.y).toBeCloseTo(650 * keyPlacement.scale, 1);
  expect(keyPlacement.width).toBeCloseTo(224 * keyPlacement.scale, 1);
  expect(keyPlacement.height).toBeCloseTo(150 * keyPlacement.scale, 1);
  await expect(page.getByText('개발 중')).toHaveCount(0);
  await expect(page.getByText('비가 막 그친 골목 끝에 가게가 있었다. 문 앞에 서자 발치의 황동 열쇠가 먼저 눈에 들어왔다. 할아버지가 쓰던 열쇠였다.')).toBeVisible();

  await page.getByRole('button', { name: '열쇠를 집는다' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-state-id', 'S0-STATE-GATE');
  await expect(page.locator('body')).toHaveAttribute(
    'data-component-id',
    'prologue.exterior.background',
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-interaction-component-id',
    'prologue.gate',
  );
  await expect(page.getByText('열쇠를 쥔 손이 차가웠다. 한 번 숨을 고르고 돌리자, 오래 닫혀 있던 문이 뻑뻑한 소리를 내며 열렸다.')).toBeVisible();
  await page.getByRole('button', { name: '문을 연다' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-S0-DECISION');
  await expect(page.locator('body')).toHaveAttribute('data-dialogue-id', 'DLG-S0-001');
  await expect(page.locator('.dialogue')).toHaveText('문을 열자 묵은 나무 냄새 사이로 오래전 숯 향이 희미하게 되살아났다.');
  await expect(page.locator('#story-illustration')).toBeVisible();
  await expect(page.locator('#story-illustration')).toHaveAttribute(
    'src',
    '/public/assets/core/s0/story/s0-aki-reopened-shop-full-scene-r1-b1.png',
  );
  await expect(page.locator('#story-portrait')).toBeHidden();
  await expect(page.locator('#story-background')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute(
    'data-story-illustration-asset-id',
    'IL-S0-AKI-REOPENED-SHOP',
  );
  await expect(page.locator('#portrait-placeholder')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '숯불 점화' })).toHaveCount(0);
  await page.getByRole('button', { name: '이 장면 건너뛰기' }).click();
  await expect(page.getByRole('heading', { name: '잠시 돌아보며' })).toBeVisible();
  await expect(page.locator('.summary li')).toHaveText([
    '남겨진 열쇠로 오래 닫힌 가게의 문을 열었다.',
    '희미했던 숯 향과 함께 오래된 기억도 다시 살아났다.',
    '두렵지만, 오늘 하루만큼은 내 손으로 이 가게를 지켜 보기로 했다.',
  ]);
  await page.locator('#actions .primary').click();
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D1-PREOPEN');
});

test('키보드만으로 S0 첫 상호작용을 진행한다', async ({ page }) => {
  await page.goto('/src/s0-d3.html');
  const keyButton = page.getByRole('button', { name: '열쇠를 집는다' });
  await keyButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-state-id', 'S0-STATE-GATE');
  await expect(page.getByRole('button', { name: '문을 연다' })).toBeVisible();
});

test('D1 영업 전 세 대사에서 인물별 전체 장면을 표시한다', async ({ page }) => {
  await page.goto('/src/s0-d3.html?new=1');
  await page.getByRole('button', { name: '열쇠를 집는다' }).click();
  await page.getByRole('button', { name: '문을 연다' }).click();
  await skipStory(page);
  await expect(page.locator('body')).toHaveAttribute('data-dialogue-id', 'DLG-D1-PRE-001');
  await expect(page.locator('#story-illustration')).toHaveAttribute(
    'src',
    '/public/assets/core/s0/story/d1-preopen-aki-full-scene-r1-b1.png',
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-story-illustration-asset-id',
    'IL-D1-PREOPEN-AKI',
  );
  await expect(page.locator('#story-portrait')).toBeHidden();
  await expect(page.locator('#story-background')).toBeHidden();
  await page.getByRole('button', { name: '다음 이야기', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-dialogue-id', 'DLG-D1-PRE-002');
  await expect(page.locator('#story-illustration')).toBeVisible();
  await expect(page.locator('#story-illustration')).toHaveAttribute(
    'src',
    '/public/assets/core/s0/story/d1-preopen-tsukioka-full-scene-r1-b1.png',
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-story-illustration-asset-id',
    'IL-D1-PREOPEN-TSUKIOKA',
  );
  await expect(page.locator('#story-portrait')).toBeHidden();
  await expect(page.locator('#story-background')).toBeHidden();
  await expect(page.locator('#portrait-placeholder')).toHaveCount(0);
  await page.getByRole('button', { name: '다음 이야기', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-dialogue-id', 'DLG-D1-PRE-003');
  await expect(page.locator('#story-illustration')).toHaveAttribute(
    'src',
    '/public/assets/core/s0/story/d1-preopen-aki-full-scene-r1-b1.png',
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-story-illustration-asset-id',
    'IL-D1-PREOPEN-AKI',
  );
  await expect(page.locator('#story-portrait')).toBeHidden();
  await expect(page.locator('#story-background')).toBeHidden();
});

test('KEY exact PR-SHOP-KEY가 없으면 승인 closed 배경 위에서도 placeholder를 유지한다', async ({
  page,
}) => {
  await page.route('**/public/assets/manifest.json', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        assets: [{
          id: 'BG-EXTERIOR-S0-CLOSED',
          status: 'approved',
          url: '/assets/s0/closed-approved.png',
        }],
      }),
    });
  });
  await page.route('**/public/assets/s0/closed-approved.png', async (route) => {
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#283b34"/></svg>',
    });
  });
  await page.goto('/src/s0-d3.html');
  await expect(page.locator('body')).toHaveAttribute('data-state-id', 'S0-STATE-KEY');
  await expect(page.locator('body')).toHaveAttribute('data-asset-mode', 'placeholder');
  await expect(page.locator('body')).toHaveAttribute(
    'data-interaction-asset-mode',
    'placeholder',
  );
  await expect(page.locator('#s0-exterior-background')).toBeVisible();
  await expect(page.locator('#s0-interaction-visual')).toBeHidden();
  await expect(page.getByText('개발 중')).toHaveCount(0);
});

test('GATE는 PR-SHOP-GATE-S0 없이 exact background 한 장과 DOM action만 렌더한다', async ({
  page,
}) => {
  await page.route('**/public/assets/manifest.json', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        assets: [{
          id: 'BG-EXTERIOR-S0-GATE-OPEN',
          status: 'approved',
          url: '/assets/s0/gate-open-approved.png',
        }],
      }),
    });
  });
  await page.route('**/public/assets/s0/gate-open-approved.png', async (route) => {
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#283b34"/></svg>',
    });
  });
  await page.goto('/src/s0-d3.html');
  await expect(page.locator('body')).toHaveAttribute('data-asset-mode', 'placeholder');
  await page.getByRole('button', { name: '열쇠를 집는다' }).click();
  await expect(page.locator('body')).toHaveAttribute(
    'data-required-asset-id',
    'BG-EXTERIOR-S0-GATE-OPEN',
  );
  await expect(page.locator('body')).toHaveAttribute('data-asset-mode', 'approved');
  await expect(page.locator('body')).toHaveAttribute('data-runtime-visual-layer-count', '1');
  await expect(page.locator('body')).toHaveAttribute(
    'data-interaction-reference-asset-id',
    'PR-SHOP-GATE-S0',
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-pr-shop-gate-runtime-visual',
    'false',
  );
  await expect(page.locator('body')).toHaveAttribute('data-open-gate-outline-count', '1');
  await expect(page.locator('body')).toHaveAttribute(
    'data-closed-gate-residual-pixel-count',
    '0',
  );
  await expect(page.locator('body')).toHaveAttribute('data-body-part-count', '0');
  await expect(page.locator('#s0-exterior-background')).toBeVisible();
  await expect(page.locator('#s0-exterior-background')).toHaveAttribute(
    'src',
    '/public/assets/s0/gate-open-approved.png',
  );
  await expect(page.getByText('개발 중')).toHaveCount(0);
  const action = page.getByRole('button', { name: '문을 연다' });
  await expect(action).toBeVisible();
  const backgroundBox = await page.locator('#s0-exterior-background').boundingBox();
  const actionBox = await action.boundingBox();
  const overlap = backgroundBox.x < actionBox.x + actionBox.width
    && backgroundBox.x + backgroundBox.width > actionBox.x
    && backgroundBox.y < actionBox.y + actionBox.height
    && backgroundBox.y + backgroundBox.height > actionBox.y;
  expect(overlap).toBe(false);
  await expect(page.locator('[data-runtime-visual-asset-id="PR-SHOP-GATE-S0"]'))
    .toHaveCount(0);
});

test.describe('기준 viewport', () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    test(`${viewport.width}x${viewport.height}에서 필수 UI가 안전 영역 안에 있다`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/src/s0-d3.html');
      const box = await page.getByTestId('scenario-app').boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 2);
      await expect(page.getByRole('button', { name: '열쇠를 집는다' })).toBeVisible();
    });
  }
});
