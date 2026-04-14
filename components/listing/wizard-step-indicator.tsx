"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;

interface WizardStepIndicatorProps {
  currentStep: Step;
}

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Photos" },
  { id: 2, label: "Details" },
  { id: 3, label: "Availability" },
];

export function WizardStepIndicator({ currentStep }: WizardStepIndicatorProps) {
  return (
    <ol
      aria-label="Create listing steps"
      className="flex items-center justify-between gap-space-2"
    >
      {STEPS.map((step, idx) => {
        const isActive = step.id === currentStep;
        const isCompleted = step.id < currentStep;
        const isFuture = step.id > currentStep;
        return (
          <li
            key={step.id}
            aria-current={isActive ? "step" : undefined}
            className="flex flex-1 items-center gap-space-2"
          >
            <div className="flex items-center gap-space-2">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                  isActive && "bg-primary text-white",
                  isCompleted && "bg-primary-light text-primary-dark",
                  isFuture && "bg-muted text-neutral-500",
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  step.id
                )}
              </span>
              <span
                className={cn(
                  "text-sm font-medium",
                  isActive && "text-foreground",
                  isCompleted && "text-primary-dark",
                  isFuture && "text-neutral-500",
                )}
              >
                {`${step.id}. ${step.label}`}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                aria-hidden="true"
                className={cn(
                  "h-px flex-1",
                  step.id < currentStep ? "bg-primary-light" : "bg-muted",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
