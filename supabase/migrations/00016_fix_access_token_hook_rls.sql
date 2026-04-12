-- Migration: Fix custom_access_token_hook RLS bypass
--
-- The hook runs as supabase_auth_admin (the caller), but RLS on
-- public.profiles only grants SELECT to the "authenticated" role.
-- This means the hook's query returns no rows and every JWT gets
-- user_role = 'anonymous' instead of the actual profile role.
--
-- Fix: make the function SECURITY DEFINER so it executes as its
-- owner (postgres), which bypasses RLS. Restrict search_path to
-- prevent privilege escalation.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  claims jsonb;
  user_role text;
BEGIN
  SELECT role INTO user_role
    FROM public.profiles
    WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  ELSE
    claims := jsonb_set(claims, '{user_role}', '"anonymous"');
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;
