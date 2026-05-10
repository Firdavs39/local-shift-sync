// Shared CORS headers for Edge Functions
// For bot-api: server-to-server only, but we keep CORS open for testing.
// For manage-api-keys: called from frontend, needs CORS.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-bot-key',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

export const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
};

export function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

export function errorResponse(message: string, status = 400, code?: string) {
  return jsonResponse({ error: { message, code: code ?? null } }, status);
}
