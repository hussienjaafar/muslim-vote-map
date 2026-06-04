import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { encryptJson } from '../_shared/crypto.ts';
import { META_GRAPH_VERSION, verifyState } from '../_shared/meta-oauth.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type AdAccount = { id: string; account_id: string; name: string; currency?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const appId = Deno.env.get('META_APP_ID');
    const appSecret = Deno.env.get('META_APP_SECRET');
    if (!appId || !appSecret) return json({ error: 'Meta app credentials are not configured' }, 500);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => null);
    const { code, state } = (body ?? {}) as { code?: string; state?: string };
    if (!code || !state) return json({ error: 'code and state are required' }, 400);

    let parsed;
    try {
      parsed = await verifyState(state);
    } catch (e) {
      return json({ error: `Invalid state: ${e instanceof Error ? e.message : 'error'}` }, 400);
    }
    if (parsed.userId !== userId) return json({ error: 'State does not match current user' }, 403);

    // Admin-only.
    const admin = createClient(url, service);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    // 1) Exchange code for a short-lived token.
    const tokenUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('redirect_uri', parsed.redirectUri);
    tokenUrl.searchParams.set('code', code);
    const shortRes = await fetch(tokenUrl.toString());
    const shortJson = await shortRes.json();
    if (!shortRes.ok || !shortJson.access_token) {
      return json({ error: shortJson.error?.message ?? 'Token exchange failed' }, 400);
    }

    // 2) Exchange for a long-lived (~60 day) token.
    const longUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', appId);
    longUrl.searchParams.set('client_secret', appSecret);
    longUrl.searchParams.set('fb_exchange_token', shortJson.access_token);
    const longRes = await fetch(longUrl.toString());
    const longJson = await longRes.json();
    const accessToken = longJson.access_token ?? shortJson.access_token;
    const expiresIn = longJson.expires_in ?? shortJson.expires_in ?? 60 * 24 * 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 3) Identify the user and list ad accounts.
    const meRes = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/me?fields=id,name&access_token=${accessToken}`);
    const meJson = await meRes.json();

    const acctRes = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts?fields=id,account_id,name,currency&limit=200&access_token=${accessToken}`,
    );
    const acctJson = await acctRes.json();
    if (!acctRes.ok) return json({ error: acctJson.error?.message ?? 'Failed to list ad accounts' }, 400);
    const adAccounts: AdAccount[] = (acctJson.data ?? []).map((a: any) => ({
      id: a.id,
      account_id: a.account_id,
      name: a.name,
      currency: a.currency,
    }));

    // 4) Store the token encrypted (pending account selection). Keep is_active false until an account is picked.
    const encrypted = await encryptJson({
      access_token: accessToken,
      token_expires_at: tokenExpiresAt,
      meta_user_id: meJson.id ?? null,
      meta_user_name: meJson.name ?? null,
      ad_accounts: adAccounts,
    });

    const { error: upsertErr } = await admin
      .from('client_api_credentials')
      .upsert(
        {
          organization_id: parsed.orgId,
          platform: 'meta',
          encrypted_credentials: encrypted,
          is_active: false,
          last_sync_status: null,
        },
        { onConflict: 'organization_id,platform' },
      );
    if (upsertErr) return json({ error: upsertErr.message }, 500);

    // Token is never returned to the client.
    return json({ ok: true, adAccounts, metaUser: { id: meJson.id ?? null, name: meJson.name ?? null } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
