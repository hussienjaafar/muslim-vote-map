import { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { SmsBroadcast } from '@/queries/useFundraisingQueries';

type SortKey =
  | 'campaignName' | 'sortTime' | 'messagesDelivered' | 'clickRate' | 'cost'
  | 'raised' | 'roas' | 'donations' | 'dollarsPer1kDelivered'
  | 'conversionRate' | 'costPerDonation';

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtCurrency2(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtRoas(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(2)}x`;
}
function fmtPct(n: number | null): string {
  return n == null ? '—' : `${(n * 100).toFixed(1)}%`;
}

/** Date + time in Eastern Time; falls back to date-only when no send time exists. */
export function fmtSentEastern(b: SmsBroadcast): string {
  if (b.sentAt) {
    const d = parseISO(b.sentAt);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      }) + ' ET';
    }
  }
  const d = parseISO(b.date);
  return isNaN(d.getTime()) ? b.date : format(d, 'MMM d, yyyy');
}

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'campaignName', label: 'Broadcast', numeric: false },
  { key: 'sortTime', label: 'Sent', numeric: false },
  { key: 'messagesDelivered', label: 'Delivered', numeric: true },
  { key: 'clickRate', label: 'Click rate', numeric: true },
  { key: 'cost', label: 'Cost', numeric: true },
  { key: 'raised', label: 'Raised', numeric: true },
  { key: 'roas', label: 'ROAS', numeric: true },
  { key: 'donations', label: 'Donations', numeric: true },
  { key: 'dollarsPer1kDelivered', label: '$/1k', numeric: true },
  { key: 'conversionRate', label: 'Conv. rate', numeric: true },
  { key: 'costPerDonation', label: 'Cost/donation', numeric: true },
];

function cellValue(b: SmsBroadcast, key: SortKey): string {
  switch (key) {
    case 'campaignName': return b.campaignName;
    case 'sortTime': return fmtSentEastern(b);
    case 'messagesDelivered': return b.messagesDelivered.toLocaleString();
    case 'clickRate': return fmtPct(b.clickRate);
    case 'cost': return fmtCurrency(b.cost);
    case 'raised': return fmtCurrency(b.raised);
    case 'roas': return fmtRoas(b.roas);
    case 'donations': return b.donations.toLocaleString();
    case 'dollarsPer1kDelivered': return b.dollarsPer1kDelivered == null ? '—' : fmtCurrency2(b.dollarsPer1kDelivered);
    case 'conversionRate': return fmtPct(b.conversionRate);
    case 'costPerDonation': return b.costPerDonation == null ? '—' : fmtCurrency2(b.costPerDonation);
  }
}

function sortVal(b: SmsBroadcast, key: SortKey): number | string {
  switch (key) {
    case 'campaignName': return b.campaignName.toLowerCase();
    case 'sortTime': return b.sentAt ?? b.date;
    case 'messagesDelivered': return b.messagesDelivered;
    case 'clickRate': return b.clickRate ?? -1;
    case 'cost': return b.cost;
    case 'raised': return b.raised;
    case 'roas': return b.roas ?? -1;
    case 'donations': return b.donations;
    case 'dollarsPer1kDelivered': return b.dollarsPer1kDelivered ?? -1;
    case 'conversionRate': return b.conversionRate ?? -1;
    case 'costPerDonation': return b.costPerDonation ?? Number.MAX_SAFE_INTEGER;
  }
}

export function SmsBroadcastTable({
  broadcasts, onSelect,
}: {
  broadcasts: SmsBroadcast[];
  onSelect?: (b: SmsBroadcast) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('raised');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const rows = [...broadcasts];
    rows.sort((a, b) => {
      const va = sortVal(a, sortKey);
      const vb = sortVal(b, sortKey);
      const cmp = (typeof va === 'string' || typeof vb === 'string')
        ? String(va).localeCompare(String(vb))
        : va - vb;
      return dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [broadcasts, sortKey, dir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDir(key === 'campaignName' || key === 'sortTime' ? 'asc' : 'desc');
    }
  };

  return (
    <div className="overflow-auto -mx-2 px-2">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-card/95 backdrop-blur z-10">
          <tr className="border-b border-border">
            {COLUMNS.map((col) => {
              const active = col.key === sortKey;
              return (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`py-2.5 px-2 cursor-pointer select-none text-[11px] uppercase tracking-wide font-semibold whitespace-nowrap ${
                    col.numeric ? 'text-right' : 'text-left'
                  } ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <span className={`inline-flex items-center gap-1 ${col.numeric ? 'flex-row-reverse' : ''}`}>
                    {col.label}
                    {active ? (
                      dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => (
            <tr
              key={b.id}
              onClick={() => onSelect?.(b)}
              className={`border-b border-border/50 hover:bg-muted/30 ${onSelect ? 'cursor-pointer' : ''}`}
            >
              {COLUMNS.map((col) => {
                const isRoas = col.key === 'roas';
                const roasColor = b.roas == null ? '' : b.roas >= 1 ? 'text-emerald-400' : 'text-rose-400';
                return (
                  <td
                    key={col.key}
                    className={`py-2.5 px-2 whitespace-nowrap tabular-nums ${
                      col.numeric ? 'text-right' : 'text-left'
                    } ${col.key === 'campaignName' ? 'font-medium text-foreground max-w-[220px] truncate' : 'text-muted-foreground'} ${
                      isRoas ? `font-bold ${roasColor}` : ''
                    } ${col.key === 'raised' ? 'text-emerald-400 font-semibold' : ''}`}
                    title={col.key === 'campaignName' ? b.campaignName : undefined}
                  >
                    {cellValue(b, col.key)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
