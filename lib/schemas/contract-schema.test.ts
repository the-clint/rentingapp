import { describe, expect, it } from "vitest";

import {
  createContractDraftSchema,
  signContractSchema,
} from "./contract-schema";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

describe("createContractDraftSchema", () => {
  it("accepts a valid UUID + date range", () => {
    const result = createContractDraftSchema.safeParse({
      listingId: VALID_UUID,
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID listing id", () => {
    const result = createContractDraftSchema.safeParse({
      listingId: "not-a-uuid",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed start date", () => {
    const result = createContractDraftSchema.safeParse({
      listingId: VALID_UUID,
      startDate: "05/01/2026",
      endDate: "2026-05-03",
    });
    expect(result.success).toBe(false);
  });

  it("rejects end before start", () => {
    const result = createContractDraftSchema.safeParse({
      listingId: VALID_UUID,
      startDate: "2026-05-05",
      endDate: "2026-05-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a single-day range (start == end)", () => {
    const result = createContractDraftSchema.safeParse({
      listingId: VALID_UUID,
      startDate: "2026-05-01",
      endDate: "2026-05-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("signContractSchema", () => {
  it("accepts a valid payload", () => {
    const result = signContractSchema.safeParse({
      contractId: VALID_UUID,
      agreeChecked: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects agreeChecked=false", () => {
    const result = signContractSchema.safeParse({
      contractId: VALID_UUID,
      agreeChecked: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID contract id", () => {
    const result = signContractSchema.safeParse({
      contractId: "nope",
      agreeChecked: true,
    });
    expect(result.success).toBe(false);
  });
});
