-- ============================================================================
-- Bot API Lockdown: function-level grants
-- ============================================================================
-- Lock down all bot-api related SECURITY DEFINER functions:
-- only service_role (Edge Functions) and postgres should be able to call them.
-- Revoke from anon/authenticated/public to close the RPC vector
-- (these functions were callable via /rest/v1/rpc/* by default).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.lookup_api_key(bytea)            FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit_token(uuid, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.count_active_api_keys(uuid)     FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_api_tier_limits(uuid)       FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.purge_old_revoked_keys()        FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_audit_log()             FROM anon, authenticated, public;

-- service_role (used by Edge Functions) needs explicit GRANT
GRANT EXECUTE ON FUNCTION public.lookup_api_key(bytea)            TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit_token(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_active_api_keys(uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION public.get_api_tier_limits(uuid)       TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_revoked_keys()        TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_audit_log()             TO service_role;
