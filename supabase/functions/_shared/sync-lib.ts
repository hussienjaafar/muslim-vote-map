// Shared fundraising sync logic, used by sync-org and sync-all-orgs.
import { decryptJson, type EncryptedPayload } from './crypto.ts';
import { normalizeActBlueTimestamp } from './actblue-timezone.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

type Platform = 'meta' | 'switchboard' | 'actblue';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
// ActBlue treats a CSV export's date_range_end as EXCLUSIVE, so using today's
// date cuts off all of today's donations. Use tomorrow as the end bound so the
// current day is always fully included.
function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
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

export type PlatformResult = { platform: Platform; ok: boolean; rows: number; error?: string; queued?: boolean; note?: string };

/**
 * Meta Ads sync. Pulls campaign-level daily insights via the Graph API.
 * Expected credentials: { access_token, ad_account_id }
 */
async function syncMeta(
  admin: SupabaseClient,
  orgId: string,
  creds: Record<string, string>,
  sinceDays: number,
  full = false,
): Promise<PlatformResult> {
  const token = creds.access_token;
  const account = creds.ad_account_id;
  if (!token || !account) {
    return { platform: 'meta', ok: false, rows: 0, error: 'Missing access_token or ad_account_id' };
  }
  const acct = account.startsWith('act_') ? account : `act_${account}`;
  // Meta only returns ad insights up to ~37 months back; cap full backfills there.
  const META_MAX_DAYS = 37 * 30;
  const since = isoDaysAgo(full ? META_MAX_DAYS : sinceDays);
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
  let url: string | null = `https://graph.facebook.com/v19.0/${acct}/insights?${params.toString()}`;

  const rows: Record<string, unknown>[] = [];
  let guard = 0;
  while (url && guard < 200) {
    guard++;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      return { platform: 'meta', ok: false, rows: 0, error: `Meta API ${res.status}: ${text.slice(0, 200)}` };
    }
    const payload = await res.json();
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
    url = payload.paging?.next ?? null;
  }

  if (rows.length) {
    // Upsert in chunks to stay well within request limits on large backfills.
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await admin
        .from('meta_ad_metrics')
        .upsert(rows.slice(i, i + 1000), { onConflict: 'organization_id,campaign_id,date' });
      if (error) return { platform: 'meta', ok: false, rows: 0, error: error.message };
    }
  }

  // Hourly spend for a short recent window (powers the single-day dashboard chart).
  // We only ever show Today/Yesterday hourly, so a rolling window keeps API cost
  // and row volume bounded. Failures here must not fail the daily sync.
  try {
    await syncMetaHourly(admin, orgId, acct, token);
  } catch (_e) {
    // best-effort; daily sync already succeeded
  }

  // Build deterministic refcode -> meta mappings from each ad's destination link.
  // Best-effort: never fail the daily metrics sync because of creative parsing.
  let adLinkNote: string | undefined;
  try {
    const r = await syncMetaAdLinks(admin, orgId, acct, token);
    adLinkNote = `ad-links: ads=${r.ads} urls=${r.urls} refcodes=${r.mappings}${r.error ? ` err=${r.error}` : ''}`;
  } catch (e) {
    adLinkNote = `ad-links error: ${(e as Error).message}`;
  }

  return { platform: 'meta', ok: true, rows: rows.length, note: adLinkNote };
}

/**
 * Reads every Meta ad's creative destination link, extracts the `refcode`
 * (and ActBlue form slug) from the URL, and upserts an exact refcode -> meta
 * mapping into campaign_attribution. This makes Meta attribution deterministic
 * instead of relying on refcode keyword guessing.
 *
 * Mappings are tagged source='meta_ad' so they refresh on every sync without
 * clobbering admin-created ('manual') mappings.
 */
