// ============================================================================
// manage-api-keys — CRUD for API keys (admin-only, JWT-authenticated)
// ============================================================================
// Auth:    Authorization: Bearer <user_jwt>  (admin role required)
// Tenant:  determined from user's profile.company_id (never from request)
// Tiers:   max keys per plan (trial:1 / starter:2 / business:10 / enterprise:∞)
// ============================================================================
//
// Endpoints (all relative to /manage-api-keys):
//   POST   /create          → generate new key, return plain key once
//   GET    /list            → list keys (no plaintext, only prefix+last4)
//   GET    /usage/:id       → per-key usage stats
//   PATCH  /:id             → rename, change scopes, ip_allowlist, expires_at
//   POST   /:id/revoke      → soft revoke
//   POST   /:id/restore     → un-revoke (if <30 days)
//   POST   /:id/rotate      → bluestrap rotation (7-day overlap)
//   GET    /events/:id      → admin audit events for one key
//   GET    /tier            → current tier limits
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import {
  generateApiKey,
  hashApiKey,
  hashToHex,
  getKeyPrefix,
  getKeyLast4,
} from '../_shared/keys.ts';
import { logKeyEvent, getRequestIp } from '../_shared/audit.ts';

const VALID_SCOPES = [
  'read:basic',
  'read:reports',
  'read:full',
  'read:audit',
  'write:notes',
];

interface AdminContext {
  user_id: string;
  company_id: string;
  company_slug: string;
  company_plan: string;
  company_max_workers: number;
}

// ---------------------------------------------------------------------------
// Auth: verify JWT and confirm admin role
// ---------------------------------------------------------------------------
async function authenticateAdmin(
  req: Request
): Promise<{ ctx: AdminContext; supabaseAdmin: any } | { error: Response }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: errorResponse('Missing JWT', 401, 'no_jwt') };
  }

  // Validate JWT via anon client
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: userData, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !userData.user) {
    return { error: errorResponse('Invalid JWT', 401, 'invalid_jwt') };
  }
  const userId = userData.user.id;

  // Service role for queries
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Get profile + company
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('company_id')
    .eq('id', userId)
    .single();

  if (profErr || !profile?.company_id) {
    return { error: errorResponse('No company found', 403, 'no_company') };
  }

  // Check admin role
  const { data: roleRow } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleRow) {
    return { error: errorResponse('Admin role required', 403, 'not_admin') };
  }

  // Get company info
  const { data: company, error: compErr } = await supabaseAdmin
    .from('companies')
    .select('slug, plan, max_workers')
    .eq('id', profile.company_id)
    .single();

  if (compErr || !company) {
    return { error: errorResponse('Company not found', 404, 'no_company') };
  }

  return {
    ctx: {
      user_id: userId,
      company_id: profile.company_id,
      company_slug: company.slug,
      company_plan: company.plan,
      company_max_workers: company.max_workers,
    },
    supabaseAdmin,
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function validateScopes(scopes: unknown): { ok: boolean; error?: string; scopes?: string[] } {
  if (!Array.isArray(scopes)) return { ok: false, error: 'scopes must be array' };
  if (scopes.length === 0) return { ok: false, error: 'scopes cannot be empty' };
  for (const s of scopes) {
    if (typeof s !== 'string' || !VALID_SCOPES.includes(s)) {
      return { ok: false, error: `Invalid scope: ${s}. Allowed: ${VALID_SCOPES.join(', ')}` };
    }
  }
  return { ok: true, scopes: scopes as string[] };
}

function validateExpiresAt(raw: unknown): { ok: boolean; error?: string; date?: string | null } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, date: null };
  if (typeof raw !== 'string') return { ok: false, error: 'expires_at must be ISO date string or null' };
  const d = new Date(raw);
  if (isNaN(d.getTime())) return { ok: false, error: 'Invalid date format' };
  if (d.getTime() <= Date.now()) return { ok: false, error: 'expires_at must be in the future' };
  // Max 1 year ahead
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 1);
  if (d > maxDate) return { ok: false, error: 'expires_at cannot be more than 1 year in the future' };
  return { ok: true, date: d.toISOString() };
}

