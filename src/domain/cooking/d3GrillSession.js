import {
  applyTare,
  beginTorch,
  canRetrieveTorchMenu,
  createD3TorchFinishState,
  finishTorch,
  sweepTorch,
  torchQuality,
} from './d3TorchFinish.js';

const clone = (value) => structuredClone(value);
const requiresTorch = ({ menuId, seasoning }) => menuId === 'momo' && seasoning === 'tare';

export function createD3GrillSession(saved = null) {
  const jobs = new Map();

  function restore(snapshot) {
    if (snapshot?.stateVersion !== 1 || !Array.isArray(snapshot.jobs)) {
      return { ok: false, reason: 'invalid-snapshot' };
    }
    const next = new Map();
    for (const job of snapshot.jobs) {
      if (!job?.id || !job.menuId || !job.seasoning || typeof job.bothFacesCooked !== 'boolean') {
        return { ok: false, reason: 'invalid-job' };
      }
      next.set(job.id, clone(job));
    }
    jobs.clear();
    next.forEach((job, id) => jobs.set(id, job));
    return { ok: true };
  }

  function stageCookedItem({ id, menuId, seasoning = 'none', bothFacesCooked = false }) {
    if (!id || !menuId) return { ok: false, reason: 'invalid-item' };
    if (jobs.has(id)) return { ok: false, reason: 'duplicate-item' };
    if (!bothFacesCooked) return { ok: false, reason: 'both-faces-required' };
    const torchRequired = requiresTorch({ menuId, seasoning });
    const job = {
      id,
      menuId,
      seasoning,
      bothFacesCooked,
      torchRequired,
      finish: torchRequired ? createD3TorchFinishState() : null,
    };
    jobs.set(id, job);
    return { ok: true, job: clone(job) };
  }

  function jobFor(id) {
    return jobs.get(id) ?? null;
  }

  function applyTareTo(id) {
    const job = jobFor(id);
    if (!job) return { ok: false, reason: 'unknown-item' };
    if (!job.torchRequired) return { ok: false, reason: 'torch-not-required' };
    return applyTare(job.finish);
  }

  function beginTorchFor(id, options = {}) {
    const job = jobFor(id);
    if (!job) return { ok: false, reason: 'unknown-item' };
    if (!job.torchRequired) return { ok: false, reason: 'torch-not-required' };
    return beginTorch(job.finish, { ...options, bothFacesCooked: job.bothFacesCooked });
  }

  function sweepTorchFor(id, input) {
    const job = jobFor(id);
    if (!job) return { ok: false, reason: 'unknown-item' };
    if (!job.torchRequired) return { ok: false, reason: 'torch-not-required' };
    return sweepTorch(job.finish, input);
  }

  function finishTorchFor(id) {
    const job = jobFor(id);
    if (!job) return { ok: false, reason: 'unknown-item' };
    if (!job.torchRequired) return { ok: false, reason: 'torch-not-required' };
    return finishTorch(job.finish);
  }

  function retrieve(id, baseQuality = { grade: 'Perfect', good: true, servable: true }) {
    const job = jobFor(id);
    if (!job) return { ok: false, reason: 'unknown-item' };
    if (job.torchRequired) {
      const allowed = canRetrieveTorchMenu(job.finish);
      if (!allowed.ok) return allowed;
    }
    const quality = job.torchRequired ? torchQuality(job.finish) : clone(baseQuality);
    jobs.delete(id);
    return {
      ok: true,
      retrieved: true,
      item: { id: job.id, menuId: job.menuId, seasoning: job.seasoning, quality },
    };
  }

  if (saved) {
    const result = restore(saved);
    if (!result.ok) throw new TypeError(`D3 그릴 저장을 복원할 수 없습니다: ${result.reason}`);
  }

  return {
    stageCookedItem,
    applyTare: applyTareTo,
    beginTorch: beginTorchFor,
    sweepTorch: sweepTorchFor,
    finishTorch: finishTorchFor,
    retrieve,
    job: (id) => clone(jobFor(id)),
    views: () => [...jobs.values()].map(clone),
    snapshot: () => ({ stateVersion: 1, jobs: [...jobs.values()].map(clone) }),
    restore,
  };
}
