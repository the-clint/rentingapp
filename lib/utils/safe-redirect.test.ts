import { describe, expect, it } from "vitest";

import {
  isSafeRenterBookingPath,
  sanitizeRenterBookingReturnTo,
} from "./safe-redirect";

const LID = "listing-abc123";

describe("isSafeRenterBookingPath", () => {
  it("accepts a same-listing contract path with query", () => {
    expect(
      isSafeRenterBookingPath(
        LID,
        `/book/${LID}/contract?start=2026-05-01&end=2026-05-03`,
      ),
    ).toBe(true);
  });

  it("accepts a same-listing payment path with bookingId", () => {
    expect(
      isSafeRenterBookingPath(LID, `/book/${LID}/payment?bookingId=boo-1`),
    ).toBe(true);
  });

  it("accepts the bare listing root path", () => {
    expect(isSafeRenterBookingPath(LID, `/book/${LID}`)).toBe(true);
  });

  it("rejects cross-listing paths", () => {
    expect(
      isSafeRenterBookingPath(LID, "/book/other-listing/contract"),
    ).toBe(false);
  });

  it("rejects absolute https URLs", () => {
    expect(
      isSafeRenterBookingPath(LID, "https://evil.example.com/phish"),
    ).toBe(false);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isSafeRenterBookingPath(LID, "//evil.example.com")).toBe(false);
  });

  it("rejects javascript: URIs", () => {
    expect(
      isSafeRenterBookingPath(LID, "javascript:alert(1)"),
    ).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(
      isSafeRenterBookingPath(LID, `/book/${LID}/../../../admin`),
    ).toBe(false);
  });

  it("rejects non-book paths", () => {
    expect(isSafeRenterBookingPath(LID, "/dashboard")).toBe(false);
  });

  it("rejects backslashes", () => {
    expect(
      isSafeRenterBookingPath(LID, `/book/${LID}\\..\\evil`),
    ).toBe(false);
  });

  it("rejects empty / null / undefined", () => {
    expect(isSafeRenterBookingPath(LID, "")).toBe(false);
    expect(isSafeRenterBookingPath(LID, null)).toBe(false);
    expect(isSafeRenterBookingPath(LID, undefined)).toBe(false);
  });

  it("rejects control characters", () => {
    expect(
      isSafeRenterBookingPath(LID, `/book/${LID}/contract\n`),
    ).toBe(false);
  });

  it("rejects malformed listingId", () => {
    expect(isSafeRenterBookingPath("", "/book/x/contract")).toBe(false);
    expect(
      isSafeRenterBookingPath("bad/id", "/book/bad/id/contract"),
    ).toBe(false);
  });
});

describe("sanitizeRenterBookingReturnTo", () => {
  it("returns the path when safe", () => {
    const path = `/book/${LID}/contract?start=a&end=b`;
    expect(sanitizeRenterBookingReturnTo(LID, path)).toBe(path);
  });

  it("returns null when unsafe", () => {
    expect(
      sanitizeRenterBookingReturnTo(LID, "https://evil.example.com"),
    ).toBeNull();
  });
});
