// Async audit logging — fire-and-forget
import { hashQuery } from './keys.ts';

interface AuditEntry {
  company_id: string | null;
  key_id?: string | null;
  endpoint: string;
  method?: string;
  query_hash?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  status_code: number;
  latency_ms?: number;
  response_rows?: number;
  error_code?: string | null;
  flagged?: boolean;
}

/**
 * Fire-and-forget audit log write.
 * supabaseAdmin must be a service-role client.
 */
export function logApiRequest(supabaseAdmin: any, entry: AuditEntry): void {
  // Don't await — don't block the response
  supabaseAdmin
    .from('api_audit_log')
    .insert({
      company_id: entry.company_id,
      key_id: entry.key_id ?? null,
      endpoint: entry.endpoint,
      method: entry.method ?? 'GET',
      query_hash: entry.query_hash ?? null,
      ip: entry.ip ?? null,
      user_agent: entry.user_agent ?? null,
      status_code: entry.status_code,
      latency_ms: entry.latency_ms ?? null,
      response_rows: entry.response_rows ?? null,
      error_code: entry.error_code ?? null,
      flagged: entry.flagged ?? false,
    })
    .then(() => {})
    .catch((err: unknown) => console.error('[audit] log write failed:', err));
}

interface KeyEvent {
  company_id: string;
  key_id: string;
  event:
    | 'created'
    | 'revoked'
    | 'rotated'
    | 'restored'
    | 'scope_changed'
    | 'renamed';
  actor_user?: string | null;
  actor_ip?: string | null;
  metadata?: Record<string, unknown>;
}

export function logKeyEvent(supabaseAdmin: any, event: KeyEvent): void {
  supabaseAdmin
    .from('api_key_events')
    .insert({
      company_id: event.company_id,
      key_id: event.key_id,
      event: event.event,
      actor_user: event.actor_user ?? null,
      actor_ip: event.actor_ip ?? null,
      metadata: event.metadata ?? null,
    })
    .then(() => {})
    .catch((err: unknown) => console.error('[audit] key event write failed:', err));
}

export function getRequestIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return null;
}

export { hashQuery };
