import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { decryptJson, encryptJson } from '../_shared/crypto.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => null);
    const { organizationId, adAccountId } = (body ?? {}) as { organizationId?: string; adAccountId?: string };
    if (!organizationId || !adAccountId) return json({ error: 'organizationId and adAccountId are required' }, 400);

    // Admin-only.
    const admin = createClient(url, service);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    const { data: row, error: readErr } = await admin
      .from('client_api_credentials')
      .select('encrypted_credentials')
      .eq('organization_id', organizationId)
      .eq('platform', 'meta')
      .maybeSingle();
    if (readErr) return json({ error: readErr.message }, 500);
    if (!row?.encrypted_credentials) return json({ error: 'No pending Meta connection found' }, 404);

    const creds = await decryptJson<{
      access_token: string;
      token_expires_at?: string;
      meta_user_id?: string | null;
      ad_accounts?: { id: string; account_id: string; name: string }[];
    }>(row.encrypted_credentials as any);

    const chosen = (creds.ad_accounts ?? []).find((a) => a.id === adAccountId || a.account_id === adAccountId);
    if (!chosen) return json({ error: 'Selected ad account is not available on this connection' }, 400);

    const merged = await encryptJson({
      ...creds,
      ad_account_id: chosen.id,
      ad_account_name: chosen.name,
    });

    const { error: updErr } = await admin
      .from('client_api_credentials')
      .update({ encrypted_credentials: merged, is_active: true, last_sync_status: null })
      .eq('organization_id', organizationId)
      .eq('platform', 'meta');
    if (updErr) return json({ error: updErr.message }, 500);

    return json({ ok: true, adAccount: { id: chosen.id, name: chosen.name } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
