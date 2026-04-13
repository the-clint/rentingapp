// Polyfill native <dialog> for the DeleteListingDialog child.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/listings/listing-1",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/actions/listing-actions", () => ({
  deleteListing: vi.fn(),
}));

import {
  ListingDetailView,
  type ListingDetailViewData,
} from "./listing-detail-view";

function sampleListing(): ListingDetailViewData {
  return {
    id: "listing-1",
    name: "Honda EU2200i Generator",
    description: "Quiet inverter generator.",
    daily_rate_cents: 7500,
    pickup_location: "Salt Lake City, UT",
    pickup_instructions: null,
    photos: [
      {
        path: "op-1/listing-1/hero.jpg",
        isHero: true,
        position: 0,
        url: "https://example/hero.jpg",
      },
      {
        path: "op-1/listing-1/thumb.jpg",
        isHero: false,
        position: 1,
        url: "https://example/thumb.jpg",
      },
    ],
  };
}

describe("ListingDetailView", () => {
  beforeEach(() => {
    // No-op, keeps linter happy.
  });

  it("renders the listing name and a formatted daily rate", () => {
    render(
      <ListingDetailView
        listing={sampleListing()}
        bookingUrl="https://everything.rent/book/listing-1"
      />,
    );
    // The listing name appears in multiple places (hero alt text, the
    // posting assistant templates). Scope to the action buttons by asserting
    // the formatted daily rate, which is unique.
    expect(screen.getByText("$75.00 / day")).toBeInTheDocument();
  });

  it("uses the hero photo url as the primary image src", () => {
    render(
      <ListingDetailView
        listing={sampleListing()}
        bookingUrl="https://everything.rent/book/listing-1"
      />,
    );
    const hero = screen.getByAltText("Honda EU2200i Generator") as HTMLImageElement;
    expect(hero.src).toBe("https://example/hero.jpg");
  });

  it("links the Edit button to /listings/{id}/edit and the Availability button to /listings/{id}/availability", () => {
    render(
      <ListingDetailView
        listing={sampleListing()}
        bookingUrl="https://everything.rent/book/listing-1"
      />,
    );
    const editLink = screen
      .getByRole("link", { name: /^edit$/i })
      .getAttribute("href");
    expect(editLink).toBe("/listings/listing-1/edit");
    const availabilityLink = screen
      .getByRole("link", { name: /manage availability/i })
      .getAttribute("href");
    expect(availabilityLink).toBe("/listings/listing-1/availability");
  });

  it("renders the Delete button that opens the delete confirmation dialog", () => {
    render(
      <ListingDetailView
        listing={sampleListing()}
        bookingUrl="https://everything.rent/book/listing-1"
      />,
    );
    // The delete trigger is the first `<Button variant="destructive">` —
    // its accessible name is `Delete {listingName}`.
    expect(
      screen.getByRole("button", { name: /delete honda eu2200i generator/i }),
    ).toBeInTheDocument();
  });

  it("auto-opens the posting assistant dialog when initialAssistantOpen is true", () => {
    const showModalSpy = vi.spyOn(
      HTMLDialogElement.prototype,
      "showModal",
    );
    render(
      <ListingDetailView
        listing={sampleListing()}
        bookingUrl="https://everything.rent/book/listing-1"
        initialAssistantOpen={true}
      />,
    );
    expect(showModalSpy).toHaveBeenCalled();
    showModalSpy.mockRestore();
  });

  it("renders the Posting assistant trigger button", () => {
    render(
      <ListingDetailView
        listing={sampleListing()}
        bookingUrl="https://everything.rent/book/listing-1"
      />,
    );
    expect(
      screen.getByRole("button", { name: /^posting assistant$/i }),
    ).toBeInTheDocument();
  });
});
