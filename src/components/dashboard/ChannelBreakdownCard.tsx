import { Inbox, TrendingUp, TrendingDown } from 'lucide-react';
import { useChannelBreakdown, channelLabel, type ChannelRow } from '@/queries/useFundraisingQueries';
import type { ResolvedRange } from '@/lib/dateRanges';

const CHANNEL_COLORS: Record<string, string> = {
  meta: '#38bdf8',
  sms: '#a78bfa',
  email: '#fbbf24',
  organic: '#34d399',
  other: '#64748b',
};

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function ConfidenceBadge({ confidence }: { confidence: string | null }) {
  if (!confidence || confidence === 'none') return null;
  const styles: Record<string, string> = {
    high: 'text-emerald-400 border-emerald-400/30',
    medium: 'text-amber-400 border-amber-400/30',
    low: 'text-muted-foreground border-border',
  };
  return (
    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${styles[confidence] ?? styles.low}`}>
      {confidence}
    </span>
  );
}

function ChannelRowItem({ row }: { row: ChannelRow }) {
  const color = CHANNEL_COLORS[row.channel] ?? CHANNEL_COLORS.other;
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-sm font-medium text-foreground">{channelLabel(row.channel)}</span>
          <ConfidenceBadge confidence={row.confidence} />
        </div>
        <span className="text-sm font-bold text-emerald-400 tabular-nums">{fmtCurrency(row.raised)}</span>
      </div>

      <div className="mt-2 h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${row.share}%`, background: color }} />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {row.donations.toLocaleString()} gifts · {row.donors.toLocaleString()} donors · {row.share.toFixed(0)}%
        </span>
        {row.spend > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            {fmtCurrency(row.spend)} spend ·
            {row.roi == null ? (
              <span>—</span>
            ) : (
              <span className={`inline-flex items-center gap-0.5 ${row.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {row.roi >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {row.roi >= 0 ? '+' : ''}{row.roi.toFixed(0)}% ROI
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export function ChannelBreakdownCard({ orgId, range }: { orgId: string | null; range: ResolvedRange }) {
  const { data, isError } = useChannelBreakdown(orgId, range);
  const channels = data?.channels ?? [];

  return (
    <section className="surgical-glass p-4 sm:p-8">
      <div className="mb-6">
        <h2 className="text-lg sm:text-xl font-display font-bold text-foreground">Revenue by Channel</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Donations attributed to each channel by refcode &amp; form, with paid-channel ROI.
        </p>
      </div>

      {isError ? (
        <div className="py-10 text-center">
          <Inbox className="w-7 h-7 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Couldn't load channel attribution.</p>
        </div>
      ) : !channels.length ? (
        <div className="py-10 text-center">
          <Inbox className="w-7 h-7 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No attributed donations for this period yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {channels.map((row) => (
            <ChannelRowItem key={row.channel} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}