function validateIpAllowlist(raw: unknown): { ok: boolean; error?: string; ips?: string[] | null } {
  if (raw === null || raw === undefined) return { ok: true, ips: null };
  if (!Array.isArray(raw)) return { ok: false, error: 'ip_allowlist must be array or null' };
  if (raw.length === 0) return { ok: true, ips: null };
  // Basic IPv4/IPv6/CIDR check (Postgres INET will validate strictly on insert)
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[a-fA-F0-9:]+(\/\d{1,3})?$/;
  for (const ip of raw) {
    if (typeof ip !== 'string' || !ipRegex.test(ip)) {
      return { ok: false, error: `Invalid IP/CIDR: ${ip}` };
    }
  }
  return { ok: true, ips: raw as string[] };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
async function handleCreate(req: Request, ctx: AdminContext, supabase: any) {
  const body = await req.json().catch(() => ({}));
  const { name, scopes, agent_type, intended_use, ip_allowlist, expires_at, env } = body;

  // Validate
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return errorResponse('name is required', 400, 'invalid_name');
  }
  if (name.length > 100) {
    return errorResponse('name must be ≤100 chars', 400, 'name_too_long');
  }

  const scopesResult = validateScopes(scopes ?? ['read:basic']);
  if (!scopesResult.ok) return errorResponse(scopesResult.error!, 400, 'invalid_scopes');

  const expiresResult = validateExpiresAt(expires_at);
  if (!expiresResult.ok) return errorResponse(expiresResult.error!, 400, 'invalid_expires_at');

  const ipResult = validateIpAllowlist(ip_allowlist);
  if (!ipResult.ok) return errorResponse(ipResult.error!, 400, 'invalid_ip_allowlist');

  const keyEnv: 'live' | 'test' = env === 'test' ? 'test' : 'live';

  // Tier limit check
  const { data: tier, error: tierErr } = await supabase
    .rpc('get_api_tier_limits', { p_company_id: ctx.company_id })
    .maybeSingle();

  if (tierErr || !tier) {
    return errorResponse('Failed to load tier limits', 500, 'tier_error');
  }

  const { data: activeCount } = await supabase
    .rpc('count_active_api_keys', { p_company_id: ctx.company_id });

  if ((activeCount ?? 0) >= tier.max_keys) {
    return errorResponse(
      `Tier limit reached: ${tier.max_keys} active keys allowed for plan '${ctx.company_plan}'. Upgrade or revoke an unused key.`,
      403,
      'tier_limit'
    );
  }

  // Default expires_at = 365 days if not provided
  const finalExpiresAt = expiresResult.date ?? (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
  })();

  // Generate key
  const plainKey = generateApiKey(keyEnv, ctx.company_slug);
  let keyHash: Uint8Array;
  try {
    keyHash = await hashApiKey(plainKey, supabase);
  } catch (err) {
    console.error('[manage] hash error:', err);
    return errorResponse('Server pepper not configured', 500, 'pepper_missing');
  }

  // Insert
  const { data: inserted, error: insertErr } = await supabase
    .from('api_keys')
    .insert({
      company_id: ctx.company_id,
      created_by: ctx.user_id,
      name: name.trim(),
      agent_type: agent_type ?? null,
      intended_use: intended_use ?? null,
      key_prefix: getKeyPrefix(plainKey),
      key_last4: getKeyLast4(plainKey),
      key_hash: hashToHex(keyHash),
      scopes: scopesResult.scopes,
      ip_allowlist: ipResult.ips,
      rate_limit_rpm: tier.rate_limit_rpm,
      daily_quota: tier.daily_quota,
      expires_at: finalExpiresAt,
      status: 'active',
    })
    .select('id, name, key_prefix, key_last4, scopes, agent_type, expires_at, created_at')
    .single();

  if (insertErr) {
    console.error('[manage] insert error:', insertErr);
    return errorResponse('Failed to create key', 500, 'insert_failed');
  }

  // Audit
  logKeyEvent(supabase, {
    company_id: ctx.company_id,
    key_id: inserted.id,
    event: 'created',
    actor_user: ctx.user_id,
    actor_ip: getRequestIp(req),
    metadata: { name: inserted.name, scopes: inserted.scopes, agent_type: inserted.agent_type },
  });

  // Return plain key ONCE — caller must store it
  return jsonResponse({
    data: {
      key: inserted,
      plain_key: plainKey,
      warning: 'This is the ONLY time the full key will be shown. Save it now.',
    },
  });
}

