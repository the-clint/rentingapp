import { describe, expect, it } from "vitest";
import { listingSchema, type ListingInput } from "./listing-schema";

function makeValidInput(overrides: Partial<ListingInput> = {}): ListingInput {
  return {
    name: "Honda EU2200i Generator",
    description:
      "A quiet, portable inverter generator perfect for camping or backup power.",
    dailyRateCents: 7500,
    pickupLocation: "Salt Lake City, UT",
    pickupInstructions: "",
    photos: [
      { path: "op-1/draft-1/photo-1.jpg", isHero: true, position: 0 },
    ],
    ...overrides,
  };
}

describe("listingSchema", () => {
  it("accepts a minimum valid input (happy path)", () => {
    const parsed = listingSchema.safeParse(makeValidInput());
    expect(parsed.success).toBe(true);
  });

  it("rejects name shorter than 3 characters", () => {
    const parsed = listingSchema.safeParse(makeValidInput({ name: "Hi" }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "Equipment name must be at least 3 characters",
      );
    }
  });

  it("rejects description shorter than 20 characters", () => {
    const parsed = listingSchema.safeParse(
      makeValidInput({ description: "Too short" }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "Description must be at least 20 characters",
      );
    }
  });

  it("rejects dailyRateCents below 100 (under $1.00)", () => {
    const parsed = listingSchema.safeParse(
      makeValidInput({ dailyRateCents: 50 }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "Daily rate must be at least $1.00",
      );
    }
  });

  it("rejects an empty pickupLocation", () => {
    const parsed = listingSchema.safeParse(
      makeValidInput({ pickupLocation: "" }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe("Pickup location is required");
    }
  });

  it("rejects an empty photos array", () => {
    const parsed = listingSchema.safeParse(makeValidInput({ photos: [] }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe("Add at least one photo");
    }
  });

  it("rejects more than one hero photo", () => {
    const parsed = listingSchema.safeParse(
      makeValidInput({
        photos: [
          { path: "op-1/draft-1/a.jpg", isHero: true, position: 0 },
          { path: "op-1/draft-1/b.jpg", isHero: true, position: 1 },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "Exactly one photo must be marked as hero",
      );
    }
  });
});
