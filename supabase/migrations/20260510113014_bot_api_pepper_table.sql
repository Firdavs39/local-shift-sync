-- ============================================================================
-- Auto-provision API_KEY_PEPPER in DB (no manual Dashboard step)
-- ============================================================================
-- Originally we required admin to add API_KEY_PEPPER as Edge Function secret
-- via Supabase Dashboard. This migration moves the pepper into a locked-down
-- table read via SECURITY DEFINER RPC, so deployments are fully automatic.
--
-- Disk encryption handled by Supabase at the cluster level. Only service_role
-- can read this table; anon/authenticated have no GRANT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bot_api_secrets (
  id          INT PRIMARY KEY DEFAULT 1,
  pepper      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);

ALTER TABLE public.bot_api_secrets ENABLE ROW LEVEL SECURITY;

-- No policy → no access for any role except those with explicit GRANT
REVOKE ALL ON public.bot_api_secrets FROM anon, authenticated, public;
GRANT SELECT, INSERT, UPDATE ON public.bot_api_secrets TO service_role;

-- Insert pepper if missing (64 hex chars = 256 bits entropy)
INSERT INTO public.bot_api_secrets (id, pepper)
VALUES (1, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

-- Helper: get pepper (service_role only via Edge Functions)
CREATE OR REPLACE FUNCTION public.get_api_key_pepper()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT pepper FROM public.bot_api_secrets WHERE id = 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_api_key_pepper() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_api_key_pepper() TO service_role;
