import { describe, expect, it } from 'vitest';
import { createStoryGuestArt, NEIGHBORHOOD_CUSTOMER_ASSET_IDS } from '../../src/render/storyGuestArt.js';
const states = ['waiting', 'eating-negima', 'drinking-beer'];
const assets = () => ({
  COMMUTER_CUSTOMER: { url:'/a-waiting.png', companions:['a','b','c','d','e'].flatMap(v => states.map(state => ({role:`office-${v}-${state}`,url:`/${v}-${state}.png`}))) },
  manifest: { assets:Object.entries(NEIGHBORHOOD_CUSTOMER_ASSET_IDS).map(([key,id]) => ({id,status:'approved',url:`/${key}-waiting.png`,companions:states.slice(1).map(state=>({role:state,url:`/${key}-${state}.png`}))})) },
});
describe('실제 인물에 결선하는 승인 아트', () => {
  it('D6 아홉 손님이 중복 없는 인물과 음식 동작을 사용한다', () => {
    const art = createStoryGuestArt(assets());
    const guests = ['OFFICE-1','SOLO-2','OFFICE-3','SOLO-4','OFFICE-5','SOLO-6','OFFICE-7','SOLO-8','OFFICE-9'];
    const variants = ['a','e','d','akane','c','naoko','b','shun','daichi'];
    guests.forEach((id,i) => {
      for(const state of states) {
        const frame = art.resolve({customerId:`D6-${id}`,servedNegima:state==='eating-negima',servedBeer:state==='drinking-beer'});
        expect(frame.url).toBe(`/${variants[i]}-${state}.png`);
      }
    });
    expect(art.pendingAssetIds).toEqual([]);
  });
  it('이른 날짜와 D6의 같은 인물은 같은 외형이다', () => {
    const art = createStoryGuestArt(assets());
    for(const [a,b] of [['D2-SOLO-B','D6-SOLO-4'],['D3-SOLO-C','D6-SOLO-6'],['D5-SOLO-D','D6-SOLO-8'],['D2-COMMUTER-A','D6-OFFICE-3']])
      expect(art.resolve({customerId:a}).url).toBe(art.resolve({customerId:b}).url);
  });
  it('미승인 결과는 읽지 않으며 승격 대기를 명시한다', () => {
    const source = assets(); source.manifest.assets.forEach(a=>{a.status='pending';});
    const art = createStoryGuestArt(source);
    expect(art.pendingAssetIds).toHaveLength(4);
    expect(art.resolve({customerId:'D6-SOLO-4'})).toBeNull();
    expect(art.resolve({customerId:'unknown'})).toBeNull();
  });
  it('먹지 않은 꼬치를 들지 않으며 실제 받은 음식만 번갈아 사용한다', () => {
    const art = createStoryGuestArt(assets());
    expect(art.resolve({customerId:'D6-SOLO-6',phase:'eating'}).url).toBe('/naoko-waiting.png');
    const both={customerId:'D6-SOLO-6',servedNegima:true,servedBeer:true};
    expect(art.resolve({...both,nowMs:0}).url).toBe('/naoko-eating-negima.png');
    expect(art.resolve({...both,nowMs:1200}).url).toBe('/naoko-drinking-beer.png');
  });
});
