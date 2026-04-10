import { z } from "zod";

export const photoSchema = z.object({
  path: z.string().min(1),
  isHero: z.boolean(),
  position: z.number().int().min(0).max(9),
});

/**
 * Raw field shape for the listing form. Exported separately so per-field
 * on-blur validation in `details-step.tsx` can do
 * `listingFieldsSchema.shape[field].safeParse(value)` — you cannot do that on
 * `listingSchema` because `.refine(...)` wraps it in a ZodEffects.
 */
export const listingFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Equipment name must be at least 3 characters")
    .max(80, "Equipment name must be 80 characters or fewer"),
  description: z
    .string()
    .trim()
    .min(20, "Description must be at least 20 characters")
    .max(2000, "Description must be 2000 characters or fewer"),
  dailyRateCents: z
    .number()
    .int("Daily rate must be a whole number of cents")
    .min(100, "Daily rate must be at least $1.00"),
  pickupLocation: z
    .string()
    .trim()
    .min(3, "Pickup location is required")
    .max(120, "Pickup location must be 120 characters or fewer"),
  pickupInstructions: z
    .string()
    .trim()
    .max(1000, "Pickup instructions must be 1000 characters or fewer")
    .optional()
    .or(z.literal("")),
  photos: z
    .array(photoSchema)
    .min(1, "Add at least one photo")
    .max(10, "You can upload at most 10 photos"),
});

export const listingSchema = listingFieldsSchema.refine(
  (data) => data.photos.filter((p) => p.isHero === true).length === 1,
  { message: "Exactly one photo must be marked as hero", path: ["photos"] },
);

export type PhotoInput = z.infer<typeof photoSchema>;
export type ListingInput = z.infer<typeof listingSchema>;
