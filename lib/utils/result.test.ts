import { describe, expect, it } from "vitest";
import { err, ok } from "./result";

describe("Result utilities", () => {
  it("ok() returns a success result with data", () => {
    const result = ok({ id: 1, name: "test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ id: 1, name: "test" });
    }
  });

  it("err() returns a failure result with error details", () => {
    const result = err("NOT_FOUND", "Item not found");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.message).toBe("Item not found");
    }
  });

  it("ok() works with primitive types", () => {
    const result = ok(42);
    expect(result).toEqual({ success: true, data: 42 });
  });

  it("err() is typed as Result<never> by default", () => {
    const result = err<string>("VALIDATION", "Invalid input");
    expect(result.success).toBe(false);
  });
});
