-- ============================================================================
-- Bot API Infrastructure - Self-Service API Keys for AI Agents
-- ============================================================================
-- Adds:
--   * api_keys table (HMAC-SHA-256 hashed keys, scoped, tier-aware)
--   * rate_limit_buckets table (token bucket per key)
--   * api_audit_log table (every request logged)
--   * api_key_events table (admin events: create/revoke/rotate)
--   * RLS policies (admin only, scoped by company_id)
--   * 6 helper SQL functions
-- ============================================================================

-- ENUMs
DO $$ BEGIN
  CREATE TYPE public.api_key_status AS ENUM ('active', 'revoked', 'purged');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.api_key_event_type AS ENUM (
    'created', 'revoked', 'rotated', 'restored', 'scope_changed', 'renamed'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ----------------------------------------------------------------------------
-- 1. api_keys
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES public.profiles(id),
  name            TEXT NOT NULL,
  agent_type      TEXT,
  intended_use    TEXT,
  key_prefix      TEXT NOT NULL,
  key_last4       TEXT NOT NULL,
  key_hash        BYTEA NOT NULL UNIQUE,
  scopes          TEXT[] NOT NULL DEFAULT ARRAY['read:basic']::TEXT[],
  ip_allowlist    INET[],
  rate_limit_rpm  INT NOT NULL DEFAULT 60,
  daily_quota     INT NOT NULL DEFAULT 10000,
  status          public.api_key_status NOT NULL DEFAULT 'active',
  expires_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  last_used_ip    INET,
  rotated_to      UUID REFERENCES public.api_keys(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  purge_at        TIMESTAMPTZ,
  CONSTRAINT name_not_empty CHECK (length(name) > 0),
  CONSTRAINT prefix_format  CHECK (key_prefix LIKE 'gtk_v1_%')
);
CREATE INDEX IF NOT EXISTS idx_api_keys_company_status ON public.api_keys(company_id, status);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash_active   ON public.api_keys(key_hash) WHERE status = 'active';

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_admin_all ON public.api_keys;
CREATE POLICY api_keys_admin_all ON public.api_keys
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- 2. rate_limit_buckets
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key_id       UUID PRIMARY KEY REFERENCES public.api_keys(id) ON DELETE CASCADE,
  tokens       INT NOT NULL,
  capacity     INT NOT NULL,
  refill_rate  INT NOT NULL,
  last_refill  TIMESTAMPTZ NOT NULL DEFAULT now(),
  daily_used   INT NOT NULL DEFAULT 0,
  daily_reset  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('day', now())
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_buckets_admin ON public.rate_limit_buckets;
CREATE POLICY rate_buckets_admin ON public.rate_limit_buckets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.api_keys k
      WHERE k.id = rate_limit_buckets.key_id
        AND k.company_id = public.get_my_company_id()
        AND public.has_role(auth.uid(), 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- 3. api_audit_log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_audit_log (
  id             BIGSERIAL PRIMARY KEY,
  ts             TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id     UUID NOT NULL,
  key_id         UUID,
  endpoint       TEXT NOT NULL,
  method         TEXT NOT NULL DEFAULT 'GET',
  query_hash     TEXT,
  ip             INET,
  user_agent     TEXT,
  status_code    INT NOT NULL,
  latency_ms     INT,
  response_rows  INT,
  error_code     TEXT,
  flagged        BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_audit_company_ts ON public.api_audit_log(company_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_key_ts     ON public.api_audit_log(key_id, ts DESC) WHERE key_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_flagged    ON public.api_audit_log(flagged) WHERE flagged = true;

ALTER TABLE public.api_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_admin_select ON public.api_audit_log;
CREATE POLICY audit_admin_select ON public.api_audit_log
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- 4. api_key_events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_key_events (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id  UUID NOT NULL,
  key_id      UUID NOT NULL,
  event       public.api_key_event_type NOT NULL,
  actor_user  UUID,
  actor_ip    INET,
  metadata    JSONB
);
CREATE INDEX IF NOT EXISTS idx_key_events_company_ts ON public.api_key_events(company_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_key_events_key        ON public.api_key_events(key_id);

ALTER TABLE public.api_key_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS key_events_admin_select ON public.api_key_events;
CREATE POLICY key_events_admin_select ON public.api_key_events
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- 5. Helper: get_api_tier_limits
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_api_tier_limits(p_company_id UUID)
RETURNS TABLE(
  max_keys      INT,
  rate_limit_rpm INT,
  daily_quota   INT,
  audit_days    INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    CASE c.plan
      WHEN 'trial'      THEN 1
      WHEN 'starter'    THEN 2
      WHEN 'business'   THEN 10
      WHEN 'enterprise' THEN 9999
      ELSE 1
    END,
    CASE c.plan
      WHEN 'trial'      THEN 30
      WHEN 'starter'    THEN 60
      WHEN 'business'   THEN 300
      WHEN 'enterprise' THEN 1000
      ELSE 30
    END,
    CASE c.plan
      WHEN 'trial'      THEN 1000
      WHEN 'starter'    THEN 10000
      WHEN 'business'   THEN 100000
      WHEN 'enterprise' THEN 100000000
      ELSE 1000
    END,
    CASE c.plan
      WHEN 'trial'      THEN 0
      WHEN 'starter'    THEN 7
      WHEN 'business'   THEN 30
      WHEN 'enterprise' THEN 365
      ELSE 0
    END
  FROM public.companies c
  WHERE c.id = p_company_id;
$$;

-- ----------------------------------------------------------------------------
-- 6. Helper: consume_rate_limit_token (atomic token bucket)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_rate_limit_token(
  p_key_id UUID,
  p_cost   INT DEFAULT 1
)
RETURNS TABLE(
  allowed     BOOLEAN,
  tokens_left INT,
  retry_after INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_now          TIMESTAMPTZ := now();
  v_bucket       public.rate_limit_buckets%ROWTYPE;
  v_elapsed_min  NUMERIC;
  v_refilled     INT;
BEGIN
  SELECT * INTO v_bucket
  FROM public.rate_limit_buckets
  WHERE key_id = p_key_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limit_buckets (key_id, tokens, capacity, refill_rate)
    SELECT id, rate_limit_rpm, rate_limit_rpm, rate_limit_rpm
    FROM public.api_keys WHERE id = p_key_id
    RETURNING * INTO v_bucket;
  END IF;

  IF v_bucket.daily_reset < date_trunc('day', v_now) THEN
    UPDATE public.rate_limit_buckets
    SET daily_used = 0, daily_reset = date_trunc('day', v_now)
    WHERE key_id = p_key_id;
    v_bucket.daily_used := 0;
  END IF;

  v_elapsed_min := EXTRACT(EPOCH FROM (v_now - v_bucket.last_refill)) / 60.0;
  v_refilled := LEAST(v_bucket.capacity, v_bucket.tokens + FLOOR(v_elapsed_min * v_bucket.refill_rate)::INT);

  IF v_refilled >= p_cost THEN
    UPDATE public.rate_limit_buckets
    SET tokens = v_refilled - p_cost,
        last_refill = v_now,
        daily_used = daily_used + p_cost
    WHERE key_id = p_key_id;
    RETURN QUERY SELECT true, v_refilled - p_cost, 0;
  ELSE
    UPDATE public.rate_limit_buckets
    SET tokens = v_refilled, last_refill = v_now
    WHERE key_id = p_key_id;
    RETURN QUERY SELECT
      false,
      v_refilled,
      CEIL((p_cost - v_refilled)::NUMERIC / v_bucket.refill_rate * 60)::INT;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Helper: lookup_api_key
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_api_key(p_key_hash BYTEA)
RETURNS TABLE(
  id             UUID,
  company_id     UUID,
  scopes         TEXT[],
  rate_limit_rpm INT,
  daily_quota    INT,
  ip_allowlist   INET[],
  expired        BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    k.id, k.company_id, k.scopes, k.rate_limit_rpm, k.daily_quota, k.ip_allowlist,
    (k.expires_at IS NOT NULL AND k.expires_at < now())
  FROM public.api_keys k
  WHERE k.key_hash = p_key_hash AND k.status = 'active';
$$;

-- ----------------------------------------------------------------------------
-- 8. Helper: count_active_api_keys
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_active_api_keys(p_company_id UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::INT FROM public.api_keys
  WHERE company_id = p_company_id AND status = 'active';
$$;

-- ----------------------------------------------------------------------------
-- 9. Helper: purge_old_revoked_keys
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_revoked_keys()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  WITH purged AS (
    UPDATE public.api_keys
    SET status = 'purged', purge_at = now()
    WHERE status = 'revoked' AND revoked_at < now() - interval '30 days'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM purged;
  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. Helper: cleanup_audit_log (tier-based retention)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_audit_log()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_total INT := 0; v_count INT; r RECORD;
BEGIN
  FOR r IN SELECT id, plan FROM public.companies LOOP
    DELETE FROM public.api_audit_log
    WHERE company_id = r.id
      AND ts < now() - (
        CASE r.plan
          WHEN 'trial'      THEN interval '0 days'
          WHEN 'starter'    THEN interval '7 days'
          WHEN 'business'   THEN interval '30 days'
          WHEN 'enterprise' THEN interval '365 days'
          ELSE interval '7 days'
        END
      );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
  END LOOP;
  RETURN v_total;
END;
$$;
