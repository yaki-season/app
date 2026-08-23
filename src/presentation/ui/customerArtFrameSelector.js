export function customerArtFrameForRole(bundle, role) {
  const frame = (bundle?.companions ?? [])
    .find((companion) => companion.role === role);
  return frame ? Object.freeze({ ...frame, frameRole: frame.role }) : null;
}

export function timedCustomerActionRole(roles, nowMs, intervalMs) {
  if (roles.length === 0) return null;
  const index = roles.length === 1
    ? 0
    : Math.floor(Math.max(0, nowMs) / intervalMs) % roles.length;
  return roles[index];
}
