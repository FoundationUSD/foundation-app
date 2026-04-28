"use client";

import { RiskDashboard } from "@/components/RiskDashboard";

export default function RiskPage() {
  return (
    <div className="fdn-page mx-auto max-w-5xl px-6 pb-12">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--fg)]">Risk Dashboard</h1>
        <p className="text-xs text-[var(--text-accent)]">
          How your deposits are distributed across independent risk drivers.
        </p>
      </div>
      <RiskDashboard />
    </div>
  );
}
