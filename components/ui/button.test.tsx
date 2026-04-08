import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button component", () => {
  it("renders with default (primary) variant without crashing", () => {
    render(<Button>Book Now</Button>);
    const button = screen.getByRole("button", { name: "Book Now" });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("h-12");
  });

  it("renders with secondary variant", () => {
    render(<Button variant="secondary">Cancel</Button>);
    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain("bg-muted");
  });

  it("renders with ghost variant using primary-dark text color", () => {
    render(<Button variant="ghost">Details</Button>);
    const button = screen.getByRole("button", { name: "Details" });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain("[color:hsl(var(--primary-dark))]");
  });

  it("renders with destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain("bg-destructive");
  });

  it("applies secondary size variant (44px / h-11)", () => {
    render(<Button variant="secondary" size="secondary">Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("h-11");
  });

  it("applies custom className alongside variants", () => {
    render(<Button className="mt-4">Styled</Button>);
    const button = screen.getByRole("button", { name: "Styled" });
    expect(button.className).toContain("mt-4");
    expect(button.className).toContain("bg-primary");
  });
});
