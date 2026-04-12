import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RentalsEmptyState } from "./rentals-empty-state";

describe("RentalsEmptyState", () => {
  it("renders the headline and guidance copy", () => {
    render(<RentalsEmptyState />);
    expect(screen.getByTestId("rentals-empty-state")).toBeInTheDocument();
    expect(screen.getByText("No rentals yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Find equipment on KSL or Facebook Marketplace to get started/,
      ),
    ).toBeInTheDocument();
  });
});
