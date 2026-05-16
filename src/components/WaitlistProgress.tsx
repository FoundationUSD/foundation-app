"use client";

import { Check } from "lucide-react";
import Link from "next/link";

interface Props {
  currentStep: 1 | 2 | 3;
}

export function WaitlistProgress({ currentStep }: Props) {
  const steps = [
    { n: 1, label: "Join page" },
    { n: 2, label: "Card reveal + share" },
    { n: 3, label: "Success" },
  ];

  return (
    <div className="mb-8 flex items-center justify-center gap-2 sm:gap-4">
      <div className="flex w-full max-w-[800px] items-center justify-between rounded-xl border border-[var(--rule)] bg-[var(--surface-strong)]/50 p-1.5 backdrop-blur-sm">
        {steps.map((step, i) => {
          const isActive = currentStep === step.n;
          const isCompleted = currentStep > step.n;

          const StepContent = (
            <div
              className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                isActive
                  ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm ring-1 ring-[var(--rule)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface)]/30 hover:text-[var(--fg)]"
              }`}
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                  isActive
                    ? "bg-gold-500 text-navy-900"
                    : isCompleted
                    ? "bg-emerald-500/20 text-emerald-500"
                    : "bg-[var(--surface-strong)] text-[var(--muted)]"
                }`}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : step.n}
              </div>
              <span className="truncate font-mono text-[10px] font-medium uppercase tracking-wider sm:text-[11px]">
                {step.label}
              </span>
            </div>
          );

          return (
            <div key={step.n} className="flex flex-1 items-center gap-2">
              {process.env.NODE_ENV === "development" ? (
                <Link
                  href={
                    step.n === 1
                      ? "/alpha/join?bypass=true"
                      : step.n === 2
                      ? "/alpha/reveal?bypass=true"
                      : "/alpha/welcome?bypass=true"
                  }
                  className="flex flex-1"
                >
                  {StepContent}
                </Link>
              ) : (
                StepContent
              )}
              {i < steps.length - 1 && (
                <div className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--rule)]">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6 12L10 8L6 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
