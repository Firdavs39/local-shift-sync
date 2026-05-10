// ============================================================================
// bot-api — Read-only API for AI agents (Hermes, n8n, Zapier, custom)
// ============================================================================
// Auth:    Authorization: Bearer gtk_v1_live_<slug>_<32_random>
//          (also accepts X-Bot-Key header for compatibility)
// Tenant:  determined from key → company_id, never from request params
// Limits:  per-key token bucket + daily quota (tier-based)
// Audit:   every request logged async to api_audit_log
// PII:     pin/email never returned; coordinates only during expected work hours
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { hashApiKey, hashToHex, isValidKeyFormat, hashQuery } from '../_shared/keys.ts';
import { logApiRequest, getRequestIp } from '../_shared/audit.ts';

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

interface KeyContext {
  key_id: string;
  company_id: string;
  scopes: string[];
  rate_limit_rpm: number;
  daily_quota: number;
  ip_allowlist: string[] | null;
}

// ---------------------------------------------------------------------------
// Auth + rate limit middleware
// ---------------------------------------------------------------------------
async function authenticate(
  req: Request,
  supabaseAdmin: any
): Promise<{ ctx: KeyContext } | { error: Response }> {
  const auth = req.headers.get('authorization');
  const xBotKey = req.headers.get('x-bot-key');
  const rawKey = auth?.startsWith('Bearer ')
    ? auth.slice('Bearer '.length).trim()
    : xBotKey?.trim() ?? '';

  if (!rawKey) {
    return { error: errorResponse('Missing API key', 401, 'missing_key') };
  }

  // Format check before hash lookup (cheap, prevents log pollution)
  if (!isValidKeyFormat(rawKey)) {
    // Constant-time-ish: still hash a dummy to avoid timing leak
    try { await hashApiKey('gtk_v1_live_dummy_' + 'A'.repeat(32)); } catch {}
    return { error: errorResponse('Invalid API key format', 401, 'invalid_format') };
  }

  let hashHex: string;
  try {
    const hash = await hashApiKey(rawKey);
    hashHex = hashToHex(hash);
  } catch (err) {
    console.error('[bot-api] hash error:', err);
    return { error: errorResponse('Server configuration error', 500, 'config_error') };
  }

  // Lookup
  const { data: keyRow, error: lookupErr } = await supabaseAdmin
    .rpc('lookup_api_key', { p_key_hash: hashHex })
    .maybeSingle();

  if (lookupErr) {
    console.error('[bot-api] lookup error:', lookupErr);
    return { error: errorResponse('Authentication failed', 500, 'auth_failed') };
  }
  if (!keyRow) {
    return { error: errorResponse('Invalid or revoked API key', 401, 'invalid_key') };
  }
  if (keyRow.expired) {
    return { error: errorResponse('API key expired', 401, 'expired') };
  }

  // IP allowlist check
  const ip = getRequestIp(req);
  if (keyRow.ip_allowlist && keyRow.ip_allowlist.length > 0) {
    if (!ip || !keyRow.ip_allowlist.includes(ip)) {
      return { error: errorResponse('IP not allowed', 403, 'ip_denied') };
    }
  }

  // Rate limit
  const { data: rl, error: rlErr } = await supabaseAdmin
    .rpc('consume_rate_limit_token', { p_key_id: keyRow.id, p_cost: 1 })
    .maybeSingle();

  if (rlErr) {
    console.error('[bot-api] rate limit error:', rlErr);
  } else if (rl && !rl.allowed) {
    return {
      error: new Response(
        JSON.stringify({
          error: { message: 'Rate limit exceeded', code: 'rate_limited' },
          retry_after_seconds: rl.retry_after,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(rl.retry_after ?? 60),
            'X-RateLimit-Remaining': String(rl.tokens_left ?? 0),
          },
        }
      ),
    };
  }

  // Update last_used_at async
  supabaseAdmin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString(), last_used_ip: ip })
    .eq('id', keyRow.id)
    .then(() => {})
    .catch((e: unknown) => console.error('[bot-api] last_used update:', e));

  return {
    ctx: {
      key_id: keyRow.id,
      company_id: keyRow.company_id,
      scopes: keyRow.scopes ?? [],
      rate_limit_rpm: keyRow.rate_limit_rpm,
      daily_quota: keyRow.daily_quota,
      ip_allowlist: keyRow.ip_allowlist,
    },
  };
}

