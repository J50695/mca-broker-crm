-- Invite-only auth: block public signups; allow admin-provisioned users only.

INSERT INTO app_config (key, value)
VALUES ('provisioning_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_invite_only_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'invited_by_admin', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Signups are invite-only. Contact your administrator for access.';
END;
$$;

DROP TRIGGER IF EXISTS enforce_invite_only_signup ON auth.users;
CREATE TRIGGER enforce_invite_only_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_only_signup();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role agent_role;
BEGIN
  assigned_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' IN ('admin', 'agent', 'team_lead')
      THEN (NEW.raw_user_meta_data->>'role')::agent_role
    WHEN (SELECT count(*) FROM public.agents) = 0 THEN 'admin'::agent_role
    ELSE 'agent'::agent_role
  END;

  INSERT INTO public.agents (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    assigned_role
  )
  ON CONFLICT (id) DO UPDATE
    SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      updated_at = now();

  RETURN NEW;
END;
$$;
