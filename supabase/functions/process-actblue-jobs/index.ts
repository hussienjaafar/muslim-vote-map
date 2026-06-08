import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { decryptJson, type EncryptedPayload } from '../_shared/crypto.ts';
import { pollActblueCsv, downloadActblueCsv, aggregateDaily } from '../_shared/sync-lib.ts';

const MAX_ATTEMPTS = 20; // ~20 minutes at one run per minute

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, service);

  try {
    const { data: jobs, error } = await admin
      .from('actblue_csv_jobs')
      .select('id, organization_id, csv_id, since_days, attempts, date_range_start')
      .eq('status', 'processing')
      .order('created_at', { ascending: true })
      .limit(1); // Process one job per invocation to stay within the CPU budget.
    if (error) return json({ error: error.message }, 500);

    const summary: Record<string, unknown>[] = [];

    for (const job of jobs ?? []) {
      try {
        // Load and decrypt the org's ActBlue credentials.
        const { data: cred } = await admin
          .from('client_api_credentials')
          .select('encrypted_credentials')
          .eq('organization_id', job.organization_id)
          .eq('platform', 'actblue')
          .eq('is_active', true)
          .maybeSingle();

        if (!cred) {
          await failJob(admin, job, 'ActBlue credentials not found');
          summary.push({ job: job.id, result: 'error', reason: 'no credentials' });
          continue;
        }

        const creds = await decryptJson<Record<string, string>>(
          cred.encrypted_credentials as EncryptedPayload,
        );

        const poll = await pollActblueCsv(String(job.csv_id), creds);

        if (!poll.ready) {
          const attempts = (job.attempts ?? 0) + 1;
          if (attempts >= MAX_ATTEMPTS) {
            await failJob(admin, job, 'ActBlue export did not complete in time');
            summary.push({ job: job.id, result: 'timeout' });
          } else {
            await admin.from('actblue_csv_jobs').update({ attempts }).eq('id', job.id);
            summary.push({ job: job.id, result: 'pending', attempts });
          }
          continue;
        }

        // Export is ready — download, parse, upsert (in chunks), and re-aggregate.
        const rawRows = await downloadActblueCsv(poll.downloadUrl!, job.organization_id);
        // ActBlue exports can repeat the same receipt id; dedupe (keep last)
        // so a single upsert batch never touches the same conflict key twice.
        const deduped = new Map<string, Record<string, unknown>>();
        for (const r of rawRows) deduped.set(String(r.transaction_id), r);
        const rows = [...deduped.values()];
        if (rows.length) {
          let upsertFailed = false;
          for (let i = 0; i < rows.length; i += 1000) {
            const { error: upErr } = await admin
              .from('actblue_transactions')
              .upsert(rows.slice(i, i + 1000), { onConflict: 'organization_id,transaction_id' });
            if (upErr) {
              await failJob(admin, job, upErr.message);
              summary.push({ job: job.id, result: 'error', reason: upErr.message });
              upsertFailed = true;
              break;
            }
          }
          if (upsertFailed) continue;
        }

        // Aggregate over the full imported range so backfilled history (not just
        // the last `since_days`) shows on the dashboard. Use the job's window
        // start when available, otherwise fall back to a full re-aggregation.
        const sinceDate = job.date_range_start
          ? String(job.date_range_start).slice(0, 10)
          : undefined;
        await aggregateDaily(admin, job.organization_id, job.since_days ?? 30, !sinceDate, sinceDate);

        await admin.from('actblue_csv_jobs').update({ status: 'complete', last_error: null, rows_imported: rows.length }).eq('id', job.id);
        await admin
          .from('client_api_credentials')
          .update({ last_sync_at: new Date().toISOString(), last_sync_status: 'success' })
          .eq('organization_id', job.organization_id)
          .eq('platform', 'actblue');

        summary.push({ job: job.id, result: 'complete', rows: rows.length });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        const attempts = (job.attempts ?? 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await failJob(admin, job, msg);
          summary.push({ job: job.id, result: 'error', reason: msg });
        } else {
          await admin.from('actblue_csv_jobs').update({ attempts, last_error: msg.slice(0, 280) }).eq('id', job.id);
          summary.push({ job: job.id, result: 'retry', reason: msg });
        }
      }
    }

    return json({ ok: true, processed: summary.length, summary });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function failJob(admin: any, job: { id: string; organization_id: string }, reason: string) {
  await admin
    .from('actblue_csv_jobs')
    .update({ status: 'error', last_error: reason.slice(0, 280) })
    .eq('id', job.id);
  await admin
    .from('client_api_credentials')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: `error: ${reason}`.slice(0, 280),
    })
    .eq('organization_id', job.organization_id)
    .eq('platform', 'actblue');
}
