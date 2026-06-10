import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox, Loader2, MessageSquare, Building2 } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useSmsBroadcastRoi } from '@/queries/useFundraisingQueries';
import { type RangeSelection, presetSelection, resolveRange } from '@/lib/dateRanges';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { SmsBroadcastTable } from '@/components/dashboard/SmsBroadcastTable';
import { SmsBroadcastDetail } from '@/components/dashboard/SmsBroadcastDetail';

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function SmsBroadcasts() {
  const { activeOrg, isLoading: orgLoading } = useOrg();
  const orgId = activeOrg?.id ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [selection, setSelection] = useState<RangeSelection>(() => presetSelection('90d'));
  const range = useMemo(() => resolveRange(selection), [selection]);

  const broadcastId = searchParams.get('broadcast');
  const { data, isLoading, isError } = useSmsBroadcastRoi(orgId, range);
  const broadcasts = data ?? [];

  const totals = useMemo(() => {
    // Only broadcasts whose link reaches ActBlue count toward ROAS.
    const attributable = broadcasts.filter((b) => b.has_actblue_link !== false);
    const raised = attributable.reduce((a, b) => a + b.raised, 0);
    const cost = attributable.reduce((a, b) => a + b.cost, 0);
    return { raised, cost, roas: cost > 0 ? raised / cost : null, count: broadcasts.length };
  }, [broadcasts]);

  const select = (id: string | null) => {
    setSearchParams((prev) => {
      if (id) prev.set('broadcast', id);
      else prev.delete('broadcast');
      return prev;
    }, { replace: false });
  };

  if (orgLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeOrg) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="surgical-glass p-10 max-w-md text-center space-y-4">
          <Building2 className="w-10 h-10 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-display font-bold text-foreground">No organization yet</h1>
          <p className="text-sm text-muted-foreground">
            Once you're added to a client organization, your SMS broadcast performance will appear here.
          </p>
        </div>
      </div>
    );
  }

  if (broadcastId) {
    return (
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10">
        <SmsBroadcastDetail orgId={orgId} broadcastId={broadcastId} onBack={() => select(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight flex items-center gap-2.5">
            <MessageSquare className="w-7 h-7 text-sky-400" /> SMS Broadcasts
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeOrg.name} · per-broadcast deliverability, engagement &amp; ROI
          </p>
        </div>
        <DateRangePicker value={selection} onChange={setSelection} />
      </header>

      {broadcasts.length > 0 && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="surgical-glass p-5">
            <div className="text-label-xs text-muted-foreground mb-2">Broadcasts</div>
            <div className="text-2xl font-display font-bold text-foreground tabular-nums">{totals.count}</div>
          </div>
          <div className="surgical-glass p-5">
            <div className="text-label-xs text-muted-foreground mb-2">Total Raised</div>
            <div className="text-2xl font-display font-bold text-emerald-400 tabular-nums">{fmtCurrency(totals.raised)}</div>
          </div>
          <div className="surgical-glass p-5">
            <div className="text-label-xs text-muted-foreground mb-2">Total Cost</div>
            <div className="text-2xl font-display font-bold text-amber-400 tabular-nums">{fmtCurrency(totals.cost)}</div>
          </div>
          <div className="surgical-glass p-5">
            <div className="text-label-xs text-muted-foreground mb-2">Blended ROAS</div>
            <div className="text-2xl font-display font-bold text-foreground tabular-nums">
              {totals.roas == null ? '—' : `${totals.roas.toFixed(2)}x`}
            </div>
          </div>
        </section>
      )}

      <section className="surgical-glass p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading broadcasts…
          </div>
        ) : isError ? (
          <div className="py-12 text-center">
            <Inbox className="w-7 h-7 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Couldn't load broadcasts.</p>
          </div>
        ) : !broadcasts.length ? (
          <div className="py-12 text-center">
            <Inbox className="w-7 h-7 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No delivered SMS broadcasts for this period yet.</p>
          </div>
        ) : (
          <SmsBroadcastTable broadcasts={broadcasts} onSelect={(b) => select(b.id)} />
        )}
      </section>
    </div>
  );
}
