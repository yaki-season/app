// DAT-001 콘텐츠 런타임 로더 (브라우저).
// SYS-004: 운영 부팅에서는 가벼운 검사만 한다. Ajv 전체 검증은 개발·빌드·테스트에서
// validate.js가 수행한다. 이 모듈은 fetch로 콘텐츠를 불러와 rules.js의 교차 검사만 돌린다.

import { checkContentRules, approvedOnly } from './rules.js';

// 배열 파일은 여러 레코드, 단일 파일은 레코드 하나로 취급한다.
const CONTENT_FILES = {
  processes: ['processes/grill.json'],
  recipes: ['recipes/negima.json'],
  menus: ['menus/early-campaign.json'],
  customers: ['customers/types.json'],
  campaignCharacters: ['campaign/characters.json'],
  orders: ['orders/early-campaign.json'],
  days: ['campaign/day-d1.json', 'campaign/day-d2.json', 'campaign/day-d3.json'],
  upgrades: ['progression/upgrades.json'],
  staff: ['staff/staff.json'],
  scenarios: ['campaign/scenario.json'],
};

async function readJson(fetchImpl, url) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`콘텐츠 로드 실패: ${url} (${res.status})`);
  return res.json();
}

/**
 * 콘텐츠를 불러와 교차 검사한다.
 * @param baseUrl 콘텐츠 디렉터리 URL (게임 진입점 기준 상대경로 등)
 * @param fetchImpl 테스트에서 주입 가능한 fetch
 * @returns { bundle, validation, approved }
 */
export async function loadContent(baseUrl = '../content', fetchImpl = fetch) {
  const bundle = {};
  for (const [kind, files] of Object.entries(CONTENT_FILES)) {
    const parsed = await Promise.all(files.map((f) => readJson(fetchImpl, `${baseUrl}/${f}`)));
    bundle[kind] = parsed.flat(); // 배열 파일은 펼치고 단일 파일은 그대로
  }

  const validation = checkContentRules(bundle);

  const approved = {};
  for (const [kind, records] of Object.entries(bundle)) {
    approved[kind] = approvedOnly(records);
  }

  return { bundle, validation, approved };
}
