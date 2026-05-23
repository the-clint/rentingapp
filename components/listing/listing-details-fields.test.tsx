import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  ListingDetailsFields,
  areDetailsValid,
  validateField,
  type DetailsDraft,
} from "./listing-details-fields";

function emptyDetails(): DetailsDraft {
  return {
    name: "",
    description: "",
    dailyRateCents: null,
    addressStreet: "",
    addressCity: "",
    addressState: "UT",
    addressZip: "",
    pickupInstructions: "",
  };
}

function validDetails(): DetailsDraft {
  return {
    name: "Honda EU2200i Generator",
    description:
      "A quiet, portable inverter generator perfect for camping or backup power.",
    dailyRateCents: 7500,
    addressStreet: "123 Main St",
    addressCity: "Salt Lake City",
    addressState: "UT",
    addressZip: "84101",
    pickupInstructions: "",
  };
}

describe("ListingDetailsFields", () => {
  it("renders all labeled inputs", () => {
    render(
      <ListingDetailsFields
        details={emptyDetails()}
        errors={{}}
        onDetailChange={vi.fn()}
        onBlur={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Equipment name")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Daily rate")).toBeInTheDocument();
    expect(screen.getByLabelText("Street address")).toBeInTheDocument();
    expect(screen.getByLabelText("City")).toBeInTheDocument();
    expect(screen.getByLabelText("State")).toBeInTheDocument();
    expect(screen.getByLabelText("ZIP")).toBeInTheDocument();
    expect(screen.getByLabelText("Pickup instructions")).toBeInTheDocument();
  });

  it("renders the description character counter reflecting current length", () => {
    render(
      <ListingDetailsFields
        details={{ ...emptyDetails(), description: "hello world" }}
        errors={{}}
        onDetailChange={vi.fn()}
        onBlur={vi.fn()}
      />,
    );
    expect(screen.getByText("11 / 2000")).toBeInTheDocument();
  });

  it("renders per-field error messages when supplied", () => {
    render(
      <ListingDetailsFields
        details={emptyDetails()}
        errors={{ name: "Equipment name must be at least 3 characters" }}
        onDetailChange={vi.fn()}
        onBlur={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Equipment name must be at least 3 characters"),
    ).toBeInTheDocument();
  });
});

describe("validateField / areDetailsValid", () => {
  it("validateField returns undefined for a valid value", () => {
    expect(validateField("name", "Honda EU2200i")).toBeUndefined();
  });

  it("validateField returns the Zod issue message for an invalid value", () => {
    expect(validateField("name", "Hi")).toBe(
      "Equipment name must be at least 3 characters",
    );
  });

  it("areDetailsValid returns true for a fully populated draft", () => {
    expect(areDetailsValid(validDetails())).toBe(true);
  });

  it("areDetailsValid returns false when a required field is empty", () => {
    expect(areDetailsValid(emptyDetails())).toBe(false);
  });
});