export async function syncMetaAdLinks(
  admin: SupabaseClient,
  orgId: string,
  acct: string,
  token: string,
): Promise<{ mappings: number; ads: number; urls: number; error: string | null }> {
  const params = new URLSearchParams({
    fields:
      'id,name,effective_status,campaign{id,name},creative{object_story_spec,asset_feed_spec,url_tags,template_url,link_url}',
    limit: '200',
    access_token: token,
  });
  let url: string | null = `https://graph.facebook.com/v19.0/${acct}/ads?${params.toString()}`;

  // refcode -> { channel, campaign_label, meta_campaign_id }
  const mappings = new Map<string, { campaign_label: string | null; meta_campaign_id: string | null }>();

  let guard = 0;
  let adCount = 0;
  let urlCount = 0;
  let firstError: string | null = null;
  while (url && guard < 200) {
    guard++;
    const res = await fetch(url);
    if (!res.ok) {
      firstError = `Meta ads API ${res.status}: ${(await res.text()).slice(0, 300)}`;
      break; // best-effort
    }
    const payload = await res.json();
    for (const ad of payload.data ?? []) {
      adCount++;
      const campaignName: string | null = ad?.campaign?.name ?? null;
      const campaignId: string | null = ad?.campaign?.id ? String(ad.campaign.id) : null;
      const urls = collectCreativeUrls(ad?.creative);
      urlCount += urls.length;
      for (const u of urls) {
        const refcode = extractRefcode(u);
        if (!refcode) continue;
        // First write wins per refcode within this run (active ads listed first).
        if (!mappings.has(refcode.toLowerCase())) {
          mappings.set(refcode.toLowerCase(), {
            campaign_label: campaignName,
            meta_campaign_id: campaignId,
          });
        }
      }
    }
    url = payload.paging?.next ?? null;
  }

  console.log(
    `[syncMetaAdLinks] org=${orgId} ads=${adCount} urls=${urlCount} refcodes=${mappings.size}` +
    (firstError ? ` error=${firstError}` : ''),
  );

  if (!mappings.size) return { mappings: 0, ads: adCount, urls: urlCount, error: firstError };

  // The unique index is expression-based (organization_id, lower(pattern)), which
  // PostgREST upsert can't target via onConflict. Instead we refresh the
  // auto-synced set: drop prior meta_ad rows, then insert the current refcodes,
  // skipping any pattern an admin already created manually.
  await admin
    .from('campaign_attribution')
    .delete()
    .eq('organization_id', orgId)
    .eq('source', 'meta_ad');

  const { data: existing } = await admin
    .from('campaign_attribution')
    .select('pattern')
    .eq('organization_id', orgId);
  const manualPatterns = new Set(
    (existing ?? []).map((r: { pattern: string | null }) => (r.pattern ?? '').toLowerCase()),
  );

  const rows = [...mappings.entries()]
    .filter(([refcode]) => !manualPatterns.has(refcode.toLowerCase()))
    .map(([refcode, info]) => ({
      organization_id: orgId,
      pattern: refcode,
      refcode,
      channel: 'meta',
      match_type: 'exact',
      campaign_label: info.campaign_label,
      meta_campaign_id: info.meta_campaign_id,
      priority: 10,
      source: 'meta_ad',
    }));

  if (rows.length) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin
        .from('campaign_attribution')
        .insert(rows.slice(i, i + 500));
      if (error) {
        console.error(`[syncMetaAdLinks] insert error: ${error.message}`);
        firstError = firstError ?? error.message;
      }
    }
  }

  return { mappings: rows.length, ads: adCount, urls: urlCount, error: firstError };
}

/** Collects all candidate destination URLs from a Meta ad creative object. */
function collectCreativeUrls(creative: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = [];
  if (!creative) return out;

  const pushSpec = (spec: any) => {
    const link = spec?.link_data;
    if (link?.link) out.push(String(link.link));
    for (const child of link?.child_attachments ?? []) {
      if (child?.link) out.push(String(child.link));
    }
    const video = spec?.video_data;
    if (video?.call_to_action?.value?.link) out.push(String(video.call_to_action.value.link));
  };

  pushSpec((creative as any).object_story_spec);

  const afs = (creative as any).asset_feed_spec;
  for (const l of afs?.link_urls ?? []) {
    if (l?.website_url) out.push(String(l.website_url));
  }

  if ((creative as any).template_url) out.push(String((creative as any).template_url));
  if ((creative as any).link_url) out.push(String((creative as any).link_url));

  // url_tags is a query-fragment like "refcode=q2fad2&utm_source=fb".
  const tags = (creative as any).url_tags;
  if (typeof tags === 'string' && tags.includes('refcode')) {
    out.push(`https://x.invalid/?${tags.replace(/^\?/, '')}`);
  }

  return out;
}