async function handleList(ctx: AdminContext, supabase: any, url: URL) {
  const includeRevoked = url.searchParams.get('include_revoked') === 'true';

  let q = supabase
    .from('api_keys')
    .select(
      'id, name, agent_type, intended_use, key_prefix, key_last4, scopes, ip_allowlist, rate_limit_rpm, daily_quota, status, expires_at, last_used_at, last_used_ip, created_at, revoked_at'
    )
    .eq('company_id', ctx.company_id)
    .order('created_at', { ascending: false });

  if (!includeRevoked) {
    q = q.eq('status', 'active');
  } else {
    q = q.in('status', ['active', 'revoked']);
  }

  const { data, error } = await q;
  if (error) return errorResponse(error.message, 500, 'query_error');

  // Add usage from rate_limit_buckets
  const ids = (data ?? []).map((k: any) => k.id);
  let buckets: any[] = [];
  if (ids.length > 0) {
    const { data: bs } = await supabase
      .from('rate_limit_buckets')
      .select('key_id, daily_used, tokens, capacity')
      .in('key_id', ids);
    buckets = bs ?? [];
  }
  const bucketMap = new Map(buckets.map((b: any) => [b.key_id, b]));

  const keys = (data ?? []).map((k: any) => ({
    ...k,
    usage: bucketMap.get(k.id) ?? { daily_used: 0, tokens: k.rate_limit_rpm, capacity: k.rate_limit_rpm },
  }));

  return jsonResponse({ data: { keys, count: keys.length } });
}

async function handleUsage(ctx: AdminContext, supabase: any, keyId: string) {
  // Confirm key belongs to company
  const { data: key } = await supabase
    .from('api_keys')
    .select('id, name, daily_quota, rate_limit_rpm')
    .eq('id', keyId)
    .eq('company_id', ctx.company_id)
    .maybeSingle();

  if (!key) return errorResponse('Key not found', 404, 'not_found');

  const { data: bucket } = await supabase
    .from('rate_limit_buckets')
    .select('daily_used, tokens, capacity, last_refill, daily_reset')
    .eq('key_id', keyId)
    .maybeSingle();

  // Recent audit log entries (last 100)
  const { data: recent } = await supabase
    .from('api_audit_log')
    .select('ts, endpoint, status_code, latency_ms, error_code')
    .eq('key_id', keyId)
    .order('ts', { ascending: false })
    .limit(100);

  // Stats by endpoint (last 7 days)
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const { data: weekRecent } = await supabase
    .from('api_audit_log')
    .select('endpoint, status_code, latency_ms')
    .eq('key_id', keyId)
    .gte('ts', since.toISOString());

  const byEndpoint = new Map<string, { count: number; total_latency: number; errors: number }>();
  for (const r of weekRecent ?? []) {
    const cur = byEndpoint.get(r.endpoint) ?? { count: 0, total_latency: 0, errors: 0 };
    cur.count++;
    cur.total_latency += r.latency_ms ?? 0;
    if (r.status_code >= 400) cur.errors++;
    byEndpoint.set(r.endpoint, cur);
  }
  const endpointStats = Array.from(byEndpoint.entries()).map(([ep, s]) => ({
    endpoint: ep,
    count: s.count,
    avg_latency_ms: s.count > 0 ? Math.round(s.total_latency / s.count) : 0,
    errors: s.errors,
  }));

  return jsonResponse({
    data: {
      key,
      bucket: bucket ?? null,
      recent_requests: recent ?? [],
      endpoint_stats_7d: endpointStats,
      total_requests_7d: weekRecent?.length ?? 0,
    },
  });
}

async function handlePatch(req: Request, ctx: AdminContext, supabase: any, keyId: string) {
  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  let event: 'renamed' | 'scope_changed' | null = null;

  if (typeof body.name === 'string') {
    if (body.name.trim().length === 0 || body.name.length > 100) {
      return errorResponse('Invalid name', 400, 'invalid_name');
    }
    updates.name = body.name.trim();
    event = 'renamed';
  }

  if (body.scopes !== undefined) {
    const r = validateScopes(body.scopes);
    if (!r.ok) return errorResponse(r.error!, 400, 'invalid_scopes');
    updates.scopes = r.scopes;
    event = 'scope_changed';
  }

  if (body.ip_allowlist !== undefined) {
    const r = validateIpAllowlist(body.ip_allowlist);
    if (!r.ok) return errorResponse(r.error!, 400, 'invalid_ip_allowlist');
    updates.ip_allowlist = r.ips;
  }

  if (body.expires_at !== undefined) {
    const r = validateExpiresAt(body.expires_at);
    if (!r.ok) return errorResponse(r.error!, 400, 'invalid_expires_at');
    updates.expires_at = r.date;
  }

  if (typeof body.agent_type === 'string') updates.agent_type = body.agent_type;
  if (typeof body.intended_use === 'string') updates.intended_use = body.intended_use;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update', 400, 'no_updates');
  }

  const { data, error } = await supabase
    .from('api_keys')
    .update(updates)
    .eq('id', keyId)
    .eq('company_id', ctx.company_id)
    .select('id, name, scopes, ip_allowlist, expires_at, agent_type, intended_use')
    .single();

  if (error || !data) return errorResponse('Update failed or key not found', 404, 'update_failed');

  if (event) {
    logKeyEvent(supabase, {
      company_id: ctx.company_id,
      key_id: keyId,
      event,
      actor_user: ctx.user_id,
      actor_ip: getRequestIp(req),
      metadata: updates,
    });
  }

  return jsonResponse({ data: { key: data } });
}

