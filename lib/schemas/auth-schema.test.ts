import { describe, expect, it } from "vitest";
import {
  signUpSchema,
  signInSchema,
  resetPasswordSchema,
  updatePasswordSchema,
} from "./auth-schema";

describe("signUpSchema", () => {
  it("accepts valid sign-up data", () => {
    const result = signUpSchema.safeParse({
      email: "test@example.com",
      password: "password123",
      confirmPassword: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = signUpSchema.safeParse({
      email: "not-an-email",
      password: "password123",
      confirmPassword: "password123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Please enter a valid email address",
      );
    }
  });

  it("rejects password shorter than 8 characters", () => {
    const result = signUpSchema.safeParse({
      email: "test@example.com",
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Password must be at least 8 characters",
      );
    }
  });

  it("rejects mismatched passwords", () => {
    const result = signUpSchema.safeParse({
      email: "test@example.com",
      password: "password123",
      confirmPassword: "different123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Passwords do not match");
    }
  });

  it("rejects empty email", () => {
    const result = signUpSchema.safeParse({
      email: "",
      password: "password123",
      confirmPassword: "password123",
    });
    expect(result.success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("accepts valid sign-in data", () => {
    const result = signInSchema.safeParse({
      email: "test@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = signInSchema.safeParse({
      email: "bad-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = signInSchema.safeParse({
      email: "test@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Password is required");
    }
  });
});

describe("resetPasswordSchema", () => {
  it("accepts valid email", () => {
    const result = resetPasswordSchema.safeParse({
      email: "test@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = resetPasswordSchema.safeParse({
      email: "not-valid",
    });
    expect(result.success).toBe(false);
  });
});

describe("updatePasswordSchema", () => {
  it("accepts valid password", () => {
    const result = updatePasswordSchema.safeParse({
      password: "newpassword123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short password", () => {
    const result = updatePasswordSchema.safeParse({
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Password must be at least 8 characters",
      );
    }
  });
});
