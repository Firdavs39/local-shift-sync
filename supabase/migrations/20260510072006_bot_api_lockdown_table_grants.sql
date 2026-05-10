-- ============================================================================
-- Bot API Lockdown: table-level grants (defense in depth)
-- ============================================================================
-- Revoke direct SELECT/INSERT/UPDATE/DELETE on new tables from anon/authenticated.
-- Frontend reads them only through manage-api-keys Edge Function (service_role).
-- RLS still protects, but no point exposing them in GraphQL/PostgREST schema.
-- ============================================================================

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.api_keys           FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.rate_limit_buckets FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.api_audit_log      FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.api_key_events     FROM anon, authenticated;

-- service_role keeps full access (used by Edge Functions internally)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limit_buckets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_audit_log      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_key_events     TO service_role;
