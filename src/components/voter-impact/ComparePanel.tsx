import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download } from 'lucide-react';
import { formatNumber, formatPercent } from '@/lib/geoUtils';

export interface CompareRegion {
  regionId: string;
  regionType: 'state' | 'district';
  label: string;
  data: any;
}

interface ComparePanelProps {
  regions: CompareRegion[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

interface MetricRow {
  label: string;
  getValue: (d: any, type: 'state' | 'district') => string;
}

const METRIC_ROWS: MetricRow[] = [
  { label: 'Muslim Voters', getValue: d => formatNumber(d?.muslim_voters) },
  {
    label: 'Registered',
    getValue: (d, type) =>
      type === 'state' ? formatNumber(d?.registered) : formatNumber(d?.muslim_registered),
  },
  {
    label: 'Turnout %',
    getValue: (d, type) =>
      type === 'state' ? formatPercent(d?.vote_2024_pct) : formatPercent(d?.actual_turnout_pct),
  },
  { label: 'Donors', getValue: d => formatNumber(d?.political_donors ?? 0) },
  { label: 'Activists', getValue: d => formatNumber(d?.political_activists) },
  {
    label: 'Registration %',
    getValue: (d, type) =>
      type === 'state' ? formatPercent(d?.registered_pct) : formatPercent(d?.registration_pct),
  },
  { label: 'Primary 2024 %', getValue: d => formatPercent(d?.primary_2024_pct) },
];

function generateCSV(regions: CompareRegion[]): string {
  const header = ['Metric', ...regions.map(r => r.label)].join(',');
  const rows = METRIC_ROWS.map(m =>
    [m.label, ...regions.map(r => `"${m.getValue(r.data, r.regionType)}"`)].join(',')
  );
  return [header, ...rows].join('\n');
}

export function ComparePanel({ regions, onRemove, onClear }: ComparePanelProps) {
  if (regions.length === 0) return null;

  const handleExport = () => {
    const csv = generateCSV(regions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'region-comparison.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-6 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider font-display">
          Compare ({regions.length}/4)
        </h4>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleExport} className="text-xs h-6 px-2 gap-1">
            <Download className="w-3 h-3" />
            CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear} className="text-xs h-6 px-2">
            Clear
          </Button>
        </div>
      </div>

      {/* Side-by-side table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 pr-2 text-muted-foreground font-medium">Metric</th>
              {regions.map(r => (
                <th key={r.regionId} className="text-right py-1.5 px-1.5 font-medium text-foreground">
                  <div className="flex items-center justify-end gap-1">
                    <span className="truncate max-w-[60px]">{r.label}</span>
                    <button onClick={() => onRemove(r.regionId)} className="text-muted-foreground hover:text-foreground shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map(m => (
              <tr key={m.label} className="border-b border-border/50">
                <td className="py-1.5 pr-2 text-muted-foreground font-display">{m.label}</td>
                {regions.map(r => (
                  <td key={r.regionId} className="text-right py-1.5 px-1.5 font-medium text-foreground tabular-nums">
                    {m.getValue(r.data, r.regionType)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
