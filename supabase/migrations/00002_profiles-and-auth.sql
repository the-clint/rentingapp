-- Migration: profiles table, auth trigger, custom access token hook
-- Story: 1-3-operator-registration-and-login

-- =============================================================================
-- 1. Profiles table
-- =============================================================================
CREATE TABLE public.profiles (
  id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'operator',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. RLS policies for profiles
-- =============================================================================
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- =============================================================================
-- 3. Trigger: auto-create profile row on auth.users INSERT
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'role', 'operator'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- =============================================================================
-- 4. Custom Access Token Hook: inject user_role into JWT
-- =============================================================================
-- NOTE: After deploying this migration, you must enable the hook in
-- Supabase Dashboard > Authentication > Hooks > Custom Access Token.
-- Point it to public.custom_access_token_hook.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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

-- =============================================================================
-- 5. Grant supabase_auth_admin access to profiles for the hook
-- =============================================================================
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.profiles TO supabase_auth_admin;
REVOKE ALL ON public.profiles FROM anon, public;