function hasScope(ctx: KeyContext, required: string): boolean {
  // 'read:full' implies all read scopes
  if (ctx.scopes.includes('read:full')) return true;
  return ctx.scopes.includes(required);
}

function getLimit(url: URL): number {
  const raw = url.searchParams.get('limit');
  if (!raw) return PAGE_SIZE_DEFAULT;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 1) return PAGE_SIZE_DEFAULT;
  return Math.min(n, PAGE_SIZE_MAX);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
async function handleShifts(supabase: any, ctx: KeyContext, url: URL) {
  if (!hasScope(ctx, 'read:basic')) {
    return errorResponse('Scope read:basic required', 403, 'scope_denied');
  }
  const limit = getLimit(url);
  const status = url.searchParams.get('status'); // early|on_time|late|offsite
  const date = url.searchParams.get('date');     // YYYY-MM-DD
  const userId = url.searchParams.get('user_id');
  const siteId = url.searchParams.get('site_id');

  let q = supabase
    .from('shifts')
    .select(
      'id, user_id, site_id, started_at, ended_at, status, minutes_late, minutes_worked, total_paused_minutes, auto_ended, is_overtime, profiles!inner(full_name), sites!inner(name, timezone, expected_start, expected_end)'
    )
    .eq('company_id', ctx.company_id)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);
  if (userId) q = q.eq('user_id', userId);
  if (siteId) q = q.eq('site_id', siteId);
  if (date) {
    q = q.gte('started_at', `${date}T00:00:00Z`).lt('started_at', `${date}T23:59:59Z`);
  }

  const { data, error } = await q;
  if (error) return errorResponse(error.message, 500, 'query_error');

  // PII filter: hide coordinates, format
  const shifts = (data ?? []).map((s: any) => ({
    id: s.id,
    user_id: s.user_id,
    full_name: s.profiles?.full_name,
    site_id: s.site_id,
    site_name: s.sites?.name,
    site_timezone: s.sites?.timezone,
    started_at: s.started_at,
    ended_at: s.ended_at,
    status: s.status,
    minutes_late: s.minutes_late,
    minutes_worked: s.minutes_worked,
    total_paused_minutes: s.total_paused_minutes,
    auto_ended: s.auto_ended,
    is_overtime: s.is_overtime,
  }));

  return jsonResponse({ data: { shifts, count: shifts.length } });
}

async function handleWorkers(supabase: any, ctx: KeyContext, url: URL) {
  if (!hasScope(ctx, 'read:basic')) {
    return errorResponse('Scope read:basic required', 403, 'scope_denied');
  }
  const activeOnly = url.searchParams.get('active') !== 'false';

  let q = supabase
    .from('profiles')
    .select('id, full_name, active, created_at')
    .eq('company_id', ctx.company_id)
    .order('full_name');

  if (activeOnly) q = q.eq('active', true);

  const { data, error } = await q;
  if (error) return errorResponse(error.message, 500, 'query_error');

  return jsonResponse({ data: { workers: data ?? [], count: data?.length ?? 0 } });
}

async function handleSites(supabase: any, ctx: KeyContext, url: URL) {
  if (!hasScope(ctx, 'read:basic')) {
    return errorResponse('Scope read:basic required', 403, 'scope_denied');
  }
  const activeOnly = url.searchParams.get('active') !== 'false';

  let q = supabase
    .from('sites')
    .select('id, name, timezone, expected_start, expected_end, radius_m, active')
    .eq('company_id', ctx.company_id)
    .order('name');

  if (activeOnly) q = q.eq('active', true);

  const { data, error } = await q;
  if (error) return errorResponse(error.message, 500, 'query_error');

  return jsonResponse({ data: { sites: data ?? [], count: data?.length ?? 0 } });
}

