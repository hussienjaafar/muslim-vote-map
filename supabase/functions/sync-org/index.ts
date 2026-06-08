import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { runOrgSync } from '../_shared/sync-lib.ts';

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

    const body = await req.json().catch(() => ({}));
    const organizationId = body?.organizationId;
    const full = body?.full === true;
    const sinceDays = Math.min(Math.max(Number(body?.sinceDays) || 30, 1), 365);
    if (!organizationId) return json({ error: 'organizationId is required' }, 400);

    const admin = createClient(url, service);

    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });
    let allowed = !!isAdmin;
    if (!allowed) {
      const { data: role } = await admin.rpc('user_org_role', { _user_id: userId, _org_id: organizationId });
      allowed = role === 'owner' || role === 'admin';
    }
    if (!allowed) return json({ error: 'Forbidden' }, 403);

    const result = await runOrgSync(admin, organizationId, sinceDays, { full });
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
