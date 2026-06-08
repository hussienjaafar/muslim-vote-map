// Shared fundraising sync logic, used by sync-org and sync-all-orgs.
import { decryptJson, type EncryptedPayload } from './crypto.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

type Platform = 'meta' | 'switchboard' | 'actblue';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type PlatformResult = { platform: Platform; ok: boolean; rows: number; error?: string; queued?: boolean };

/**
 * Meta Ads sync. Pulls campaign-level daily insights via the Graph API.
 * Expected credentials: { access_token, ad_account_id }
 */
async function syncMeta(
  admin: SupabaseClient,
  orgId: string,
  creds: Record<string, string>,
  sinceDays: number,
): Promise<PlatformResult> {
  const token = creds.access_token;
  const account = creds.ad_account_id;
  if (!token || !account) {
    return { platform: 'meta', ok: false, rows: 0, error: 'Missing access_token or ad_account_id' };
  }
  const acct = account.startsWith('act_') ? account : `act_${account}`;
  const since = isoDaysAgo(sinceDays);
  const until = todayIso();

  const params = new URLSearchParams({
    level: 'campaign',
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    fields:
      'campaign_id,campaign_name,spend,impressions,clicks,reach,cpc,cpm,ctr,actions,action_values',
    limit: '500',
    access_token: token,
  });
  const url = `https://graph.facebook.com/v19.0/${acct}/insights?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    return { platform: 'meta', ok: false, rows: 0, error: `Meta API ${res.status}: ${text.slice(0, 200)}` };
  }
  const payload = await res.json();
  const rows: Record<string, unknown>[] = [];
  for (const r of payload.data ?? []) {
    let conversions = 0;
    let conversionValue = 0;
    for (const a of r.actions ?? []) {
      if (String(a.action_type).includes('purchase') || String(a.action_type).includes('donate')) {
        conversions += num(a.value);
      }
    }
    for (const a of r.action_values ?? []) {
      if (String(a.action_type).includes('purchase') || String(a.action_type).includes('donate')) {
        conversionValue += num(a.value);
      }
    }
    rows.push({
      organization_id: orgId,
      campaign_id: String(r.campaign_id),
      ad_set_id: null,
      ad_id: null,
      date: r.date_start,
      spend: num(r.spend),
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      reach: num(r.reach),
      cpc: num(r.cpc),
      cpm: num(r.cpm),
      ctr: num(r.ctr),
      conversions,
      conversion_value: conversionValue,
      roas: num(r.spend) > 0 ? conversionValue / num(r.spend) : null,
      synced_at: new Date().toISOString(),
    });
  }

  if (rows.length) {
    const { error } = await admin
      .from('meta_ad_metrics')
      .upsert(rows, { onConflict: 'organization_id,campaign_id,date' });
    if (error) return { platform: 'meta', ok: false, rows: 0, error: error.message };
  }
  return { platform: 'meta', ok: true, rows: rows.length };
}

/**
 * Switchboard SMS sync. Pulls broadcasts and aggregates daily metrics.
 * Expected credentials: { account_id, api_key }
 * Auth: HTTP Basic base64(account_id:api_key) against https://api.oneswitchboard.com
 */
async function syncSwitchboard(
  admin: SupabaseClient,
  orgId: string,
  creds: Record<string, string>,
  sinceDays: number,
): Promise<PlatformResult> {
  const accountId = creds.account_id;
  const apiKey = creds.api_key;
  if (!accountId || !apiKey) {
    return { platform: 'switchboard', ok: false, rows: 0, error: 'Missing account_id or api_key' };
  }

  const auth = 'Basic ' + btoa(`${accountId}:${apiKey}`);
  const sinceMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

  // Page through broadcasts.
  const broadcasts: Record<string, unknown>[] = [];
  let next: string | null = 'https://api.oneswitchboard.com/v1/broadcasts';
  let guard = 0;
  while (next && guard < 50) {
    guard++;
    const res = await fetch(next, {
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        platform: 'switchboard',
        ok: false,
        rows: 0,
        error: `Switchboard API ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const payload = await res.json();
    const items: Record<string, unknown>[] = payload.data ?? payload.broadcasts ?? [];
    if (Array.isArray(items)) broadcasts.push(...items);
    next = payload.next ?? payload.links?.next ?? payload.next_page ?? null;
  }

  const rows = broadcasts
    .map((b) => {
      const attrs = (b.attributes ?? b) as Record<string, unknown>;
      const date = String(attrs.sent_at ?? attrs.scheduled_at ?? attrs.created_at ?? todayIso()).slice(0, 10);
      return {
        organization_id: orgId,
        campaign_id: String(b.id ?? attrs.id),
        campaign_name: attrs.name ?? attrs.title ?? null,
        date,
        messages_sent: num(attrs.messages_sent ?? attrs.sent ?? attrs.total_sent),
        messages_delivered: num(attrs.messages_delivered ?? attrs.delivered),
        messages_failed: num(attrs.messages_failed ?? attrs.failed),
        opt_outs: num(attrs.opt_outs ?? attrs.opt_out ?? attrs.unsubscribes),
        clicks: num(attrs.clicks),
        conversions: num(attrs.conversions),
        amount_raised: num(attrs.amount_raised ?? attrs.raised),
        cost: num(attrs.cost ?? attrs.spend),
        synced_at: new Date().toISOString(),
      };
    })
    .filter((r) => new Date(r.date).getTime() >= sinceMs - 24 * 60 * 60 * 1000);

  if (rows.length) {
    const { error } = await admin
      .from('sms_campaign_metrics')
      .upsert(rows, { onConflict: 'organization_id,campaign_id,date' });
    if (error) return { platform: 'switchboard', ok: false, rows: 0, error: error.message };
  }
  return { platform: 'switchboard', ok: true, rows: rows.length };
}