async function handleActiveNow(supabase: any, ctx: KeyContext) {
  if (!hasScope(ctx, 'read:basic')) {
    return errorResponse('Scope read:basic required', 403, 'scope_denied');
  }
  const { data, error } = await supabase
    .from('shifts')
    .select(
      'id, user_id, site_id, started_at, status, minutes_late, is_paused, is_overtime, profiles!inner(full_name), sites!inner(name)'
    )
    .eq('company_id', ctx.company_id)
    .is('ended_at', null)
    .order('started_at', { ascending: true });

  if (error) return errorResponse(error.message, 500, 'query_error');

  const active = (data ?? []).map((s: any) => ({
    id: s.id,
    user_id: s.user_id,
    full_name: s.profiles?.full_name,
    site_id: s.site_id,
    site_name: s.sites?.name,
    started_at: s.started_at,
    status: s.status,
    minutes_late: s.minutes_late,
    is_paused: s.is_paused,
    is_overtime: s.is_overtime,
  }));

  return jsonResponse({ data: { active, count: active.length } });
}

async function handleLateToday(supabase: any, ctx: KeyContext) {
  if (!hasScope(ctx, 'read:basic')) {
    return errorResponse('Scope read:basic required', 403, 'scope_denied');
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('shifts')
    .select(
      'id, user_id, site_id, started_at, minutes_late, profiles!inner(full_name), sites!inner(name, timezone)'
    )
    .eq('company_id', ctx.company_id)
    .eq('status', 'late')
    .gte('started_at', today.toISOString())
    .order('minutes_late', { ascending: false });

  if (error) return errorResponse(error.message, 500, 'query_error');

  const late = (data ?? []).map((s: any) => ({
    id: s.id,
    full_name: s.profiles?.full_name,
    site_name: s.sites?.name,
    started_at: s.started_at,
    minutes_late: s.minutes_late,
  }));

  return jsonResponse({ data: { late, count: late.length } });
}

async function handleWorkerStats(supabase: any, ctx: KeyContext, url: URL) {
  if (!hasScope(ctx, 'read:reports') && !hasScope(ctx, 'read:basic')) {
    return errorResponse('Scope read:reports required', 403, 'scope_denied');
  }
  const name = url.searchParams.get('name');
  const userId = url.searchParams.get('user_id');
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '30', 10) || 30, 365);

  if (!name && !userId) {
    return errorResponse('Either name or user_id is required', 400, 'missing_param');
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  let q = supabase
    .from('shifts')
    .select(
      'id, user_id, status, minutes_late, minutes_worked, total_paused_minutes, is_overtime, started_at, profiles!inner(full_name)'
    )
    .eq('company_id', ctx.company_id)
    .gte('started_at', since.toISOString());

  if (userId) {
    q = q.eq('user_id', userId);
  } else if (name) {
    q = q.ilike('profiles.full_name', `%${name}%`);
  }

  const { data, error } = await q;
  if (error) return errorResponse(error.message, 500, 'query_error');

  // Aggregate by user
  const byUser = new Map<string, any>();
  for (const s of data ?? []) {
    const u = s.user_id;
    if (!byUser.has(u)) {
      byUser.set(u, {
        user_id: u,
        full_name: s.profiles?.full_name,
        shifts_count: 0,
        late_count: 0,
        on_time_count: 0,
        early_count: 0,
        offsite_count: 0,
        overtime_count: 0,
        total_minutes_worked: 0,
        total_minutes_late: 0,
        sum_minutes_late_for_late: 0,
      });
    }
    const u_obj = byUser.get(u);
    u_obj.shifts_count++;
    if (s.status === 'late') {
      u_obj.late_count++;
      u_obj.sum_minutes_late_for_late += s.minutes_late ?? 0;
    }
    if (s.status === 'on_time') u_obj.on_time_count++;
    if (s.status === 'early') u_obj.early_count++;
    if (s.status === 'offsite') u_obj.offsite_count++;
    if (s.is_overtime) u_obj.overtime_count++;
    u_obj.total_minutes_worked += s.minutes_worked ?? 0;
    u_obj.total_minutes_late += s.minutes_late ?? 0;
  }

  const result = Array.from(byUser.values()).map((u) => ({
    ...u,
    avg_minutes_late: u.late_count > 0 ? Math.round(u.sum_minutes_late_for_late / u.late_count) : 0,
    total_hours_worked: Math.round((u.total_minutes_worked / 60) * 10) / 10,
  }));

  return jsonResponse({ data: { workers: result, period_days: days, count: result.length } });
}

