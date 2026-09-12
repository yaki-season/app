// 화면은 판정 결과를 읽기만 한다. 메뉴별 시간은 cookStations가 제공한다.
export const GRILL_FACE_COPY = Object.freeze({
  under: '익는 중', perfect: '노릇', over: '과다', burnt: '탐',
});

export function grillCraftCopy(view) {
  if (view.flipping) return { tone: 'turning', action: '뒤집는 중', ready: false };
  const worst = [view.frontDoneness, view.backDoneness];
  const ready = view.nextAction === 'retrieve';
  if (worst.includes('burnt')) return { tone: 'burnt', action: ready ? '탄 면이 있어요 · 꺼내기' : '탄 면 주의 · 뒤집기', ready };
  if (view.doneness === 'over') return { tone: 'over', action: ready ? '더 타기 전에 꺼내기' : '과다 · 뒤집기', ready };
  if (ready) return { tone: worst.includes('over') ? 'over' : 'perfect', action: worst.includes('over') ? '한 면 과다 · 꺼내기' : '양면 노릇 · 꺼내기', ready };
  if (view.doneness === 'perfect') return { tone: 'perfect', action: '노릇 · 뒤집기', ready };
  return { tone: 'under', action: '지글지글 · 익히는 중', ready };
}

// 0.3초 양면 전이와 같은 시계를 사용한다. 별도 타이머를 만들지 않아 정지·복구에 함께 멈춘다.
export function grillFlipPose(view, reducedMotion = false) {
  const sign = view.orientationFaceDown === 'back' ? -1 : 1;
  if (!view.flipping) return { x: 0, y: 0, roll: 0, scaleX: sign };
  const p = Math.max(0, Math.min(1, view.flipProgress ?? 0));
  const lift = Math.sin(Math.PI * p);
  return {
    x: reducedMotion ? 0 : Math.sin(p * Math.PI * 2) * 0.045,
    y: lift * (reducedMotion ? 0.012 : 0.085),
    roll: reducedMotion ? 0 : Math.sin(p * Math.PI * 2) * -0.055,
    // 두께 없는 평면을 회전시켜 없애지 않고 앞/뒤 교체 순간도 80% 폭을 유지한다.
    scaleX: sign * (p < 0.5 ? 1 : -1) * (1 - lift * 0.2),
  };
}

export function applyGrillFlipPose(instance, view, reducedMotion = false) {
  if (!instance) return;
  const pose = grillFlipPose(view ?? {}, reducedMotion);
  instance.holder.userData.craftBaseScale ??= instance.holder.scale.clone();
  instance.holder.scale.copy(instance.holder.userData.craftBaseScale).multiplyScalar(1.10);
  const pivot = instance.flipPivot;
  pivot.rotation.y = 0;
  pivot.rotation.z = pose.roll;
  pivot.position.set(pose.x, pose.y, 0);
  pivot.scale.x = pose.scaleX;
}
