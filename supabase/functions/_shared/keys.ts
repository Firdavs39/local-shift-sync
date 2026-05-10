// API key generation, hashing, validation
// Format: gtk_v1_<env>_<slug>_<random32_base62>
// Hash: HMAC-SHA-256(pepper, full_key)
// Pepper stored in public.bot_api_secrets, fetched via get_api_key_pepper() RPC.
// Cached in-memory per isolate (fast path after first call).

const KEY_PREFIX_REGEX = /^gtk_v1_(live|test)_[a-z0-9-]+_[A-Za-z0-9]{32}$/;
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

let _cachedPepper: { value: string; expires: number } | null = null;
const PEPPER_CACHE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a new API key plaintext.
 * Caller is responsible for hashing it before storage and showing to user once.
 */
export function generateApiKey(env: 'live' | 'test', companySlug: string): string {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  let suffix = '';
  for (const byte of random) {
    suffix += BASE62[byte % BASE62.length];
  }
  // Sanitize slug to lowercase alphanumeric + dash
  const safeSlug = companySlug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
  return `gtk_v1_${env}_${safeSlug}_${suffix}`;
}

export function isValidKeyFormat(key: string): boolean {
  return KEY_PREFIX_REGEX.test(key);
}

export function getKeyPrefix(key: string): string {
  // Returns "gtk_v1_live_acme" (everything before the random suffix)
  const parts = key.split('_');
  if (parts.length < 5) return key;
  return parts.slice(0, 4).join('_');
}

export function getKeyLast4(key: string): string {
  return key.slice(-4);
}

/**
 * Fetch pepper from DB via RPC (cached for 5 min per isolate).
 * supabaseAdmin must be a service-role client.
 */
async function getPepper(supabaseAdmin: any): Promise<string> {
  const now = Date.now();
  if (_cachedPepper && _cachedPepper.expires > now) {
    return _cachedPepper.value;
  }

  // Fall back to env var if explicitly set (for local dev/testing)
  const envPepper = Deno.env.get('API_KEY_PEPPER');
  if (envPepper && envPepper.length >= 16) {
    _cachedPepper = { value: envPepper, expires: now + PEPPER_CACHE_MS };
    return envPepper;
  }

  const { data, error } = await supabaseAdmin.rpc('get_api_key_pepper');
  if (error || !data || typeof data !== 'string' || data.length < 16) {
    throw new Error(`Pepper not configured: ${error?.message ?? 'no value returned'}`);
  }
  _cachedPepper = { value: data, expires: now + PEPPER_CACHE_MS };
  return data;
}

/**
 * HMAC-SHA-256(pepper, key) → Uint8Array.
 */
export async function hashApiKey(key: string, supabaseAdmin: any): Promise<Uint8Array> {
  const pepper = await getPepper(supabaseAdmin);
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(key));
  return new Uint8Array(sig);
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Convert Uint8Array hash to hex string for Postgres bytea (\x prefixed).
 */
export function hashToHex(hash: Uint8Array): string {
  return '\\x' + Array.from(hash).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash query parameters for audit log (non-PII fingerprint).
 */
export async function hashQuery(query: string): Promise<string> {
  const enc = new TextEncoder();
  const sig = await crypto.subtle.digest('SHA-256', enc.encode(query));
  return Array.from(new Uint8Array(sig)).slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
