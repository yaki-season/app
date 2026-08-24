import { ART_SEMANTIC_OWNER_ID } from './artSemanticOwnerIds.js';

const storyIllustration = (sceneKey, assetId, alt) => Object.freeze({
  sceneKey,
  requiredAssetId: assetId,
  semanticOwner: ART_SEMANTIC_OWNER_ID.ARTIST_2_S0_PROLOGUE,
  alt,
});

export const S0_D3_STORY_ILLUSTRATION_BINDINGS = Object.freeze([
  storyIllustration('S0', 'IL-S0-DECISION-PIXEL', '비 갠 밤, 다시 연 가게 앞에 선 아사노 아키'),
  storyIllustration('D1-PRE', 'IL-D1-PREOPEN-PIXEL', '첫 영업을 준비하며 츠키오카를 맞는 아사노 아키'),
  storyIllustration('D1-POST', 'IL-D1-POST-PIXEL', '첫 영업을 마치고 츠키오카의 격려를 받는 아사노 아키'),
  storyIllustration('D2-PRE', 'IL-D2-PREOPEN-PIXEL', '둘째 날 모모를 준비하며 손님을 맞는 아사노 아키'),
  storyIllustration('D2-POST', 'IL-D2-POST-PIXEL', '둘째 날 다시 오겠다는 손님을 배웅하는 아사노 아키'),
  storyIllustration('D3-PRE', 'IL-D3-PREOPEN-PIXEL', '타레 노트를 살피며 직장인 손님들을 맞는 아사노 아키'),
  storyIllustration('D3-POST', 'IL-D3-POST-PIXEL', '셋째 날 영업 뒤 손님과 츠키오카에게 인사하는 아사노 아키'),
]);

export const S0_D3_STORY_ILLUSTRATION_BY_SCENE_KEY = Object.freeze(
  Object.fromEntries(S0_D3_STORY_ILLUSTRATION_BINDINGS.map((binding) => [
    binding.sceneKey,
    binding,
  ])),
);
