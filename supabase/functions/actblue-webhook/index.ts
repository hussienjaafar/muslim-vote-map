import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptJson, type EncryptedPayload } from '../_shared/crypto.ts';
import { aggregateDaily } from '../_shared/sync-lib.ts';

// Public endpoint (no JWT). ActBlue posts contributions here in real time.
// Configure in ActBlue with this function URL.
// The organization is identified by the `entity_id` in the payload (matched against stored credentials).
// Authentication is either:
//   1. HMAC: X-ActBlue-Signature: sha256=<hex> validated against the org's webhook_secret
//   2. HTTP Basic Auth matching the org's basic_auth_username / basic_auth_password

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function computeHmac(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function validateHmac(header: string | null, body: string, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') return false;
  const computed = await computeHmac(body, secret);
  return timingSafeEqual(parts[1], computed);
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

    const row = {
      organization_id: orgId,
      transaction_id: txId,
      donor_email: donor.email ?? null,
      donor_name: [first, last].filter(Boolean).join(' ') || null,
      amount: num(c.amount),
      refcode: c.refcode ?? c.refcodes?.refcode ?? null,
      source_campaign: c.fundraisingPageName ?? c.contributionForm ?? null,
      transaction_type: 'donation',
      is_recurring: !!(c.recurringDuration || c.isRecurring || c.recurringPeriod),
      transaction_date: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
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
