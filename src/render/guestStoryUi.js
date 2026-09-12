import { buildGuestScene, guestJournalEntries } from '../scenario/guestStories.js';
import { storyGuestForCustomer } from '../domain/businessDay/storyGuests.js';
import { guestSceneId, guestSceneIdentity, normalizeGuestStoryProgress } from '../domain/businessDay/guestMemory.js';

// 진행 상태는 영업 snapshot이 소유한다. DOM에는 원고와 현재 줄만 투영한다.
export function createGuestStoryUi({ dayId, getBusiness, getFlags, saveProgress, pause, onDialogue, canPresent = () => true }) {
  const el = id => document.getElementById(id);
  const panel = el('departureCutscene');
  const journal = el('guestJournal');
  let scene = null;
  let previousFocus = null;
  const progress = () => normalizeGuestStoryProgress(getBusiness()?.guestStory, dayId);
  const sceneFor = sceneId => {
    const identity = guestSceneIdentity(sceneId);
    return identity ? buildGuestScene({ ...identity, business: getBusiness(), flagIds: getFlags() }) : null;
  };

  function paint() {
    if (!scene) return;
    const index = Math.min(progress().active?.lineIndex ?? 0, scene.lines.length - 1);
    const line = scene.lines[index];
    panel.dataset.sceneId = scene.sceneId;
    panel.dataset.beat = scene.beat;
    el('guestSceneTitle').textContent = `${dayId.toUpperCase()} · ${scene.title}`;
    el('departureCutsceneSpeaker').textContent = line.speakerName;
    el('departureCutsceneLine').textContent = line.text;
    el('guestSceneProgress').textContent = `${index + 1} / ${scene.lines.length} · 이야기 중에는 영업이 멈춥니다`;
    el('departureCutsceneContinue').textContent = index === scene.lines.length - 1 ? '영업으로' : '다음';
  }

  function showNext() {
    const state = progress();
    let active = state.active;
    const pending = [...state.pendingIds];
    while (active || pending.length) {
      active ??= { sceneId: pending.shift(), lineIndex: 0 };
      const candidate = sceneFor(active.sceneId);
      if (!candidate) { active = null; continue; }
      scene = candidate;
      saveProgress({ ...state, active: { ...active, lineIndex: Math.min(active.lineIndex, scene.lines.length - 1) }, pendingIds: pending });
      panel.hidden = false;
      document.body.dataset.departureCutscene = 'true';
      paint();
      onDialogue(true, scene);
      pause('story-cutscene', true);
      el('departureCutsceneContinue').focus();
      return true;
    }
    saveProgress({ ...state, active: null, pendingIds: [] });
    return false;
  }

  function openMany(beat, customerIds) {
    const state = progress();
    const ids = customerIds.map(id => storyGuestForCustomer(id)?.key).filter(Boolean)
      .map(key => guestSceneId(dayId, beat, key));
    const added = [...new Set(ids)].filter(id => !state.completedIds.includes(id)
      && state.active?.sceneId !== id && !state.pendingIds.includes(id) && sceneFor(id));
    if (!added.length) return false;
    if (!scene) previousFocus = document.activeElement;
    saveProgress({ ...state, pendingIds: [...state.pendingIds, ...added] });
    presentPending();
    return true;
  }

  function presentPending() {
    if (scene || !journal.hidden || !canPresent() || !progress().pendingIds.length) return false;
    return showNext();
  }

  function open(beat, { customerId = 'REGULAR_TSUKIOKA' } = {}) {
    return openMany(beat, [customerId]);
  }

  function finish() {
    if (!scene) return false;
    const state = progress();
    saveProgress({ ...state, completedIds: [...state.completedIds, scene.sceneId], active: null });
    scene = null;
    if (showNext()) return true;
    panel.hidden = true;
    delete document.body.dataset.departureCutscene;
    pause('story-cutscene', false);
    onDialogue(false, null);
    const target = previousFocus?.isConnected && previousFocus.getClientRects().length
      ? previousFocus : el('businessPhase');
    target?.focus();
    return true;
  }

  function advance() {
    if (!scene) return;
    const state = progress();
    const lineIndex = (state.active?.lineIndex ?? 0) + 1;
    if (lineIndex >= scene.lines.length) { finish(); return; }
    saveProgress({ ...state, active: { sceneId: scene.sceneId, lineIndex } });
    paint();
  }

  function closeJournal() {
    if (journal.hidden) return false;
    journal.hidden = true;
    el('guestJournalToggle').setAttribute('aria-expanded', 'false');
    pause('guest-journal', false);
    el('guestJournalToggle').focus();
    return true;
  }

  el('guestJournalToggle').addEventListener('click', () => {
    if (scene) return;
    const container = el('guestJournalEntries');
    container.replaceChildren();
    const entries = guestJournalEntries({ flagIds: getFlags(), business: getBusiness() });
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.textContent = '아직 기록한 손님 이야기가 없습니다.';
      container.appendChild(empty);
    }
    for (const entry of entries) {
      const article = document.createElement('article');
      article.dataset.dayId = entry.dayId;
      article.dataset.guestKey = entry.key;
      const title = document.createElement('h3');
      title.textContent = `${entry.name} · ${entry.dayId.toUpperCase()} · ${entry.title}`;
      const note = document.createElement('p'); note.textContent = entry.note;
      const served = document.createElement('p'); served.className = 'guest-journal__served';
      served.textContent = `내어 드린 것 · ${entry.served}`;
      article.append(title, note, served); container.appendChild(article);
    }
    journal.hidden = false;
    el('guestJournalToggle').setAttribute('aria-expanded', 'true');
    pause('guest-journal', true);
    el('guestJournalClose').focus();
  });
  el('guestJournalClose').addEventListener('click', closeJournal);
  el('departureCutsceneContinue').addEventListener('click', advance);
  el('guestSceneSkip').addEventListener('click', finish);
  // 키를 누르고 있는 동안 생성되는 click을 차단한다. 최초 Enter/Space는 기본 버튼 동작을 쓴다.
  panel.addEventListener('keydown', event => {
    if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
  });

  return {
    open, openMany, finish, closeJournal, presentPending,
    hasDeferred: () => !scene && progress().pendingIds.length > 0,
    seen: (beat, key = 'tsukioka') => progress().completedIds.includes(guestSceneId(dayId, beat, key)),
    snapshot: () => ({ ...progress(), active: Boolean(scene), sceneId: scene?.sceneId ?? null, customerId: scene?.customerId ?? null }),
    restore() {
      const active = progress().active;
      if (active || progress().pendingIds.length) { previousFocus = document.activeElement; showNext(); }
    },
  };
}
