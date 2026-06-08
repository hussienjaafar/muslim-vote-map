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

// Real ActBlue "Default" webhooks place entityId inside each lineitem. Collect
// every entity id we can find (lineitems first, then contribution/top-level
// fallbacks used by our test payloads).
function collectEntityIds(c: any, body: any): string[] {
  const ids: string[] = [];
  const push = (v: unknown) => {
    if (v != null && String(v).trim() !== '') ids.push(String(v));
  };
  const lineitems = Array.isArray(body?.lineitems) ? body.lineitems : [];
  for (const li of lineitems) {
    push(li?.entityId);
    push(li?.entity_id);
  }
  push(c?.entityId);
  push(c?.entity_id);
  push(body?.entityId);
  push(body?.entity_id);
  push(body?.contribution?.entityId);
  push(body?.contribution?.entity_id);
  return ids;
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

    const entityIds = collectEntityIds(c, body);
    if (entityIds.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing entity_id' }), { status: 400 });
    }

    // Find the org whose stored credentials match one of the payload's entity ids.
    const { data: rows } = await admin
      .from('client_api_credentials')
      .select('organization_id, encrypted_credentials, is_active')
      .eq('platform', 'actblue')
      .eq('is_active', true);

    let orgId: string | null = null;
    let creds: Record<string, string> | null = null;
    let matchedEntityId: string | null = null;
    for (const r of rows ?? []) {
      try {
        const dec = await decryptJson<Record<string, string>>(r.encrypted_credentials as EncryptedPayload);
        if (dec.entity_id && entityIds.includes(String(dec.entity_id))) {
          orgId = r.organization_id as string;
          creds = dec;
          matchedEntityId = String(dec.entity_id);
          break;
        }
      } catch {
        // Skip undecryptable rows.
      }
    }

    if (!orgId || !creds) {
      return new Response(JSON.stringify({ error: 'No matching organization' }), { status: 404 });
    }

    // Authenticate: HTTP Basic Auth (ActBlue sends Authorization: Basic on every delivery).
    const authHeader = req.headers.get('Authorization');
    let authenticated = false;

    if (creds.basic_auth_username && creds.basic_auth_password) {
      authenticated = validateBasicAuth(authHeader, creds.basic_auth_username, creds.basic_auth_password);
    }

    if (!authenticated) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          hint: 'Configure the Webhook Username and Password (Basic Auth) in API credentials to match ActBlue',
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

    // Pick the lineitem that belongs to this org's entity (split contributions
    // can include lineitems for several committees); fall back to the first.
    const lineitems = Array.isArray(body?.lineitems) ? body.lineitems : [];
    const lineitem =
      lineitems.find((li: any) => String(li?.entityId ?? li?.entity_id ?? '') === matchedEntityId) ??
      lineitems[0] ??
      null;

    // Amount and paid date live on the lineitem in real ActBlue payloads;
    // fall back to contribution-level fields for our simplified test payloads.
    const amount = num(lineitem?.amount ?? c.amount);
    const paidAt = lineitem?.paidAt ?? c.paidAt ?? c.createdAt;

    const row = {
      organization_id: orgId,
      transaction_id: txId,
      donor_email: donor.email ?? null,
      donor_name: [first, last].filter(Boolean).join(' ') || null,
      amount,
      refcode: c.refcode ?? c.refcodes?.refcode ?? null,
      source_campaign: c.fundraisingPageName ?? c.contributionForm ?? null,
      form_name: c.contributionForm ?? c.formName ?? c.fundraisingPageName ?? body?.form?.name ?? null,
      transaction_type: 'donation',
      is_recurring: isRecurring,
      transaction_date: normalizeActBlueTimestamp(paidAt),
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