async function handleRevoke(req: Request, ctx: AdminContext, supabase: any, keyId: string) {
  const { data, error } = await supabase
    .from('api_keys')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('company_id', ctx.company_id)
    .eq('status', 'active')
    .select('id, name')
    .single();

  if (error || !data) return errorResponse('Key not found or not active', 404, 'not_found');

  logKeyEvent(supabase, {
    company_id: ctx.company_id,
    key_id: keyId,
    event: 'revoked',
    actor_user: ctx.user_id,
    actor_ip: getRequestIp(req),
  });

  return jsonResponse({ data: { id: data.id, name: data.name, revoked: true } });
}

async function handleRestore(req: Request, ctx: AdminContext, supabase: any, keyId: string) {
  // Only allow restore if revoked < 30 days ago
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const { data, error } = await supabase
    .from('api_keys')
    .update({ status: 'active', revoked_at: null })
    .eq('id', keyId)
    .eq('company_id', ctx.company_id)
    .eq('status', 'revoked')
    .gt('revoked_at', cutoff.toISOString())
    .select('id, name')
    .single();

  if (error || !data) {
    return errorResponse('Key not found or revoked >30 days ago', 404, 'not_restorable');
  }

  logKeyEvent(supabase, {
    company_id: ctx.company_id,
    key_id: keyId,
    event: 'restored',
    actor_user: ctx.user_id,
    actor_ip: getRequestIp(req),
  });

  return jsonResponse({ data: { id: data.id, name: data.name, restored: true } });
}

async function handleRotate(req: Request, ctx: AdminContext, supabase: any, keyId: string) {
  // Find existing key
  const { data: oldKey, error: oldErr } = await supabase
    .from('api_keys')
    .select('id, name, agent_type, intended_use, scopes, ip_allowlist, rate_limit_rpm, daily_quota')
    .eq('id', keyId)
    .eq('company_id', ctx.company_id)
    .eq('status', 'active')
    .single();

  if (oldErr || !oldKey) return errorResponse('Active key not found', 404, 'not_found');

  // Check tier limit (rotation creates +1 active key for overlap period)
  const { data: tier } = await supabase
    .rpc('get_api_tier_limits', { p_company_id: ctx.company_id })
    .maybeSingle();

  const { data: activeCount } = await supabase
    .rpc('count_active_api_keys', { p_company_id: ctx.company_id });

  if ((activeCount ?? 0) >= tier.max_keys) {
    return errorResponse(
      'Tier limit reached. Revoke another key first or upgrade plan.',
      403,
      'tier_limit'
    );
  }

  // Generate new key
  const plainKey = generateApiKey('live', ctx.company_slug);
  let keyHash: Uint8Array;
  try {
    keyHash = await hashApiKey(plainKey, supabase);
  } catch {
    return errorResponse('Server pepper not configured', 500, 'pepper_missing');
  }

  // Insert new key with same settings
  const { data: newKey, error: newErr } = await supabase
    .from('api_keys')
    .insert({
      company_id: ctx.company_id,
      created_by: ctx.user_id,
      name: oldKey.name + ' (rotated)',
      agent_type: oldKey.agent_type,
      intended_use: oldKey.intended_use,
      key_prefix: getKeyPrefix(plainKey),
      key_last4: getKeyLast4(plainKey),
      key_hash: hashToHex(keyHash),
      scopes: oldKey.scopes,
      ip_allowlist: oldKey.ip_allowlist,
      rate_limit_rpm: oldKey.rate_limit_rpm,
      daily_quota: oldKey.daily_quota,
      expires_at: (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString(); })(),
      status: 'active',
    })
    .select('id, name, key_prefix, key_last4, scopes, expires_at')
    .single();

  if (newErr) {
    console.error('[manage] rotate insert error:', newErr);
    return errorResponse('Failed to create rotated key', 500, 'rotate_failed');
  }

  // Set old key to expire in 7 days (overlap window) + link rotated_to
  const overlapDate = new Date();
  overlapDate.setDate(overlapDate.getDate() + 7);

  await supabase
    .from('api_keys')
    .update({
      expires_at: overlapDate.toISOString(),
      rotated_to: newKey.id,
    })
    .eq('id', keyId);

  // Audit
  logKeyEvent(supabase, {
    company_id: ctx.company_id,
    key_id: keyId,
    event: 'rotated',
    actor_user: ctx.user_id,
    actor_ip: getRequestIp(req),
    metadata: { new_key_id: newKey.id, overlap_until: overlapDate.toISOString() },
  });

  return jsonResponse({
    data: {
      old_key_id: keyId,
      old_expires_at: overlapDate.toISOString(),
      new_key: newKey,
      plain_key: plainKey,
      overlap_days: 7,
      warning: 'Old key remains valid for 7 days. Update your integration before then.',
    },
  });
}

