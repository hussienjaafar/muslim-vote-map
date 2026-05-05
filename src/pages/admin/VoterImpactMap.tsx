import React, { useState, useMemo, useCallback, Suspense, lazy, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useStatesData, useDistrictsData, useAllDistricts } from '@/hooks/useVoterData';
import type { MetricType } from '@/store/mapStore';
import { colorScales, metricLabels, type ColorStop } from '@/lib/colorScales';
import { MapControls } from '@/components/voter-impact/MapControls';
import { RegionSidebar, type ComparisonItem } from '@/components/voter-impact/RegionSidebar';
import { VoterImpactMapLegend } from '@/components/voter-impact/MapLegend';
import { DataCartIcon } from '@/components/voter-impact/DataCartIcon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

import { DataCart } from '@/components/voter-impact/DataCart';
import { RegionSearch } from '@/components/voter-impact/RegionSearch';
import { useCartItems } from '@/queries/useDataProductQueries';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { ArrowLeft, Loader2, AlertTriangle, RefreshCw, User, LogOut } from 'lucide-react';
import { GuidedTour } from '@/components/tour/GuidedTour';
import { MAP_TOUR_STEPS, HOME_TOUR_STEPS } from '@/components/tour/tourSteps';
import { useTourStatus } from '@/hooks/useTourStatus';

const ImpactMap = lazy(() => import('@/components/voter-impact/ImpactMap'));

// #17: Dynamic header titles per metric
const MAP_TITLES: Record<MetricType, string> = {
  population: 'Muslim Voter Population Map',
  donors: 'Muslim Voter Donors Map',
  activists: 'Muslim Voter Activists Map',
  turnout: 'Muslim Voter Turnout Map',
  impact: 'Muslim Voter Impact Map',
};

// Mobile-friendly short titles to avoid header truncation on small screens
const MAP_TITLES_SHORT: Record<MetricType, string> = {
  population: 'Population',
  donors: 'Donors',
  activists: 'Activists',
  turnout: 'Turnout',
  impact: 'Impact',
};

