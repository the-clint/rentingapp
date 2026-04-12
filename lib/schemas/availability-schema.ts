import { z } from "zod";

import { rangesOverlap, todayKey } from "@/lib/utils/date-range";

/**
 * A single blocked date range. Both endpoints are `YYYY-MM-DD` strings.
 *
 * Rules:
 *  - Both strings must match `^\d{4}-\d{2}-\d{2}$`.
 *  - `startDate <= endDate` (lexicographic, which == chronological).
 *  - `startDate >= todayKey()` — no blocking dates in the past.
 */
export const blockedRangeSchema = z
  .object({
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  })
  .refine((r) => r.startDate <= r.endDate, {
    message: "Start date must be on or before end date",
    path: ["endDate"],
  })
  .refine((r) => r.startDate >= todayKey(), {
    message: "You cannot block a date in the past",
    path: ["startDate"],
  });

/**
 * An array of blocked ranges. Adds a cross-range `superRefine` that rejects
 * any two ranges in the payload that overlap. Adjacent non-overlapping ranges
 * (`[A,B]` and `[C,D]` with `B < C`) are allowed — the server action
 * normalizes via `collapseConsecutiveDates` before writing.
 */
export const blockedRangesSchema = z
  .array(blockedRangeSchema)
  .superRefine((ranges, ctx) => {
    // Record every overlap (not just the first). Previous implementation
    // used an early `return` inside superRefine, which hid secondary
    // conflicts and meant the error message pointed at whichever pair the
    // O(n²) loop hit first — misleading for multi-range payloads.
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        if (rangesOverlap(ranges[i], ranges[j])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Blocked date ranges cannot overlap",
            path: [j],
          });
        }
      }
    }
  });

export type BlockedRangeInput = z.infer<typeof blockedRangeSchema>;
