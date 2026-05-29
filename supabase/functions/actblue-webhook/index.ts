import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptJson, type EncryptedPayload } from '../_shared/crypto.ts';

// Public endpoint (no JWT). ActBlue posts contributions here in real time.
// Configure in ActBlue with URL: <fn-url>?org=<organization_id>
// and HTTP Basic Auth matching the org's stored webhook_username / webhook_password.

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }
  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get('org');
    if (!orgId) return new Response(JSON.stringify({ error: 'Missing org' }), { status: 400 });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, service);

    const { data: credRow } = await admin
      .from('client_api_credentials')
      .select('encrypted_credentials, is_active')
      .eq('organization_id', orgId)
      .eq('platform', 'actblue')
      .maybeSingle();

    if (!credRow || !credRow.is_active) {
      return new Response(JSON.stringify({ error: 'Not configured' }), { status: 404 });
    }

    let creds: Record<string, string>;
    try {
      creds = await decryptJson<Record<string, string>>(credRow.encrypted_credentials as EncryptedPayload);
    } catch {
      return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
    }

    // Validate HTTP Basic Auth against stored webhook credentials.
    const expectedUser = creds.webhook_username;
    const expectedPass = creds.webhook_password;
    if (!expectedUser || !expectedPass) {
      return new Response(JSON.stringify({ error: 'Webhook auth not set' }), { status: 401 });
    }
    const authHeader = req.headers.get('Authorization') ?? '';
    const ok = (() => {
      if (!authHeader.startsWith('Basic ')) return false;
      try {
        const [u, p] = atob(authHeader.slice(6)).split(':');
        return u === expectedUser && p === expectedPass;
      } catch {
        return false;
      }
    })();
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="actblue"' },
      });
    }

    const body = await req.json().catch(() => null);
    const c = body?.contribution ?? body?.lineitem ?? body;
    if (!c) return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });

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

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), { status: 500 });
  }
});
