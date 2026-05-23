import { describe, expect, it } from "vitest";

import {
  generatePostingCopy,
  type ListingForTemplates,
} from "./posting-templates";

const fixture: ListingForTemplates = {
  name: "2016 Kubota Mini Excavator",
  description:
    "Well-maintained 3,000lb mini excavator. Includes 12\" bucket and trailer.",
  dailyRateCents: 17500,
  pickupLocation: "Provo, UT",
};

const bookingUrl = "https://everything.rent/book/test-listing-id";

describe("generatePostingCopy", () => {
  it("includes the formatted daily rate, listing name, pickup, and booking URL", () => {
    const copy = generatePostingCopy(fixture, bookingUrl);
    expect(copy).toContain("$175.00/day");
    expect(copy).toContain("2016 Kubota Mini Excavator");
    expect(copy).toContain(bookingUrl);
    expect(copy).toContain("Pickup: Provo, UT");
    expect(copy).toContain("Reserve here:");
  });

  it("formats zero-cent and sub-dollar daily rates cleanly", () => {
    const free = generatePostingCopy(
      { ...fixture, dailyRateCents: 0 },
      bookingUrl,
    );
    expect(free).toContain("$0.00/day");

    const cheap = generatePostingCopy(
      { ...fixture, dailyRateCents: 99 },
      bookingUrl,
    );
    expect(cheap).toContain("$0.99/day");
  });

  it("passes special characters through without mangling", () => {
    const weird: ListingForTemplates = {
      name: 'He said "rent me" — now',
      description:
        'Line one with "quotes"\nLine two with unicode: café, π, 日本語\nLine three.',
      dailyRateCents: 5000,
      pickupLocation: "St. George, UT",
    };
    const copy = generatePostingCopy(weird, bookingUrl);
    expect(copy).toContain('"rent me"');
    expect(copy).toContain("café");
    expect(copy).toContain("日本語");
    expect(copy).toContain("Line two");
    expect(copy).toContain(bookingUrl);
  });
});
