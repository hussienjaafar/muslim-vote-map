import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { encryptJson } from '../_shared/crypto.ts';
import { runOrgSync } from '../_shared/sync-lib.ts';

type Platform = 'meta' | 'switchboard' | 'actblue';
const PLATFORMS: Platform[] = ['meta', 'switchboard', 'actblue'];

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

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'Invalid body' }, 400);

    const { organizationId, platform, action, credentials } = body as {
      organizationId?: string;
      platform?: Platform;
      action?: 'save' | 'disconnect';
      credentials?: Record<string, string>;
    };

    if (!organizationId || typeof organizationId !== 'string') {
      return json({ error: 'organizationId is required' }, 400);
    }
    if (!platform || !PLATFORMS.includes(platform)) {
      return json({ error: 'Invalid platform' }, 400);
    }

    const admin = createClient(url, service);

    // Authorization: platform admin OR org owner/admin.
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });
    let allowed = !!isAdmin;
    if (!allowed) {
      const { data: role } = await admin.rpc('user_org_role', {
        _user_id: userId,
        _org_id: organizationId,
      });
      allowed = role === 'owner' || role === 'admin';
    }
    if (!allowed) return json({ error: 'Forbidden' }, 403);

    if (action === 'disconnect') {
      const { error } = await admin
        .from('client_api_credentials')
        .update({ is_active: false })
        .eq('organization_id', organizationId)
        .eq('platform', platform);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, platform, status: 'disconnected' });
    }

    // Save
    if (!credentials || typeof credentials !== 'object') {
      return json({ error: 'credentials are required' }, 400);
    }
    // Strip empties and cap sizes.
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(credentials)) {
      if (typeof v !== 'string') continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      if (trimmed.length > 4096) return json({ error: `${k} is too long` }, 400);
      clean[k] = trimmed;
    }
    if (Object.keys(clean).length === 0) {
      return json({ error: 'No credential values provided' }, 400);
    }

    const encrypted = await encryptJson(clean);

    const { error: upsertErr } = await admin
      .from('client_api_credentials')
      .upsert(
        {
          organization_id: organizationId,
          platform,
          encrypted_credentials: encrypted,
          is_active: true,
          last_sync_status: null,
        },
        { onConflict: 'organization_id,platform' },
      );
    if (upsertErr) return json({ error: upsertErr.message }, 500);

    return json({ ok: true, platform, status: 'connected' });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
