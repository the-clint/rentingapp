import { z } from "zod";

/**
 * Contract Server Action input schemas (Story 3-4).
 *
 * `createContractDraftSchema` — validates the payload used to generate or
 * look up the draft contract row when the renter lands on the contract
 * page. `listingId` is a UUID, `startDate`/`endDate` are `YYYY-MM-DD`
 * strings with `start <= end`.
 *
 * `signContractSchema` — validates the payload of the final "I Agree &
 * Sign" button click. `agreeChecked` must be `true` — the Server Action
 * refuses to sign a contract where the checkbox was never ticked.
 */

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createContractDraftSchema = z
  .object({
    listingId: z
      .string()
      .regex(UUID_REGEX, "Listing id must be a UUID"),
    startDate: z
      .string()
      .regex(DATE_REGEX, "Start date must be in YYYY-MM-DD format"),
    endDate: z
      .string()
      .regex(DATE_REGEX, "End date must be in YYYY-MM-DD format"),
  })
  .refine((r) => r.startDate <= r.endDate, {
    message: "Start date must be on or before end date",
    path: ["endDate"],
  });

export const signContractSchema = z
  .object({
    contractId: z
      .string()
      .regex(UUID_REGEX, "Contract id must be a UUID"),
    agreeChecked: z
      .boolean()
      .refine((v) => v === true, {
        message: "You must agree to the terms before signing",
      }),
  });

export type CreateContractDraftInput = z.infer<typeof createContractDraftSchema>;
export type SignContractInput = z.infer<typeof signContractSchema>;
