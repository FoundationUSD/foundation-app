"use client";

import { RebalanceFlow } from "@/components/RebalanceFlow";

export default function RebalancePage() {
  return (
    <div className="fdn-page mx-auto max-w-5xl">
      <div className="mb-10 text-center">
        <p className="section-label mx-auto mb-6 block w-fit">Yield Allocation</p>
        <h1 className="page-heading mb-4 text-[clamp(2.2rem,5vw,3.5rem)] leading-[1.08]">
          Portfolio <em>Rebalance</em>
        </h1>
        <p className="mx-auto max-w-md text-sm text-[var(--muted)]">
          Move capital between strategies to optimize your yield allocation across Foundation vaults.
        </p>
      </div>
      <RebalanceFlow />
    </div>
  );
}
