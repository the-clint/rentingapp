import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { CurrencyInput } from "./currency-input";

describe("CurrencyInput", () => {
  it("formats `75` to `75.00` on blur and emits 7500 cents", () => {
    const handleChange = vi.fn();
    render(
      <CurrencyInput
        id="rate"
        name="rate"
        value={null}
        onChange={handleChange}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "75" } });
    fireEvent.blur(input);
    expect(handleChange).toHaveBeenCalledWith(7500);
    expect(input.value).toBe("75.00");
  });

  it("formats `75.5` to `75.50` on blur and emits 7550 cents", () => {
    const handleChange = vi.fn();
    render(
      <CurrencyInput
        id="rate"
        name="rate"
        value={null}
        onChange={handleChange}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "75.5" } });
    fireEvent.blur(input);
    expect(handleChange).toHaveBeenCalledWith(7550);
    expect(input.value).toBe("75.50");
  });

  it("rejects partially-numeric input like `75abc` instead of silently coercing to 75", () => {
    // Regression: parseFloat("75abc") returns 75 — the original implementation
    // accepted the invalid string as $75.00. The fix uses a strict regex.
    const handleChange = vi.fn();
    render(
      <CurrencyInput
        id="rate"
        name="rate"
        value={null}
        onChange={handleChange}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "75abc" } });
    fireEvent.blur(input);
    expect(handleChange).toHaveBeenCalledWith(null);
  });

  it("rejects more than two decimal places", () => {
    const handleChange = vi.fn();
    render(
      <CurrencyInput
        id="rate"
        name="rate"
        value={null}
        onChange={handleChange}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "75.555" } });
    fireEvent.blur(input);
    expect(handleChange).toHaveBeenCalledWith(null);
  });

  it("emits null on non-numeric input and renders the error", () => {
    const handleChange = vi.fn();
    render(
      <CurrencyInput
        id="rate"
        name="rate"
        value={null}
        onChange={handleChange}
        error="Daily rate must be at least $1.00"
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    expect(handleChange).toHaveBeenCalledWith(null);
    expect(
      screen.getByText("Daily rate must be at least $1.00"),
    ).toBeInTheDocument();
  });
});
