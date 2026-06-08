import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Radio, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

type Delivery = {
  id: string;
  source: string;
  source_ip: string | null;
  processing_status: string;
  response_status: number | null;
  error_detail: string | null;
  entity_ids_found: string[] | null;
  matched_organization_id: string | null;
  headers: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  received_at: string;
};

/** Pull a donation amount + donor identity out of the logged ActBlue payload. */
function parseDonation(payload: Record<string, unknown> | null): { amount: number | null; donor: string | null } {
  if (!payload || typeof payload !== 'object') return { amount: null, donor: null };
  const p = payload as any;
  const c = p.contribution ?? p.lineitem ?? p;
  const lineitems = Array.isArray(p.lineitems) ? p.lineitems : [];
  const rawAmount = lineitems[0]?.amount ?? c?.amount;
  const amount = rawAmount != null && Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : null;
  const donor = p.donor ?? c?.donor ?? {};
  const name = [donor.firstname ?? donor.firstName, donor.lastname ?? donor.lastName].filter(Boolean).join(' ');
  return { amount, donor: name || donor.email || null };
}

function useWebhookDeliveries() {
  return useQuery({
    queryKey: ['webhook-deliveries'],
    queryFn: async (): Promise<Delivery[]> => {
      const { data, error } = await supabase
        .from('webhook_deliveries')
        .select('id, source, source_ip, processing_status, response_status, error_detail, entity_ids_found, matched_organization_id, headers, payload, received_at')
        .order('received_at', { ascending: false })
        .limit(100);
      if (error) return [];
      return (data ?? []) as Delivery[];
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

function statusColor(status: string): string {
  if (status === 'processed') return 'text-emerald-400';
  if (status === 'failed') return 'text-red-400';
  return 'text-amber-400';
}

export default function WebhookDeliveries() {
  const { data, isLoading, isFetching, refetch } = useWebhookDeliveries();

  return (
    <div className="p-4 sm:p-6 lg:p-10 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight flex items-center gap-3">
            <Radio className="w-7 h-7 text-blue-400" />
            Webhook Deliveries
          </h2>
          <p className="text-muted-foreground text-sm mt-2 max-w-xl">
            Every inbound ActBlue webhook request is logged here — including rejected ones — so you can confirm
            deliveries arrive and diagnose any failures.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white/5 hover:bg-white/10 text-sm text-foreground transition-colors self-start"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-12">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading deliveries...
        </div>
      ) : !data?.length ? (
        <div className="surgical-glass p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No webhook deliveries recorded yet. The next ActBlue delivery will appear here.
          </p>
        </div>
      ) : (
        <div className="surgical-glass overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3 font-bold">Received</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">HTTP</th>
                <th className="px-4 py-3 font-bold">Auth</th>
                <th className="px-4 py-3 font-bold">Source IP</th>
                <th className="px-4 py-3 font-bold">Entity IDs</th>
                <th className="px-4 py-3 font-bold">Matched Org</th>
                <th className="px-4 py-3 font-bold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                    {format(new Date(d.received_at), 'MMM d, HH:mm:ss')}
                  </td>
                  <td className={`px-4 py-3 font-bold uppercase tracking-wider text-[11px] ${statusColor(d.processing_status)}`}>
                    {d.processing_status}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{d.response_status ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{String((d.headers as any)?.auth_scheme ?? '—')}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{d.source_ip ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.entity_ids_found?.join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                    {d.matched_organization_id ? d.matched_organization_id.slice(0, 8) : '—'}
                  </td>
                  <td className="px-4 py-3 text-red-400/80 max-w-[280px] truncate" title={d.error_detail ?? ''}>
                    {d.error_detail ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
