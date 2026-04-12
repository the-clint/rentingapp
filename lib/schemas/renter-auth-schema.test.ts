import { describe, expect, it } from "vitest";

import {
  formatPhoneDisplay,
  otpCodeSchema,
  phoneNumberSchema,
  requestOtpSchema,
  stripPhoneFormatting,
  toE164US,
  verifyOtpSchema,
} from "./renter-auth-schema";

describe("stripPhoneFormatting", () => {
  it("removes all non-digit characters", () => {
    expect(stripPhoneFormatting("(801) 555-1234")).toBe("8015551234");
    expect(stripPhoneFormatting("+1 801-555-1234")).toBe("18015551234");
    expect(stripPhoneFormatting("abc123def")).toBe("123");
  });
});

describe("toE164US", () => {
  it("normalizes a 10-digit number to E.164", () => {
    expect(toE164US("8015551234")).toBe("+18015551234");
  });

  it("normalizes a formatted 10-digit number", () => {
    expect(toE164US("(801) 555-1234")).toBe("+18015551234");
  });

  it("normalizes a leading-1 11-digit number", () => {
    expect(toE164US("18015551234")).toBe("+18015551234");
    expect(toE164US("+1 801 555 1234")).toBe("+18015551234");
  });

  it("returns null for too-short numbers", () => {
    expect(toE164US("801555")).toBeNull();
  });

  it("returns null for too-long numbers", () => {
    expect(toE164US("801555123456")).toBeNull();
  });

  it("returns null for non-US leading digits", () => {
    expect(toE164US("28015551234")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(toE164US("")).toBeNull();
  });
});

describe("formatPhoneDisplay", () => {
  it("renders progressively as the user types", () => {
    expect(formatPhoneDisplay("")).toBe("");
    expect(formatPhoneDisplay("8")).toBe("(8");
    expect(formatPhoneDisplay("801")).toBe("(801");
    expect(formatPhoneDisplay("8015")).toBe("(801) 5");
    expect(formatPhoneDisplay("801555")).toBe("(801) 555");
    expect(formatPhoneDisplay("8015551")).toBe("(801) 555-1");
    expect(formatPhoneDisplay("8015551234")).toBe("(801) 555-1234");
  });

  it("ignores characters beyond 10 digits", () => {
    expect(formatPhoneDisplay("80155512349999")).toBe("(801) 555-1234");
  });

  it("strips existing formatting before reformatting", () => {
    expect(formatPhoneDisplay("(801) 555-1234")).toBe("(801) 555-1234");
  });
});

describe("phoneNumberSchema", () => {
  it("accepts and normalizes a formatted US phone", () => {
    const result = phoneNumberSchema.safeParse("(801) 555-1234");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("+18015551234");
  });

  it("rejects empty string", () => {
    const result = phoneNumberSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects a non-US phone", () => {
    const result = phoneNumberSchema.safeParse("+44 20 7946 0958");
    expect(result.success).toBe(false);
  });
});

describe("otpCodeSchema", () => {
  it("accepts a 6-digit code", () => {
    expect(otpCodeSchema.safeParse("123456").success).toBe(true);
  });

  it("rejects a short code", () => {
    expect(otpCodeSchema.safeParse("12345").success).toBe(false);
  });

  it("rejects a long code", () => {
    expect(otpCodeSchema.safeParse("1234567").success).toBe(false);
  });

  it("rejects non-numeric characters", () => {
    expect(otpCodeSchema.safeParse("12a456").success).toBe(false);
  });

  it("trims whitespace before validating", () => {
    expect(otpCodeSchema.safeParse("  123456  ").success).toBe(true);
  });
});

describe("requestOtpSchema and verifyOtpSchema", () => {
  it("parses a valid request payload", () => {
    const result = requestOtpSchema.safeParse({ phone: "(801) 555-1234" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("+18015551234");
  });

  it("parses a valid verify payload", () => {
    const result = verifyOtpSchema.safeParse({
      phone: "8015551234",
      code: "654321",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("+18015551234");
      expect(result.data.code).toBe("654321");
    }
  });

  it("fails verify payload with invalid code", () => {
    const result = verifyOtpSchema.safeParse({
      phone: "8015551234",
      code: "abc",
    });
    expect(result.success).toBe(false);
  });
});
