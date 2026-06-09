import React, { useMemo, useState } from 'react';
import { X, Plus, CheckCircle2, MousePointerClick } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import type { Issue, IssueDonorDistrict, IssueDonorState, IssueMetric } from '@/hooks/useIssueDonorData';
import { useVoterDistrictContext, useVoterStateContext } from '@/hooks/useIssueDonorData';
import { getIssuePalette } from '@/lib/issueColors';
import { STATE_ABBREVIATIONS } from '@/lib/us-states';
import { formatNumber, formatPercent } from '@/lib/geoUtils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { useAddToCart, useDataProducts } from '@/queries/useDataProductQueries';

interface IssueRegionSidebarProps {
  open: boolean;
  onClose: () => void;
  selectedIssues: Issue[];
  metric: IssueMetric;
  region: { code: string; type: 'state' | 'district' } | null;
  districtData: IssueDonorDistrict[];
  stateData: IssueDonorState[];
  /** When true, renders bare content (no Sheet wrapper) — for use inside an external bottom sheet. */
  bareContent?: boolean;
  /** When true, renders only a single-line summary (region name + total). */
  compactMode?: boolean;
}

function fmt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString();
}

function getMetricValue(row: { gold_donors: number; silver_donors: number; gold_cell_phones: number; silver_cell_phones: number; total_donors: number }, metric: IssueMetric): number {
  switch (metric) {
    case 'total_donors': return row.total_donors;
    case 'gold_donors': return row.gold_donors;
    case 'silver_donors': return row.silver_donors;
    case 'gold_cell_phones': return row.gold_cell_phones;
    case 'silver_cell_phones': return row.silver_cell_phones;
  }
}

