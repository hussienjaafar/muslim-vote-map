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

// Build a header map for the delivery log, redacting anything sensitive so the
// Basic Auth password / signatures are never persisted.
function redactHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    const key = k.toLowerCase();
    out[k] =
      key === 'authorization' || key === 'x-actblue-signature' || key === 'cookie'
        ? '[REDACTED]'
        : v;
  }
  return out;
}

function authScheme(header: string | null): string {
  if (!header) return 'none';
  return header.split(' ')[0] || 'unknown';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }
  try {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, service);

  // Read the raw body + request metadata up front so we can log EVERY inbound
  // delivery (mirrors Molitico's webhook_logs pattern) before any auth/parse,
  // making rejected deliveries visible instead of disappearing.
  const rawBody = await req.text();
  const sourceIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    null;
  const userAgent = req.headers.get('user-agent');
  const headers = redactHeaders(req);
  const authHeaderRaw = req.headers.get('Authorization');

  const body = (() => {
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  })();

  // Create the initial delivery log row (best-effort, never blocks the webhook).
  let logId: string | null = null;
  try {
    const { data: logRow } = await admin
      .from('webhook_deliveries')
      .insert({
        source: 'actblue',
        event_type: 'incoming',
        payload: body ?? { unparseable: true, raw_preview: rawBody.slice(0, 8192) },
        headers: { ...headers, auth_scheme: authScheme(authHeaderRaw) },
        source_ip: sourceIp,
        user_agent: userAgent,
        processing_status: 'pending',
      })
      .select('id')
      .single();
    logId = logRow?.id ?? null;
  } catch (logErr) {
    console.error('webhook_deliveries insert failed', logErr);
  }

  // Update the delivery log + return the response in one place.
  const finish = async (
    status: number,
    outcome: string,
    errorDetail: string | null,
    extra: Record<string, unknown> = {},
    responseBody: Record<string, unknown> = {},
    responseHeaders: Record<string, string> = {},
  ): Promise<Response> => {
    if (logId) {
      try {
        await admin
          .from('webhook_deliveries')
          .update({
            processing_status: status >= 200 && status < 300 ? 'processed' : 'failed',
            response_status: status,
            error_detail: errorDetail,
            ...extra,
          })
          .eq('id', logId);
      } catch (e) {
        console.error('webhook_deliveries update failed', e);
      }
    }
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { 'Content-Type': 'application/json', ...responseHeaders },
    });
  };

  try {
    if (!body) {
      return await finish(400, 'bad_payload', 'Invalid JSON body', {}, { error: 'Invalid payload' });
    }

    const c = body?.contribution ?? body?.lineitem ?? body;
    if (!c) {
      return await finish(400, 'bad_payload', 'No contribution/lineitem object', {}, { error: 'Invalid payload' });
    }

    const entityIds = collectEntityIds(c, body);
    if (entityIds.length === 0) {
      return await finish(
        400,
        'missing_entity',
        'No entity_id found in payload',
        { entity_ids_found: [] },
        { error: 'Missing entity_id' },
      );
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
      return await finish(
        404,
        'no_match',
        `No org matches entity ids: ${entityIds.join(', ')}`,
        { entity_ids_found: entityIds },
        { error: 'No matching organization' },
      );
    }

    // Authenticate: HTTP Basic Auth (ActBlue sends Authorization: Basic on every delivery).
    let authenticated = false;
    if (creds.basic_auth_username && creds.basic_auth_password) {
      authenticated = validateBasicAuth(authHeaderRaw, creds.basic_auth_username, creds.basic_auth_password);
    }

    if (!authenticated) {
      return await finish(
        401,
        'unauthorized',
        'Basic Auth validation failed',
        { entity_ids_found: entityIds, matched_organization_id: orgId },
        {
          error: 'Unauthorized',
          hint: 'Configure the Webhook Username and Password (Basic Auth) in API credentials to match ActBlue',
        },
        { 'WWW-Authenticate': 'Basic realm="actblue"' },
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
    if (error) {
      return await finish(
        500,
        'error',
        `Upsert failed: ${error.message}`,
        { entity_ids_found: entityIds, matched_organization_id: orgId },
        { error: error.message },
      );
    }

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

    return await finish(
      200,
      'processed',
      null,
      { entity_ids_found: entityIds, matched_organization_id: orgId },
      { ok: true },
    );
  } catch (e) {
    return await finish(500, 'error', e instanceof Error ? e.message : 'Unknown', {}, {
      error: e instanceof Error ? e.message : 'Unknown',
    });
  }
});
