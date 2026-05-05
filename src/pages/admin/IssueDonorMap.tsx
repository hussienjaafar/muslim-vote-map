import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Map as MapIcon, Upload, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { IssueSelector } from '@/components/issue-donor/IssueSelector';
import { IssueLegend } from '@/components/issue-donor/IssueLegend';
import { IssueMap } from '@/components/issue-donor/IssueMap';
import { IssueRegionSidebar } from '@/components/issue-donor/IssueRegionSidebar';
import { IssueRegionSearch } from '@/components/issue-donor/IssueRegionSearch';
import { ManageIssuesDrawer } from '@/components/issue-donor/ManageIssuesDrawer';
import { IssueDonorImport } from '@/components/admin/IssueDonorImport';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  useIssues, useIssueDonorDistricts, useIssueDonorStates,
  useAllStatesDirectory, useAllDistrictsDirectory,
  type IssueMetric,
} from '@/hooks/useIssueDonorData';
import type { ScaleMode } from '@/lib/issueColors';

const METRIC_OPTIONS: { key: IssueMetric; label: string; short: string }[] = [
  { key: 'total_donors', label: 'Total Donors', short: 'Total' },
  { key: 'gold_donors', label: 'Gold Donors', short: 'Gold' },
  { key: 'silver_donors', label: 'Silver Donors', short: 'Silver' },
  { key: 'gold_cell_phones', label: 'Gold Cell Phones', short: 'G. Cells' },
  { key: 'silver_cell_phones', label: 'Silver Cell Phones', short: 'S. Cells' },
];

