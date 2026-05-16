"use client";

import { Check } from "lucide-react";
import Link from "next/link";

interface Props {
  currentStep: 1 | 2 | 3;
}

export function WaitlistProgress({ currentStep }: Props) {
  const steps = [
    { n: 1, label: "Access" },
    { n: 2, label: "Genesis" },
    { n: 3, label: "Priority" },
  ];

  return (
    <div className="flex w-full items-center justify-between px-4 sm:px-12">
      {steps.map((step, i) => {
        const isActive = currentStep === step.n;
        const isCompleted = currentStep > step.n;

        const StepContent = (
          <div className="relative flex items-center py-2 gap-2">
            <div
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold transition-all ${
                isActive
                  ? "bg-gold-500 text-navy-900"
                  : isCompleted
                  ? "bg-emerald-500/20 text-emerald-500"
                  : "bg-[var(--surface-strong)] text-[var(--muted)]"
              }`}
            >
              {isCompleted ? <Check className="h-2 w-2" /> : step.n}
            </div>
            <span
              className={`font-mono text-[10px] font-bold uppercase tracking-[0.1em] transition-colors ${
                isActive ? "text-[var(--fg)]" : "text-[var(--muted)]"
              }`}
            >
              {step.label}
            </span>
            
            {isActive && (
              <div className="absolute bottom-0 left-0 h-[1px] w-full bg-gold-500 shadow-[0_0_8px_rgba(184,150,12,0.3)]" />
            )}
          </div>
        );

        const href =
          step.n === 1
            ? "/alpha/join"
            : step.n === 2
            ? "/alpha/reveal"
            : "/alpha/welcome";

        return (
          <div key={step.n} className="flex flex-1 items-center justify-center">
            {isCompleted ? (
              <Link href={href} className="flex items-center no-underline">
                {StepContent}
              </Link>
            ) : (
              <div className="flex items-center">{StepContent}</div>
            )}
            {i < steps.length - 1 && (
              <div className="mx-8 h-px flex-1 max-w-[60px] bg-[var(--rule)]/10" />
            )}
          </div>
        );
      })}
    </div>
  );
}