export default function VoterImpactMap() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const [activeMetric, setActiveMetric] = useState<MetricType>('population');
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(searchParams.get('region'));
  const [selectedRegionType, setSelectedRegionType] = useState<'state' | 'district' | null>(
    (searchParams.get('type') as 'state' | 'district') || null
  );
  const [comparisonItems, setComparisonItems] = useState<ComparisonItem[]>([]);
  const [isDistrictView, setIsDistrictView] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const { completeTour } = useTourStatus();
  const [showMapTour, setShowMapTour] = useState(false);

  // Detect tour=1 param from Home page handoff
  useEffect(() => {
    if (searchParams.get('tour') === '1') {
      const timer = setTimeout(() => setShowMapTour(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Mobile bottom sheet snap points — sheet is hidden until a region is selected,
  // so we only need half + nearly-full positions.
  const SNAP_POINTS = [0.5 as const, 0.9 as const];
  const [activeSnapPoint, setActiveSnapPoint] = useState<string | number | null>(SNAP_POINTS[0]);

  // #2: Error handling
  const { data: statesData, error: statesError, refetch: refetchStates } = useStatesData();
  const { data: allDistricts, error: districtsError, refetch: refetchDistricts } = useAllDistricts();
  const selectedStateCode = selectedRegionType === 'state' ? selectedRegionId : null;
  const { data: stateDistricts } = useDistrictsData(selectedStateCode);
  const { data: cartItems } = useCartItems();

  // #16: Saved regions for map indicators
  const { data: savedRegions } = useQuery({
    queryKey: ['saved-regions-map', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('saved_regions')
        .select('region_code, region_type')
        .eq('user_id', user.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const savedRegionCodes = useMemo(() =>
    new Set((savedRegions ?? []).map(r => r.region_code)),
    [savedRegions]
  );

  const dataError = statesError || districtsError;

  // URL deep-linking — preserve tour param during handoff
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const tourParam = params.get('tour');
    if (selectedRegionId) {
      const next = new URLSearchParams({ region: selectedRegionId, type: selectedRegionType || 'state' });
      if (tourParam) next.set('tour', tourParam);
      setSearchParams(next);
    } else {
      if (tourParam) {
        setSearchParams({ tour: tourParam });
      } else {
        setSearchParams({});
      }
    }
  }, [selectedRegionId, selectedRegionType]);

  // Correct state data by aggregating from districts when needed
  const correctedStatesData = useMemo(() => {
    if (!statesData || !allDistricts) return statesData;
    return statesData.map(state => {
      const stateDistricts = allDistricts.filter(d => d.state_code === state.state_code);
      if (stateDistricts.length === 0) return state;

      // Aggregate key metrics from districts
      const sumField = (field: string) => stateDistricts.reduce((sum, d) => sum + (Number((d as any)[field]) || 0), 0);

      const districtVoters = sumField('muslim_voters');
      const districtDonors = sumField('donor_gold_count') + sumField('donor_silver_count');
      const districtActivists = sumField('political_activists');
      const districtCells = sumField('cell_phones');
      const districtHouseholds = sumField('households');
      const districtRegistered = sumField('muslim_registered');
      const districtVoted2024 = sumField('voted_2024');
      const districtVoted2022 = sumField('voted_2022');
      const districtPrimary2024 = sumField('primary_2024');
      const districtPrimary2022 = sumField('primary_2022');

      // Build corrected state — prefer district aggregates when state has 0 or stale data
      const corrected = { ...state };

      // Correct muslim_voters
      if (state.muslim_voters === 0 && districtVoters > 0) {
        corrected.muslim_voters = districtVoters;
      } else if (state.muslim_voters > 0 && districtVoters > 0) {
        const diff = Math.abs(state.muslim_voters - districtVoters) / Math.max(state.muslim_voters, districtVoters);
        if (diff > 0.9) corrected.muslim_voters = districtVoters;
      }

      // Always aggregate these from districts if the state value is 0/null
      if (districtDonors > 0) {
        corrected.political_donors = districtDonors;
        corrected.donor_gold_count = sumField('donor_gold_count');
        corrected.donor_silver_count = sumField('donor_silver_count');
      }
      if (!state.political_activists && districtActivists > 0) corrected.political_activists = districtActivists;
      if (!state.cell_phones && districtCells > 0) corrected.cell_phones = districtCells;
      if (!state.households && districtHouseholds > 0) corrected.households = districtHouseholds;
      if (!state.registered && districtRegistered > 0) corrected.registered = districtRegistered;
      if (!state.vote_2024 && districtVoted2024 > 0) corrected.vote_2024 = districtVoted2024;
      if (!state.vote_2022 && districtVoted2022 > 0) corrected.vote_2022 = districtVoted2022;
      if (!state.primary_2024 && districtPrimary2024 > 0) corrected.primary_2024 = districtPrimary2024;
      if (!state.primary_2022 && districtPrimary2022 > 0) corrected.primary_2022 = districtPrimary2022;

      // Compute turnout percentages from aggregated data
      if (corrected.vote_2024 && corrected.registered) {
        corrected.vote_2024_pct = Number(((corrected.vote_2024 / corrected.registered) * 100).toFixed(1));
      }
      if (corrected.vote_2022 && corrected.registered) {
        corrected.vote_2022_pct = Number(((corrected.vote_2022 / corrected.registered) * 100).toFixed(1));
      }

      return corrected;
    });
  }, [statesData, allDistricts]);

  // Detect if donors data is a duplicate of voters (donors === voters for all states)
  const donorsAreDuplicate = useMemo(() => {
    if (!correctedStatesData || correctedStatesData.length === 0) return false;
    return correctedStatesData.every(s =>
      (s.political_donors ?? 0) === 0 || s.political_donors === s.muslim_voters
    );
  }, [correctedStatesData]);

  const hiddenMetrics: MetricType[] = donorsAreDuplicate ? ['donors'] : [];

  // Compute legend stops for district view — shows selected state's actual value range
  const localDistrictColorStops = useMemo((): ColorStop[] | null => {
    if (!isDistrictView || !selectedStateCode || !stateDistricts) return null;

    const metricFieldMap: Record<MetricType, string> = {
      population: 'muslim_voters',
      turnout: 'actual_turnout_pct',
      activists: 'political_activists',
      donors: 'total_donors',
      impact: 'impactScore',
    };
    const metricField = metricFieldMap[activeMetric];
    if (!metricField) return null;

    const values = stateDistricts.map(d => {
      if (metricField === 'total_donors') {
        return (d.donor_gold_count ?? 0) + (d.donor_silver_count ?? 0);
      }
      return Number((d as any)[metricField] ?? 0);
    }).filter(v => v > 0);
    if (values.length === 0) return null;

    const localMin = Math.min(...values);
    const localMax = Math.max(...values);
    if (localMin === localMax) return null;

    // Build legend stops that show actual values mapped to the metric's colors
    const globalStops = colorScales[activeMetric];
    return globalStops.map((stop, i) => {
      const t = globalStops.length > 1 ? i / (globalStops.length - 1) : 0;
      const val = localMin + t * (localMax - localMin);
      return {
        value: t * 100, // Normalized 0-100 to match the district color expression
        color: stop.color,
        label: activeMetric === 'turnout'
          ? `${val.toFixed(0)}%`
          : val >= 1000 ? `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}K` : Math.round(val).toLocaleString(),
      };
    });
  }, [isDistrictView, selectedStateCode, stateDistricts, activeMetric]);

  const handleRegionSelect = useCallback((regionId: string, type: 'state' | 'district') => {
    if (!regionId) {
      setSelectedRegionId(null);
      setSelectedRegionType(null);
      if (isMobile) setActiveSnapPoint(SNAP_POINTS[0]); // Reset to half (sheet will be hidden anyway)
    } else {
      setSelectedRegionId(regionId);
      setSelectedRegionType(type);
      if (isMobile) setActiveSnapPoint(SNAP_POINTS[0]); // Snap to half on select
    }
  }, [isMobile]);

  // #4: Search select handler — also flies map to region
  const handleSearchSelect = useCallback((regionId: string, type: 'state' | 'district') => {
    handleRegionSelect(regionId, type);
    // The ImpactMap component handles flyTo internally on selection change
  }, [handleRegionSelect]);

  const handleAddToCompare = useCallback((item: ComparisonItem) => {
    setComparisonItems(prev => {
      if (prev.length >= 4 || prev.some(c => c.regionId === item.regionId)) return prev;
      return [...prev, item];
    });
  }, []);

  const handleRemoveFromCompare = useCallback((id: string) => {
    setComparisonItems(prev => prev.filter(c => c.regionId !== id));
  }, []);

  // Current region data — #14: always compute parent state for districts
  const currentStateData = useMemo(() => {
    if (selectedRegionType === 'state') {
      return correctedStatesData?.find(s => s.state_code === selectedRegionId);
    }
    if (selectedRegionType === 'district' && selectedRegionId) {
      const district = allDistricts?.find(d => d.cd_code === selectedRegionId);
      if (district) {
        return correctedStatesData?.find(s => s.state_code === district.state_code);
      }
    }
    return undefined;
  }, [correctedStatesData, selectedRegionId, selectedRegionType, allDistricts]);

  const currentDistrictData = useMemo(() =>
    stateDistricts?.find(d => d.cd_code === (selectedRegionType === 'district' ? selectedRegionId : null))
    ?? allDistricts?.find(d => d.cd_code === selectedRegionId),
    [stateDistricts, allDistricts, selectedRegionId, selectedRegionType]
  );

  const regionDataForProducts = useMemo(() => {
    const d = selectedRegionType === 'district' ? currentDistrictData : currentStateData;
    return {
      muslimVoters: d?.muslim_voters ?? 0,
      cellPhones: d?.cell_phones ?? 0,
      households: d?.households ?? 0,
      politicalActivists: (d as any)?.political_activists ?? 0,
      politicalDonors: (d as any)?.political_donors ?? 0,
      donorPlatinumCount: d?.donor_platinum_count ?? 0,
      donorGoldCount: d?.donor_gold_count ?? 0,
      donorSilverCount: d?.donor_silver_count ?? 0,
    };
  }, [currentStateData, currentDistrictData, selectedRegionType]);

  const handleCloseSidebar = useCallback(() => {
    setSelectedRegionId(null);
    setSelectedRegionType(null);
  }, []);

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sidebarContent = selectedRegionId ? (
    <RegionSidebar
      regionId={selectedRegionId}
      regionType={selectedRegionType}
      stateData={currentStateData}
      districtData={currentDistrictData}
      activeMetric={activeMetric}
      comparisonItems={comparisonItems}
      onClose={handleCloseSidebar}
      onAddToCompare={handleAddToCompare}
      onRemoveFromCompare={handleRemoveFromCompare}
      onClearCompare={() => setComparisonItems([])}
      className={isMobile ? 'w-full border-l-0 h-auto' : undefined}
      allStatesData={correctedStatesData}
      allDistrictsData={allDistricts}
    />
  ) : null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex flex-col animate-fade-in" style={{ background: 'hsl(var(--map-bg))' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 border-b border-white/10 bg-[hsl(0_0%_7.5%)]/40 backdrop-blur-xl z-nav-bar h-14 shadow-[0_0_20px_hsl(var(--primary)/0.05)]" style={{ paddingTop: 'max(0rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          {isAdmin ? (
            <button onClick={() => navigate('/admin')} className="text-muted-foreground hover:text-blue-400 transition-colors duration-300 shrink-0 flex items-center gap-1.5 font-display text-xs uppercase tracking-widest">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          ) : (
            <button onClick={() => navigate('/home')} className="text-muted-foreground hover:text-blue-400 transition-colors duration-300 shrink-0 flex items-center gap-1.5 font-display text-xs uppercase tracking-widest">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Home</span>
            </button>
          )}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
            </span>
            <h1 className="text-sm font-bold font-display text-white tracking-tighter truncate">
              <span className="md:hidden">{MAP_TITLES_SHORT[activeMetric]}</span>
              <span className="hidden md:inline">{MAP_TITLES[activeMetric]}</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <div data-tour="region-search">
            <RegionSearch
              statesData={correctedStatesData ?? null}
              districtsData={allDistricts ?? null}
              onSelect={handleSearchSelect}
            />
          </div>
          <div data-tour="cart-icon">
            <DataCartIcon count={cartItems?.length ?? 0} onClick={() => setCartOpen(true)} />
          </div>
          {!isAdmin && user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                  <Avatar className="h-8 w-8 border border-white/10 shadow-[0_0_8px_hsl(var(--primary)/0.15)] cursor-pointer">
                    <AvatarFallback className="bg-muted text-xs font-display font-bold text-muted-foreground">
                      {user.email?.charAt(0).toUpperCase() ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="surgical-glass min-w-[160px]">
                <DropdownMenuItem onClick={() => navigate('/account')} className="cursor-pointer gap-2">
                  <User className="w-4 h-4" /> My Account
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate('/login');
                  }}
                  className="cursor-pointer gap-2 text-red-400 focus:text-red-400"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Map + Controls + Sidebar */}
      <div className="flex-1 flex relative min-h-0">
        <div className="flex-1 relative min-h-0" data-tour="map-canvas">
          {/* MapControls — desktop: top-left; mobile: bottom bar above sheet */}
          {!isMobile && (
            <div className="absolute top-2 sm:top-3 left-2 sm:left-3 z-10" data-tour="metric-controls">
              <MapControls activeMetric={activeMetric} onMetricChange={setActiveMetric} hiddenMetrics={hiddenMetrics} />
            </div>
          )}

          {/* #2: Error state overlay */}
          {dataError && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-card/95 backdrop-blur-sm rounded-lg border border-destructive/30 p-6 text-center max-w-xs">
              <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-2">Failed to load data</p>
              <p className="text-xs text-muted-foreground mb-4">
                {(statesError as Error)?.message || (districtsError as Error)?.message || 'An error occurred'}
              </p>
              <Button size="sm" onClick={() => { refetchStates(); refetchDistricts(); }}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Retry
              </Button>
            </div>
          )}

          <Suspense fallback={
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ background: 'hsl(var(--map-bg))' }}>
              <div className="space-y-3 w-full max-w-md px-8">
                <div className="h-4 w-3/4 mx-auto rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 mx-auto rounded bg-muted/60 animate-pulse" />
                <div className="mt-6 aspect-[16/9] w-full rounded-lg bg-muted/30 animate-pulse" />
              </div>
            </div>
          }>
            <ImpactMap
              states={correctedStatesData ?? null}
              districts={allDistricts ?? null}
              activeMetric={activeMetric}
              localDistrictColorStops={localDistrictColorStops}
              selectedRegion={selectedRegionId}
              selectedRegionType={selectedRegionType}
              isDistrictView={isDistrictView}
              onRegionSelect={handleRegionSelect}
              onDistrictViewChange={setIsDistrictView}
              savedRegionCodes={savedRegionCodes}
              mobileSheetExpanded={isMobile && !!selectedRegionId}
            />
          </Suspense>

          {/* Legend — desktop bottom-left; mobile bottom-right (compact), fades out smoothly when sheet appears */}
          {!isMobile && (
            <div className="absolute z-10 bottom-4 left-4">
              <VoterImpactMapLegend
                activeMetric={activeMetric}
                localColorStops={localDistrictColorStops}
                isDistrictView={isDistrictView}
                hasDistrictField={true}
              />
            </div>
          )}
          {isMobile && (
            <div
              className="absolute z-10 right-2 transition-opacity duration-200"
              style={{
                bottom: selectedRegionId ? 'calc(50dvh + 12px + env(safe-area-inset-bottom))' : 'calc(60px + env(safe-area-inset-bottom))',
                opacity: selectedRegionId ? 0 : 1,
                pointerEvents: selectedRegionId ? 'none' : 'auto',
              }}
            >
              <VoterImpactMapLegend
                activeMetric={activeMetric}
                localColorStops={localDistrictColorStops}
                isDistrictView={isDistrictView}
                hasDistrictField={true}
                compact
              />
            </div>
          )}

          {/* Mobile MapControls — anchored at bottom; hides when a region is selected */}
          {isMobile && (
            <div
              className="absolute z-10 left-2 right-2 transition-opacity duration-200"
              style={{
                bottom: 'calc(12px + env(safe-area-inset-bottom))',
                opacity: selectedRegionId ? 0 : 1,
                pointerEvents: selectedRegionId ? 'none' : 'auto',
              }}
              data-tour="metric-controls"
            >
              <MapControls
                activeMetric={activeMetric}
                onMetricChange={setActiveMetric}
                hiddenMetrics={hiddenMetrics}
                variant="mobile-bar"
              />
            </div>
          )}
        </div>

        {/* #13 + #1: Desktop sidebar (no empty state), mobile bottom drawer */}
        {selectedRegionId && !isMobile && sidebarContent}
      </div>

      {/* Mobile bottom sheet — only shown when a region is selected */}
      {isMobile && selectedRegionId && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] rounded-t-[10px] border-t border-white/10 bg-background flex flex-col transition-[max-height] duration-300 ease-in-out animate-in slide-in-from-bottom"
          style={{
            maxHeight: activeSnapPoint === SNAP_POINTS[1] ? '90dvh' : '50dvh',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Drag handle — taller tap target, cycles between half + nearly-full */}
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
            <RegionSidebar
              regionId={selectedRegionId}
              regionType={selectedRegionType}
              stateData={currentStateData}
              districtData={currentDistrictData}
              activeMetric={activeMetric}
              comparisonItems={comparisonItems}
              onClose={() => { handleCloseSidebar(); setActiveSnapPoint(SNAP_POINTS[0]); }}
              onAddToCompare={handleAddToCompare}
              onRemoveFromCompare={handleRemoveFromCompare}
              onClearCompare={() => setComparisonItems([])}
              className="w-full border-l-0 h-auto"
              allStatesData={correctedStatesData}
              allDistrictsData={allDistricts}
              compactMode={false}
            />
          </div>
        </div>
      )}

      {/* Cart Drawer */}
      <DataCart open={cartOpen} onOpenChange={setCartOpen} />

      {/* Map Tour (Phase 2) */}
      {showMapTour && (
        <GuidedTour
          steps={MAP_TOUR_STEPS}
          stepOffset={HOME_TOUR_STEPS.length}
          onComplete={() => {
            setShowMapTour(false);
            completeTour.mutate();
            // Remove tour param
            const params = new URLSearchParams(searchParams.toString());
            params.delete('tour');
            setSearchParams(params);
          }}
          onSkip={() => {
            setShowMapTour(false);
            completeTour.mutate();
            const params = new URLSearchParams(searchParams.toString());
            params.delete('tour');
            setSearchParams(params);
          }}
        />
      )}
    </div>
  );
}
