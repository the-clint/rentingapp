"use client";

import { Button } from "@/components/ui/button";

interface AvailabilityStepProps {
  onBack: () => void;
  onPublish: () => void;
  isPublishing: boolean;
}

export function AvailabilityStep({
  onBack,
  onPublish,
  isPublishing,
}: AvailabilityStepProps) {
  return (
    <div className="flex flex-col gap-space-6">
      <p className="text-body text-neutral-700">
        Your listing will be available starting today. You can block specific
        dates after publishing.
      </p>

      <div className="flex justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isPublishing}
        >
          Back
        </Button>
        <Button type="button" onClick={onPublish} disabled={isPublishing}>
          {isPublishing ? "Publishing…" : "Publish Listing"}
        </Button>
      </div>
    </div>
  );
}
