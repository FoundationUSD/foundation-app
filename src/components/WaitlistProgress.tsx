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
    <div className="flex w-full items-center justify-center gap-4 sm:gap-10 px-4 py-4 sm:py-5 bg-[var(--surface-strong)]/20">
      {steps.map((step, i) => {
        const isActive = currentStep === step.n;
        const isCompleted = currentStep > step.n;

        const StepContent = (
          <div className="relative flex items-center gap-2.5 py-1">
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                isActive
                  ? "bg-gold-500 text-navy-900"
                  : isCompleted
                  ? "bg-emerald-500/20 text-emerald-500"
                  : "bg-[var(--surface-strong)] text-[var(--muted)]"
              }`}
            >
              {isCompleted ? <Check className="h-2.5 w-2.5" /> : step.n}
            </div>
            <span
              className={`font-mono text-[11px] font-bold uppercase tracking-[0.15em] transition-colors ${
                isActive ? "text-[var(--fg)]" : "text-[var(--muted)]"
              }`}
            >
              {step.label}
            </span>
            
            {isActive && (
              <div className="absolute bottom-[-4px] left-0 h-[1.5px] w-full bg-gold-500 shadow-[0_0_8px_rgba(184,150,12,0.3)]" />
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
          <div key={step.n} className="flex items-center gap-4 sm:gap-10">
            {isCompleted ? (
              <Link href={href} className="flex items-center no-underline hover:opacity-80 transition-opacity">
                {StepContent}
              </Link>
            ) : (
              <div className="flex items-center">{StepContent}</div>
            )}
            {i < steps.length - 1 && (
              <div className="h-[2px] w-4 sm:w-8 bg-[var(--rule)]/20 rounded-full animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
}
