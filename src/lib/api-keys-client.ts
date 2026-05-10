// Typed client for manage-api-keys Edge Function
// Wraps supabase.functions.invoke with type safety
import { supabase } from '@/integrations/supabase/client';

export type ApiKeyScope = 'read:basic' | 'read:reports' | 'read:full' | 'read:audit' | 'write:notes';
export type ApiKeyStatus = 'active' | 'revoked' | 'purged';
export type AgentType = 'telegram-bot' | 'n8n' | 'zapier' | 'custom' | string;

export interface ApiKey {
  id: string;
  name: string;
  agent_type: string | null;
  intended_use: string | null;
  key_prefix: string;
  key_last4: string;
  scopes: ApiKeyScope[];
  ip_allowlist: string[] | null;
  rate_limit_rpm: number;
  daily_quota: number;
  status: ApiKeyStatus;
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  created_at: string;
  revoked_at: string | null;
  usage?: {
    daily_used: number;
    tokens: number;
    capacity: number;
  };
}

export interface TierLimits {
  plan: string;
  max_keys: number;
  rate_limit_rpm: number;
  daily_quota: number;
  audit_retention_days: number;
  active_keys_count: number;
  keys_remaining: number;
}

export interface CreateKeyInput {
  name: string;
  scopes?: ApiKeyScope[];
  agent_type?: string;
  intended_use?: string;
  ip_allowlist?: string[];
  expires_at?: string | null;
  env?: 'live' | 'test';
}

export interface CreateKeyResponse {
  key: ApiKey;
  plain_key: string;
  warning: string;
}

export interface RotateKeyResponse {
  old_key_id: string;
  old_expires_at: string;
  new_key: ApiKey;
  plain_key: string;
  overlap_days: number;
  warning: string;
}

export interface UsageStats {
  key: { id: string; name: string; daily_quota: number; rate_limit_rpm: number };
  bucket: {
    daily_used: number;
    tokens: number;
    capacity: number;
    last_refill: string;
    daily_reset: string;
  } | null;
  recent_requests: Array<{
    ts: string;
    endpoint: string;
    status_code: number;
    latency_ms: number | null;
    error_code: string | null;
  }>;
  endpoint_stats_7d: Array<{
    endpoint: string;
    count: number;
    avg_latency_ms: number;
    errors: number;
  }>;
  total_requests_7d: number;
}

export interface KeyEvent {
  id: number;
  ts: string;
  event: 'created' | 'revoked' | 'rotated' | 'restored' | 'scope_changed' | 'renamed';
  actor_user: string | null;
  actor_ip: string | null;
  metadata: Record<string, unknown> | null;
}

const FN = 'manage-api-keys';

async function invoke<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const { data, error } = await supabase.functions.invoke<{ data?: T; error?: { message: string; code: string | null } }>(`${FN}${path}`, {
    method: method as any,
    body: body as any,
  });

  if (error) {
    // supabase.functions.invoke throws for non-2xx; data may still contain error structure
    const msg = (data as any)?.error?.message ?? error.message ?? 'Unknown error';
    throw new Error(msg);
  }

  if (data && (data as any).error) {
    throw new Error((data as any).error.message);
  }

  return (data as any)?.data as T;
}

export const ApiKeysApi = {
  async list(includeRevoked = false): Promise<{ keys: ApiKey[]; count: number }> {
    return invoke<{ keys: ApiKey[]; count: number }>(
      `/list?include_revoked=${includeRevoked}`,
      { method: 'GET' }
    );
  },

  async tier(): Promise<TierLimits> {
    return invoke<TierLimits>('/tier', { method: 'GET' });
  },

  async create(input: CreateKeyInput): Promise<CreateKeyResponse> {
    return invoke<CreateKeyResponse>('/create', { method: 'POST', body: input });
  },

  async patch(id: string, updates: Partial<CreateKeyInput>): Promise<{ key: ApiKey }> {
    return invoke<{ key: ApiKey }>(`/${id}`, { method: 'PATCH', body: updates });
  },

  async revoke(id: string): Promise<{ id: string; name: string; revoked: boolean }> {
    return invoke<{ id: string; name: string; revoked: boolean }>(`/${id}/revoke`, { method: 'POST', body: {} });
  },

  async restore(id: string): Promise<{ id: string; name: string; restored: boolean }> {
    return invoke<{ id: string; name: string; restored: boolean }>(`/${id}/restore`, { method: 'POST', body: {} });
  },

  async rotate(id: string): Promise<RotateKeyResponse> {
    return invoke<RotateKeyResponse>(`/${id}/rotate`, { method: 'POST', body: {} });
  },

  async usage(id: string): Promise<UsageStats> {
    return invoke<UsageStats>(`/usage/${id}`, { method: 'GET' });
  },

  async events(id: string): Promise<{ events: KeyEvent[] }> {
    return invoke<{ events: KeyEvent[] }>(`/events/${id}`, { method: 'GET' });
  },
};

// Helper: pretty-print key preview
export function formatKeyPreview(key: ApiKey): string {
  return `${key.key_prefix}_•••••••••${key.key_last4}`;
}

// Helper: format relative time in Russian
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'никогда';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD} дн назад`;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Helper: format expiration with warning
export function formatExpiration(iso: string | null): { text: string; warning: 'none' | 'soon' | 'expired' } {
  if (!iso) return { text: 'никогда', warning: 'none' };
  const d = new Date(iso);
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return { text: 'истёк', warning: 'expired' };
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 7) return { text: `через ${days} дн`, warning: 'soon' };
  if (days < 30) return { text: `через ${days} дн`, warning: 'soon' };
  if (days < 365) return { text: `через ${days} дн`, warning: 'none' };
  return {
    text: d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }),
    warning: 'none',
  };
}

// Helper: scope display name in Russian
export function scopeLabel(scope: ApiKeyScope): string {
  const labels: Record<ApiKeyScope, string> = {
    'read:basic': 'Чтение базовое',
    'read:reports': 'Чтение отчётов',
    'read:full': 'Полный доступ на чтение',
    'read:audit': 'Аудит-лог',
    'write:notes': 'Запись заметок',
  };
  return labels[scope] ?? scope;
}

// Helper: scope description
export function scopeDescription(scope: ApiKeyScope): string {
  const desc: Record<ApiKeyScope, string> = {
    'read:basic': 'Смены, сотрудники, объекты, активные смены, опоздания',
    'read:reports': 'Сводки, статистика по сотрудникам, дайджесты',
    'read:full': 'Всё read-доступы плюс координаты',
    'read:audit': 'История запросов API (для аудита)',
    'write:notes': 'Запись заметок к сменам (зарезервировано)',
  };
  return desc[scope] ?? '';
}
