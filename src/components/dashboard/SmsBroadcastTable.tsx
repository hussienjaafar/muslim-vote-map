import { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { SmsBroadcast } from '@/queries/useFundraisingQueries';

type SortKey =
  | 'campaignName' | 'date' | 'messagesDelivered' | 'clickRate' | 'cost'
  | 'raised' | 'donations' | 'roas' | 'dollarsPer1kDelivered'
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
function fmtDate(iso: string): string {
  const d = parseISO(iso);
  return isNaN(d.getTime()) ? iso : format(d, 'MMM d, yyyy');
}

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'campaignName', label: 'Broadcast', numeric: false },
  { key: 'date', label: 'Date', numeric: false },
  { key: 'messagesDelivered', label: 'Delivered', numeric: true },
  { key: 'clickRate', label: 'Click rate', numeric: true },
  { key: 'cost', label: 'Cost', numeric: true },
  { key: 'raised', label: 'Raised', numeric: true },
  { key: 'donations', label: 'Donations', numeric: true },
  { key: 'roas', label: 'ROAS', numeric: true },
  { key: 'dollarsPer1kDelivered', label: '$/1k', numeric: true },
  { key: 'conversionRate', label: 'Conv. rate', numeric: true },
  { key: 'costPerDonation', label: 'Cost/donation', numeric: true },
];

function cellValue(b: SmsBroadcast, key: SortKey): string {
  switch (key) {
    case 'campaignName': return b.campaignName;
    case 'date': return fmtDate(b.date);
    case 'messagesDelivered': return b.messagesDelivered.toLocaleString();
    case 'clickRate': return fmtPct(b.clickRate);
    case 'cost': return fmtCurrency(b.cost);
    case 'raised': return fmtCurrency(b.raised);
    case 'donations': return b.donations.toLocaleString();
    case 'roas': return fmtRoas(b.roas);
    case 'dollarsPer1kDelivered': return b.dollarsPer1kDelivered == null ? '—' : fmtCurrency2(b.dollarsPer1kDelivered);
    case 'conversionRate': return fmtPct(b.conversionRate);
    case 'costPerDonation': return b.costPerDonation == null ? '—' : fmtCurrency2(b.costPerDonation);
  }
}

function sortVal(b: SmsBroadcast, key: SortKey): number | string {
  switch (key) {
    case 'campaignName': return b.campaignName.toLowerCase();
    case 'date': return b.date;
    case 'messagesDelivered': return b.messagesDelivered;
    case 'clickRate': return b.clickRate ?? -1;
    case 'cost': return b.cost;
    case 'raised': return b.raised;
    case 'donations': return b.donations;
    case 'roas': return b.roas ?? -1;
    case 'dollarsPer1kDelivered': return b.dollarsPer1kDelivered ?? -1;
    case 'conversionRate': return b.conversionRate ?? -1;
    case 'costPerDonation': return b.costPerDonation ?? Number.MAX_SAFE_INTEGER;
  }
}

export function SmsBroadcastTable({
  open, onOpenChange, broadcasts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  broadcasts: SmsBroadcast[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>('roas');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const rows = [...broadcasts];
    rows.sort((a, b) => {
      const va = sortVal(a, sortKey);
      const vb = sortVal(b, sortKey);
      let cmp: number;
      if (typeof va === 'string' || typeof vb === 'string') {
        cmp = String(va).localeCompare(String(vb));
      } else {
        cmp = va - vb;
      }
      return dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [broadcasts, sortKey, dir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDir(key === 'campaignName' || key === 'date' ? 'asc' : 'desc');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="surgical-glass max-w-[min(96vw,1100px)] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">SMS Broadcast Performance</DialogTitle>
        </DialogHeader>
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
                <tr key={b.id} className="border-b border-border/50 hover:bg-muted/30">
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
      </DialogContent>
    </Dialog>
  );
}
