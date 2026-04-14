// Monitor — real-time vault health.
// Spec: ADR-004 §Keeper Infrastructure — Monitor.
//
// Alerts (see ADR-004 alert table):
//   Buffer low      — buffer < 8% TVL         → warn operator, prepare queue mode
//   Buffer critical — buffer < 5% TVL         → queue mode auto-activates
//   NAV stale       — no update >13h          → alert NAV keeper
//   NAV blocked     — no update >26h          → vault auto-blocks (critical)
//   TVL drop        — >15% in 1h              → alert all guardians
//   Large redeem    — single redeem >5% TVL   → alert operator
//   Invariant viol. — any invariant fails     → auto-pause (critical, all)
//   Upgrade pending — timelock countdown      → public event

export async function runMonitor(): Promise<void> {
  throw new Error("monitor: not yet implemented (ADR-004 §Keeper Infrastructure)");
}

if (import.meta.main) {
  await runMonitor();
}
