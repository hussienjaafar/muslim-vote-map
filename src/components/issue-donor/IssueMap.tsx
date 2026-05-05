import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Map as MapGL, Source, Layer, NavigationControl, useMap } from 'react-map-gl/maplibre';
import type { MapLayerMouseEvent, ViewStateChangeEvent } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Crosshair, Keyboard } from 'lucide-react';
import { FIPS_TO_ABBR } from '@/hooks/useImpactMapLayers';
import type { Issue, IssueDonorDistrict, IssueDonorState, IssueMetric } from '@/hooks/useIssueDonorData';
import { getIssuePalette, buildScaledColorExpression, computeScaleStops, type ScaleMode } from '@/lib/issueColors';
import { STATE_ABBREVIATIONS } from '@/lib/us-states';
import { IssueMiniCard } from './IssueMiniCard';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const CONTINENTAL_US_BOUNDS: [[number, number], [number, number]] = [[-124, 25], [-67, 49]];
const DISTRICT_VISIBILITY_ZOOM = 5.5;

const HOVER_BORDER_COLOR = '#93c5fd';
const SELECTED_BORDER_COLOR = '#3b82f6';
const GLOW_HOVER_COLOR = '#60a5fa';
const GLOW_SELECTED_COLOR = '#3b82f6';
const STATE_BORDER_COLOR = '#64748b';
const STATE_BORDER_DISTRICT_VIEW_COLOR = '#94a3b8';
const DISTRICT_BORDER_COLOR = '#475569';

const LABEL_OVERRIDES: Record<string, [number, number]> = {
  AL: [-86.8, 32.8], AK: [-153.5, 63.5], AZ: [-111.7, 34.3], AR: [-92.4, 34.8],
  CA: [-119.5, 37.2], CO: [-105.5, 39.0], CT: [-72.7, 41.6], DE: [-75.5, 39.0],
  DC: [-77.0, 38.9], FL: [-81.7, 28.6], GA: [-83.4, 32.7], HI: [-157.5, 20.8],
  ID: [-114.5, 44.4], IL: [-89.2, 40.0], IN: [-86.2, 39.8], IA: [-93.5, 42.0],
  KS: [-98.4, 38.5], KY: [-85.3, 37.8], LA: [-92.0, 31.0], ME: [-69.2, 45.4],
  MD: [-76.8, 39.0], MA: [-71.8, 42.3], MI: [-84.7, 43.3], MN: [-94.3, 46.3],
  MS: [-89.7, 32.7], MO: [-92.5, 38.4], MT: [-109.6, 47.0], NE: [-99.8, 41.5],
  NV: [-116.6, 39.3], NH: [-71.6, 43.7], NJ: [-74.7, 40.2], NM: [-106.0, 34.4],
  NY: [-75.5, 42.8], NC: [-79.4, 35.5], ND: [-100.5, 47.5], OH: [-82.8, 40.4],
  OK: [-97.5, 35.5], OR: [-120.5, 44.0], PA: [-77.6, 40.9], RI: [-71.5, 41.7],
  SC: [-80.9, 34.0], SD: [-100.2, 44.4], TN: [-86.3, 35.8], TX: [-99.5, 31.5],
  UT: [-111.7, 39.5], VT: [-72.6, 44.1], VA: [-79.4, 37.5], WA: [-120.5, 47.4],
  WV: [-80.6, 38.6], WI: [-89.8, 44.6], WY: [-107.5, 43.0],
};

function isValidFC(d: any): boolean {
  return d && typeof d === 'object' && d.type === 'FeatureCollection' && Array.isArray(d.features);
}

function metricVal(
  row: { gold_donors: number; silver_donors: number; gold_cell_phones: number; silver_cell_phones: number; total_donors: number } | undefined,
  metric: IssueMetric,
): number {
  if (!row) return 0;
  switch (metric) {
    case 'total_donors': return row.total_donors;
    case 'gold_donors': return row.gold_donors;
    case 'silver_donors': return row.silver_donors;
    case 'gold_cell_phones': return row.gold_cell_phones;
    case 'silver_cell_phones': return row.silver_cell_phones;
  }
}

const METRIC_LABELS: Record<IssueMetric, string> = {
  total_donors: 'Total Donors',
  gold_donors: 'Gold Donors',
  silver_donors: 'Silver Donors',
  gold_cell_phones: 'Gold Cells',
  silver_cell_phones: 'Silver Cells',
};

interface IssueMapProps {
  selectedIssues: Issue[];
  metric: IssueMetric;
  districtData: IssueDonorDistrict[];
  stateData: IssueDonorState[];
  selectedRegion: { code: string; type: 'state' | 'district' } | null;
  onRegionSelect: (code: string, type: 'state' | 'district') => void;
  onMaxValueChange?: (max: number) => void;
  scaleMode?: ScaleMode;
  onScaleChange?: (info: { stops: number[]; max: number }) => void;
}

// ---------------------------------------------------------------------------
// Inner component — must live inside <MapGL> for useMap() access
// ---------------------------------------------------------------------------

