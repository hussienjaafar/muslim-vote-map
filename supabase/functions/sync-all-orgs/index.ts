import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { runOrgSync } from '../_shared/sync-lib.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Invoked by the daily cron schedule (apikey header) or a platform admin.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, service);

    // Authorize: either a valid platform-admin JWT, or the cron apikey matching anon/service key.
    const authHeader = req.headers.get('Authorization');
    const apikey = req.headers.get('apikey');
    let authorized = false;

    if (apikey && (apikey === anon || apikey === service)) {
      authorized = true;
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      if (token === service) {
        authorized = true;
      } else {
        const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
        const { data: claims } = await userClient.auth.getClaims(token);
        if (claims?.claims?.sub) {
          const { data: isAdmin } = await admin.rpc('has_role', { _user_id: claims.claims.sub, _role: 'admin' });
          authorized = !!isAdmin;
        }
      }
    }
    if (!authorized) {
      // Surface auth failures loudly: a stale/rotated cron key was the cause of a
      // silent multi-day sync outage. Logging here makes a recurrence visible.
      console.error('sync-all-orgs: unauthorized request rejected (check cron Authorization key)');
      return json({ error: 'Unauthorized' }, 401);
    }

    const { data: orgs } = await admin
      .from('client_api_credentials')
      .select('organization_id')
      .eq('is_active', true);

    const uniqueOrgIds = [...new Set((orgs ?? []).map((o: { organization_id: string }) => o.organization_id))];
    console.log(`sync-all-orgs: starting sync for ${uniqueOrgIds.length} org(s)`);

    const summaries = [];
    for (const orgId of uniqueOrgIds) {
      try {
        const r = await runOrgSync(admin, orgId, 7);
        summaries.push(r);
      } catch (e) {
        summaries.push({ org_id: orgId, error: (e as Error).message });
      }
    }

    return json({ ok: true, orgs: uniqueOrgIds.length, summaries });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
