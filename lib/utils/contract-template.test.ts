import { describe, expect, it } from "vitest";

import { renderContract, type ContractTemplateInput } from "./contract-template";

const EXACT_CANCELLATION =
  "Cancel 48+ hours before for a full refund. Within 48 hours, the hold is non-refundable.";

function baseInput(
  overrides: Partial<ContractTemplateInput> = {},
): ContractTemplateInput {
  return {
    listingName: "2016 Kubota Mini Excavator",
    pickupLocation: "Provo, UT",
    pickupInstructions: "Lockbox on the trailer, code 4321.",
    dailyRateCents: 17500,
    startDate: "2026-05-01",
    endDate: "2026-05-03",
    totalCents: 52500,
    rentalDays: 3,
    renterPhoneE164: "+18015551234",
    ...overrides,
  };
}

describe("renderContract", () => {
  it("substitutes every placeholder into the body", () => {
    const { body } = renderContract(baseInput());
    expect(body).toContain("2016 Kubota Mini Excavator");
    expect(body).toContain("Provo, UT");
    expect(body).toContain("Lockbox on the trailer, code 4321.");
    expect(body).toContain("2026-05-01");
    expect(body).toContain("2026-05-03");
    expect(body).toContain("$175.00");
    expect(body).toContain("$525.00");
    expect(body).toContain("(801) 555-1234");
    expect(body).toContain("3 days");
  });

  it("uses singular day wording for a one-day rental", () => {
    const { body, summary } = renderContract(
      baseInput({
        endDate: "2026-05-01",
        totalCents: 17500,
        rentalDays: 1,
      }),
    );
    expect(body).toContain("1 day");
    expect(body).not.toContain("1 days");
    expect(summary.periodLine).toContain("1 day");
  });

  it("uses the exact cancellation policy text required by the AC", () => {
    const { body, summary } = renderContract(baseInput());
    expect(body).toContain(EXACT_CANCELLATION);
    expect(summary.cancellationLine).toBe(EXACT_CANCELLATION);
  });

  it("includes liability and no-show language in both the body and the summary", () => {
    const { body, summary } = renderContract(baseInput());
    expect(body.toLowerCase()).toContain("liability");
    expect(body.toLowerCase()).toContain("no-show");
    expect(summary.liabilityLine.toLowerCase()).toContain("damage");
    expect(summary.noShowLine.toLowerCase()).toContain("no-show");
  });

  it("produces a body long enough to be a real contract", () => {
    const { body } = renderContract(baseInput());
    expect(body.length).toBeGreaterThan(200);
  });

  it("falls back to a generic pickup instructions line when none is provided", () => {
    const { body } = renderContract(
      baseInput({ pickupInstructions: null }),
    );
    expect(body).toContain(
      "The operator will share pickup instructions after the payment hold is authorized.",
    );
  });

  it("returns a summary with all six lines populated", () => {
    const { summary } = renderContract(baseInput());
    expect(summary.periodLine).toMatch(/2026-05-01/);
    expect(summary.rateLine).toContain("$175.00");
    expect(summary.rateLine).toContain("$525.00");
    expect(summary.pickupLine).toContain("Provo, UT");
    expect(summary.cancellationLine).toBe(EXACT_CANCELLATION);
    expect(summary.liabilityLine.length).toBeGreaterThan(10);
    expect(summary.noShowLine.length).toBeGreaterThan(10);
  });
});