interface InnerProps {
  selectedIssues: Issue[];
  metric: IssueMetric;
  districtData: IssueDonorDistrict[];
  stateData: IssueDonorState[];
  selectedRegion: { code: string; type: 'state' | 'district' } | null;
  onRegionSelect: (code: string, type: 'state' | 'district') => void;
  enrichedStates: any | null;
  enrichedDistricts: any | null;
  fillPaint: any;
  showDistricts: boolean;
  onBackToStates: () => void;
  hovered: string | null;
  showRecenter: boolean;
  onRecenter: () => void;
}

function MapInner({
  selectedIssues, metric, stateData,
  selectedRegion, onRegionSelect,
  enrichedStates, enrichedDistricts, fillPaint,
  showDistricts, onBackToStates,
  hovered, showRecenter, onRecenter,
}: InnerProps) {
  const { current: mapRef } = useMap();

  // Reactive border paint mirroring ImpactMap
  const stateBorderPaint = useMemo(() => {
    const dw = showDistricts ? 2.5 : 1.5;
    const dc = showDistricts ? STATE_BORDER_DISTRICT_VIEW_COLOR : STATE_BORDER_COLOR;
    const sel = selectedRegion?.type === 'state' ? selectedRegion.code : null;
    const hv = hovered;
    const lw: any = sel
      ? ['case', ['==', ['get', '__regionKey'], sel], 5,
          hv && hv !== sel ? ['case', ['==', ['get', '__regionKey'], hv], 4, dw] : dw]
      : hv ? ['case', ['==', ['get', '__regionKey'], hv], 4, dw] : dw;
    const lc: any = sel
      ? ['case', ['==', ['get', '__regionKey'], sel], SELECTED_BORDER_COLOR,
          hv && hv !== sel ? ['case', ['==', ['get', '__regionKey'], hv], HOVER_BORDER_COLOR, dc] : dc]
      : hv ? ['case', ['==', ['get', '__regionKey'], hv], HOVER_BORDER_COLOR, dc] : dc;
    return { 'line-width': lw, 'line-color': lc, 'line-opacity': 1 };
  }, [hovered, selectedRegion, showDistricts]);

  const stateBorderGlowPaint = useMemo(() => {
    const sel = selectedRegion?.type === 'state' ? selectedRegion.code : null;
    const hv = hovered;
    const gw: any = sel
      ? ['case', ['==', ['get', '__regionKey'], sel], 12,
          hv && hv !== sel ? ['case', ['==', ['get', '__regionKey'], hv], 10, 0] : 0]
      : hv ? ['case', ['==', ['get', '__regionKey'], hv], 10, 0] : 0;
    const gc: any = sel
      ? ['case', ['==', ['get', '__regionKey'], sel], GLOW_SELECTED_COLOR,
          hv && hv !== sel ? ['case', ['==', ['get', '__regionKey'], hv], GLOW_HOVER_COLOR, 'transparent'] : 'transparent']
      : hv ? ['case', ['==', ['get', '__regionKey'], hv], GLOW_HOVER_COLOR, 'transparent'] : 'transparent';
    return { 'line-color': gc, 'line-width': gw, 'line-blur': 4, 'line-opacity': 0.5 };
  }, [hovered, selectedRegion]);

  const districtBorderPaint = useMemo(() => {
    const sel = selectedRegion?.type === 'district' ? selectedRegion.code : null;
    const hv = hovered;
    const lw: any = sel
      ? ['case', ['==', ['get', '__regionKey'], sel], 4,
          hv && hv !== sel ? ['case', ['==', ['get', '__regionKey'], hv], 3, 0.6] : 0.6]
      : hv ? ['case', ['==', ['get', '__regionKey'], hv], 3, 0.6] : 0.6;
    const lc: any = sel
      ? ['case', ['==', ['get', '__regionKey'], sel], SELECTED_BORDER_COLOR,
          hv && hv !== sel ? ['case', ['==', ['get', '__regionKey'], hv], HOVER_BORDER_COLOR, DISTRICT_BORDER_COLOR] : DISTRICT_BORDER_COLOR]
      : hv ? ['case', ['==', ['get', '__regionKey'], hv], HOVER_BORDER_COLOR, DISTRICT_BORDER_COLOR] : DISTRICT_BORDER_COLOR;
    return { 'line-width': lw, 'line-color': lc, 'line-opacity': 0.85 };
  }, [hovered, selectedRegion]);

  const districtBorderGlowPaint = useMemo(() => {
    const sel = selectedRegion?.type === 'district' ? selectedRegion.code : null;
    const hv = hovered;
    const gw: any = sel
      ? ['case', ['==', ['get', '__regionKey'], sel], 12,
          hv && hv !== sel ? ['case', ['==', ['get', '__regionKey'], hv], 10, 0] : 0]
      : hv ? ['case', ['==', ['get', '__regionKey'], hv], 10, 0] : 0;
    const gc: any = sel
      ? ['case', ['==', ['get', '__regionKey'], sel], GLOW_SELECTED_COLOR,
          hv && hv !== sel ? ['case', ['==', ['get', '__regionKey'], hv], GLOW_HOVER_COLOR, 'transparent'] : 'transparent']
      : hv ? ['case', ['==', ['get', '__regionKey'], hv], GLOW_HOVER_COLOR, 'transparent'] : 'transparent';
    return { 'line-color': gc, 'line-width': gw, 'line-blur': 4, 'line-opacity': 0.5 };
  }, [hovered, selectedRegion]);

  // Label points (state abbreviations)
  const labelPointsGeoJSON = useMemo((): GeoJSON.FeatureCollection => {
    if (!enrichedStates) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: enrichedStates.features
        .filter((f: any) => f.properties?.__regionKey)
        .map((f: any) => {
          const sc = f.properties.__regionKey as string;
          if (LABEL_OVERRIDES[sc]) {
            return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: LABEL_OVERRIDES[sc] }, properties: { stateCode: sc } };
          }
          const geom = f.geometry;
          let coords: number[][] = [];
          if (geom?.type === 'MultiPolygon') {
            let largest = geom.coordinates[0][0];
            let largestArea = 0;
            for (const poly of geom.coordinates) {
              const ring = poly[0];
              let area = 0;
              for (let j = 0; j < ring.length - 1; j++) area += ring[j][0] * ring[j + 1][1] - ring[j + 1][0] * ring[j][1];
              area = Math.abs(area) / 2;
              if (area > largestArea) { largestArea = area; largest = ring; }
            }
            coords = largest;
          } else if (geom?.type === 'Polygon') {
            coords = geom.coordinates[0];
          }
          if (!coords.length) {
            return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [0, 0] }, properties: { stateCode: sc } };
          }
          let sumLng = 0, sumLat = 0, count = 0;
          const step = Math.max(1, Math.floor(coords.length / 30));
          for (let i = 0; i < coords.length; i += step) { sumLng += coords[i][0]; sumLat += coords[i][1]; count++; }
          return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [sumLng / count, sumLat / count] }, properties: { stateCode: sc } };
        }),
    };
  }, [enrichedStates]);

  // AK/HI cards — show dominant issue color + value
  const akData = useMemo(() => {
    const rows = stateData.filter(s => s.state_code === 'AK');
    let best = 0; let idx = 0;
    rows.forEach(r => {
      const v = metricVal(r, metric);
      const i = selectedIssues.findIndex(s => s.id === r.issue_id);
      if (v > best && i >= 0) { best = v; idx = i; }
    });
    return { value: best, paletteIdx: idx };
  }, [stateData, metric, selectedIssues]);

  const hiData = useMemo(() => {
    const rows = stateData.filter(s => s.state_code === 'HI');
    let best = 0; let idx = 0;
    rows.forEach(r => {
      const v = metricVal(r, metric);
      const i = selectedIssues.findIndex(s => s.id === r.issue_id);
      if (v > best && i >= 0) { best = v; idx = i; }
    });
    return { value: best, paletteIdx: idx };
  }, [stateData, metric, selectedIssues]);

  const flyToAK = useCallback(() => {
    mapRef?.flyTo({ center: [-153.5, 64.2], zoom: 3.5, duration: 1000 });
    onRegionSelect('AK', 'state');
  }, [mapRef, onRegionSelect]);

  const flyToHI = useCallback(() => {
    mapRef?.flyTo({ center: [-160.3, 20.6], zoom: 5, duration: 1000 });
    onRegionSelect('HI', 'state');
  }, [mapRef, onRegionSelect]);

  // Crossfade: states fade out from zoom 5.0 → 5.8, districts fade in from 5.0 → 5.8.
  // Both layers stay mounted & interactive throughout the transition (no pop-in).
  const stateFillPaint = useMemo(() => {
    const base = (fillPaint as any).baseOpacity ?? 0.78;
    return {
      'fill-color': (fillPaint as any)['fill-color'],
      'fill-opacity': [
        'interpolate', ['linear'], ['zoom'],
        5.0, base,
        5.8, 0,
      ] as any,
    };
  }, [fillPaint]);

  const districtFillPaint = useMemo(() => {
    const base = (fillPaint as any).baseOpacity ?? 0.78;
    return {
      'fill-color': (fillPaint as any)['fill-color'],
      'fill-opacity': [
        'interpolate', ['linear'], ['zoom'],
        5.0, 0,
        5.8, base,
      ] as any,
    };
  }, [fillPaint]);

  // Border opacity also crossfades, but the selected-state glow stays visible
  // at full opacity at all zooms so users keep their spatial anchor while drilling in.
  const stateBorderOpacity: any = [
    'interpolate', ['linear'], ['zoom'],
    5.0, 1,
    5.8, 0.25,
  ];
  const districtBorderOpacity: any = [
    'interpolate', ['linear'], ['zoom'],
    5.0, 0,
    5.8, 0.85,
  ];

  return (
    <>
      {enrichedStates && (
        <Source id="issue-states" type="geojson" data={enrichedStates}>
          <Layer id="issue-states-fill" type="fill" paint={stateFillPaint as any} />
          <Layer
            id="issue-states-border-glow"
            type="line"
            paint={{ ...stateBorderGlowPaint } as any}
          />
          <Layer
            id="issue-states-border"
            type="line"
            paint={{ ...stateBorderPaint, 'line-opacity': stateBorderOpacity } as any}
          />
        </Source>
      )}

      {labelPointsGeoJSON.features.length > 0 && (
        <Source id="issue-state-labels" type="geojson" data={labelPointsGeoJSON}>
          <Layer
            id="issue-states-labels"
            type="symbol"
            layout={{
              'text-field': ['get', 'stateCode'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 5, 12, 7, 14],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-letter-spacing': 0.15,
              'text-allow-overlap': false,
              'text-padding': 2,
            }}
            paint={{
              'text-color': '#e2e8f0',
              'text-halo-color': 'rgba(0, 0, 0, 0.9)',
              'text-halo-width': 2,
              'text-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 5, 0.9, 6, 0.3, 7, 0],
            }}
          />
        </Source>
      )}

      {enrichedDistricts && (
        <Source id="issue-districts" type="geojson" data={enrichedDistricts}>
          <Layer id="issue-districts-fill" type="fill" paint={districtFillPaint as any} />
          <Layer
            id="issue-districts-border-glow"
            type="line"
            paint={{ ...districtBorderGlowPaint } as any}
          />
          <Layer
            id="issue-districts-border"
            type="line"
            paint={{ ...districtBorderPaint, 'line-opacity': districtBorderOpacity } as any}
          />
        </Source>
      )}

      <NavigationControl position="bottom-right" />

      {!showDistricts && (
        <div className="absolute bottom-[7.5rem] left-4 z-10 flex flex-col gap-2">
          <IssueMiniCard
            stateCode="AK"
            color={selectedIssues[akData.paletteIdx] && akData.value > 0 ? getIssuePalette(akData.paletteIdx).swatch : '#1a1a1a'}
            value={akData.value.toLocaleString()}
            onClick={flyToAK}
          />
          <IssueMiniCard
            stateCode="HI"
            color={selectedIssues[hiData.paletteIdx] && hiData.value > 0 ? getIssuePalette(hiData.paletteIdx).swatch : '#1a1a1a'}
            value={hiData.value.toLocaleString()}
            onClick={flyToHI}
          />
        </div>
      )}

      {showRecenter && !showDistricts && (
        <button
          className="absolute top-16 left-4 z-10 flex items-center gap-1.5 px-3 py-2 rounded-md font-display text-xs uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg"
          onClick={onRecenter}
        >
          <Crosshair className="w-4 h-4" />
          <span className="hidden sm:inline">Back to US</span>
        </button>
      )}

      {showDistricts && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-16 left-4 z-10 gap-1.5 animate-in fade-in slide-in-from-left-2 duration-300"
          onClick={onBackToStates}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Back to states</span>
          <span className="sm:hidden">States</span>
        </Button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function IssueMap({
  selectedIssues, metric, districtData, stateData,
  selectedRegion, onRegionSelect, onMaxValueChange,
  scaleMode = 'quantile', onScaleChange,
}: IssueMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInternalRef = useRef<any>(null);

  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const [statesGeoJSON, setStatesGeoJSON] = useState<any>(null);
  const [districtsGeoJSON, setDistrictsGeoJSON] = useState<any>(null);
  const [districtsLoading, setDistrictsLoading] = useState(true);
  const [showDistricts, setShowDistricts] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showRecenter, setShowRecenter] = useState(false);
  const [zoomNotification, setZoomNotification] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [tooltipContent, setTooltipContent] = useState<{ name: string; rows: { label: string; value: string; color?: string }[] } | null>(null);
  const tooltipRafRef = useRef<number | null>(null);

  const showDistrictsRef = useRef(showDistricts);
  showDistrictsRef.current = showDistricts;
  const onRegionSelectRef = useRef(onRegionSelect);
  onRegionSelectRef.current = onRegionSelect;
  const hoveredRef = useRef(hovered);
  hoveredRef.current = hovered;
  const selectedIssuesRef = useRef(selectedIssues);
  selectedIssuesRef.current = selectedIssues;
  const metricRef = useRef(metric);
  metricRef.current = metric;
  const districtDataRef = useRef(districtData);
  districtDataRef.current = districtData;
  const stateDataRef = useRef(stateData);
  stateDataRef.current = stateData;
  const statesGeoJSONRef = useRef<any>(null);
  statesGeoJSONRef.current = statesGeoJSON;
  const selectedRegionRef = useRef(selectedRegion);
  selectedRegionRef.current = selectedRegion;
  const initialFlyDone = useRef(false);

  // ----- Load GeoJSON with caching -----
  useEffect(() => {
    fetch('/geojson/us-states.json')
      .then(r => r.json())
      .then(d => { if (isValidFC(d)) setStatesGeoJSON(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const CACHE_KEY = 'census_districts_v3_geojson';
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (isValidFC(parsed) && parsed.features.length > 0) {
          setDistrictsGeoJSON(parsed);
          setDistrictsLoading(false);
          return;
        }
        sessionStorage.removeItem(CACHE_KEY);
      }
    } catch { /* ignore */ }

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const REMOTE = `${SUPABASE_URL}/storage/v1/object/public/geojson/congressional-districts-119.json`;

    fetch(REMOTE)
      .then(r => { if (!r.ok) throw new Error(`status ${r.status}`); return r.json(); })
      .then(data => {
        if (!isValidFC(data) || !data.features.length) throw new Error('empty');
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
        setDistrictsGeoJSON(data);
      })
      .catch(() => {
        // Fallback to bundled (may be empty stub)
        fetch('/geojson/congressional-districts-118.json')
          .then(r => r.json())
          .then(d => { if (isValidFC(d)) setDistrictsGeoJSON(d); })
          .catch(() => {});
      })
      .finally(() => setDistrictsLoading(false));
  }, []);

  // ----- Index data -----
  const districtIndex = useMemo(() => {
    const m = new Map<string, Map<string, IssueDonorDistrict>>();
    for (const d of districtData) {
      let inner = m.get(d.cd_code);
      if (!inner) { inner = new Map(); m.set(d.cd_code, inner); }
      inner.set(d.issue_id, d);
    }
    return m;
  }, [districtData]);

  const stateIndex = useMemo(() => {
    const m = new Map<string, Map<string, IssueDonorState>>();
    for (const s of stateData) {
      let inner = m.get(s.state_code);
      if (!inner) { inner = new Map(); m.set(s.state_code, inner); }
      inner.set(s.issue_id, s);
    }
    return m;
  }, [stateData]);

  // ----- Enrich features with metric values -----
  const { enrichedStates, enrichedDistricts, maxValue } = useMemo(() => {
    let max = 0;
    const enrichFeatures = (
      fc: any,
      lookup: (key: string) => Map<string, any> | undefined,
      keyFromFeature: (f: any) => string | null,
    ) => {
      if (!fc) return null;
      const features = fc.features.map((f: any) => {
        const key = keyFromFeature(f);
        if (!key) return f;
        const inner = lookup(key);
        let dominantIssueIdx = -1;
        let dominantValue = 0;
        let sum = 0;
        if (inner) {
          selectedIssues.forEach((issue, idx) => {
            const row = inner.get(issue.id);
            const v = metricVal(row, metric);
            sum += v;
            if (v > dominantValue) { dominantValue = v; dominantIssueIdx = idx; }
          });
        }
        if (sum > max) max = sum;
        if (dominantValue > max && selectedIssues.length === 1) max = dominantValue;
        return {
          ...f,
          properties: {
            ...f.properties,
            __metricSum: sum,
            __dominantValue: dominantValue,
            __dominantIssue: dominantIssueIdx,
            __regionKey: key,
          },
        };
      });
      return { ...fc, features };
    };

    const eStates = enrichFeatures(
      statesGeoJSON,
      (k) => stateIndex.get(k),
      (f) => {
        const fips = f.id != null ? String(f.id).padStart(2, '0') : f.properties?.STATE;
        return fips ? FIPS_TO_ABBR[fips] ?? null : null;
      },
    );

    const eDistricts = enrichFeatures(
      districtsGeoJSON,
      (k) => districtIndex.get(k),
      (f) => {
        const props = f.properties ?? {};
        const stateFips = props.STATEFP || props.STATE || (f.id != null ? String(f.id).slice(0, 2) : null);
        const distNum = props.CD118FP || props.CDFIPS || props.DISTRICT || props.CD;
        if (!stateFips || distNum == null) return null;
        const stateAbbr = FIPS_TO_ABBR[String(stateFips).padStart(2, '0')];
        if (!stateAbbr) return null;
        const num = String(distNum).replace(/\D/g, '');
        if (!num) return null;
        return `${stateAbbr}-${String(parseInt(num, 10)).padStart(3, '0')}`;
      },
    );

    return { enrichedStates: eStates, enrichedDistricts: eDistricts, maxValue: max };
  }, [statesGeoJSON, districtsGeoJSON, stateIndex, districtIndex, selectedIssues, metric]);

  useEffect(() => { onMaxValueChange?.(maxValue); }, [maxValue, onMaxValueChange]);

  // ----- Compute data-driven scale stops based on selected mode -----
  const scaleStops = useMemo(() => {
    const values: number[] = [];
    const collect = (fc: any, prop: string) => {
      if (!fc) return;
      for (const f of fc.features) {
        const v = f.properties?.[prop] ?? 0;
        if (v > 0) values.push(v);
      }
    };
    if (selectedIssues.length === 1) {
      collect(enrichedDistricts, '__metricSum');
      if (values.length === 0) collect(enrichedStates, '__metricSum');
    } else {
      collect(enrichedDistricts, '__dominantValue');
      if (values.length === 0) collect(enrichedStates, '__dominantValue');
    }
    return computeScaleStops(values, scaleMode);
  }, [enrichedStates, enrichedDistricts, selectedIssues.length, scaleMode]);

  useEffect(() => {
    onScaleChange?.({ stops: scaleStops, max: maxValue });
  }, [scaleStops, maxValue, onScaleChange]);

  // ----- Paint -----
  // Build base color + opacity expressions; the actual layer paint multiplies these
  // by a zoom-driven crossfade in <MapInner /> so states fade out as districts fade in.
  const fillPaint = useMemo(() => {
    if (selectedIssues.length === 0) {
      return { 'fill-color': '#1a1a1a', baseOpacity: 0.4 as any };
    }
    if (selectedIssues.length === 1) {
      const palette = getIssuePalette(0);
      return {
        'fill-color': buildScaledColorExpression('__metricSum', palette, scaleStops),
        baseOpacity: 0.78 as any,
      };
    }
    const swatchCases: any[] = ['case'];
    selectedIssues.forEach((_, idx) => {
      swatchCases.push(['==', ['get', '__dominantIssue'], idx]);
      swatchCases.push(getIssuePalette(idx).swatch);
    });
    swatchCases.push('#1a1a1a');

    // Use the same data-driven stops so mid-range districts read distinctly
    const opacityRamp = [0.15, 0.3, 0.42, 0.55, 0.65, 0.75, 0.82, 0.88];
    const intensity: any[] = ['interpolate', ['linear'], ['coalesce', ['get', '__dominantValue'], 0]];
    for (let i = 0; i < scaleStops.length; i++) {
      intensity.push(scaleStops[i], opacityRamp[i]);
    }
    return { 'fill-color': swatchCases, baseOpacity: intensity as any };
  }, [selectedIssues, scaleStops]);

  // ----- Tooltip -----
  const updateTooltip = useCallback((
    pos: { x: number; y: number } | null,
    content: { name: string; rows: { label: string; value: string; color?: string }[] } | null,
  ) => {
    if (tooltipRafRef.current) cancelAnimationFrame(tooltipRafRef.current);
    tooltipRafRef.current = requestAnimationFrame(() => {
      setTooltipPos(pos);
      setTooltipContent(content);
      tooltipRafRef.current = null;
    });
  }, []);

  const buildTooltipContent = useCallback((regionKey: string, isDistrict: boolean) => {
    const issues = selectedIssuesRef.current;
    const m = metricRef.current;
    const inner = isDistrict
      ? districtDataRef.current.filter(d => d.cd_code === regionKey)
      : stateDataRef.current.filter(s => s.state_code === regionKey);
    const byIssue = new Map<string, any>();
    inner.forEach(r => byIssue.set(r.issue_id, r));

    const name = isDistrict
      ? `${regionKey} (${STATE_ABBREVIATIONS[regionKey.split('-')[0]] || regionKey.split('-')[0]})`
      : (STATE_ABBREVIATIONS[regionKey] || regionKey);

    if (issues.length === 0) {
      return { name, rows: [{ label: 'No issues selected', value: '—' }] };
    }

    if (issues.length === 1) {
      const row = byIssue.get(issues[0].id);
      if (!row) {
        return {
          name,
          rows: [{ label: METRIC_LABELS[m], value: 'No data', color: getIssuePalette(0).swatch }],
        };
      }
      const v = metricVal(row, m);
      return {
        name,
        rows: [{ label: METRIC_LABELS[m], value: v.toLocaleString(), color: getIssuePalette(0).swatch }],
      };
    }

    const rows = issues.map((issue, idx) => {
      const row = byIssue.get(issue.id);
      if (!row) {
        return { label: issue.name, value: 'No data', color: getIssuePalette(idx).swatch };
      }
      const v = metricVal(row, m);
      return { label: issue.name, value: v.toLocaleString(), color: getIssuePalette(idx).swatch };
    });
    return { name, rows };
  }, []);

  // ----- Map handlers -----
  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    const features = e.features;
    if (!features?.length) return;

    // When zoomed into district view, prioritize district feature over the state underneath
    let feat = features[0];
    if (showDistrictsRef.current) {
      const d = features.find((f: any) => f.layer?.id === 'issue-districts-fill');
      if (d) feat = d;
    } else {
      const s = features.find((f: any) => f.layer?.id === 'issue-states-fill');
      if (s) feat = s;
    }

    const key = feat.properties?.__regionKey as string | undefined;
    if (!key) return;
    const isDistrict = (feat.layer.id === 'issue-districts-fill');
    onRegionSelectRef.current(key, isDistrict ? 'district' : 'state');
    setAnnouncement(`Selected ${isDistrict ? 'district ' + key : STATE_ABBREVIATIONS[key] || key}`);

    // Second click on the already-selected state = "drill in" gesture
    const prev = selectedRegionRef.current;
    if (
      !isDistrict &&
      prev?.type === 'state' &&
      prev.code === key
    ) {
      const map = mapInternalRef.current?.getMap();
      if (map && map.getZoom() < 6) {
        map.flyTo({ zoom: 6.5, duration: 900, essential: true });
        setZoomNotification('Now showing congressional districts');
        setTimeout(() => setZoomNotification(null), 3000);
      }
      return;
    }

    // Fly-to for first state click
    if (!isDistrict && statesGeoJSONRef.current) {
      const map = mapInternalRef.current?.getMap();
      const srcFeat = statesGeoJSONRef.current.features?.find((sf: any) => {
        const fips = sf.id != null ? String(sf.id).padStart(2, '0') : sf.properties?.STATE;
        return fips && FIPS_TO_ABBR[fips] === key;
      });
      if (map && srcFeat?.geometry) {
        const geom = srcFeat.geometry;
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
        let mn0 = Infinity, mn1 = Infinity, mx0 = -Infinity, mx1 = -Infinity;
        polys.forEach((poly: any) => poly.forEach((ring: any) => ring.forEach((pt: any) => {
          mn0 = Math.min(mn0, pt[0]); mn1 = Math.min(mn1, pt[1]);
          mx0 = Math.max(mx0, pt[0]); mx1 = Math.max(mx1, pt[1]);
        })));
        const isMobileView = (containerRef.current?.clientWidth || 800) < 768;
        map.fitBounds([[mn0, mn1], [mx0, mx1]], {
          padding: { top: 60, bottom: 60, left: 60, right: isMobileView ? 60 : 380 },
          maxZoom: 7.5, duration: 1400, easing: (t: number) => 1 - Math.pow(1 - t, 3),
        });
        // Pre-emptively switch into district view so the crossfade starts
        // immediately rather than waiting for the zoom event to fire post-animation.
        setShowDistricts(true);
        setZoomNotification('Now showing congressional districts');
        setTimeout(() => setZoomNotification(null), 3000);
      }
    }
  }, []);

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    if (isTouch) return;
    const feats = e.features;
    let feat = feats?.[0];
    // Mirror handleClick: prefer district feature when zoomed in, state otherwise.
    if (showDistrictsRef.current && feats?.length) {
      const d = feats.find((f: any) => f.layer?.id === 'issue-districts-fill');
      if (d) feat = d;
    } else if (feats?.length) {
      const s = feats.find((f: any) => f.layer?.id === 'issue-states-fill');
      if (s) feat = s;
    }
    const key = (feat?.properties?.__regionKey as string | undefined) ?? null;
    if (key !== hoveredRef.current) {
      hoveredRef.current = key;
      setHovered(key);
    }
    if (!key || !feat) {
      updateTooltip(null, null);
      return;
    }
    const isDistrict = feat.layer?.id === 'issue-districts-fill';
    const content = buildTooltipContent(key, isDistrict);
    updateTooltip({ x: e.point.x, y: e.point.y }, content);
  }, [isTouch, updateTooltip, buildTooltipContent]);

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = null;
    setHovered(null);
    updateTooltip(null, null);
  }, [updateTooltip]);

  const handleZoom = useCallback((e: ViewStateChangeEvent) => {
    const z = e.viewState.zoom;
    const wasDistrict = showDistrictsRef.current;
    const isNow = z >= DISTRICT_VISIBILITY_ZOOM;
    if (isNow !== wasDistrict) {
      setShowDistricts(isNow);
      setZoomNotification(isNow ? 'Now showing congressional districts' : 'Now showing states');
      setTimeout(() => setZoomNotification(null), 3000);
    }
  }, []);

  const handleMoveEnd = useCallback((e: ViewStateChangeEvent) => {
    const vs = e.viewState;
    setShowRecenter(vs.zoom > 5.5 || vs.longitude < -130 || vs.longitude > -65 || vs.latitude < 22 || vs.latitude > 55);
  }, []);

  const handleLoad = useCallback(() => {
    const map = mapInternalRef.current?.getMap();
    if (!map) return;
    map.resize();
    const containerW = containerRef.current?.clientWidth || 800;
    map.fitBounds(CONTINENTAL_US_BOUNDS, {
      padding: containerW < 640 ? { top: 5, bottom: 40, left: 5, right: 5 } : 40,
      duration: 0,
    });

    // Deep-link: if arriving with a pre-selected state, fly to it after a beat
    const initial = selectedRegionRef.current;
    if (initial?.type === 'state' && statesGeoJSONRef.current && !initialFlyDone.current) {
      initialFlyDone.current = true;
      const stateCode = initial.code;
      setTimeout(() => {
        const srcFeat = statesGeoJSONRef.current?.features?.find((sf: any) => {
          const fips = sf.id != null ? String(sf.id).padStart(2, '0') : sf.properties?.STATE;
          return fips && FIPS_TO_ABBR[fips] === stateCode;
        });
        if (!srcFeat?.geometry) return;
        const geom = srcFeat.geometry;
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
        let mn0 = Infinity, mn1 = Infinity, mx0 = -Infinity, mx1 = -Infinity;
        polys.forEach((poly: any) => poly.forEach((ring: any) => ring.forEach((pt: any) => {
          mn0 = Math.min(mn0, pt[0]); mn1 = Math.min(mn1, pt[1]);
          mx0 = Math.max(mx0, pt[0]); mx1 = Math.max(mx1, pt[1]);
        })));
        const isMobileView = (containerRef.current?.clientWidth || 800) < 768;
        map.fitBounds([[mn0, mn1], [mx0, mx1]], {
          padding: { top: 60, bottom: 60, left: 60, right: isMobileView ? 60 : 380 },
          maxZoom: 7.5, duration: 1400, easing: (t: number) => 1 - Math.pow(1 - t, 3),
        });
      }, 300);
    }
  }, []);

  const handleRecenter = useCallback(() => {
    mapInternalRef.current?.getMap()?.flyTo({ center: [(-124 + -67) / 2, (25 + 49) / 2], zoom: 3.5, duration: 1200 });
  }, []);

  const handleBackToStates = useCallback(() => {
    setShowDistricts(false);
    const containerW = containerRef.current?.clientWidth || 800;
    mapInternalRef.current?.getMap()?.fitBounds(CONTINENTAL_US_BOUNDS, {
      padding: containerW < 640 ? { top: 10, bottom: 60, left: 5, right: 5 } : 40,
      duration: 1200,
    });
  }, []);

  // Retry deep-link fly-to when GeoJSON arrives after the map has already loaded
  useEffect(() => {
    if (initialFlyDone.current) return;
    if (!statesGeoJSON || !selectedRegion || selectedRegion.type !== 'state') return;
    const map = mapInternalRef.current?.getMap();
    if (!map || !map.loaded()) return;

    initialFlyDone.current = true;
    const stateCode = selectedRegion.code;
    const srcFeat = statesGeoJSON.features?.find((sf: any) => {
      const fips = sf.id != null ? String(sf.id).padStart(2, '0') : sf.properties?.STATE;
      return fips && FIPS_TO_ABBR[fips] === stateCode;
    });
    if (!srcFeat?.geometry) return;
    const geom = srcFeat.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    let mn0 = Infinity, mn1 = Infinity, mx0 = -Infinity, mx1 = -Infinity;
    polys.forEach((poly: any) => poly.forEach((ring: any) => ring.forEach((pt: any) => {
      mn0 = Math.min(mn0, pt[0]); mn1 = Math.min(mn1, pt[1]);
      mx0 = Math.max(mx0, pt[0]); mx1 = Math.max(mx1, pt[1]);
    })));
    const isMobileView = (containerRef.current?.clientWidth || 800) < 768;
    map.fitBounds([[mn0, mn1], [mx0, mx1]], {
      padding: { top: 60, bottom: 60, left: 60, right: isMobileView ? 60 : 380 },
      maxZoom: 7.5, duration: 1400, easing: (t: number) => 1 - Math.pow(1 - t, 3),
    });
  }, [statesGeoJSON, selectedRegion]);

  // Keyboard navigation
  const sortedStateCodes = useMemo(() =>
    Object.keys(STATE_ABBREVIATIONS).filter(c => !['PR', 'VI', 'GU', 'AS', 'MP'].includes(c)).sort(), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') { onRegionSelectRef.current('', 'state'); return; }
      if (e.key === '?') { setShowKeyboardHelp(prev => !prev); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const cur = selectedRegion?.type === 'state' ? selectedRegion.code : null;
        const idx = cur ? sortedStateCodes.indexOf(cur) : -1;
        const next = e.key === 'ArrowRight'
          ? sortedStateCodes[(idx + 1) % sortedStateCodes.length]
          : sortedStateCodes[(idx - 1 + sortedStateCodes.length) % sortedStateCodes.length];
        onRegionSelectRef.current(next, 'state');
        setAnnouncement(`Selected ${STATE_ABBREVIATIONS[next]} (${next})`);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sortedStateCodes, selectedRegion]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <MapGL
        ref={mapInternalRef}
        initialViewState={{ longitude: -96, latitude: 39, zoom: 3.4 }}
        minZoom={3}
        maxZoom={12}
        renderWorldCopies={false}
        maxBounds={[[-172, 15], [-55, 72]]}
        mapStyle={MAP_STYLE}
        interactiveLayerIds={['issue-states-fill', 'issue-districts-fill']}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onZoom={handleZoom}
        onMoveEnd={handleMoveEnd}
        onLoad={handleLoad}
        cursor={hovered ? 'pointer' : 'grab'}
        style={{ width: '100%', height: '100%' }}
      >
        <MapInner
          selectedIssues={selectedIssues}
          metric={metric}
          districtData={districtData}
          stateData={stateData}
          selectedRegion={selectedRegion}
          onRegionSelect={onRegionSelect}
          enrichedStates={enrichedStates}
          enrichedDistricts={enrichedDistricts}
          fillPaint={fillPaint}
          showDistricts={showDistricts}
          onBackToStates={handleBackToStates}
          hovered={hovered}
          showRecenter={showRecenter}
          onRecenter={handleRecenter}
        />
      </MapGL>

      {/* Tooltip */}
      {tooltipPos && tooltipContent && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg px-3 py-2 min-w-[160px]"
          style={{
            left: Math.max(8, Math.min(
              tooltipPos.x + 180 > (containerRef.current?.clientWidth || 1000)
                ? tooltipPos.x - 190 : tooltipPos.x + 14,
              (containerRef.current?.clientWidth || 1000) - 200
            )),
            top: Math.max(8, Math.min(
              tooltipPos.y < 60 ? tooltipPos.y + 14 : tooltipPos.y - 60,
              (containerRef.current?.clientHeight || 600) - 100
            )),
            background: 'rgba(20, 20, 22, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 10px 30px -10px rgba(0,0,0,0.6)',
          }}
        >
          <div className="font-display text-sm font-bold text-white mb-1.5 tracking-tight">{tooltipContent.name}</div>
          <div className="space-y-0.5">
            {tooltipContent.rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  {r.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />}
                  <span className="font-display text-muted-foreground truncate">{r.label}</span>
                </div>
                <span className="font-medium tabular-nums text-foreground">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {districtsLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#1c1c1e]/90 backdrop-blur-md rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground pointer-events-none">
          Loading district boundaries…
        </div>
      )}

      {/* Zoom notification */}
      {zoomNotification && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-blue-600/90 backdrop-blur-md rounded-lg px-3 py-1.5 text-xs text-white font-medium pointer-events-none animate-in fade-in slide-in-from-top-2">
          {zoomNotification}
        </div>
      )}

      {/* Keyboard help */}
      <div className="hidden md:block">
        <TooltipProvider>
          <Tooltip open={showKeyboardHelp} onOpenChange={setShowKeyboardHelp}>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="absolute bottom-4 right-16 z-20 h-7 w-7 opacity-60 hover:opacity-100"
                onClick={() => setShowKeyboardHelp(prev => !prev)}
              >
                <Keyboard className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs space-y-1 max-w-[180px]">
              <p className="font-semibold">Keyboard Shortcuts</p>
              <p>← → Cycle states</p>
              <p>Esc — Deselect</p>
              <p>? — Toggle this help</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* ARIA live region */}
      <div className="sr-only" aria-live="polite" role="status">{announcement}</div>
    </div>
  );
}