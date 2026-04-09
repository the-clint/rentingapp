"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, err, type Result } from "@/lib/utils/result";
import {
  signUpSchema,
  signInSchema,
  resetPasswordSchema,
  updatePasswordSchema,
} from "@/lib/schemas/auth-schema";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return "http://localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signUp(formData: FormData): Promise<Result<{ userId: string }>> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const supabase = await createClient();
  const baseUrl = await getBaseUrl();

  const { data, error: signUpError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${baseUrl}/auth/callback`,
    },
  });

  if (signUpError) {
    return err("SIGNUP_ERROR", signUpError.message);
  }

  if (!data.user) {
    return err("SIGNUP_ERROR", "Failed to create user");
  }

  // Set app_metadata.role via admin client (cannot be set client-side)
  const admin = createAdminClient();
  const { error: adminError } = await admin.auth.admin.updateUserById(
    data.user.id,
    { app_metadata: { role: "operator" } },
  );

  if (adminError) {
    // Clean up the orphaned auth user to prevent inconsistent state
    await admin.auth.admin.deleteUser(data.user.id);
    return err("ROLE_ASSIGNMENT_ERROR", adminError.message);
  }

  return ok({ userId: data.user.id });
}

export async function signIn(formData: FormData): Promise<Result<{ userId: string }>> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };

  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const supabase = await createClient();

  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (signInError) {
    return err("SIGNIN_ERROR", signInError.message);
  }

  if (!data.user) {
    return err("SIGNIN_ERROR", "Failed to sign in");
  }

  return ok({ userId: data.user.id });
}

export async function resetPassword(formData: FormData): Promise<Result<null>> {
  const raw = {
    email: String(formData.get("email") ?? ""),
  };

  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const supabase = await createClient();
  const baseUrl = await getBaseUrl();

  const { error: resetError } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${baseUrl}/auth/callback?next=/auth/update-password` },
  );

  if (resetError) {
    return err("RESET_ERROR", resetError.message);
  }

  return ok(null);
}

export async function updatePassword(formData: FormData): Promise<Result<null>> {
  const raw = {
    password: String(formData.get("password") ?? ""),
  };

  const parsed = updatePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  const supabase = await createClient();

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (updateError) {
    return err("UPDATE_PASSWORD_ERROR", updateError.message);
  }

  return ok(null);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
