"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/listing/currency-input";
import { listingFieldsSchema } from "@/lib/schemas/listing-schema";

/**
 * Canonical form-state shape for the five operator-facing listing detail
 * fields. Shared between the Create Listing wizard (`DetailsStep`) and the
 * Edit Listing form (`EditListingForm`) so no field JSX or validation logic
 * is duplicated between create and edit flows.
 */
export interface DetailsDraft {
  name: string;
  description: string;
  dailyRateCents: number | null;
  pickupLocation: string;
  pickupInstructions: string;
}

export type FieldKey =
  | "name"
  | "description"
  | "dailyRateCents"
  | "pickupLocation"
  | "pickupInstructions";

/**
 * Per-field on-blur validation. Consumers pass a raw field value and receive
 * either `undefined` (valid) or a user-facing error message derived from the
 * shared `listingFieldsSchema`. Mirrors the Zod v4 `.issues[0].message`
 * convention established in earlier stories.
 */
export function validateField(
  field: FieldKey,
  value: unknown,
): string | undefined {
  const fieldSchema = listingFieldsSchema.shape[
    field as keyof typeof listingFieldsSchema.shape
  ];
  if (!fieldSchema) return undefined;
  const result = fieldSchema.safeParse(value);
  if (result.success) return undefined;
  return result.error.issues[0]?.message;
}

/**
 * Returns true when all required detail fields pass validation. The optional
 * `pickupInstructions` field is only validated when non-empty.
 */
export function areDetailsValid(details: DetailsDraft): boolean {
  if (
    validateField("name", details.name) ||
    validateField("description", details.description) ||
    validateField("dailyRateCents", details.dailyRateCents) ||
    validateField("pickupLocation", details.pickupLocation)
  ) {
    return false;
  }
  if (details.pickupInstructions.length > 0) {
    if (validateField("pickupInstructions", details.pickupInstructions)) {
      return false;
    }
  }
  return true;
}

interface ListingDetailsFieldsProps {
  details: DetailsDraft;
  errors: Partial<Record<FieldKey, string>>;
  onDetailChange: <K extends keyof DetailsDraft>(
    field: K,
    value: DetailsDraft[K],
  ) => void;
  onBlur: (field: FieldKey, value: unknown) => void;
}

/**
 * Pure field-rendering component. Owns no form state — the caller passes
 * `details`, `errors`, and the change/blur handlers. Field ids and
 * `aria-describedby` wiring are stable so existing test selectors keep
 * working after the extraction from `details-step.tsx`.
 */
export function ListingDetailsFields({
  details,
  errors,
  onDetailChange,
  onBlur,
}: ListingDetailsFieldsProps) {
  return (
    <div className="flex flex-col gap-space-6">
      <div className="grid gap-2">
        <Label htmlFor="listing-name">Equipment name</Label>
        <Input
          id="listing-name"
          name="name"
          value={details.name}
          onChange={(e) => onDetailChange("name", e.target.value)}
          onBlur={(e) => onBlur("name", e.target.value)}
          aria-describedby="listing-name-error"
        />
        {errors.name && (
          <p id="listing-name-error" className="text-sm text-destructive">
            {errors.name}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="listing-description">Description</Label>
        <textarea
          id="listing-description"
          name="description"
          value={details.description}
          onChange={(e) => onDetailChange("description", e.target.value)}
          onBlur={(e) => onBlur("description", e.target.value)}
          rows={5}
          aria-describedby="listing-description-count listing-description-error"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
        <div className="flex justify-between">
          {errors.description ? (
            <p
              id="listing-description-error"
              className="text-sm text-destructive"
            >
              {errors.description}
            </p>
          ) : (
            <span />
          )}
          <span
            id="listing-description-count"
            className="text-sm text-neutral-600"
          >
            {details.description.length} / 2000
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="listing-daily-rate">Daily rate</Label>
        <CurrencyInput
          id="listing-daily-rate"
          name="dailyRateCents"
          value={details.dailyRateCents}
          onChange={(cents) => {
            onDetailChange("dailyRateCents", cents);
            onBlur("dailyRateCents", cents);
          }}
          error={errors.dailyRateCents}
          placeholder="75.00"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="listing-pickup-location">Pickup location</Label>
        <Input
          id="listing-pickup-location"
          name="pickupLocation"
          value={details.pickupLocation}
          onChange={(e) => onDetailChange("pickupLocation", e.target.value)}
          onBlur={(e) => onBlur("pickupLocation", e.target.value)}
          aria-describedby="listing-pickup-location-error"
        />
        {errors.pickupLocation && (
          <p
            id="listing-pickup-location-error"
            className="text-sm text-destructive"
          >
            {errors.pickupLocation}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="listing-pickup-instructions">
          Pickup instructions
        </Label>
        <textarea
          id="listing-pickup-instructions"
          name="pickupInstructions"
          value={details.pickupInstructions}
          onChange={(e) =>
            onDetailChange("pickupInstructions", e.target.value)
          }
          onBlur={(e) => onBlur("pickupInstructions", e.target.value)}
          rows={3}
          aria-describedby="listing-pickup-instructions-error"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
        {errors.pickupInstructions && (
          <p
            id="listing-pickup-instructions-error"
            className="text-sm text-destructive"
          >
            {errors.pickupInstructions}
          </p>
        )}
      </div>
    </div>
  );
}
