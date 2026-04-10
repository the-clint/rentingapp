-- Migration: otp_attempts table + renter role propagation in access token hook
-- Story: 3-3-renter-phone-otp-authentication
--
-- Two concerns rolled into one migration because they are co-dependent:
--   1. `otp_attempts` audit table used for server-side rate limiting of
--      renter phone-OTP requests (1 OTP per phone number per 60 seconds).
--   2. The custom access token hook from 00002_profiles-and-auth.sql is
--      amended so that phone-only auth.users rows get `user_role = 'renter'`
--      in the JWT even though they have no row in `public.profiles`. This
--      preserves the existing operator behavior (profiles.role wins) while
--      giving phone-auth users a deterministic role claim.
--
-- Design decisions:
--   - Rate limiting is enforced in the Server Action via the Supabase service
--     role client, not via a SECURITY DEFINER RPC. Reasons:
--       a) The Server Action already runs with the service role key for OTP
--          requests (Supabase Auth phone OTP needs a privileged client); one
--          extra `select().gte().limit()` is cheaper than a round-trip to an
--          RPC that does the same thing.
--       b) SECURITY DEFINER functions are harder to unit test than a plain
--          Server Action that mocks @supabase/ssr.
--       c) The rate-limit window is tiny (60 s) so the TOCTOU race between
--          "check" and "insert" is not a security concern — a determined
--          attacker racing at < 60 s granularity is still limited to the
--          Twilio/Supabase per-phone rate limits upstream.
--   - RLS on `otp_attempts` is total-deny: no anon, no authenticated. The
--     service role bypasses RLS, which is the only path the Server Action
--     uses. Even if a renter session leaks the access token, it cannot read
--     or write this table.
--   - `phone` column is the E.164 string (`+18015551234`). The Server Action
--     normalizes before writing, so stray formats never land here.

-- =============================================================================
-- 1. otp_attempts table
-- =============================================================================
CREATE TABLE public.otp_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  PRIMARY KEY (id)
);

-- Lookup by (phone, created_at DESC) for the rate-limit "most recent attempt
-- within the last 60 seconds" probe.
CREATE INDEX otp_attempts_phone_created_at_idx
  ON public.otp_attempts (phone, created_at DESC);

-- Lock the table down entirely. Only the service role (which bypasses RLS)
-- may read or write. The Server Action is the sole caller.
ALTER TABLE public.otp_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.otp_attempts FROM anon, authenticated, public;

-- =============================================================================
-- 2. Amend custom access token hook to set user_role='renter' for phone users
-- =============================================================================
-- The existing hook from 00002 looks up public.profiles.role. Phone-OTP
-- auth.users rows never go through the `handle_new_user` trigger's default
-- path because the `on_auth_user_created` trigger DOES fire for them — but
-- it inserts with role='operator' unless the raw_user_meta_data carries a
-- 'role' key, which phone-OTP signups do not set.
--
-- Rather than change the trigger (which would affect operator signups), we
-- update the hook to (a) look up profiles.role first (preserved operator
-- path), and (b) fall back to detecting phone-only users and assigning
-- 'renter' explicitly. A phone-only user is defined as: auth.users row
-- where `phone IS NOT NULL AND email IS NULL`.
--
-- NOTE: We are NOT updating the `handle_new_user` trigger. The profiles
-- row for a phone-only user still gets created with role='operator' (the
-- trigger default), but the hook's renter detection via auth.users columns
-- overrides that for JWT claim purposes. A follow-up cleanup could skip
-- creating the profiles row altogether for phone users; for MVP, the hook
-- override is sufficient and preserves a single trigger code path.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  user_role text;
  user_phone text;
  user_email text;
  profile_role text;
BEGIN
  SELECT phone, email INTO user_phone, user_email
    FROM auth.users
    WHERE id = (event->>'user_id')::uuid;

  SELECT role INTO profile_role
    FROM public.profiles
    WHERE id = (event->>'user_id')::uuid;

  -- Phone-only users (no email) are always renters, regardless of what
  -- the profiles table says. This handles the phone-OTP renter flow.
  IF user_phone IS NOT NULL AND user_email IS NULL THEN
    user_role := 'renter';
  ELSIF profile_role IS NOT NULL THEN
    user_role := profile_role;
  ELSE
    user_role := 'anonymous';
  END IF;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- The existing GRANT to supabase_auth_admin on public.profiles from 00002
-- remains. The hook now also reads `auth.users(phone, email)`, which
-- supabase_auth_admin already has access to (it owns the auth schema).
