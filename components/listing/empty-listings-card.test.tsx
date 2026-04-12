import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { EmptyListingsCard } from "./empty-listings-card";

describe("EmptyListingsCard", () => {
  it("renders the heading copy", () => {
    render(<EmptyListingsCard />);
    expect(
      screen.getByRole("heading", {
        name: /haven't created any listings yet/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders the body copy", () => {
    render(<EmptyListingsCard />);
    expect(
      screen.getByText(/List your first piece of equipment/i),
    ).toBeInTheDocument();
  });

  it("renders the Create Listing CTA pointing at /listings/new", () => {
    render(<EmptyListingsCard />);
    const cta = screen.getByRole("link", { name: "Create Listing" });
    expect(cta).toHaveAttribute("href", "/listings/new");
  });
});