export default function IssueDonorMap({ isAdminView = false }: { isAdminView?: boolean } = {}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: allIssues, isLoading: issuesLoading } = useIssues();
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [metric, setMetric] = useState<IssueMetric>('total_donors');
  const [region, setRegion] = useState<{ code: string; type: 'state' | 'district' } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [maxValue, setMaxValue] = useState(0);
  const [scaleStops, setScaleStops] = useState<number[]>([]);
  const [scaleMode, setScaleMode] = useState<ScaleMode>(() => {
    if (typeof window === 'undefined') return 'quantile';
    const saved = localStorage.getItem('issueMap.scaleMode');
    return (saved === 'linear' || saved === 'log' || saved === 'quantile') ? saved : 'quantile';
  });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [issueSheetOpen, setIssueSheetOpen] = useState(false);
  const [metricRowCollapsed, setMetricRowCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('issueMap.metricRowCollapsed') === '1';
  });
  const [hintDismissed, setHintDismissed] = useState(false);

  // Mobile bottom-sheet snap state (mirrors Voter Map)
  // Only 2 snap points now: half + nearly-full. Sheet is hidden until a region is selected.
  const SNAP_POINTS = [0.5 as const, 0.9 as const];
  const [activeSnapPoint, setActiveSnapPoint] = useState<string | number | null>(SNAP_POINTS[0]);

  // When a region is selected on mobile, expand sheet to half
  useEffect(() => {
    if (!isMobile) return;
    if (region) setActiveSnapPoint(SNAP_POINTS[0]); // half
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, isMobile]);

  useEffect(() => {
    try { localStorage.setItem('issueMap.metricRowCollapsed', metricRowCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [metricRowCollapsed]);

  useEffect(() => {
    try { localStorage.setItem('issueMap.scaleMode', scaleMode); } catch { /* ignore */ }
  }, [scaleMode]);

  // Auto-pick first issue when data loads
  useEffect(() => {
    if (!selectedIssueIds.length && allIssues && allIssues.length > 0) {
      setSelectedIssueIds([allIssues[0].id]);
    }
  }, [allIssues, selectedIssueIds.length]);

  const { data: districtData = [] } = useIssueDonorDistricts(selectedIssueIds);
  const { data: stateData = [] } = useIssueDonorStates(selectedIssueIds);
  const { data: allStatesDir } = useAllStatesDirectory();
  const { data: allDistrictsDir } = useAllDistrictsDirectory();

  const selectedIssues = useMemo(
    () => selectedIssueIds.map(id => allIssues?.find(i => i.id === id)).filter(Boolean) as NonNullable<typeof allIssues>[number][],
    [selectedIssueIds, allIssues],
  );

  return (
    <div className="fixed top-16 left-0 md:left-64 right-0 bottom-0 bg-[#0e0e0e] text-foreground flex flex-col">
      {/* Top bar — single row on desktop; 2-row stacked on mobile */}
      <header
        className="shrink-0 z-20 bg-[#131313]/80 backdrop-blur-xl border-b border-white/5"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Row 1 — back + title + actions */}
        <div className="px-3 sm:px-6 h-14 flex items-center gap-2 sm:gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(isAdminView ? '/admin' : '/home')}
            className="gap-1.5 text-muted-foreground hover:text-foreground px-2 sm:px-3"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{isAdminView ? 'Admin' : 'Home'}</span>
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <MapIcon className="h-4 w-4 text-blue-400 shrink-0" />
            <h1 className="text-sm font-display font-bold tracking-tight truncate">Issue Map</h1>
            {isAdminView && (
              <span className="hidden lg:inline text-[10px] uppercase tracking-[0.15em] text-amber-400 ml-2 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 shrink-0">
                Admin
              </span>
            )}
          </div>

          <div className="flex-1" />

          {/* Region search */}
          <IssueRegionSearch
            statesData={allStatesDir ?? null}
            districtsData={allDistrictsDir ?? null}
            onSelect={(code, type) => setRegion({ code, type })}
          />

          {/* Upload button — admin only */}
          {isAdminView && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUploadOpen(true)}
              className="gap-1.5 border-white/10 bg-[#1c1c1e]/80 text-muted-foreground hover:text-foreground hover:bg-white/5 px-2 sm:px-3 min-h-[40px] sm:min-h-0"
              aria-label="Upload data"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Upload Data</span>
            </Button>
          )}

          {/* Desktop metric toggle (≥md) */}
          <div className="hidden md:flex gap-1 bg-[#1c1c1e]/80 backdrop-blur-md rounded-lg border border-white/8 p-1 overflow-x-auto max-w-[60vw]">
            {METRIC_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setMetric(opt.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  metric === opt.key
                    ? 'bg-blue-600 text-white'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
              >
                <span className="font-display">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Row 2 — mobile metric scroller (<md). Collapsible to reclaim space. */}
        <div className="md:hidden px-3 pb-2 -mt-1">
          {metricRowCollapsed ? (
            <button
              onClick={() => setMetricRowCollapsed(false)}
              className="w-full flex items-center justify-between gap-2 bg-[#1c1c1e]/80 backdrop-blur-md rounded-lg border border-white/10 px-3 py-1.5 min-h-[36px]"
              aria-label="Expand metric selector"
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">Metric</span>
              <span className="text-xs font-display font-semibold text-foreground flex-1 text-left truncate">
                {METRIC_OPTIONS.find(o => o.key === metric)?.label}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          ) : (
            <div className="flex items-stretch gap-1">
              <div className="flex gap-1 bg-[#1c1c1e]/80 backdrop-blur-md rounded-lg border border-white/8 p-1 overflow-x-auto snap-x snap-mandatory flex-1">
                {METRIC_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setMetric(opt.key)}
                    className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap snap-start min-h-[40px] ${
                      metric === opt.key
                        ? 'bg-blue-600 text-white'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                    }`}
                  >
                    <span className="font-display">{opt.short}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setMetricRowCollapsed(true)}
                className="shrink-0 px-2 rounded-lg border border-white/8 bg-[#1c1c1e]/80 text-muted-foreground hover:text-foreground"
                aria-label="Collapse metric selector"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Map area */}
      <main className="relative flex-1">
        {issuesLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="h-32 w-32 rounded-full" />
          </div>
        ) : (
          <>
            <IssueMap
              selectedIssues={selectedIssues}
              metric={metric}
              districtData={districtData}
              stateData={stateData}
              selectedRegion={region}
              onRegionSelect={(code, type) => setRegion({ code, type })}
              onMaxValueChange={setMaxValue}
              scaleMode={scaleMode}
              onScaleChange={({ stops, max }) => { setScaleStops(stops); setMaxValue(max); }}
            />

            {/* Top-left issue selector — desktop card; mobile pill that opens sheet */}
            <div className="absolute top-3 left-3 z-20 max-w-[calc(100vw-1.5rem)]">
              {isMobile ? (
                <IssueSelector
                  allIssues={allIssues ?? []}
                  selectedIds={selectedIssueIds}
                  onChange={setSelectedIssueIds}
                  onManage={() => setManageOpen(true)}
                  compact
                  onExpand={() => setIssueSheetOpen(true)}
                />
              ) : (
                <IssueSelector
                  allIssues={allIssues ?? []}
                  selectedIds={selectedIssueIds}
                  onChange={setSelectedIssueIds}
                  onManage={() => setManageOpen(true)}
                />
              )}
            </div>

            {/* Legend — desktop bottom-left; mobile bottom-right (compact), hides smoothly when sheet expands */}
            {!isMobile && (
              <div className="absolute z-10 bottom-6 left-4">
                <IssueLegend
                  selectedIssues={selectedIssues}
                  metric={metric}
                  maxValue={maxValue}
                  scaleMode={scaleMode}
                  onScaleModeChange={setScaleMode}
                  stops={scaleStops}
                />
              </div>
            )}
            {isMobile && (
              <div
                className="absolute z-10 right-2 transition-opacity duration-200"
                style={{
                  bottom: region ? 'calc(50dvh + 12px + env(safe-area-inset-bottom))' : 'calc(12px + env(safe-area-inset-bottom))',
                  opacity: region ? 0 : 1,
                  pointerEvents: region ? 'none' : 'auto',
                }}
              >
                <IssueLegend
                  selectedIssues={selectedIssues}
                  metric={metric}
                  maxValue={maxValue}
                  scaleMode={scaleMode}
                  stops={scaleStops}
                  compact
                />
              </div>
            )}

            {/* Mobile hint pill — only when nothing selected, replaces the empty sheet peek */}
            {isMobile && !region && !hintDismissed && selectedIssues.length > 0 && (
              <button
                onClick={() => setHintDismissed(true)}
                className="absolute z-10 left-1/2 -translate-x-1/2 bg-[#1c1c1e]/90 backdrop-blur-xl border border-white/10 rounded-full px-3 py-1.5 text-[11px] font-display text-muted-foreground shadow-lg"
                style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
                aria-label="Dismiss hint"
              >
                Tap a region to explore
              </button>
            )}

            {/* Empty state */}
            {(!allIssues || allIssues.length === 0) && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-[#1c1c1e]/90 border border-white/10 rounded-lg p-6 max-w-md text-center pointer-events-auto">
                  <h2 className="font-display text-lg text-foreground mb-2">No issues yet</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    Import a multi-sheet donor file from the Data tab to get started.
                  </p>
                  <Button onClick={() => navigate('/admin/data')} variant="secondary" size="sm">
                    Go to Data Import
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Region detail — desktop sheet OR mobile persistent bottom sheet */}
      {!isMobile && (
        <IssueRegionSidebar
          open={!!region}
          onClose={() => setRegion(null)}
          selectedIssues={selectedIssues}
          metric={metric}
          region={region}
          districtData={districtData}
          stateData={stateData}
        />
      )}

      {isMobile && region && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] rounded-t-[10px] border-t border-white/10 bg-[#0e0e0e] flex flex-col transition-[max-height] duration-300 ease-in-out animate-in slide-in-from-bottom"
          style={{
            maxHeight: activeSnapPoint === SNAP_POINTS[1] ? '90dvh' : '50dvh',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <button
            className="w-full flex flex-col items-center justify-center py-2.5 cursor-grab active:cursor-grabbing min-h-[36px]"
            onClick={() => {
              const idx = SNAP_POINTS.indexOf(activeSnapPoint as any);
              setActiveSnapPoint(SNAP_POINTS[(idx + 1) % SNAP_POINTS.length]);
            }}
            aria-label="Toggle sheet height"
          >
            <div className="h-1.5 w-12 rounded-full bg-muted-foreground/40" />
          </button>
          <div className="overflow-y-auto flex-1">
            <IssueRegionSidebar
              open
              onClose={() => setRegion(null)}
              selectedIssues={selectedIssues}
              metric={metric}
              region={region}
              districtData={districtData}
              stateData={stateData}
              bareContent
              compactMode={false}
            />
          </div>
        </div>
      )}

      {/* Mobile issue picker sheet */}
      {isMobile && (
        <Sheet open={issueSheetOpen} onOpenChange={setIssueSheetOpen}>
          <SheetContent
            side="bottom"
            className="bg-[#0e0e0e] border-t border-white/10 text-foreground p-4 max-h-[80vh] overflow-y-auto"
          >
            <IssueSelector
              allIssues={allIssues ?? []}
              selectedIds={selectedIssueIds}
              onChange={(ids) => { setSelectedIssueIds(ids); }}
              onManage={() => { setIssueSheetOpen(false); setManageOpen(true); }}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Manage drawer */}
      <ManageIssuesDrawer
        open={manageOpen}
        onOpenChange={setManageOpen}
        issues={allIssues ?? []}
      />

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto bg-[#131313] border-white/10 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-display">Upload Issue Donor Data</DialogTitle>
            <DialogDescription>
              Upload a multi-sheet XLSX file. Each sheet becomes an issue.
            </DialogDescription>
          </DialogHeader>
          <IssueDonorImport />
        </DialogContent>
      </Dialog>
    </div>
  );
}
