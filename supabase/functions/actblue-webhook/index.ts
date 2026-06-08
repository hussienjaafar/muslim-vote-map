import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptJson, type EncryptedPayload } from '../_shared/crypto.ts';
import { aggregateDaily } from '../_shared/sync-lib.ts';
import { normalizeActBlueTimestamp } from '../_shared/actblue-timezone.ts';

// Public endpoint (no JWT). ActBlue posts contributions here in real time.
// Configure in ActBlue with this function URL.
// The organization is identified by the `entity_id` in the payload (matched against stored credentials).
// Authentication: HTTP Basic Auth matching the org's basic_auth_username / basic_auth_password.
// (ActBlue webhooks authenticate via Basic Auth only — there is no signature header.)

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function validateBasicAuth(header: string | null, user: string, pass: string): boolean {
  if (!header || !header.startsWith('Basic ')) return false;
  try {
    const [u, p] = atob(header.slice(6)).split(':');
    return u === user && p === pass;
  } catch {
    return false;
  }
}

function extractEntityId(c: any, body: any): string | null {
  const raw = c?.entityId ?? c?.entity_id ?? body?.entityId ?? body?.entity_id ??
    body?.contribution?.entityId ?? body?.contribution?.entity_id ?? null;
  return raw != null ? String(raw) : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, service);

    // Read the raw body once (needed for HMAC verification).
    const rawBody = await req.text();
    const body = (() => {
      try {
        return JSON.parse(rawBody);
      } catch {
        return null;
      }
    })();
    if (!body) return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });

    const c = body?.contribution ?? body?.lineitem ?? body;
    if (!c) return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });

    const entityId = extractEntityId(c, body);
    if (!entityId) return new Response(JSON.stringify({ error: 'Missing entity_id' }), { status: 400 });

    // Find the org whose stored credentials match this entity_id.
    const { data: rows } = await admin
      .from('client_api_credentials')
      .select('organization_id, encrypted_credentials, is_active')
      .eq('platform', 'actblue')
      .eq('is_active', true);

    let orgId: string | null = null;
    let creds: Record<string, string> | null = null;
    for (const r of rows ?? []) {
      try {
        const dec = await decryptJson<Record<string, string>>(r.encrypted_credentials as EncryptedPayload);
        if (dec.entity_id && String(dec.entity_id) === entityId) {
          orgId = r.organization_id as string;
          creds = dec;
          break;
        }
      } catch {
        // Skip undecryptable rows.
      }
    }

    if (!orgId || !creds) {
      return new Response(JSON.stringify({ error: 'No matching organization' }), { status: 404 });
    }

    // Authenticate: HMAC signature first, then Basic Auth fallback.
    const signatureHeader = req.headers.get('X-ActBlue-Signature');
    const authHeader = req.headers.get('Authorization');
    let authenticated = false;

    if (creds.webhook_secret) {
      authenticated = await validateHmac(signatureHeader, rawBody, creds.webhook_secret);
    }
    if (!authenticated && creds.basic_auth_username && creds.basic_auth_password) {
      authenticated = validateBasicAuth(authHeader, creds.basic_auth_username, creds.basic_auth_password);
    }

    if (!authenticated) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          hint: 'Configure webhook_secret (HMAC) or basic_auth_username/password in API credentials',
        }),
        { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="actblue"' } },
      );
    }

    const donor = body?.donor ?? c?.donor ?? {};
    const txId = String(c.orderNumber ?? c.receiptId ?? c.lineitemId ?? c.id ?? crypto.randomUUID());
    const first = donor.firstname ?? donor.firstName ?? '';
    const last = donor.lastname ?? donor.lastName ?? '';

    const period = String(c.recurringPeriod ?? c.recurringType ?? '').trim().toLowerCase();
    const isRecurring = period
      ? period !== 'once'
      : !!(c.recurringDuration || c.isRecurring === true);

    const row = {
      organization_id: orgId,
      transaction_id: txId,
      donor_email: donor.email ?? null,
      donor_name: [first, last].filter(Boolean).join(' ') || null,
      amount: num(c.amount),
      refcode: c.refcode ?? c.refcodes?.refcode ?? null,
      source_campaign: c.fundraisingPageName ?? c.contributionForm ?? null,
      form_name: c.contributionForm ?? c.formName ?? c.fundraisingPageName ?? null,
      transaction_type: 'donation',
      is_recurring: isRecurring,
      transaction_date: normalizeActBlueTimestamp(c.createdAt),
    };

    const { error } = await admin
      .from('actblue_transactions')
      .upsert(row, { onConflict: 'organization_id,transaction_id' });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    // Re-aggregate just this donation's day so the dashboard rollup
    // (daily_aggregated_metrics) updates in real time instead of waiting for
    // the daily cron sync. Scoped to one day = cheap and idempotent. Never let
    // an aggregation hiccup fail the webhook (ActBlue retries on non-2xx).
    const day = String(row.transaction_date).slice(0, 10);
    try {
      await aggregateDaily(admin, orgId, 1, false, day);
    } catch (aggErr) {
      console.error('aggregateDaily failed for', orgId, day, aggErr);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), { status: 500 });
  }
});