/**
 * Extracts the `?refcode=` value from free text (e.g. an SMS message body that
 * contains an ActBlue donate link). Falls back to `refcode2` if no `refcode`.
 * Returned lowercased to match attribution comparisons.
 */
function extractRefcodeFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m =
    text.match(/[?&]refcode=([^&#\s"'<>)\]]+)/i) ??
    text.match(/[?&]refcode2=([^&#\s"'<>)\]]+)/i);
  if (!m) return null;
  try {
    const rc = decodeURIComponent(m[1]).trim().toLowerCase();
    return rc || null;
  } catch (_e) {
    return m[1].trim().toLowerCase() || null;
  }
}

/** Extracts the `refcode` query parameter from a URL, if present. */
function extractRefcode(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const rc = u.searchParams.get('refcode') ?? u.searchParams.get('refcode2');
    const trimmed = rc?.trim();
    return trimmed ? trimmed : null;
  } catch (_e) {
    // Try a loose regex for non-standard / fragment URLs.
    const m = rawUrl.match(/refcode2?=([^&#\s]+)/i);
    return m ? decodeURIComponent(m[1]).trim() || null : null;
  }
}

/**
 * Follows an HTTP redirect chain manually (capped, with a timeout) and returns
 * the final resolved URL. Used to resolve vanity/short links (e.g.
 * example.org/donate) to the underlying ActBlue URL that carries `?refcode=`.
 * Returns null on any network error, timeout, or non-https hop.
 */
async function resolveRedirect(startUrl: string, maxHops = 6): Promise<string | null> {
  let current = startUrl;
  for (let i = 0; i < maxHops; i++) {
    if (!current.startsWith('https://')) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(current, { method: 'GET', redirect: 'manual', signal: controller.signal });
    } catch (_e) {
      clearTimeout(timer);
      return null;
    }
    clearTimeout(timer);
    // Redirect response: follow the Location header.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return current;
      try { current = new URL(loc, current).toString(); } catch (_e) { return current; }
      continue;
    }
    // Terminal response (2xx/4xx/5xx): this is the resolved URL.
    return res.url || current;
  }
  return current;
}




const META_HOURLY_WINDOW_DAYS = 7;

/**
 * Pulls Meta hourly insights (advertiser timezone) for a short recent window
 * and upserts per-campaign/day/hour spend into meta_ad_hourly_metrics.
 */
async function syncMetaHourly(
  admin: SupabaseClient,
  orgId: string,
  acct: string,
  token: string,
): Promise<void> {
  const since = isoDaysAgo(META_HOURLY_WINDOW_DAYS);
  const until = todayIso();

  const params = new URLSearchParams({
    level: 'campaign',
    time_increment: '1',
    breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
    time_range: JSON.stringify({ since, until }),
    fields: 'campaign_id,spend,impressions,clicks',
    limit: '500',
    access_token: token,
  });
  let url: string | null = `https://graph.facebook.com/v19.0/${acct}/insights?${params.toString()}`;

  const rows: Record<string, unknown>[] = [];
  let guard = 0;
  while (url && guard < 200) {
    guard++;
    const res = await fetch(url);
    if (!res.ok) return; // best-effort
    const payload = await res.json();
    for (const r of payload.data ?? []) {
      const hourStr = r.hourly_stats_aggregated_by_advertiser_time_zone as string | undefined;
      if (!hourStr) continue;
      const hour = parseInt(hourStr.slice(0, 2), 10);
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue;
      rows.push({
        organization_id: orgId,
        campaign_id: String(r.campaign_id),
        date: r.date_start,
        hour,
        spend: num(r.spend),
        impressions: num(r.impressions),
        clicks: num(r.clicks),
        synced_at: new Date().toISOString(),
      });
    }
    url = payload.paging?.next ?? null;
  }

  if (rows.length) {
    for (let i = 0; i < rows.length; i += 1000) {
      await admin
        .from('meta_ad_hourly_metrics')
        .upsert(rows.slice(i, i + 1000), { onConflict: 'organization_id,campaign_id,date,hour' });
    }
  }
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
  full = false,
): Promise<PlatformResult> {
  const accountId = creds.account_id;
  const apiKey = creds.api_key;
  if (!accountId || !apiKey) {
    return { platform: 'switchboard', ok: false, rows: 0, error: 'Missing account_id or api_key' };
  }

  const auth = 'Basic ' + btoa(`${accountId}:${apiKey}`);
  // Full backfills pull every broadcast; incremental syncs filter by window.
  const sinceMs = full ? 0 : Date.now() - sinceDays * 24 * 60 * 60 * 1000;


  // Page through broadcasts.
  const broadcasts: Record<string, unknown>[] = [];
  let next: string | null = 'https://api.oneswitchboard.com/v1/broadcasts';
  let guard = 0;
  while (next && guard < (full ? 500 : 50)) {
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
    const data = (payload.data ?? {}) as Record<string, any>;
    const items: Record<string, unknown>[] = data.page ?? data.broadcasts ?? (Array.isArray(data) ? data : []) ?? [];
    if (Array.isArray(items)) broadcasts.push(...items);
    next = data.next_page ?? payload.next_page ?? data.links?.next ?? null;
  }

  const SENT_STATUSES = new Set(['sent', 'sending', 'stopped', 'paused']);
  const rows = broadcasts
    .map((b) => {
      const attrs = (b.attributes ?? b) as Record<string, unknown>;
      const status = String(attrs.status ?? '').toLowerCase();
      const startedRaw = attrs.started_at ?? attrs.created_at ?? null;
      const date = String(startedRaw ?? todayIso()).slice(0, 10);
      const sentAt = startedRaw ? new Date(String(startedRaw)).toISOString() : null;
      return {
        status,
        organization_id: orgId,
        campaign_id: String(b.id ?? attrs.id),
        campaign_name: attrs.title ?? attrs.name ?? null,
        date,
        sent_at: sentAt,
        messages_sent: num(attrs.total_messages ?? attrs.messages_sent),
        messages_delivered: num(attrs.delivered ?? attrs.messages_delivered),
        messages_failed: num(attrs.failed_to_deliver ?? attrs.messages_failed),
        opt_outs: num(attrs.opt_outs),
        clicks: num(attrs.clicks),
        conversions: num(attrs.donations ?? attrs.conversions),
        amount_raised: num(attrs.amount_raised),
        cost: num(attrs.cost_estimate ?? attrs.cost),
        link_refcode: null as string | null,
        synced_at: new Date().toISOString(),
      };
    })
    .filter((r) => SENT_STATUSES.has(r.status))
    .filter((r) => new Date(r.date).getTime() >= sinceMs - 24 * 60 * 60 * 1000)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ status, ...rest }) => rest);

  // Pull each broadcast's message body from the single-broadcast endpoint and
  // extract the real `?refcode=` from a direct ActBlue donate link inside it.
  // This is the authoritative per-broadcast refcode (the list endpoint omits
  // message_text). Note: if a broadcast links through a reused vanity/redirect
  // (e.g. example.org/donate) the refcode is not in the message and stays null;
  // assign_sms_refcodes then falls back to date-based matching for that send.
  for (const r of rows) {
    try {
      const res = await fetch(`https://api.oneswitchboard.com/v1/broadcasts/${r.campaign_id}`, {
        headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const payload = await res.json();
      const d = (payload.data ?? payload) as Record<string, any>;
      const attrs = (d.attributes ?? d) as Record<string, unknown>;
      const messageText = String(attrs.message_text ?? attrs.text ?? attrs.body ?? '');
      r.link_refcode = extractRefcodeFromText(messageText);
    } catch (_e) {
      // Leave link_refcode null; assign_sms_refcodes falls back to date matching.
    }
  }


  if (rows.length) {
    const { error } = await admin
      .from('sms_campaign_metrics')
      .upsert(rows, { onConflict: 'organization_id,campaign_id,date' });
    if (error) return { platform: 'switchboard', ok: false, rows: 0, error: error.message };
  }

  // Assign each broadcast's refcode: the link_refcode extracted above wins;
  // broadcasts without an extractable link fall back to date-based matching.
  await admin.rpc('assign_sms_refcodes', { _org_id: orgId });

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
  full = false,
): Promise<PlatformResult> {
  const username = creds.username;
  const password = creds.password;
  const entityId = creds.entity_id;
  if (!username || !password || !entityId) {
    return { platform: 'actblue', ok: false, rows: 0, error: 'Missing username, password or entity_id' };
  }

  const auth = 'Basic ' + btoa(`${username}:${password}`);
  const base = 'https://secure.actblue.com/api/v1';

  // ActBlue rejects any export whose date range exceeds 6 months. Build a list
  // of <=6-month windows to request. Full backfills cover the last 2 years in
  // four 6-month chunks; incremental syncs use a single clamped window.
  const isoMonthsAgo = (months: number): string => {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().slice(0, 10);
  };
  const windows: { start: string; end: string }[] = [];
  if (full) {
    for (const startMonths of [24, 18, 12, 6]) {
      const endMonths = startMonths - 6;
      // The final window ends "now" — use tomorrow (exclusive end) to include today.
      windows.push({ start: isoMonthsAgo(startMonths), end: endMonths === 0 ? tomorrowIso() : isoMonthsAgo(endMonths) });
    }
  } else {
    const days = Math.min(Math.max(sinceDays, 1), 180); // cap at ~6 months
    windows.push({ start: isoDaysAgo(days), end: tomorrowIso() });
  }

  let queuedCount = 0;
  const errors: string[] = [];
  for (const w of windows) {
    const reqRes = await fetch(`${base}/csvs`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv_type: 'paid_contributions', date_range_start: w.start, date_range_end: w.end }),
    });
    if (!reqRes.ok) {
      const text = await reqRes.text();
      errors.push(`${w.start}..${w.end}: ${reqRes.status} ${text.slice(0, 120)}`);
      continue;
    }
    const reqJson = await reqRes.json();
    const csvId = reqJson.id;
    if (!csvId) {
      errors.push(`${w.start}..${w.end}: no export id`);
      continue;
    }
    const { error: jobErr } = await admin.from('actblue_csv_jobs').insert({
      organization_id: orgId,
      csv_id: String(csvId),
      status: 'processing',
      since_days: sinceDays,
      date_range_start: w.start,
      date_range_end: w.end,
    });
    if (jobErr) {
      errors.push(`${w.start}..${w.end}: ${jobErr.message}`);
      continue;
    }
    queuedCount++;
  }

  if (queuedCount === 0) {
    return { platform: 'actblue', ok: false, rows: 0, error: `ActBlue export failed: ${errors.join('; ').slice(0, 200)}` };
  }
  const note = full
    ? `${queuedCount} ActBlue export window(s) queued${errors.length ? ` (${errors.length} failed)` : ''}`
    : undefined;
  return { platform: 'actblue', ok: true, rows: 0, queued: true, note };
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

/** Derive a readable form name from an ActBlue fundraising-page URL slug. */
function slugFromPage(page: string | null): string | null {
  if (!page) return null;
  const m = page.match(/\/(?:page|my-express|form)\/?([^/?#]+)?/i);
  const slug = (m?.[1] || '').trim();
  if (!slug) {
    if (/my-express/i.test(page)) return 'ActBlue Express';
    return null;
  }
  return slug;
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
    const period = (get('recurring period') || get('recurrence frequency') || '').trim().toLowerCase();
    const totalMonths = (get('recurring total months') || '').trim().toLowerCase();
    const isRecurring = period
      ? period !== 'once'
      : totalMonths !== '' && totalMonths !== '0';
    const fundraisingPage = get('fundraising page') || null;
    const formName =
      get('form name') || get('contribution form') || slugFromPage(fundraisingPage);
    // ActBlue contribution exports name these columns "Reference Code" and
    // "Reference Code 2" (lowercased here). Keep the short aliases as fallbacks.
    const rc1 = get('reference code') || get('refcode') || '';
    const rc2 = get('reference code 2') || get('refcode2') || '';
    out.push({
      organization_id: orgId,
      transaction_id: String(txId),
      donor_email: get('donor email') || null,
      donor_name: [first, last].filter(Boolean).join(' ') || null,
      amount: num(get('amount')),
      refcode: rc1 || rc2 || null,
      refcode2: rc2 || null,
      source_campaign: fundraisingPage,
      form_name: formName,
      transaction_type: 'donation',
      is_recurring: isRecurring,
      transaction_date: normalizeActBlueTimestamp(get('date')),
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


/**
 * Recomputes daily_aggregated_metrics for an org over the window.
 * Pass `sinceDate` (YYYY-MM-DD) to aggregate from an explicit start date,
 * `full=true` to aggregate all history, otherwise the last `sinceDays` days.
 */
export async function aggregateDaily(
  admin: SupabaseClient,
  orgId: string,
  sinceDays: number,
  full = false,
  sinceDate?: string,
): Promise<number> {
  const since = sinceDate ?? (full ? '2000-01-01' : isoDaysAgo(sinceDays));


  const [meta, sms, rollup] = await Promise.all([
    admin.from('meta_ad_metrics').select('date, spend, impressions, clicks').eq('organization_id', orgId).gte('date', since),
    admin.from('sms_campaign_metrics').select('date, cost, amount_raised, messages_sent, conversions').eq('organization_id', orgId).gte('date', since),
    // Donation totals are computed in Postgres, bucketed by Eastern Time, so we
    // never stream the org's full transaction history into the function (which
    // hit both the 1000-row PostgREST cap and the edge CPU limit on backfills).
    admin.rpc('org_daily_rollup', { _org_id: orgId, _since: since }),
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
    // NOTE: do NOT add SMS amount_raised into d.funds. SMS is a channel —
    // those donations still process through ActBlue and are already counted
    // in the org_daily_rollup below. Adding amount_raised here double-counts
    // funds raised. Keep it out of the funds total.
    d.sms_sent += num(r.messages_sent);
    d.sms_conversions += num(r.conversions);
  }

  // Per-day donation count + funds, already grouped by Eastern-Time day.
  for (const r of rollup.data ?? []) {
    const day = String(r.day).slice(0, 10);
    const d = ensure(day);
    d.funds += num(r.funds);
    d.donations += num(r.donations);
  }

  // New-donor counts: one per donor whose first-ever donation (in ET) falls in
  // the window, attributed to that first ET day.
  const { data: newDonors } = await admin.rpc('org_new_donors_since', {
    _org_id: orgId,
    _since: since,
  });
  for (const r of newDonors ?? []) {
    if (!r.first_date) continue;
    const day = String(r.first_date).slice(0, 10);
    ensure(day).new_donors += 1;
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
  opts: { full?: boolean; onlyPlatform?: Platform } = {},
): Promise<{ org_id: string; results: PlatformResult[]; aggregated: number }> {
  const full = !!opts.full;
  let query = admin
    .from('client_api_credentials')
    .select('platform, encrypted_credentials, is_active')
    .eq('organization_id', orgId)
    .eq('is_active', true);
  if (opts.onlyPlatform) query = query.eq('platform', opts.onlyPlatform);
  const { data: creds } = await query;

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
    if (row.platform === 'meta') result = await syncMeta(admin, orgId, decrypted, sinceDays, full);
    else if (row.platform === 'switchboard') result = await syncSwitchboard(admin, orgId, decrypted, sinceDays, full);
    else if (row.platform === 'actblue') result = await syncActblue(admin, orgId, decrypted, sinceDays, full);
    else result = { platform: row.platform, ok: false, rows: 0, error: 'Unknown platform' };

    results.push(result);

    const statusText = result.queued
      ? `processing: ${result.note ?? 'ActBlue export queued'}`
      : result.ok
        ? 'success'
        : `error: ${result.error ?? 'unknown'}`.slice(0, 280);

    await admin
      .from('client_api_credentials')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: statusText,
      })
      .eq('organization_id', orgId)
      .eq('platform', row.platform);
  }

  const aggregated = await aggregateDaily(admin, orgId, sinceDays, full);

  // Re-resolve attribution so newly-synced ad-link mappings and fresh
  // transactions are reflected. Best-effort; never fail the sync on this.
  try {
    await admin.rpc('recompute_attribution', { _org_id: orgId, _since: null });
  } catch (_e) {
    // best-effort
  }

  return { org_id: orgId, results, aggregated };
}
