import { STORY_GUESTS, storyGuestForCustomer } from './storyGuests.js';

export const STORY_CUSTOMER_ID = 'REGULAR_TSUKIOKA';
const DAYS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
const MENUS = ['negima', 'momo', 'kawa', 'beer', 'highball', 'cabbage-salad'];
export const guestSceneId = (dayId, beat, key = 'tsukioka') => `SCN-${dayId.toUpperCase()}-${key.toUpperCase()}-${beat.toUpperCase()}`;
export function guestSceneIdentity(sceneId) {
  const match = /^SCN-(D[1-6])-([A-Z]+)-(ARRIVAL|DEPARTURE)$/.exec(sceneId ?? '');
  return match && STORY_GUESTS[match[2].toLowerCase()]
    ? { dayId: match[1].toLowerCase(), key: match[2].toLowerCase(), beat: match[3].toLowerCase() } : null;
}

export function normalizeGuestStoryProgress(value, dayId) {
  const allowed = Object.keys(STORY_GUESTS).flatMap(key => ['arrival', 'departure'].map(beat => guestSceneId(dayId, beat, key)));
  const completedIds = [...new Set(Array.isArray(value?.completedIds) ? value.completedIds.filter(id => allowed.includes(id)) : [])];
  const candidate = value?.active;
  const active = candidate && allowed.includes(candidate.sceneId) && !completedIds.includes(candidate.sceneId)
    && Number.isInteger(candidate.lineIndex) && candidate.lineIndex >= 0 && candidate.lineIndex < 30
    ? { sceneId: candidate.sceneId, lineIndex: candidate.lineIndex } : null;
  const pendingIds = [...new Set(Array.isArray(value?.pendingIds) ? value.pendingIds : [])]
    .filter(id => allowed.includes(id) && !completedIds.includes(id) && id !== active?.sceneId);
  return { completedIds, active, pendingIds };
}

export function guestVisit(business, key = 'tsukioka') {
  const customer = Object.values(business?.customers ?? {}).find(c => storyGuestForCustomer(c.id)?.key === key);
  const order = customer ? business.orders?.[customer.orderId] : null;
  // 공유 주문은 두 동행이 함께 받은 음식이다. 별개 주문은 각자 받은 것만 읽는다.
  const members = customer ? Object.values(business.customers).filter(c => c.orderId === customer.orderId).map(c => c.id) : [];
  const servings = Array.isArray(business?.guestServings) ? business.guestServings.filter(item => item
    && members.includes(item.customerId) && MENUS.includes(item.menuId)
    && ['Perfect', 'Good', 'OK', 'Fail', null].includes(item.quality)) : [];
  return { customer, order, servings, first: servings[0] ?? null };
}

export function buildGuestMemoryFlags(business) {
  if (!DAYS.includes(business?.dayId)) return [];
  return Object.keys(STORY_GUESTS).flatMap(key => {
    const { customer, order, servings } = guestVisit(business, key);
    if (!customer) return [];
    const facts = ['visited'];
    if (order?.acceptedAtMs != null) facts.push('ordered');
    if (order?.status === 'failed') facts.push('failed');
    if (order?.status === 'abandoned') facts.push('left-waiting');
    if (servings[0]) facts.push(`first:${servings[0].menuId}`);
    for (const item of servings) facts.push(`served:${item.menuId}`);
    for (const id of normalizeGuestStoryProgress(business.guestStory, business.dayId).completedIds) {
      const identity = guestSceneIdentity(id);
      if (identity?.key === key) facts.push(`scene:${identity.beat}`);
    }
    return [...new Set(facts)].map(fact => `guest:${key}:${business.dayId}:${fact}`);
  });
}

export function earlierGuestMemory(flagIds, dayId, key = 'tsukioka') {
  const flags = new Set(Array.isArray(flagIds) ? flagIds : []);
  const previous = DAYS.slice(0, DAYS.indexOf(dayId)).reverse()
    .find(day => flags.has(`guest:${key}:${day}:visited`));
  const has = fact => Boolean(previous && flags.has(`guest:${key}:${previous}:${fact}`));
  return { dayId: previous ?? null, has, first: MENUS.find(menu => has(`first:${menu}`)) ?? null };
}
