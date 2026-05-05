import React from 'react';
import type { Issue, IssueMetric } from '@/hooks/useIssueDonorData';
import { getIssuePalette, type ScaleMode } from '@/lib/issueColors';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const METRIC_LABELS: Record<IssueMetric, string> = {
  total_donors: 'Total Donors',
  gold_donors: 'Gold Donors',
  silver_donors: 'Silver Donors',
  gold_cell_phones: 'Gold Cell Phones',
  silver_cell_phones: 'Silver Cell Phones',
};

interface IssueLegendProps {
  selectedIssues: Issue[];
  metric: IssueMetric;
  maxValue: number;
  scaleMode?: ScaleMode;
  onScaleModeChange?: (mode: ScaleMode) => void;
  stops?: number[];
  compact?: boolean;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

const MODE_LABELS: Record<ScaleMode, { label: string; tip: string }> = {
  quantile: { label: 'Quantile', tip: 'Equal-rank bins. Best when one region (e.g. CA) dwarfs the rest.' },
  linear: { label: 'Linear', tip: 'Linear scale capped at the 95th percentile. Shows magnitude.' },
  log: { label: 'Log', tip: 'Log10 scale. Smooths long-tail distributions.' },
};

export function IssueLegend({
  selectedIssues, metric, maxValue,
  scaleMode = 'quantile', onScaleModeChange, stops,
  compact,
}: IssueLegendProps) {
  if (!selectedIssues.length) return null;

  const isMulti = selectedIssues.length > 1;
  const palette = getIssuePalette(0);
  const showStops = stops && stops.length === palette.ramp.length;

  // Compact (mobile) variant — drops the scale-mode toggles and shrinks chrome
  if (compact) {
    return (
      <div className="bg-[#1c1c1e]/90 backdrop-blur-[20px] rounded-lg border border-white/10 px-2.5 py-1.5 shadow-xl min-w-[180px] max-w-[260px]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground font-display truncate">
            {METRIC_LABELS[metric]}
          </span>
        </div>
        {isMulti ? (
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {selectedIssues.map((issue, idx) => {
              const p = getIssuePalette(idx);
              return (
                <div key={issue.id} className="flex items-center gap-1 min-w-0">
                  <span className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: p.swatch }} />
                  <span className="text-[10px] text-foreground truncate max-w-[80px]">{issue.name}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div
              className="h-1.5 rounded-sm w-full"
              style={{ background: `linear-gradient(to right, ${palette.ramp.join(', ')})` }}
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[9px] text-muted-foreground tabular-nums">0</span>
              <span className="text-[9px] text-muted-foreground tabular-nums">{formatNum(maxValue / 2)}</span>
              <span className="text-[9px] text-muted-foreground tabular-nums">{formatNum(maxValue)}</span>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-[#1c1c1e]/90 backdrop-blur-[20px] rounded-lg border border-white/10 p-3 shadow-xl min-w-[220px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground font-display">
          {METRIC_LABELS[metric]}
        </span>
        {onScaleModeChange && (
          <TooltipProvider delayDuration={300}>
            <div className="flex gap-0.5 bg-black/30 rounded p-0.5">
              {(Object.keys(MODE_LABELS) as ScaleMode[]).map(m => (
                <Tooltip key={m}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onScaleModeChange(m)}
                      className={`px-1.5 py-0.5 text-[9px] font-display uppercase tracking-wider rounded transition-colors ${
                        scaleMode === m
                          ? 'bg-blue-600 text-white'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                      }`}
                    >
                      {MODE_LABELS[m].label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px] max-w-[200px]">
                    {MODE_LABELS[m].tip}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        )}
      </div>

      {isMulti ? (
        <>
          <div className="space-y-1.5">
            {selectedIssues.map((issue, idx) => {
              const p = getIssuePalette(idx);
              return (
                <div key={issue.id} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-sm shrink-0"
                    style={{ backgroundColor: p.swatch }}
                  />
                  <span className="text-xs text-foreground truncate">{issue.name}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 pt-2 border-t border-white/5 text-[10px] text-muted-foreground leading-snug">
            Colored by dominant issue · intensity by {scaleMode} scale.
          </p>
        </>
      ) : (
        <>
          <div
            className="h-2 rounded-sm w-full"
            style={{
              background: `linear-gradient(to right, ${palette.ramp.join(', ')})`,
            }}
          />
          {showStops ? (
            <div className="flex items-center justify-between mt-1.5 gap-1">
              {[stops![0], stops![2], stops![4], stops![6], stops![7]].map((v, i, arr) => (
                <span key={i} className="text-[9px] text-muted-foreground tabular-nums">
                  {formatNum(v)}{i === arr.length - 1 && maxValue > stops![7] ? '+' : ''}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-muted-foreground tabular-nums">0</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{formatNum(maxValue / 2)}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{formatNum(maxValue)}</span>
            </div>
          )}
          {showStops && maxValue > stops![7] && (
            <p className="mt-1.5 text-[9px] text-muted-foreground leading-snug">
              Top region: <span className="text-foreground tabular-nums">{formatNum(maxValue)}</span>
              {scaleMode === 'linear' && ' (capped above P95)'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
