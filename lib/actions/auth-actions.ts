"use server";

import { createClient } from "@/lib/supabase/server";
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
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? "http://everything.test:3000";
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

  // Role assignment: handled entirely in Postgres.
  //   1. The `on_auth_user_created` trigger inserts a `public.profiles` row
  //      with role='operator' (see migration 00002_profiles-and-auth.sql).
  //   2. The `custom_access_token_hook` reads `profiles.role` and injects it
  //      as the `user_role` JWT claim on every token issuance — including
  //      this signup's initial token, since the hook runs after the trigger.
  //
  // DEPLOYMENT PREREQUISITE: the custom access token hook MUST be enabled in
  // Supabase Dashboard > Authentication > Hooks, pointing at
  // `public.custom_access_token_hook`. Without it, no token will carry a role
  // claim and `proxy.ts` will reject every operator-route request.
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
