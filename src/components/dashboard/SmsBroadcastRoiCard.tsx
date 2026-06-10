import { useMemo, useState } from 'react';
import { Inbox, MessageSquare, ArrowRight } from 'lucide-react';
import { useSmsBroadcastRoi, type SmsBroadcast } from '@/queries/useFundraisingQueries';
import type { ResolvedRange } from '@/lib/dateRanges';
import { SmsBroadcastTable } from './SmsBroadcastTable';

const TOP_N = 5;

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtRoas(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(2)}x`;
}

function BroadcastRow({ b, maxRoas }: { b: SmsBroadcast; maxRoas: number }) {
  const roasColor = b.roas == null ? 'text-muted-foreground' : b.roas >= 1 ? 'text-emerald-400' : 'text-rose-400';
  const barColor = b.roas == null ? '#64748b' : b.roas >= 1 ? '#34d399' : '#fb7185';
  const pct = b.roas != null && maxRoas > 0 ? Math.max(4, (b.roas / maxRoas) * 100) : 0;
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground truncate" title={b.campaignName}>
          {b.campaignName}
        </span>
        <span className={`text-sm font-bold tabular-nums shrink-0 ${roasColor}`}>{fmtRoas(b.roas)}</span>
      </div>

      <div className="mt-2 h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>
          <span className="text-emerald-400 font-semibold">{fmtCurrency(b.raised)}</span> raised · {fmtCurrency(b.cost)} cost
        </span>
        <span>{b.donations.toLocaleString()} gifts</span>
      </div>
    </div>
  );
}

export function SmsBroadcastRoiCard({ orgId, range }: { orgId: string | null; range: ResolvedRange }) {
  const { data, isError } = useSmsBroadcastRoi(orgId, range);
  const [open, setOpen] = useState(false);
  const broadcasts = data ?? [];

  const { topRows, totalRaised, totalCost, maxRoas } = useMemo(() => {
    const totalRaised = broadcasts.reduce((a, b) => a + b.raised, 0);
    const totalCost = broadcasts.reduce((a, b) => a + b.cost, 0);
    const topRows = [...broadcasts]
      .sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1))
      .slice(0, TOP_N);
    const maxRoas = topRows.reduce((m, b) => Math.max(m, b.roas ?? 0), 0);
    return { topRows, totalRaised, totalCost, maxRoas };
  }, [broadcasts]);

  const blendedRoas = totalCost > 0 ? totalRaised / totalCost : null;

  return (
    <section className="surgical-glass p-4 sm:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-display font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-sky-400" /> SMS Broadcast Performance
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Top broadcasts by return on ad spend (raised ÷ cost), attributed by refcode.
          </p>
        </div>
        {broadcasts.length > 0 && (
          <div className="text-right shrink-0">
            <div className="text-xl font-display font-bold text-foreground tabular-nums">{fmtRoas(blendedRoas)}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Blended ROAS</div>
          </div>
        )}
      </div>

      {isError ? (
        <div className="py-10 text-center">
          <Inbox className="w-7 h-7 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Couldn't load broadcast performance.</p>
        </div>
      ) : !broadcasts.length ? (
        <div className="py-10 text-center">
          <Inbox className="w-7 h-7 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No delivered SMS broadcasts for this period yet.</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border/60">
            {topRows.map((b) => (
              <BroadcastRow key={b.id} b={b} maxRoas={maxRoas} />
            ))}
          </div>
          <button
            onClick={() => setOpen(true)}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            View all {broadcasts.length} broadcasts <ArrowRight className="w-4 h-4" />
          </button>
          <SmsBroadcastTable open={open} onOpenChange={setOpen} broadcasts={broadcasts} />
        </>
      )}
    </section>
  );
}