async function handleSummary(supabase: any, ctx: KeyContext, url: URL) {
  if (!hasScope(ctx, 'read:reports') && !hasScope(ctx, 'read:basic')) {
    return errorResponse('Scope read:reports required', 403, 'scope_denied');
  }
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '7', 10) || 7, 90);
  const siteId = url.searchParams.get('site_id');

  const since = new Date();
  since.setDate(since.getDate() - days);

  let q = supabase
    .from('shifts')
    .select('status, minutes_late, minutes_worked, is_overtime, started_at, site_id')
    .eq('company_id', ctx.company_id)
    .gte('started_at', since.toISOString());

  if (siteId) q = q.eq('site_id', siteId);

  const { data, error } = await q;
  if (error) return errorResponse(error.message, 500, 'query_error');

  let on_time = 0, late = 0, early = 0, offsite = 0, overtime = 0;
  let total_minutes = 0, total_late = 0;

  for (const s of data ?? []) {
    if (s.status === 'on_time') on_time++;
    if (s.status === 'late') { late++; total_late += s.minutes_late ?? 0; }
    if (s.status === 'early') early++;
    if (s.status === 'offsite') offsite++;
    if (s.is_overtime) overtime++;
    total_minutes += s.minutes_worked ?? 0;
  }

  const total = data?.length ?? 0;

  return jsonResponse({
    data: {
      period_days: days,
      total_shifts: total,
      on_time,
      late,
      early,
      offsite,
      overtime,
      total_hours: Math.round((total_minutes / 60) * 10) / 10,
      avg_minutes_late: late > 0 ? Math.round(total_late / late) : 0,
      site_id: siteId,
    },
  });
}

async function handleDigest(supabase: any, ctx: KeyContext, url: URL) {
  if (!hasScope(ctx, 'read:reports') && !hasScope(ctx, 'read:basic')) {
    return errorResponse('Scope read:reports required', 403, 'scope_denied');
  }
  const type = url.searchParams.get('type') ?? 'morning'; // morning|evening|weekly
  const days = type === 'weekly' ? 7 : 1;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('shifts')
    .select(
      'status, minutes_late, minutes_worked, is_overtime, started_at, ended_at, profiles!inner(full_name), sites!inner(name)'
    )
    .eq('company_id', ctx.company_id)
    .gte('started_at', since.toISOString());

  if (error) return errorResponse(error.message, 500, 'query_error');

  const shifts = data ?? [];
  const total = shifts.length;
  const lateShifts = shifts.filter((s: any) => s.status === 'late');
  const offsiteShifts = shifts.filter((s: any) => s.status === 'offsite');
  const overtime = shifts.filter((s: any) => s.is_overtime).length;
  const closed = shifts.filter((s: any) => s.ended_at !== null).length;
  const stillOpen = total - closed;

  // Top late workers
  const lateByWorker = new Map<string, { name: string; total_min: number; count: number }>();
  for (const s of lateShifts) {
    const name = s.profiles?.full_name ?? 'Unknown';
    const cur = lateByWorker.get(name) ?? { name, total_min: 0, count: 0 };
    cur.total_min += s.minutes_late ?? 0;
    cur.count++;
    lateByWorker.set(name, cur);
  }
  const topLate = Array.from(lateByWorker.values())
    .sort((a, b) => b.total_min - a.total_min)
    .slice(0, 5);

  return jsonResponse({
    data: {
      type,
      period_days: days,
      total_shifts: total,
      on_time: shifts.filter((s: any) => s.status === 'on_time').length,
      late: lateShifts.length,
      offsite: offsiteShifts.length,
      overtime,
      closed,
      still_open: stillOpen,
      top_late: topLate,
      generated_at: new Date().toISOString(),
    },
  });
}

