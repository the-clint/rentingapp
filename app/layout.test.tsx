import { describe, expect, it, vi } from "vitest";

// Mock next/font/google since it's a build-time Next.js feature
vi.mock("next/font/google", () => ({
  Inter: () => ({
    className: "inter-mock",
    variable: "--font-inter",
    style: { fontFamily: "Inter" },
  }),
}));

describe("Design system configuration", () => {
  it("exports Everything.Rent branding metadata", async () => {
    const { metadata } = await import("./layout");
    expect(metadata.title).toBe("Everything.Rent");
    expect(metadata.description).toContain("equipment rentals");
  });

  it("exports RootLayout as named export", async () => {
    const layoutModule = await import("./layout");
    expect(layoutModule.RootLayout).toBeDefined();
    expect(typeof layoutModule.RootLayout).toBe("function");
  });
});
