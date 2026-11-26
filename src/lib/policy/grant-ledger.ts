/**
 * Process-local single-use ledger for commander approval grants.
 * evaluatePolicy remains non-mutating; writers mark a grant consumed after
 * a successful nomination export so a replay of the unused payload is denied.
 */
const consumedGrantIds = new Set<string>();

export function wasCommanderGrantConsumed(grantId: string): boolean {
  return consumedGrantIds.has(grantId);
}

/** @returns false when the grant was already consumed. */
export function consumeCommanderGrant(grantId: string): boolean {
  if (consumedGrantIds.has(grantId)) return false;
  consumedGrantIds.add(grantId);
  return true;
}

export function resetCommanderGrantLedger(): void {
  consumedGrantIds.clear();
}