/**
 * ActBlue sync. Requests a CSV export and queues it as a background job.
 * The export is generated asynchronously by ActBlue and finished later by the
 * process-actblue-jobs worker. Expected credentials: { username, password, entity_id }
 */
async function syncActblue(
  admin: SupabaseClient,
  orgId: string,
  creds: Record<string, string>,
  sinceDays: number,
): Promise<PlatformResult> {
  const username = creds.username;
  const password = creds.password;
  const entityId = creds.entity_id;
  if (!username || !password || !entityId) {
    return { platform: 'actblue', ok: false, rows: 0, error: 'Missing username, password or entity_id' };
  }

  const auth = 'Basic ' + btoa(`${username}:${password}`);
  const base = 'https://secure.actblue.com/api/v1';

  // Request a CSV export for the window; the worker polls for completion later.
  const reqRes = await fetch(`${base}/csvs`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv_type: 'paid_contributions', date_range_start: isoDaysAgo(sinceDays), date_range_end: todayIso() }),
  });
  if (!reqRes.ok) {
    const text = await reqRes.text();
    return { platform: 'actblue', ok: false, rows: 0, error: `ActBlue API ${reqRes.status}: ${text.slice(0, 200)}` };
  }
  const reqJson = await reqRes.json();
  const csvId = reqJson.id;
  if (!csvId) {
    return { platform: 'actblue', ok: false, rows: 0, error: 'ActBlue did not return an export id' };
  }

  // Record a background job so the worker can finish the import.
  const { error: jobErr } = await admin.from('actblue_csv_jobs').insert({
    organization_id: orgId,
    csv_id: String(csvId),
    status: 'processing',
    since_days: sinceDays,
  });
  if (jobErr) return { platform: 'actblue', ok: false, rows: 0, error: jobErr.message };

  return { platform: 'actblue', ok: true, rows: 0, queued: true };
}

/**
 * Polls ActBlue for an export's download URL. Returns:
 *  - { ready: true, downloadUrl } when complete
 *  - { ready: false } when still generating
 * Throws on API errors.
 */
export async function pollActblueCsv(
  csvId: string,
  creds: Record<string, string>,
): Promise<{ ready: boolean; downloadUrl?: string }> {
  const auth = 'Basic ' + btoa(`${creds.username}:${creds.password}`);
  const base = 'https://secure.actblue.com/api/v1';
  const poll = await fetch(`${base}/csvs/${csvId}`, { headers: { Authorization: auth } });
  if (!poll.ok) {
    const text = await poll.text();
    throw new Error(`ActBlue API ${poll.status}: ${text.slice(0, 200)}`);
  }
  const pj = await poll.json();
  if (pj.status === 'complete' && pj.download_url) {
    return { ready: true, downloadUrl: pj.download_url };
  }
  return { ready: false };
}

/** Downloads an ActBlue export and parses it into transaction rows. */
export async function downloadActblueCsv(downloadUrl: string, orgId: string): Promise<Record<string, unknown>[]> {
  const csvRes = await fetch(downloadUrl);
  const csvText = await csvRes.text();
  return parseActblueCsv(csvText, orgId);
}

