import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { D1_BUSINESS_DAY_RELEASE_DEFINITION_URL } from '../../src/application/ports/d1BusinessDayDefinition.js';
import { buildD1PublicRuntimeContract } from '../../src/content/d1PublicRuntimeContract.js';
import { buildD1ReleaseDefinition } from '../../src/content/d1ReleaseDefinition.js';

const root = new URL('../../', import.meta.url);
const read = (relativePath) => JSON.parse(readFileSync(
  fileURLToPath(new URL(relativePath, root)),
  'utf8',
));

function buildReleaseDefinition() {
  const bundle = {
    days: [read('content/campaign/day-d1.json')],
    orders: read('content/orders/early-campaign.json'),
    customers: read('content/customers/types.json'),
  };
  return buildD1ReleaseDefinition({
    bundle,
    developmentFixture: read('tests/fixtures/business-days/d1-full-day.json'),
    runtimeContract: buildD1PublicRuntimeContract(bundle),
  });
}

// production은 이 URL에서 versioned release 한 개만 읽는다. E2E는 Developer 3 builder의 실제
// 결과를 응답해 browser adapter를 검증하며, 애플리케이션에는 development fixture fallback을 두지 않는다.
export async function routeD1ReleaseDefinition(page) {
  const definition = buildReleaseDefinition();
  await page.route(D1_BUSINESS_DAY_RELEASE_DEFINITION_URL, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(definition),
  }));
  return definition;
}
