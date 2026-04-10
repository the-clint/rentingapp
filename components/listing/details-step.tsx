"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ListingDetailsFields,
  areDetailsValid,
  validateField,
  type DetailsDraft,
  type FieldKey,
} from "@/components/listing/listing-details-fields";

// Backwards-compatible re-export so existing importers
// (e.g. `components/listing/create-listing-wizard.tsx`,
// `components/listing/details-step.test.tsx`) keep resolving
// `DetailsDraft` from this module. The canonical home is now
// `listing-details-fields.tsx`.
export type { DetailsDraft };

interface DetailsStepProps {
  details: DetailsDraft;
  onDetailChange: <K extends keyof DetailsDraft>(
    field: K,
    value: DetailsDraft[K],
  ) => void;
  onBack: () => void;
  onNext: () => void;
}

export function DetailsStep({
  details,
  onDetailChange,
  onBack,
  onNext,
}: DetailsStepProps) {
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});

  const runBlur = (field: FieldKey, value: unknown) => {
    const msg = validateField(field, value);
    setErrors((prev) => ({ ...prev, [field]: msg }));
  };

  const canAdvance = areDetailsValid(details);

  return (
    <div className="flex flex-col gap-space-6">
      <ListingDetailsFields
        details={details}
        errors={errors}
        onDetailChange={onDetailChange}
        onBlur={runBlur}
      />

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onNext} disabled={!canAdvance}>
          Next: Availability
        </Button>
      </div>
    </div>
  );
}