export function parseActblueCsv(text: string, orgId: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const out: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const get = (name: string) => {
      const j = idx(name);
      return j >= 0 ? cells[j] : '';
    };
    const txId = get('receipt id') || get('lineitem id') || get('order number');
    if (!txId) continue;
    const first = get('donor first name');
    const last = get('donor last name');
    out.push({
      organization_id: orgId,
      transaction_id: String(txId),
      donor_email: get('donor email') || null,
      donor_name: [first, last].filter(Boolean).join(' ') || null,
      amount: num(get('amount')),
      refcode: get('refcode') || get('refcode2') || null,
      source_campaign: get('fundraising page') || null,
      transaction_type: 'donation',
      is_recurring: /yes|true|1/i.test(get('recurring total months') || get('recurrence number') || ''),
      transaction_date: parseDate(get('date')),
    });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseDate(s: string): string {
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Recomputes daily_aggregated_metrics for an org over the window. */
async function aggregateDaily(admin: SupabaseClient, orgId: string, sinceDays: number): Promise<number> {
  const since = isoDaysAgo(sinceDays);

  const [meta, sms, donations] = await Promise.all([
    admin.from('meta_ad_metrics').select('date, spend, impressions, clicks').eq('organization_id', orgId).gte('date', since),
    admin.from('sms_campaign_metrics').select('date, cost, amount_raised, messages_sent, conversions').eq('organization_id', orgId).gte('date', since),
    admin.from('actblue_transactions').select('transaction_date, amount, donor_email').eq('organization_id', orgId).gte('transaction_date', since),
  ]);

  const byDate: Record<string, {
    ad_spend: number; sms_cost: number; funds: number; donations: number;
    meta_impressions: number; meta_clicks: number; sms_sent: number; sms_conversions: number; new_donors: number;
  }> = {};
  const ensure = (d: string) => (byDate[d] ??= {
    ad_spend: 0, sms_cost: 0, funds: 0, donations: 0,
    meta_impressions: 0, meta_clicks: 0, sms_sent: 0, sms_conversions: 0, new_donors: 0,
  });

  for (const r of meta.data ?? []) {
    const d = ensure(r.date);
    d.ad_spend += num(r.spend);
    d.meta_impressions += num(r.impressions);
    d.meta_clicks += num(r.clicks);
  }
  for (const r of sms.data ?? []) {
    const d = ensure(r.date);
    d.sms_cost += num(r.cost);
    d.funds += num(r.amount_raised);
    d.sms_sent += num(r.messages_sent);
    d.sms_conversions += num(r.conversions);
  }

  // First-seen date per donor email (across all history) to compute new donors.
  const firstSeen = new Map<string, string>();
  const { data: allDonors } = await admin
    .from('actblue_transactions')
    .select('donor_email, transaction_date')
    .eq('organization_id', orgId)
    .not('donor_email', 'is', null)
    .order('transaction_date', { ascending: true });
  for (const r of allDonors ?? []) {
    const email = String(r.donor_email).toLowerCase();
    if (!firstSeen.has(email)) firstSeen.set(email, String(r.transaction_date).slice(0, 10));
  }

  for (const r of donations.data ?? []) {
    const day = String(r.transaction_date).slice(0, 10);
    const d = ensure(day);
    d.funds += num(r.amount);
    d.donations += 1;
    if (r.donor_email && firstSeen.get(String(r.donor_email).toLowerCase()) === day) {
      d.new_donors += 1;
    }
  }

  const rows = Object.entries(byDate).map(([date, v]) => {
    const totalSpend = v.ad_spend + v.sms_cost;
    return {
      organization_id: orgId,
      date,
      total_ad_spend: v.ad_spend,
      total_sms_cost: v.sms_cost,
      total_funds_raised: v.funds,
      total_donations: v.donations,
      new_donors: v.new_donors,
      roi_percentage: totalSpend > 0 ? ((v.funds - totalSpend) / totalSpend) * 100 : null,
      meta_impressions: v.meta_impressions,
      meta_clicks: v.meta_clicks,
      sms_sent: v.sms_sent,
      sms_conversions: v.sms_conversions,
      calculated_at: new Date().toISOString(),
    };
  });

  if (rows.length) {
    await admin.from('daily_aggregated_metrics').upsert(rows, { onConflict: 'organization_id,date' });
  }
  return rows.length;
}

/** Runs all configured platform syncs for an org, then aggregates. */
export async function runOrgSync(
  admin: SupabaseClient,
  orgId: string,
  sinceDays = 30,
): Promise<{ org_id: string; results: PlatformResult[]; aggregated: number }> {
  const { data: creds } = await admin
    .from('client_api_credentials')
    .select('platform, encrypted_credentials, is_active')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  const results: PlatformResult[] = [];
  for (const row of creds ?? []) {
    let decrypted: Record<string, string>;
    try {
      decrypted = await decryptJson<Record<string, string>>(row.encrypted_credentials as EncryptedPayload);
    } catch (e) {
      results.push({ platform: row.platform, ok: false, rows: 0, error: 'Decrypt failed: ' + (e as Error).message });
      continue;
    }

    let result: PlatformResult;
    if (row.platform === 'meta') result = await syncMeta(admin, orgId, decrypted, sinceDays);
    else if (row.platform === 'switchboard') result = await syncSwitchboard(admin, orgId, decrypted, sinceDays);
    else if (row.platform === 'actblue') result = await syncActblue(admin, orgId, decrypted, sinceDays);
    else result = { platform: row.platform, ok: false, rows: 0, error: 'Unknown platform' };

    results.push(result);

    await admin
      .from('client_api_credentials')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: result.ok ? 'success' : `error: ${result.error ?? 'unknown'}`.slice(0, 280),
      })
      .eq('organization_id', orgId)
      .eq('platform', row.platform);
  }

  const aggregated = await aggregateDaily(admin, orgId, sinceDays);
  return { org_id: orgId, results, aggregated };
}
