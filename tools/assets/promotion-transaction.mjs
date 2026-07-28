import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function moveIfPresent(source, destination) {
  if (!await exists(source)) return false;
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(source, destination);
  return true;
}

export async function atomicPromoteBundle({
  transactionDirectory,
  manifestPath,
  candidateManifest,
  newFiles,
  oldFiles,
  validateFinalState,
  simulateFailureAfterManifest = false,
}) {
  const stageDirectory = path.join(transactionDirectory, 'stage');
  const backupDirectory = path.join(transactionDirectory, 'backup');
  const stagedManifest = path.join(stageDirectory, 'manifest.json');
  const backupManifest = path.join(backupDirectory, 'manifest.json');
  const installedNew = [];
  const backedUpOld = [];
  let manifestBackedUp = false;
  let manifestInstalled = false;

  await mkdir(stageDirectory, { recursive: true });
  await mkdir(backupDirectory, { recursive: true });

  try {
    for (const [index, item] of newFiles.entries()) {
      if (await exists(item.target)) {
        throw new Error(`새 runtime 대상이 이미 존재합니다: ${item.target}`);
      }
      const staged = path.join(stageDirectory, `artifact-${index}`);
      await copyFile(item.source, staged);
      item.staged = staged;
    }
    await writeFile(stagedManifest, `${JSON.stringify(candidateManifest, null, 2)}\n`, 'utf8');

    for (const [index, item] of oldFiles.entries()) {
      const backup = path.join(backupDirectory, `old-artifact-${index}`);
      if (await moveIfPresent(item, backup)) backedUpOld.push({ original: item, backup });
    }

    for (const item of newFiles) {
      await mkdir(path.dirname(item.target), { recursive: true });
      await rename(item.staged, item.target);
      installedNew.push(item.target);
    }

    await rename(manifestPath, backupManifest);
    manifestBackedUp = true;
    await rename(stagedManifest, manifestPath);
    manifestInstalled = true;

    if (simulateFailureAfterManifest) {
      throw new Error('테스트용 manifest 반영 후 실패');
    }

    const finalErrors = await validateFinalState();
    if (finalErrors.length > 0) {
      throw new Error(`승격 후 검증 실패:\n- ${finalErrors.join('\n- ')}`);
    }

    await rm(transactionDirectory, { recursive: true, force: true });
    return;
  } catch (error) {
    if (manifestInstalled && await exists(manifestPath)) {
      await rm(manifestPath, { force: true });
    }
    if (manifestBackedUp && await exists(backupManifest)) {
      await rename(backupManifest, manifestPath);
    }

    for (const installed of installedNew.reverse()) {
      await rm(installed, { force: true });
    }
    for (const item of backedUpOld.reverse()) {
      await mkdir(path.dirname(item.original), { recursive: true });
      if (await exists(item.backup)) await rename(item.backup, item.original);
    }

    await rm(transactionDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function fileBytes(file) {
  return readFile(file);
}