async function handleEvents(ctx: AdminContext, supabase: any, keyId: string) {
  const { data, error } = await supabase
    .from('api_key_events')
    .select('id, ts, event, actor_user, actor_ip, metadata')
    .eq('key_id', keyId)
    .eq('company_id', ctx.company_id)
    .order('ts', { ascending: false })
    .limit(100);

  if (error) return errorResponse(error.message, 500, 'query_error');
  return jsonResponse({ data: { events: data ?? [] } });
}

async function handleTier(ctx: AdminContext, supabase: any) {
  const { data: tier } = await supabase
    .rpc('get_api_tier_limits', { p_company_id: ctx.company_id })
    .maybeSingle();

  const { data: activeCount } = await supabase
    .rpc('count_active_api_keys', { p_company_id: ctx.company_id });

  return jsonResponse({
    data: {
      plan: ctx.company_plan,
      max_keys: tier?.max_keys ?? 1,
      rate_limit_rpm: tier?.rate_limit_rpm ?? 30,
      daily_quota: tier?.daily_quota ?? 1000,
      audit_retention_days: tier?.audit_days ?? 0,
      active_keys_count: activeCount ?? 0,
      keys_remaining: Math.max(0, (tier?.max_keys ?? 1) - (activeCount ?? 0)),
    },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authResult = await authenticateAdmin(req);
  if ('error' in authResult) return authResult.error;
  const { ctx, supabaseAdmin } = authResult;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/manage-api-keys/, '').replace(/^\/+/, '/');
  const method = req.method;

  try {
    // POST /create
    if (method === 'POST' && path === '/create') {
      return await handleCreate(req, ctx, supabaseAdmin);
    }

    // GET /list
    if (method === 'GET' && (path === '/list' || path === '/' || path === '')) {
      return await handleList(ctx, supabaseAdmin, url);
    }

    // GET /tier
    if (method === 'GET' && path === '/tier') {
      return await handleTier(ctx, supabaseAdmin);
    }

    // GET /usage/:id
    const usageMatch = path.match(/^\/usage\/([0-9a-f-]+)$/);
    if (method === 'GET' && usageMatch) {
      return await handleUsage(ctx, supabaseAdmin, usageMatch[1]);
    }

    // GET /events/:id
    const eventsMatch = path.match(/^\/events\/([0-9a-f-]+)$/);
    if (method === 'GET' && eventsMatch) {
      return await handleEvents(ctx, supabaseAdmin, eventsMatch[1]);
    }

    // POST /:id/revoke
    const revokeMatch = path.match(/^\/([0-9a-f-]+)\/revoke$/);
    if (method === 'POST' && revokeMatch) {
      return await handleRevoke(req, ctx, supabaseAdmin, revokeMatch[1]);
    }

    // POST /:id/restore
    const restoreMatch = path.match(/^\/([0-9a-f-]+)\/restore$/);
    if (method === 'POST' && restoreMatch) {
      return await handleRestore(req, ctx, supabaseAdmin, restoreMatch[1]);
    }

    // POST /:id/rotate
    const rotateMatch = path.match(/^\/([0-9a-f-]+)\/rotate$/);
    if (method === 'POST' && rotateMatch) {
      return await handleRotate(req, ctx, supabaseAdmin, rotateMatch[1]);
    }

    // PATCH /:id
    const patchMatch = path.match(/^\/([0-9a-f-]+)$/);
    if (method === 'PATCH' && patchMatch) {
      return await handlePatch(req, ctx, supabaseAdmin, patchMatch[1]);
    }

    return errorResponse(`Endpoint ${method} ${path} not found`, 404, 'not_found');
  } catch (err) {
    console.error('[manage] handler error:', err);
    return errorResponse('Internal server error', 500, 'internal_error');
  }
});
