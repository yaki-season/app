import { describe, expect, it } from 'vitest';
import { D4_EPILOGUE_PAGES, D5_EPILOGUE_PAGES, FIXED_CHARACTER, S0_D4_STORY_SCENES,
  S0_INTERACTIONS, speakerById, validateS0D4Content } from '../../src/scenario/s0-d3-content.js';

// 문장 전체의 복제 대신 실제 깨진 장면·화자·스킵을 막는다.
describe('캠페인 이야기 연결', () => {
  it('저장된 프롤로그 입력 ID와 장면·대사 ID가 유효하다', () => {
    expect(S0_INTERACTIONS.map(step => step.interactionId)).toEqual(['S0-KEY-SELECT', 'S0-GATE-OPEN']);
    expect(validateS0D4Content()).toEqual([]);
    for (const scene of S0_D4_STORY_SCENES) {
      expect(scene.lines.length).toBeGreaterThan(0);
      expect(scene.skipSummary.length).toBeGreaterThan(0);
      expect(scene.skipSummary.length).toBeLessThanOrEqual(3);
      for (const line of scene.lines) {
        expect(speakerById(line.speakerId)).toBeTruthy();
        expect(line.text.trim()).not.toBe('');
      }
    }
  });
  it('첫 주문은 실제 메뉴·수량과 일치한다', () => {
    const line = S0_D4_STORY_SCENES.find(s => s.sceneId === 'SCN-D1-PREOPEN').lines
      .find(l => l.speakerId === FIXED_CHARACTER.TSUKIOKA.id).text;
    expect(line).toMatch(/네기마 둘/);
    expect(line).toMatch(/생맥주 하나/);
  });
  it('영업 전후 장면과 D4·D5 후일담은 각 날짜에 연결된다', () => {
    for (const dayId of ['D1', 'D2', 'D3', 'D4']) {
      expect(S0_D4_STORY_SCENES.filter(s => s.dayId === dayId).map(s => s.timing))
        .toEqual(['pre-open', 'post-settlement']);
    }
    for (const [day, pages] of [['D4', D4_EPILOGUE_PAGES], ['D5', D5_EPILOGUE_PAGES]]) {
      expect(pages.length).toBeGreaterThan(0);
      for (const page of pages) {
        expect(page.pageId.startsWith(day + '-EPILOGUE-')).toBe(true);
        expect(page.paragraphs.every(p => p.trim().length > 0)).toBe(true);
      }
    }
  });
});
