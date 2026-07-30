import { copyText, downloadTextFile } from './browserFiles.js';

export function createPublicShellDialogs({
  element,
  actionButton,
  settingsRepository,
  getSettings,
  setSettings,
  getDiagnosticText,
  onOperation,
}) {
  const dialog = document.querySelector('#shell-dialog');
  const kickerNode = document.querySelector('#dialog-kicker');
  const titleNode = document.querySelector('#dialog-title');
  const contentNode = document.querySelector('#dialog-content');
  const actionsNode = document.querySelector('#dialog-actions');

  function open({ overlayId, kicker, title, content, actions }) {
    dialog.dataset.overlayId = overlayId;
    document.body.dataset.overlayId = overlayId;
    kickerNode.textContent = kicker;
    titleNode.textContent = title;
    contentNode.replaceChildren(...content);
    actionsNode.replaceChildren(...actions);
    dialog.showModal();
  }

  function close() {
    if (dialog.open) dialog.close();
    delete document.body.dataset.overlayId;
    delete dialog.dataset.overlayId;
  }

  function openDiagnostics() {
    const text = getDiagnosticText();
    open({
      overlayId: 'OVR-DIAGNOSTICS',
      kicker: '로컬 진단',
      title: '안전한 진단 정보',
      content: [
        element('p', {
          className: 'notice',
          text: '진단에는 개인정보, 브라우저 경로, 저장 payload, 대사·원본 콘텐츠가 포함되지 않습니다.',
        }),
        element('pre', { text }),
      ],
      actions: [
        actionButton('복사', async () => {
          await copyText(text);
          onOperation('diagnostic-copied');
        }),
        actionButton('파일 다운로드', () => {
          downloadTextFile({
            fileName: 'yaki-season-diagnostic.json',
            mediaType: 'application/json',
            text,
          });
          onOperation('diagnostic-downloaded');
        }),
        actionButton('닫기', close, { primary: true }),
      ],
    });
  }

  function openHelp() {
    open({
      overlayId: 'OVR-HELP',
      kicker: '도움',
      title: '화면 이용 방법',
      content: [
        element('p', { text: 'Tab과 Shift+Tab으로 항목을 이동하고 Enter 또는 Space로 선택할 수 있습니다.' }),
        element('p', { text: '저장 파일은 이 브라우저에만 남습니다. 내보내기와 불러오기는 사용자가 직접 실행할 때만 동작합니다.' }),
        element('p', { text: '모든 상태와 경고는 색뿐 아니라 문구로도 표시됩니다. 이 버전에는 오디오가 없습니다.' }),
      ],
      actions: [
        actionButton('진단 정보 보기', () => {
          close();
          openDiagnostics();
        }),
        actionButton('닫기', close, { primary: true }),
      ],
    });
  }

  function settingRow(key, label) {
    const row = element('label', { className: 'setting-row' });
    const input = element('input', { attributes: { type: 'checkbox', name: key } });
    input.checked = getSettings()[key];
    row.append(element('span', { text: label }), input);
    return row;
  }

  function openSettings(origin = 'start') {
    const list = element('div', { className: 'settings-list' });
    list.append(
      settingRow('largeHitArea', '큰 입력 영역'),
      settingRow('highContrast', '고대비 표시'),
      settingRow('reducedMotion', '움직임 줄이기'),
      settingRow('helpEnabled', '도움말 표시'),
    );
    const returnToOrigin = () => {
      close();
      if (origin === 'pause') openPause();
    };
    open({
      overlayId: 'OVR-SETTINGS',
      kicker: '설정',
      title: '화면과 입력',
      content: [
        list,
        element('p', {
          className: 'notice',
          text: '변경은 로컬에만 저장됩니다. 오디오 설정과 원격 동기화는 제공하지 않습니다.',
        }),
      ],
      actions: [
        actionButton('취소', returnToOrigin),
        actionButton('설정 저장', async () => {
          const next = Object.fromEntries(
            [...list.querySelectorAll('input')].map((input) => [input.name, input.checked]),
          );
          const saved = await settingsRepository.save(next);
          if (!saved.ok) throw saved.error;
          setSettings(saved.value);
          onOperation('settings-saved');
          returnToOrigin();
        }, { primary: true }),
      ],
    });
  }

  function openPause() {
    open({
      overlayId: 'OVR-PAUSE',
      kicker: '일시정지',
      title: '메뉴를 잠시 멈췄습니다',
      content: [
        element('p', { text: '이 shell에는 진행 중인 gameplay timer가 없습니다. 저장과 캠페인 상태도 변경하지 않습니다.' }),
      ],
      actions: [
        actionButton('도움', () => {
          close();
          openHelp();
        }),
        actionButton('설정', () => {
          close();
          openSettings('pause');
        }),
        actionButton('재개', close, { primary: true }),
      ],
    });
  }

  dialog.addEventListener('close', () => {
    delete document.body.dataset.overlayId;
  });

  return Object.freeze({
    open,
    close,
    openDiagnostics,
    openHelp,
    openPause,
    openSettings,
  });
}
