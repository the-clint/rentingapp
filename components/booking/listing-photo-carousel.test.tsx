import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { ListingPhotoCarousel } from "./listing-photo-carousel";

// jsdom doesn't implement scrollTo / layout geometry. Stub both so the
// component's handlers and derived-index math have something to call.
let scrollToMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollToMock = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    writable: true,
    value: scrollToMock,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 300,
  });
});

const photos = [
  { path: "op-1/l-1/a.jpg", url: "https://cdn.example/a.jpg" },
  { path: "op-1/l-1/b.jpg", url: "https://cdn.example/b.jpg" },
  { path: "op-1/l-1/c.jpg", url: "https://cdn.example/c.jpg" },
];

describe("ListingPhotoCarousel", () => {
  it("renders all photos with accessible alt text", () => {
    render(<ListingPhotoCarousel photos={photos} listingName="Honda Generator" />);
    expect(
      screen.getByAltText("Honda Generator photo 1"),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("Honda Generator photo 2"),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("Honda Generator photo 3"),
    ).toBeInTheDocument();
  });

  it("outer region has aria-roledescription='carousel'", () => {
    render(<ListingPhotoCarousel photos={photos} listingName="Honda" />);
    const region = screen.getByRole("region", { name: /honda photos/i });
    expect(region.getAttribute("aria-roledescription")).toBe("carousel");
  });

  it("renders photo counter starting at '1 / total'", () => {
    render(<ListingPhotoCarousel photos={photos} listingName="Honda" />);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("renders a dot per photo with the first marked active", () => {
    render(<ListingPhotoCarousel photos={photos} listingName="Honda" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute("aria-current")).toBe("true");
    expect(tabs[1].getAttribute("aria-current")).toBeNull();
  });

  it("clicking Next advances the active slide and updates the counter", () => {
    render(<ListingPhotoCarousel photos={photos} listingName="Honda" />);
    const nextBtn = screen.getByRole("button", { name: /next photo/i });
    fireEvent.click(nextBtn);
    expect(scrollToMock).toHaveBeenCalledWith({ left: 300, behavior: "smooth" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs[1].getAttribute("aria-current")).toBe("true");
  });

  it("clicking Previous at the start is disabled", () => {
    render(<ListingPhotoCarousel photos={photos} listingName="Honda" />);
    const prevBtn = screen.getByRole("button", { name: /previous photo/i });
    expect(prevBtn).toBeDisabled();
    expect(prevBtn.getAttribute("aria-disabled")).toBe("true");
  });

  it("clicking Next at the end is disabled", () => {
    render(<ListingPhotoCarousel photos={photos} listingName="Honda" />);
    const nextBtn = screen.getByRole("button", { name: /next photo/i });
    fireEvent.click(nextBtn); // 1 → 2
    fireEvent.click(nextBtn); // 2 → 3
    expect(nextBtn).toBeDisabled();
    expect(nextBtn.getAttribute("aria-disabled")).toBe("true");
  });

  it("ArrowRight / ArrowLeft keys move the active slide", () => {
    render(<ListingPhotoCarousel photos={photos} listingName="Honda" />);
    const region = screen.getByRole("region", { name: /honda photos/i });
    // The track (scrollable child) is the keydown target.
    const track = region.querySelector('[tabindex="0"]') as HTMLElement;
    expect(track).not.toBeNull();
    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    fireEvent.keyDown(track, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("clicking a dot jumps to that slide", () => {
    render(<ListingPhotoCarousel photos={photos} listingName="Honda" />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[2]);
    expect(scrollToMock).toHaveBeenCalledWith({ left: 600, behavior: "smooth" });
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("single-photo case: no dots, no arrows, counter '1 / 1'", () => {
    render(
      <ListingPhotoCarousel photos={[photos[0]]} listingName="Honda" />,
    );
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: /previous photo/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /next photo/i }),
    ).toBeNull();
    // Single slide still exposes the group for screen readers.
    const region = screen.getByRole("region", { name: /honda photos/i });
    expect(
      within(region).getByRole("group", { name: /photo 1 of 1/i }),
    ).toBeInTheDocument();
  });
});
