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

const bookingUrl = "https://rentingapp.com/book/test-listing-id";

describe("generatePostingCopy", () => {
  it("KSL template includes the formatted daily rate, listing name, and booking URL", () => {
    const copy = generatePostingCopy(fixture, "ksl", bookingUrl);
    expect(copy).toContain("$175.00/day");
    expect(copy).toContain("2016 Kubota Mini Excavator");
    expect(copy).toContain(bookingUrl);
    expect(copy).toContain("Pickup: Provo, UT");
    expect(copy).toContain("Reserve here:");
  });

  it("Facebook Marketplace template is terser than KSL and includes name + URL", () => {
    const ksl = generatePostingCopy(fixture, "ksl", bookingUrl);
    const fb = generatePostingCopy(fixture, "facebook", bookingUrl);
    expect(fb.length).toBeLessThan(ksl.length);
    expect(fb).toContain("2016 Kubota Mini Excavator");
    expect(fb).toContain("$175.00/day");
    expect(fb).toContain(bookingUrl);
    expect(fb).toContain("Pickup in Provo, UT");
  });

  it("Craigslist template contains an ALL CAPS line and the booking URL", () => {
    const copy = generatePostingCopy(fixture, "craigslist", bookingUrl);
    // At least one line with 6+ consecutive uppercase letters.
    expect(copy).toMatch(/[A-Z]{6,}/);
    expect(copy).toContain("FOR RENT");
    expect(copy).toContain("PICKUP LOCATION:");
    expect(copy).toContain("$175.00/DAY");
    expect(copy).toContain(bookingUrl);
    expect(copy).toContain("2016 Kubota Mini Excavator");
  });

  it("formats zero-cent and sub-dollar daily rates cleanly", () => {
    const free = generatePostingCopy(
      { ...fixture, dailyRateCents: 0 },
      "ksl",
      bookingUrl,
    );
    expect(free).toContain("$0.00/day");

    const cheap = generatePostingCopy(
      { ...fixture, dailyRateCents: 99 },
      "ksl",
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
    // Should not throw for any platform.
    for (const platform of ["ksl", "facebook", "craigslist"] as const) {
      const copy = generatePostingCopy(weird, platform, bookingUrl);
      expect(copy).toContain('"rent me"');
      expect(copy).toContain("café");
      expect(copy).toContain("日本語");
      expect(copy).toContain("Line two");
      expect(copy).toContain(bookingUrl);
    }
  });
});
