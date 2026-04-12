import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

for (const table of ["profiles", "listings", "listing_blocked_dates"]) {
  const { error } = await admin.from(table).select("*").limit(1);
  console.log(`${table}: ${error ? "MISSING — " + error.message : "exists"}`);
}