async function handleAuditLog(supabase: any, ctx: KeyContext, url: URL) {
  if (!hasScope(ctx, 'read:audit')) {
    return errorResponse('Scope read:audit required', 403, 'scope_denied');
  }
  const limit = getLimit(url);
  const { data, error } = await supabase
    .from('api_audit_log')
    .select('id, ts, key_id, endpoint, method, status_code, latency_ms, error_code, flagged')
    .eq('company_id', ctx.company_id)
    .order('ts', { ascending: false })
    .limit(limit);

  if (error) return errorResponse(error.message, 500, 'query_error');
  return jsonResponse({ data: { entries: data ?? [], count: data?.length ?? 0 } });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
serve(async (req) => {
  const startedAt = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return errorResponse('Only GET allowed on bot-api', 405, 'method_not_allowed');
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Auth
  const authResult = await authenticate(req, supabaseAdmin);
  if ('error' in authResult) {
    // Audit failed auth (without key_id since we don't have it)
    logApiRequest(supabaseAdmin, {
      company_id: null,
      endpoint: new URL(req.url).pathname,
      method: req.method,
      ip: getRequestIp(req),
      user_agent: req.headers.get('user-agent'),
      status_code: authResult.error.status,
      latency_ms: Date.now() - startedAt,
      error_code: 'auth_failed',
    });
    return authResult.error;
  }
  const ctx = authResult.ctx;

  // Route
  const url = new URL(req.url);
  // Strip /bot-api prefix from path
  const path = url.pathname.replace(/^\/bot-api/, '').replace(/^\/+/, '/');

  let response: Response;
  try {
    switch (true) {
      case path === '/' || path === '':
        response = jsonResponse({
          data: {
            api: 'GeoTime bot-api',
            version: 'v1',
            company_id: ctx.company_id,
            scopes: ctx.scopes,
            endpoints: [
              'GET /shifts?date=&status=&user_id=&site_id=&limit=',
              'GET /workers?active=true',
              'GET /sites?active=true',
              'GET /active-now',
              'GET /late-today',
              'GET /worker-stats?name=&user_id=&days=',
              'GET /summary?days=&site_id=',
              'GET /digest?type=morning|evening|weekly',
              'GET /audit-log?limit=',
            ],
          },
        });
        break;
      case path === '/shifts':
        response = await handleShifts(supabaseAdmin, ctx, url);
        break;
      case path === '/workers':
        response = await handleWorkers(supabaseAdmin, ctx, url);
        break;
      case path === '/sites':
        response = await handleSites(supabaseAdmin, ctx, url);
        break;
      case path === '/active-now':
        response = await handleActiveNow(supabaseAdmin, ctx);
        break;
      case path === '/late-today':
        response = await handleLateToday(supabaseAdmin, ctx);
        break;
      case path === '/worker-stats':
        response = await handleWorkerStats(supabaseAdmin, ctx, url);
        break;
      case path === '/summary':
        response = await handleSummary(supabaseAdmin, ctx, url);
        break;
      case path === '/digest':
        response = await handleDigest(supabaseAdmin, ctx, url);
        break;
      case path === '/audit-log':
        response = await handleAuditLog(supabaseAdmin, ctx, url);
        break;
      default:
        response = errorResponse('Endpoint not found', 404, 'not_found');
    }
  } catch (err) {
    console.error('[bot-api] handler error:', err);
    response = errorResponse('Internal server error', 500, 'internal_error');
  }

  // Audit
  const queryHash = url.search ? await hashQuery(url.search) : null;
  logApiRequest(supabaseAdmin, {
    company_id: ctx.company_id,
    key_id: ctx.key_id,
    endpoint: path,
    method: req.method,
    query_hash: queryHash,
    ip: getRequestIp(req),
    user_agent: req.headers.get('user-agent'),
    status_code: response.status,
    latency_ms: Date.now() - startedAt,
  });

  return response;
});