export function IssueRegionSidebar({
  open, onClose, selectedIssues, metric, region, districtData, stateData, bareContent, compactMode,
}: IssueRegionSidebarProps) {
  const isMobile = useIsMobile();

  // Voter context — joined by code from voter_impact tables
  const { data: districtCtx } = useVoterDistrictContext(
    region?.type === 'district' ? region.code : null,
  );
  const { data: stateCtx } = useVoterStateContext(
    region?.type === 'state' ? region.code : null,
  );

  const rowsByIssue = useMemo(() => {
    if (!region) return new Map<string, any>();
    const m = new Map<string, any>();
    if (region.type === 'district') {
      for (const d of districtData) {
        if (d.cd_code === region.code) m.set(d.issue_id, d);
      }
    } else {
      for (const s of stateData) {
        if (s.state_code === region.code) m.set(s.issue_id, s);
      }
    }
    return m;
  }, [region, districtData, stateData]);

  const totalForMetric = useMemo(() => {
    let total = 0;
    for (const issue of selectedIssues) {
      const row = rowsByIssue.get(issue.id);
      if (row) total += getMetricValue(row, metric);
    }
    return total;
  }, [rowsByIssue, selectedIssues, metric]);

  if (!region) return null;

  const title = region.type === 'district'
    ? `District ${region.code}`
    : (STATE_ABBREVIATIONS[region.code] || region.code);

  const subtitle = region.type === 'district'
    ? STATE_ABBREVIATIONS[region.code.split('-')[0]] || region.code.split('-')[0]
    : 'State rollup';

  // Compact peek: single-line summary with title + total for primary issue
  if (compactMode) {
    return (
      <div className="px-5 py-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-display">{subtitle}</p>
          <h2 className="text-base font-display font-bold text-foreground tracking-tight truncate">{title}</h2>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-display">Total</p>
          <p className="text-base font-display font-bold text-foreground tabular-nums">{fmt(totalForMetric)}</p>
        </div>
      </div>
    );
  }

  const body = (
    <>
      <div className="sticky top-0 z-10 bg-[#0e0e0e]/95 backdrop-blur-md border-b border-white/5 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-display">{subtitle}</p>
            <h2 className="text-xl font-display font-bold text-foreground tracking-tight mt-0.5">{title}</h2>
          </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5 space-y-5">
          {/* Drill-in hint — state view only */}
          {region.type === 'state' && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground border border-primary/15 bg-primary/[0.04] rounded-md px-3 py-2">
              <MousePointerClick className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Click the state again to view its congressional districts.</span>
            </div>
          )}

          {/* Last election results — district only */}
          {region.type === 'district' && districtCtx && districtCtx.winner && (
            <div className="border border-white/5 rounded-md p-4 bg-white/[0.02]">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-display mb-3">
                Last Election Results
              </p>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-emerald-400/80 font-display">Winner</p>
                    <p className="text-foreground font-medium truncate">
                      {districtCtx.winner}
                      {districtCtx.winner_party && (
                        <span className="ml-1.5 text-muted-foreground">({districtCtx.winner_party})</span>
                      )}
                    </p>
                  </div>
                  <span className="tabular-nums text-foreground shrink-0">{formatNumber(districtCtx.winner_votes)}</span>
                </div>
                {districtCtx.runner_up && (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-rose-400/70 font-display">Runner-up</p>
                      <p className="text-foreground font-medium truncate">
                        {districtCtx.runner_up}
                        {districtCtx.runner_up_party && (
                          <span className="ml-1.5 text-muted-foreground">({districtCtx.runner_up_party})</span>
                        )}
                      </p>
                    </div>
                    <span className="tabular-nums text-foreground shrink-0">{formatNumber(districtCtx.runner_up_votes)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-display">Margin</span>
                  <span className="tabular-nums text-foreground">
                    {formatNumber(districtCtx.margin_votes)}
                    {districtCtx.margin_pct != null && (
                      <span className="ml-1.5 text-muted-foreground">({formatPercent(districtCtx.margin_pct)})</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Stacked share bar */}
          {selectedIssues.length > 1 && totalForMetric > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-display mb-2">
                Share by issue
              </p>
              <div className="flex h-3 w-full rounded-sm overflow-hidden bg-white/5">
                {selectedIssues.map((issue, idx) => {
                  const row = rowsByIssue.get(issue.id);
                  if (!row) return null;
                  const v = getMetricValue(row, metric);
                  if (!v) return null;
                  const pct = (v / totalForMetric) * 100;
                  return (
                    <div
                      key={issue.id}
                      className="h-full"
                      style={{ width: `${pct}%`, backgroundColor: getIssuePalette(idx).swatch }}
                      title={`${issue.name}: ${pct.toFixed(1)}%`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-issue breakdown */}
          {selectedIssues.map((issue, idx) => {
            const row = rowsByIssue.get(issue.id);
            const palette = getIssuePalette(idx);
            return (
              <div key={issue.id} className="border border-white/5 rounded-md p-4 bg-white/[0.02]">
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette.swatch }} />
                  <h3 className="text-sm font-medium text-foreground">{issue.name}</h3>
                </div>
                {row ? (
                  <div className="grid grid-cols-3 gap-x-3 gap-y-3 text-xs">
                    <Stat label="Gold Donors" value={fmt(row.gold_donors)} accent />
                    <Stat label="Cell Phones" value={fmt(row.gold_cell_phones)} />
                    <Stat label="Addresses" value={fmt(row.gold_addresses)} />
                    <Stat label="Silver Donors" value={fmt(row.silver_donors)} accent />
                    <Stat label="Cell Phones" value={fmt(row.silver_cell_phones)} />
                    <Stat label="Addresses" value={fmt(row.silver_addresses)} />
                    <div className="col-span-3 mt-1 pt-2 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-display">
                        Total Donors
                      </span>
                      <span className="tabular-nums font-medium text-foreground">{fmt(row.total_donors)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data for this region.</p>
                )}
              </div>
            );
          })}

          {/* Add to quote request */}
          <AddToQuoteSection
            region={region}
            issues={selectedIssues.map(i => ({ issue: i, row: rowsByIssue.get(i.id) })).filter(x => x.row)}
          />


      </div>
    </>
  );

  if (bareContent) {
    return <div className="bg-[#0e0e0e] text-foreground">{body}</div>;
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        overlayClassName={isMobile ? undefined : 'bg-black/20'}
        className={
          isMobile
            ? 'h-[85vh] w-full bg-[#0e0e0e] border-t border-white/10 text-foreground p-0 overflow-y-auto'
            : 'w-full sm:max-w-md bg-[#0e0e0e] border-l border-white/10 text-foreground p-0 overflow-y-auto'
        }
      >
        {body}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-[0.1em] ${accent ? 'text-foreground' : 'text-muted-foreground'} font-display`}>
        {label}
      </p>
      <p className="tabular-nums text-sm text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function AddToQuoteSection({
  region,
  issues,
}: {
  region: { code: string; type: 'state' | 'district' };
  issues: { issue: Issue; row: any }[];
}) {
  const { user } = useAuth();
  const { data: products } = useDataProducts();
  const addToCart = useAddToCart();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  if (!user || !products?.length || !issues.length) return null;

  const geoName = region.type === 'district'
    ? `District ${region.code}`
    : (STATE_ABBREVIATIONS[region.code] || region.code);

  const recordsFor = (row: any, sourceField?: string | null): number => {
    if (!sourceField) return 0;
    return Number(row?.[sourceField]) || 0;
  };

  const handleAdd = async (issueId: string, issueName: string, productId: string, recordCount: number) => {
    const key = `${issueId}:${productId}`;
    try {
      await addToCart.mutateAsync({
        product_id: productId,
        geo_type: region.type,
        geo_code: region.code,
        geo_name: geoName,
        record_count: recordCount,
        issue_id: issueId,
        issue_name: issueName,
      });
      setAddedIds(prev => new Set(prev).add(key));
      setTimeout(() => {
        setAddedIds(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 2000);
    } catch { /* handled by mutation */ }
  };

  return (
    <div className="border border-primary/20 rounded-md p-4 bg-primary/[0.04] space-y-4">
      <p className="text-[10px] uppercase tracking-[0.15em] text-primary font-display">
        Add to Quote Request
      </p>
      {issues.map(({ issue, row }) => (
        <div key={issue.id} className="space-y-2">
          {issues.length > 1 && (
            <p className="text-[11px] font-medium text-foreground">{issue.name}</p>
          )}
          <div className="space-y-2">
            {products.map(p => {
              const key = `${issue.id}:${p.id}`;
              const added = addedIds.has(key);
              const records = recordsFor(row, (p as any).source_field);
              return (
                <button
                  key={key}
                  onClick={() => handleAdd(issue.id, issue.name, p.id, records)}
                  disabled={addToCart.isPending || added}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all border ${
                    added
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-white/[0.02] text-foreground hover:bg-primary/10 border-white/[0.06] hover:border-primary/30'
                  }`}
                >
                  <span className="truncate text-left flex-1">{p.name}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">{fmt(records)}</span>
                  {added ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Quote-only — no charge. Submit your request and our team will follow up with pricing and delivery.
      </p>
    </div>
  );
}
