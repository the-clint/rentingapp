import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `e2e-diag-${Date.now()}@gmail.com`;
console.log("1. Creating user via admin.createUser:", email);
const { data: userData, error: createErr } = await admin.auth.admin.createUser({
  email,
  password: "DiagPass!12345",
  email_confirm: true,
});
if (createErr) {
  console.error("createUser error:", createErr);
  process.exit(1);
}
const userId = userData.user.id;
console.log("   user id:", userId);

console.log("2. Checking profiles table for the user...");
const { data: profileData, error: profErr } = await admin
  .from("profiles")
  .select("id, role")
  .eq("id", userId)
  .maybeSingle();
if (profErr) console.error("   profiles query error:", profErr);
else console.log("   profile:", profileData);

console.log("3. Signing in to get a session + JWT...");
const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: signInData, error: signInErr } =
  await anon.auth.signInWithPassword({ email, password: "DiagPass!12345" });
if (signInErr) {
  console.error("   signIn error:", signInErr);
} else {
  const token = signInData.session?.access_token;
  console.log("   access token received:", !!token);
  if (token) {
    const [, payload] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
    console.log("   JWT claim keys:", Object.keys(decoded));
    console.log("   user_role claim:", decoded.user_role);
    console.log("   app_metadata:", decoded.app_metadata);
    console.log("   role claim:", decoded.role);
  }
}

console.log("4. Cleaning up diag user...");
await admin.auth.admin.deleteUser(userId);
console.log("Done.");
