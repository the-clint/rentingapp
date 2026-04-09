import { describe, expect, it } from "vitest";
import {
  signUpSchema,
  signInSchema,
  resetPasswordSchema,
  updatePasswordSchema,
} from "@/lib/schemas/auth-schema";

// Test the validation layer used by auth actions.
// Full integration tests with Supabase require a running instance
// and are covered by E2E tests.

function formDataFrom(obj: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(obj)) {
    fd.append(key, value);
  }
  return fd;
}

describe("Auth action validation", () => {
  describe("signUp validation", () => {
    it("validates correct sign-up form data", () => {
      const fd = formDataFrom({
        email: "operator@example.com",
        password: "securepass123",
        confirmPassword: "securepass123",
      });
      const result = signUpSchema.safeParse({
        email: fd.get("email"),
        password: fd.get("password"),
        confirmPassword: fd.get("confirmPassword"),
      });
      expect(result.success).toBe(true);
    });

    it("rejects sign-up with mismatched passwords", () => {
      const result = signUpSchema.safeParse({
        email: "operator@example.com",
        password: "securepass123",
        confirmPassword: "different123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects sign-up with short password", () => {
      const result = signUpSchema.safeParse({
        email: "operator@example.com",
        password: "short",
        confirmPassword: "short",
      });
      expect(result.success).toBe(false);
    });

    it("rejects sign-up with invalid email", () => {
      const result = signUpSchema.safeParse({
        email: "not-an-email",
        password: "securepass123",
        confirmPassword: "securepass123",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("signIn validation", () => {
    it("validates correct sign-in data", () => {
      const result = signInSchema.safeParse({
        email: "operator@example.com",
        password: "securepass123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty password", () => {
      const result = signInSchema.safeParse({
        email: "operator@example.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("resetPassword validation", () => {
    it("validates correct email", () => {
      const result = resetPasswordSchema.safeParse({
        email: "operator@example.com",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = resetPasswordSchema.safeParse({
        email: "bad",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updatePassword validation", () => {
    it("validates correct password", () => {
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
    });
  });
});
