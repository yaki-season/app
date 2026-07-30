// 파일 선택·다운로드 UI가 브라우저 File/Blob 세부 구현과 분리해 호출하는 application port.
// 실제 파일 읽기·다운로드는 presentation 책임이고, 이 port는 문자열 검증과 저장 교체만 담당한다.

export function createSaveFilePort(saveRepository) {
  for (const method of [
    'loadActive',
    'validateImport',
    'importSave',
    'exportActiveSave',
    'restoreBackup',
  ]) {
    if (typeof saveRepository?.[method] !== 'function') {
      throw new TypeError(`saveRepository.${method} 구현이 필요합니다.`);
    }
  }

  return Object.freeze({
    loadForContinue: () => saveRepository.loadActive(),
    validateImportFile: (text) => saveRepository.validateImport(text),
    importFile: (text) => saveRepository.importSave(text),
    exportFile: () => saveRepository.exportActiveSave(),
    restoreBackup: (slot) => saveRepository.restoreBackup(slot),
  });
}
