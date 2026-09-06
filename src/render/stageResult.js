// Display this day's reward, including when reopening an already completed day.
export function stageResult(summary, savedSettlement = null) {
  const result = summary ?? savedSettlement?.summary;
  const economy = result?.economy;
  const earnings = economy?.total ?? savedSettlement?.reward?.balance ?? 0;
  const reputation = economy?.reputation ?? savedSettlement?.reward?.reputation ?? 0;
  return {
    earnings,
    reputation,
    // Historical saves without order statistics cannot establish a clear result.
    cleared: (result?.orders?.completed ?? 0) > 0,
    signedReputation: reputation < 0 ? String(reputation) : '+' + reputation,
  };
}
