import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Map, Source, Layer, Marker, NavigationControl, useMap } from 'react-map-gl/maplibre';
import type { MapLayerMouseEvent, ViewStateChangeEvent } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MetricType } from '@/store/mapStore';
import type { ColorStop } from '@/lib/colorScales';
import { getColorForValue } from '@/lib/colorScales';
import { useImpactMapLayers, FIPS_TO_ABBR } from '@/hooks/useImpactMapLayers';
import { StateMiniCard } from './StateMiniCard';
import { formatNumber, formatPercent } from '@/lib/geoUtils';
import { STATE_ABBREVIATIONS } from '@/lib/us-states';
import { Button } from '@/components/ui/button';
import { Crosshair, ArrowLeft, Keyboard } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const CONTINENTAL_US_BOUNDS: [[number, number], [number, number]] = [[-124, 25], [-67, 49]];
const DISTRICT_VISIBILITY_ZOOM = 5.5;

const BORDER_COLOR = '#64748b';
const STATE_BORDER_DISTRICT_VIEW_COLOR = '#94a3b8';
const DISTRICT_BORDER_COLOR = '#475569';
const HOVER_BORDER_COLOR = '#93c5fd';
const SELECTED_BORDER_COLOR = '#3b82f6';
const GLOW_HOVER_COLOR = '#60a5fa';
const GLOW_SELECTED_COLOR = '#3b82f6';

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

function isValidFeatureCollection(data: any): boolean {
  return data != null && typeof data === 'object' && data.type === 'FeatureCollection' && Array.isArray(data.features);
}

interface ImpactMapProps {
  states: any[] | null;
  districts: any[] | null;
  activeMetric: MetricType;
  localDistrictColorStops: ColorStop[] | null;
  selectedRegion: string | null;
  selectedRegionType: 'state' | 'district' | null;
  isDistrictView: boolean;
  onRegionSelect: (regionId: string, type: 'state' | 'district') => void;
  onDistrictViewChange: (show: boolean) => void;
  savedRegionCodes?: Set<string>;
  mobileSheetExpanded?: boolean;
}

// ---------------------------------------------------------------------------
// MapContent — rendered inside <Map> so useMap() works
// ---------------------------------------------------------------------------

interface MapContentProps extends ImpactMapProps {
  statesGeoJSON: any;
  districtsGeoJSON: any;
  hoveredRegion: string | null;
  showRecenter: boolean;
  announcement: string;
  tooltipPos: { x: number; y: number } | null;
  tooltipContent: { name: string; stats: { label: string; value: string }[] } | null;
  containerRef: React.RefObject<HTMLDivElement>;
  onRecenter: () => void;
  onBackToStateView: () => void;
}

function MapContent({
  states, districts, activeMetric, localDistrictColorStops,
  selectedRegion, isDistrictView, onRegionSelect, onDistrictViewChange,
  savedRegionCodes, mobileSheetExpanded, statesGeoJSON, districtsGeoJSON,
  hoveredRegion, showRecenter, announcement, tooltipPos, tooltipContent,
  containerRef, onRecenter, onBackToStateView,
}: MapContentProps) {
  const { current: mapRef } = useMap();

  const {
    enrichedStatesGeoJSON,
    enrichedDistrictsGeoJSON,
    statesFillLayer,
    districtsFillLayer,
    districtsImpactBorderLayer,
  } = useImpactMapLayers({
    states, districts, activeMetric, localDistrictColorStops,
    showDistricts: isDistrictView, statesGeoJSON, districtsGeoJSON,
  });

  // --- Reactive border paint ---

  const stateBorderPaint = useMemo(() => {
    const dw = isDistrictView ? 2.5 : 1.5;
    const dc = isDistrictView ? STATE_BORDER_DISTRICT_VIEW_COLOR : BORDER_COLOR;
    const lw: any = selectedRegion
      ? ['case', ['==', ['get', 'stateCode'], selectedRegion], 5,
          hoveredRegion && hoveredRegion !== selectedRegion
            ? ['case', ['==', ['get', 'stateCode'], hoveredRegion], 4, dw] : dw]
      : hoveredRegion
        ? ['case', ['==', ['get', 'stateCode'], hoveredRegion], 4, dw] : dw;
    const lc: any = selectedRegion
      ? ['case', ['==', ['get', 'stateCode'], selectedRegion], SELECTED_BORDER_COLOR,
          hoveredRegion && hoveredRegion !== selectedRegion
            ? ['case', ['==', ['get', 'stateCode'], hoveredRegion], HOVER_BORDER_COLOR, dc] : dc]
      : hoveredRegion
        ? ['case', ['==', ['get', 'stateCode'], hoveredRegion], HOVER_BORDER_COLOR, dc] : dc;
    return { 'line-width': lw, 'line-color': lc, 'line-opacity': 1 };
  }, [hoveredRegion, selectedRegion, isDistrictView]);

  const stateBorderGlowPaint = useMemo(() => {
    const gw: any = selectedRegion
      ? ['case', ['==', ['get', 'stateCode'], selectedRegion], 12,
          hoveredRegion && hoveredRegion !== selectedRegion
            ? ['case', ['==', ['get', 'stateCode'], hoveredRegion], 10, 0] : 0]
      : hoveredRegion ? ['case', ['==', ['get', 'stateCode'], hoveredRegion], 10, 0] : 0;
    const gc: any = selectedRegion
      ? ['case', ['==', ['get', 'stateCode'], selectedRegion], GLOW_SELECTED_COLOR,
          hoveredRegion && hoveredRegion !== selectedRegion
            ? ['case', ['==', ['get', 'stateCode'], hoveredRegion], GLOW_HOVER_COLOR, 'transparent'] : 'transparent']
      : hoveredRegion
        ? ['case', ['==', ['get', 'stateCode'], hoveredRegion], GLOW_HOVER_COLOR, 'transparent'] : 'transparent';
    return { 'line-color': gc, 'line-width': gw, 'line-blur': 4, 'line-opacity': 0.5 };
  }, [hoveredRegion, selectedRegion]);

  const districtBorderPaint = useMemo(() => ({
    'line-width': hoveredRegion
      ? ['case', ['==', ['get', 'cdCode'], hoveredRegion], 4, 1] : 1,
    'line-color': hoveredRegion
      ? ['case', ['==', ['get', 'cdCode'], hoveredRegion], HOVER_BORDER_COLOR, DISTRICT_BORDER_COLOR]
      : DISTRICT_BORDER_COLOR,
    'line-opacity': 0.7,
  }), [hoveredRegion]);

  const districtBorderGlowPaint = useMemo(() => ({
    'line-color': hoveredRegion
      ? ['case', ['==', ['get', 'cdCode'], hoveredRegion], GLOW_HOVER_COLOR, 'transparent'] : 'transparent',
    'line-width': hoveredRegion
      ? ['case', ['==', ['get', 'cdCode'], hoveredRegion], 10, 0] : 0,
    'line-blur': 4,
    'line-opacity': 0.5,
  }), [hoveredRegion]);

  // --- Label points ---

  const labelPointsGeoJSON = useMemo((): GeoJSON.FeatureCollection => {
    if (!enrichedStatesGeoJSON) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: enrichedStatesGeoJSON.features
        .filter((f: any) => f.properties?.stateCode)
        .map((f: any) => {
          const sc = f.properties.stateCode;
          if (LABEL_OVERRIDES[sc]) {
            return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: LABEL_OVERRIDES[sc] }, properties: { stateCode: sc, impactDistrictCount: f.properties.impactDistrictCount ?? 0 } };
          }
          const geom = f.geometry;
          let coords: number[][];
          if (geom.type === 'MultiPolygon') {
            let largest = geom.coordinates[0][0], largestArea = 0;
            for (const poly of geom.coordinates) {
              const ring = poly[0];
              let area = 0;
              for (let j = 0; j < ring.length - 1; j++) area += ring[j][0] * ring[j + 1][1] - ring[j + 1][0] * ring[j][1];
              area = Math.abs(area) / 2;
              if (area > largestArea) { largestArea = area; largest = ring; }
            }
            coords = largest;
          } else {
            coords = geom.coordinates[0];
          }
          let sumLng = 0, sumLat = 0, count = 0;
          const step = Math.max(1, Math.floor(coords.length / 30));
          for (let i = 0; i < coords.length; i += step) { sumLng += coords[i][0]; sumLat += coords[i][1]; count++; }
          return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [sumLng / count, sumLat / count] }, properties: { stateCode: sc, impactDistrictCount: f.properties.impactDistrictCount ?? 0 } };
        }),
    };
  }, [enrichedStatesGeoJSON]);

  // --- Bookmark markers ---

  const savedRegionMarkers = useMemo(() => {
    if (!savedRegionCodes?.size || !enrichedStatesGeoJSON) return [];
    const markers: { code: string; lng: number; lat: number }[] = [];
    enrichedStatesGeoJSON.features?.forEach((f: any) => {
      const sc = f.properties?.stateCode;
      if (!sc || !savedRegionCodes.has(sc) || !f.geometry) return;
      const geom = f.geometry;
      const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates?.[0]?.[0];
      if (!coords?.length) return;
      let sumLng = 0, sumLat = 0, count = 0;
      const step = Math.max(1, Math.floor(coords.length / 20));
      for (let i = 0; i < coords.length; i += step) { sumLng += coords[i][0]; sumLat += coords[i][1]; count++; }
      markers.push({ code: sc, lng: sumLng / count, lat: sumLat / count });
    });
    return markers;
  }, [savedRegionCodes, enrichedStatesGeoJSON]);

  // --- Camera callbacks (need useMap) ---

  const flyToAK = useCallback(() => {
    mapRef?.flyTo({ center: [-153.5, 64.2], zoom: 3.5, duration: 1000 });
    onRegionSelect('AK', 'state');
  }, [mapRef, onRegionSelect]);

  const flyToHI = useCallback(() => {
    mapRef?.flyTo({ center: [-160.3, 20.6], zoom: 5, duration: 1000 });
    onRegionSelect('HI', 'state');
  }, [mapRef, onRegionSelect]);

  // --- AK/HI card helpers ---

  const akData = useMemo(() => states?.find(s => s.state_code === 'AK'), [states]);
  const hiData = useMemo(() => states?.find(s => s.state_code === 'HI'), [states]);

  const getCardColor = useCallback((d: any, stateCode?: string) => {
    if (!d) return '#333';
    if (activeMetric === 'impact') {
      const count = districts?.filter((dist: any) => dist.state_code === stateCode && dist.can_impact)?.length || 0;
      return getColorForValue(count, 'population'); // Use amber scale manually
    }
    const v = activeMetric === 'population' ? d.muslim_voters : activeMetric === 'donors' ? ((d.donor_gold_count ?? 0) + (d.donor_silver_count ?? 0))
      : activeMetric === 'activists' ? d.political_activists : d.vote_2024_pct;
    return getColorForValue(v ?? 0, activeMetric);
  }, [activeMetric, districts]);

  const getCardValue = useCallback((d: any, stateCode?: string) => {
    if (!d) return '—';
    if (activeMetric === 'impact') {
      const count = districts?.filter((dist: any) => dist.state_code === stateCode && dist.can_impact)?.length || 0;
      return String(count);
    }
    const v = activeMetric === 'population' ? d.muslim_voters : activeMetric === 'donors' ? ((d.donor_gold_count ?? 0) + (d.donor_silver_count ?? 0))
      : activeMetric === 'activists' ? d.political_activists : d.vote_2024_pct;
    return activeMetric === 'turnout' ? formatPercent(v) : formatNumber(v);
  }, [activeMetric, districts]);

  const distVis = isDistrictView ? 'visible' as const : 'none' as const;

  return (
    <>
      {enrichedStatesGeoJSON && isValidFeatureCollection(enrichedStatesGeoJSON) && (
        <Source id="states" type="geojson" data={enrichedStatesGeoJSON}>
          <Layer id="states-fill" type="fill" paint={statesFillLayer.paint as any} />
          <Layer id="states-border-glow" type="line" paint={stateBorderGlowPaint as any} />
          <Layer id="states-border" type="line" paint={stateBorderPaint as any} />
        </Source>
      )}

      {labelPointsGeoJSON.features.length > 0 && (
        <Source id="state-label-points" type="geojson" data={labelPointsGeoJSON}>
          {/* State abbreviation labels (hidden when impact metric active at state level) */}
          <Layer
            id="states-labels"
            type="symbol"
            layout={{
              'text-field': ['get', 'stateCode'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 5, 12, 7, 14],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-letter-spacing': 0.15,
              'text-max-width': 4,
              'text-allow-overlap': false,
              'text-ignore-placement': false,
              'text-padding': 2,
              'visibility': (activeMetric === 'impact' && !isDistrictView ? 'none' : 'visible') as 'visible' | 'none',
            }}
            paint={{
              'text-color': '#e2e8f0',
              'text-halo-color': 'rgba(0, 0, 0, 0.9)',
              'text-halo-width': 2,
              'text-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 5, 0.9, 6, 0.3, 7, 0],
            }}
          />
          {/* Impact district count labels (shown only when impact metric active at state level) */}
          <Layer
            id="states-impact-count-labels"
            type="symbol"
            layout={{
              'text-field': ['to-string', ['get', 'impactDistrictCount']],
              'text-size': ['interpolate', ['linear'], ['zoom'], 3, 12, 5, 18, 7, 22],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-allow-overlap': true,
              'text-ignore-placement': true,
              'visibility': (activeMetric === 'impact' && !isDistrictView ? 'visible' : 'none') as 'visible' | 'none',
            }}
            paint={{
              'text-color': '#ffffff',
              'text-halo-color': 'rgba(0, 0, 0, 0.95)',
              'text-halo-width': 2.5,
              'text-opacity': ['case', ['>', ['get', 'impactDistrictCount'], 0], 1, 0.3],
            }}
          />
        </Source>
      )}

      {enrichedDistrictsGeoJSON && isValidFeatureCollection(enrichedDistrictsGeoJSON) && enrichedDistrictsGeoJSON.features.length > 0 && (
        <Source id="districts" type="geojson" data={enrichedDistrictsGeoJSON}>
          <Layer id="districts-fill" type="fill" layout={{ visibility: distVis }} paint={districtsFillLayer.paint as any} />
          <Layer id="districts-border-glow" type="line" layout={{ visibility: distVis }} paint={districtBorderGlowPaint as any} />
          <Layer id="districts-border" type="line" layout={{ visibility: distVis }} paint={districtBorderPaint as any} />
          <Layer id="districts-impact-border" type="line" filter={districtsImpactBorderLayer.filter as any} layout={districtsImpactBorderLayer.layout as any} paint={districtsImpactBorderLayer.paint as any} />
        </Source>
      )}

      {savedRegionMarkers.map(m => (
        <Marker key={m.code} longitude={m.lng} latitude={m.lat}>
          <div title={`Saved: ${STATE_ABBREVIATIONS[m.code] || m.code}`} style={{ cursor: 'pointer' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="hsl(45, 93%, 58%)" stroke="hsl(45, 93%, 40%)" strokeWidth="2">
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
            </svg>
          </div>
        </Marker>
      ))}

      <NavigationControl position="bottom-right" />

      {!isDistrictView && !mobileSheetExpanded && (
        <div className="absolute bottom-[12rem] left-2 sm:bottom-[7.5rem] sm:left-4 z-map-overlays flex flex-row sm:flex-col gap-1 sm:gap-2">
          <StateMiniCard stateCode="AK" color={getCardColor(akData, 'AK')} value={getCardValue(akData, 'AK')} onClick={flyToAK} />
          <StateMiniCard stateCode="HI" color={getCardColor(hiData, 'HI')} value={getCardValue(hiData, 'HI')} onClick={flyToHI} />
        </div>
      )}

      {showRecenter && !isDistrictView && (
        <button
          className="absolute top-[3.25rem] sm:top-16 left-2 sm:left-4 z-map-pills flex items-center gap-1.5 px-3 py-2 rounded-md font-display text-xs uppercase tracking-wider min-h-[36px] bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg"
          onClick={onRecenter}
        >
          <Crosshair className="w-4 h-4" />
          <span className="hidden sm:inline">Back to US</span>
        </button>
      )}

      {isDistrictView && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-[3.25rem] sm:top-16 left-2 sm:left-4 z-map-overlays min-h-[36px] text-[11px] sm:text-sm"
          onClick={onBackToStateView}
        >
          <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1" />
          <span className="hidden sm:inline">Back to state view</span>
          <span className="sm:hidden">States</span>
        </Button>
      )}

      {tooltipPos && tooltipContent && (
        <div
          className="pointer-events-none absolute z-map-overlays rounded-lg px-2 py-1.5 sm:px-3 sm:py-2 min-w-[120px] sm:min-w-[150px]"
          style={{
            left: Math.max(8, Math.min(
              tooltipPos.x + 170 > (containerRef.current?.clientWidth || 1000)
                ? tooltipPos.x - 180 : tooltipPos.x + 14,
              (containerRef.current?.clientWidth || 1000) - 180
            )),
            top: Math.max(8, Math.min(
              tooltipPos.y < 60 ? tooltipPos.y + 14 : tooltipPos.y - 60,
              (containerRef.current?.clientHeight || 600) - 80
            )),
            background: 'rgba(44, 44, 46, 0.90)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
          }}
        >
          <div className="font-display text-xs sm:text-sm font-bold text-white mb-0.5 sm:mb-1 tracking-tight">{tooltipContent.name}</div>
          {tooltipContent.stats.map((s, i) => (
            <div key={i} className="flex justify-between gap-3 sm:gap-4 text-[10px] sm:text-[11px]">
              <span className="font-display text-muted-foreground">{s.label}</span>
              <span className="font-medium tabular-nums text-foreground">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sr-only" aria-live="polite" role="status">{announcement}</div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ImpactMap — public component
// ---------------------------------------------------------------------------

export default function ImpactMap({
  states, districts, activeMetric, localDistrictColorStops,
  selectedRegion, selectedRegionType, isDistrictView,
  onRegionSelect, onDistrictViewChange, savedRegionCodes, mobileSheetExpanded,
}: ImpactMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInternalRef = useRef<any>(null);

  // Detect touch device to disable hover tooltip
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const [statesGeoJSON, setStatesGeoJSON] = useState<any>(null);
  const [districtsGeoJSON, setDistrictsGeoJSON] = useState<any>(null);
  const [districtsLoading, setDistrictsLoading] = useState(true);

  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [tooltipContent, setTooltipContent] = useState<{ name: string; stats: { label: string; value: string }[] } | null>(null);
  const tooltipRafRef = useRef<number | null>(null);

  const [showRecenter, setShowRecenter] = useState(false);
  const [zoomNotification, setZoomNotification] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  // Stable refs for event handlers
  const onRegionSelectRef = useRef(onRegionSelect);
  onRegionSelectRef.current = onRegionSelect;
  const onDistrictViewChangeRef = useRef(onDistrictViewChange);
  onDistrictViewChangeRef.current = onDistrictViewChange;
  const isDistrictViewRef = useRef(isDistrictView);
  isDistrictViewRef.current = isDistrictView;
  const activeMetricRef = useRef(activeMetric);
  activeMetricRef.current = activeMetric;
  const statesGeoJSONRef = useRef<any>(null);
  statesGeoJSONRef.current = statesGeoJSON;
  const hoveredRegionRef = useRef<string | null>(null);
  hoveredRegionRef.current = hoveredRegion;
  const selectedRegionRef = useRef<string | null>(selectedRegion);
  selectedRegionRef.current = selectedRegion;
  const statesDataRef = useRef(states);
  statesDataRef.current = states;
  const districtsDataRef = useRef(districts);
  districtsDataRef.current = districts;

  const updateTooltip = useCallback((
    pos: { x: number; y: number } | null,
    content: { name: string; stats: { label: string; value: string }[] } | null,
  ) => {
    if (tooltipRafRef.current) cancelAnimationFrame(tooltipRafRef.current);
    tooltipRafRef.current = requestAnimationFrame(() => {
      setTooltipPos(pos);
      setTooltipContent(content);
      tooltipRafRef.current = null;
    });
  }, []);

  // Load GeoJSON — states and districts in parallel
  useEffect(() => {
    // States fetch
    fetch('/geojson/us-states.json')
      .then(r => r.json())
      .then(data => {
        if (isValidFeatureCollection(data) && data.features.length > 0) setStatesGeoJSON(data);
        else console.error('us-states.json is not a valid GeoJSON FeatureCollection');
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    // Districts fetch — runs in parallel with states
    const DISTRICTS_CACHE_KEY = 'census_districts_v3_geojson';
    try { sessionStorage.removeItem('census_districts_119_geojson'); sessionStorage.removeItem('census_districts_v2_geojson'); } catch { /* ignore */ }

    const cached = sessionStorage.getItem(DISTRICTS_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (isValidFeatureCollection(parsed) && parsed.features.length > 0) {
          setDistrictsGeoJSON(parsed);
          setDistrictsLoading(false);
          return;
        } else { sessionStorage.removeItem(DISTRICTS_CACHE_KEY); }
      } catch { sessionStorage.removeItem(DISTRICTS_CACHE_KEY); }
    }

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const DISTRICTS_URL = `${SUPABASE_URL}/storage/v1/object/public/geojson/congressional-districts-119.json`;

    fetch(DISTRICTS_URL)
      .then(r => { if (!r.ok) throw new Error(`Districts fetch ${r.status}`); return r.json(); })
      .then(data => {
        const features = Array.isArray(data?.features) ? data.features : [];
        const mapped = {
          type: 'FeatureCollection' as const,
          features: features.map((f: any) => ({
            type: f.type, geometry: f.geometry,
            properties: { ...(f.properties || {}), STATE: f.properties?.STATE, CD: f.properties?.CD ?? '00', NAME: f.properties?.NAME ?? '' },
          })),
        };
        if (mapped.features.length > 0) {
          try { sessionStorage.setItem(DISTRICTS_CACHE_KEY, JSON.stringify(mapped)); } catch { /* quota */ }
          setDistrictsGeoJSON(mapped);
        }
      })
      .catch(err => {
        console.error('Failed to load districts', err);
        fetch('/geojson/congressional-districts-118.json')
          .then(r => r.json())
          .then(data => { if (isValidFeatureCollection(data) && data.features.length > 0) setDistrictsGeoJSON(data); })
          .catch(console.error);
      })
      .finally(() => setDistrictsLoading(false));
  }, []);

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
        const cur = selectedRegionRef.current;
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
  }, [sortedStateCodes]);

  // Map event handlers
  // Track whether we've done the initial fly-to for a deep-linked region
  const initialFlyDone = useRef(false);

  const handleLoad = useCallback(() => {
    const map = mapInternalRef.current?.getMap();
    if (!map) return;
    map.resize();
    const containerW = containerRef.current?.clientWidth || 800;
    map.fitBounds(CONTINENTAL_US_BOUNDS, {
      padding: containerW < 640 ? { top: 5, bottom: 40, left: 5, right: 5 } : 40,
      duration: 0,
    });

    // If arriving with a pre-selected region, fly to it after a short delay
    if (selectedRegionRef.current && statesGeoJSONRef.current && !initialFlyDone.current) {
      initialFlyDone.current = true;
      const stateCode = selectedRegionRef.current;
      setTimeout(() => {
        const srcFeat = statesGeoJSONRef.current?.features?.find(
          (sf: any) => (FIPS_TO_ABBR[sf.id] || FIPS_TO_ABBR[sf.properties?.STATE] || sf.properties?.stateCode) === stateCode
        );
        if (srcFeat?.geometry) {
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
        }
      }, 300);
    }
  }, []);

  // Retry fly-to when GeoJSON arrives after map already loaded
  useEffect(() => {
    if (initialFlyDone.current || !statesGeoJSON || !selectedRegion) return;
    const map = mapInternalRef.current?.getMap();
    if (!map || !map.loaded()) return;

    initialFlyDone.current = true;
    const stateCode = selectedRegion;
    const srcFeat = statesGeoJSON.features?.find(
      (sf: any) => (FIPS_TO_ABBR[sf.id] || FIPS_TO_ABBR[sf.properties?.STATE] || sf.properties?.stateCode) === stateCode
    );
    if (srcFeat?.geometry) {
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
    }
  }, [statesGeoJSON, selectedRegion]);

  const handleMoveEnd = useCallback((e: ViewStateChangeEvent) => {
    const vs = e.viewState;
    setShowRecenter(vs.zoom > 5.5 || vs.longitude < -130 || vs.longitude > -65 || vs.latitude < 22 || vs.latitude > 55);
  }, []);

  const handleZoom = useCallback((e: ViewStateChangeEvent) => {
    const zoom = e.viewState.zoom;
    const wasDistrict = isDistrictViewRef.current;
    const isNow = zoom >= DISTRICT_VISIBILITY_ZOOM;
    onDistrictViewChangeRef.current(isNow);
    if (isNow && !wasDistrict) { setZoomNotification('Now showing congressional districts'); setTimeout(() => setZoomNotification(null), 3000); }
    else if (!isNow && wasDistrict) { setZoomNotification('Now showing states'); setTimeout(() => setZoomNotification(null), 3000); }
  }, []);

  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    const features = e.features;
    if (!features?.length) { onRegionSelectRef.current('', 'state'); return; }

    // Prioritize district features when in district view
    if (isDistrictViewRef.current) {
      const districtFeature = features.find((feat: any) => feat.layer?.id === 'districts-fill');
      if (districtFeature) {
        const cdCode = districtFeature.properties?.cdCode;
        if (cdCode) { onRegionSelectRef.current(cdCode, 'district'); setAnnouncement(`Selected district ${cdCode}`); return; }
      }
    }

    const f = features.find((feat: any) => feat.layer?.id === 'states-fill') || features[0];
    const layerId = (f as any).layer?.id;

    if (layerId === 'states-fill') {
      const stateCode = f.properties?.stateCode;
      if (!stateCode) return;
      onRegionSelectRef.current(stateCode, 'state');
      setAnnouncement(`Selected ${f.properties?.stateName || stateCode}`);

      const map = mapInternalRef.current?.getMap();
      if (map) {
        const srcFeat = statesGeoJSONRef.current?.features?.find(
          (sf: any) => (FIPS_TO_ABBR[sf.id] || FIPS_TO_ABBR[sf.properties?.STATE] || sf.properties?.stateCode) === stateCode
        );
        if (srcFeat?.geometry) {
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
            maxZoom: 7.5, duration: 1200,
          });
        }
      }
    }
  }, []);

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    // Disable hover tooltip on touch devices — tap interaction uses the bottom sheet instead
    if (isTouch) return;

    const features = e.features;
    if (!features?.length) {
      if (hoveredRegionRef.current !== null) { hoveredRegionRef.current = null; setHoveredRegion(null); }
      updateTooltip(null, null);
      return;
    }

    // Build tooltip stats based on active metric
    const metric = activeMetricRef.current;
    const getMetricStat = (row: any, isState: boolean) => {
      switch (metric) {
        case 'population':
          return { label: 'Voters', value: formatNumber(row?.muslim_voters ?? 0) };
        case 'activists':
          return { label: 'Activists', value: formatNumber(row?.political_activists ?? 0) };
        case 'donors':
          return { label: 'Donors', value: formatNumber((row?.donor_gold_count ?? 0) + (row?.donor_silver_count ?? 0)) };
        case 'turnout': {
          const pct = isState ? row?.vote_2024_pct : row?.actual_turnout_pct;
          const hasData = isState ? (row?.vote_2024_pct || row?.vote_2024) : (row?.actual_turnout_pct || row?.voted_2024);
          return { label: 'Turnout', value: hasData ? formatPercent(pct ?? 0) : 'No data' };
        }
        case 'impact': {
          if (isState) {
            const count = districtsDataRef.current?.filter((d: any) => d.state_code === row?.state_code && d.can_impact)?.length || 0;
            const total = districtsDataRef.current?.filter((d: any) => d.state_code === row?.state_code)?.length || 0;
            return { label: 'Impact Districts', value: `${count} of ${total}` };
          }
          const margin = row?.margin_votes ?? 0;
          const didntVote = row?.didnt_vote_2024 ?? 0;
          const score = margin > 0 ? Math.min(Math.round((didntVote / margin) * 100), 100) : 0;
          return { label: 'Impact Score', value: row?.can_impact ? `${score}%` : 'No impact' };
        }
        default:
          return { label: 'Voters', value: formatNumber(row?.muslim_voters ?? 0) };
      }
    };

    // Prioritize district features when in district view
    if (isDistrictViewRef.current) {
      const districtFeature = features.find((feat: any) => feat.layer?.id === 'districts-fill');
      if (districtFeature) {
        const cdCode = districtFeature.properties?.cdCode || null;
        if (hoveredRegionRef.current !== cdCode) { hoveredRegionRef.current = cdCode; setHoveredRegion(cdCode); }
        const row = districtsDataRef.current?.find((d: any) => d.cd_code === (districtFeature.properties?.cdCode || ''));
        const metricStat = getMetricStat(row, false);
        updateTooltip({ x: e.point.x, y: e.point.y }, {
          name: districtFeature.properties?.districtName || districtFeature.properties?.cdCode || '',
          stats: [
            metricStat,
            { label: 'Voters', value: formatNumber(row?.muslim_voters ?? districtFeature.properties?.rawMetricValue ?? 0) },
          ].filter((s, i, arr) => i === 0 || s.label !== arr[0].label),
        });
        return;
      }
    }

    const f = features.find((feat: any) => feat.layer?.id === 'states-fill') || features[0];
    const layerId = (f as any).layer?.id;

    if (layerId === 'states-fill') {
      const stateCode = f.properties?.stateCode || null;
      if (hoveredRegionRef.current !== stateCode) { hoveredRegionRef.current = stateCode; setHoveredRegion(stateCode); }
      const row = statesDataRef.current?.find((s: any) => s.state_code === (f.properties?.stateCode || ''));
      const metricStat = getMetricStat(row, true);
      updateTooltip({ x: e.point.x, y: e.point.y }, {
        name: f.properties?.stateName || f.properties?.stateCode || '',
        stats: [
          metricStat,
          { label: 'Voters', value: formatNumber(row?.muslim_voters ?? f.properties?.metricValue ?? 0) },
        ].filter((s, i, arr) => i === 0 || s.label !== arr[0].label), // Deduplicate if metric IS voters
      });
      return;
    }

    if (hoveredRegionRef.current !== null) { hoveredRegionRef.current = null; setHoveredRegion(null); }
    updateTooltip(null, null);
  }, [updateTooltip]);

  const handleMouseLeave = useCallback(() => {
    if (hoveredRegionRef.current !== null) { hoveredRegionRef.current = null; setHoveredRegion(null); }
    updateTooltip(null, null);
  }, [updateTooltip]);

  const handleRecenter = useCallback(() => {
    mapInternalRef.current?.getMap()?.flyTo({ center: [(-124 + -67) / 2, (25 + 49) / 2], zoom: 3.5, duration: 1200 });
  }, []);

  const handleBackToStateView = useCallback(() => {
    onDistrictViewChangeRef.current(false);
    const containerW = containerRef.current?.clientWidth || 800;
    mapInternalRef.current?.getMap()?.fitBounds(CONTINENTAL_US_BOUNDS, {
      padding: containerW < 640 ? { top: 10, bottom: 60, left: 5, right: 5 } : 40,
      duration: 1200,
    });
  }, []);

  // Orient change resize
  useEffect(() => {
    const handle = () => setTimeout(() => mapInternalRef.current?.getMap()?.resize(), 200);
    window.addEventListener('orientationchange', handle);
    return () => window.removeEventListener('orientationchange', handle);
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'manipulation' }}>
      <Map
        ref={mapInternalRef}
        mapStyle={MAP_STYLE}
        initialViewState={{ longitude: -98, latitude: 39, zoom: 3.5 }}
        minZoom={3}
        maxZoom={12}
        renderWorldCopies={false}
        maxBounds={[[-172, 15], [-55, 72]]}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={['states-fill', 'districts-fill']}
        cursor={hoveredRegion ? 'pointer' : 'default'}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onZoom={handleZoom}
        onMoveEnd={handleMoveEnd}
        onLoad={handleLoad}
      >
        <MapContent
          states={states}
          districts={districts}
          activeMetric={activeMetric}
          localDistrictColorStops={localDistrictColorStops}
          selectedRegion={selectedRegion}
          selectedRegionType={selectedRegionType}
          isDistrictView={isDistrictView}
          onRegionSelect={onRegionSelect}
          onDistrictViewChange={onDistrictViewChange}
          savedRegionCodes={savedRegionCodes}
          mobileSheetExpanded={mobileSheetExpanded}
          statesGeoJSON={statesGeoJSON}
          districtsGeoJSON={districtsGeoJSON}
          hoveredRegion={hoveredRegion}
          showRecenter={showRecenter}
          announcement={announcement}
          tooltipPos={tooltipPos}
          tooltipContent={tooltipContent}
          containerRef={containerRef}
          onRecenter={handleRecenter}
          onBackToStateView={handleBackToStateView}
        />
      </Map>

      {districtsLoading && (
        <div className="absolute top-14 sm:top-4 left-1/2 -translate-x-1/2 z-map-overlays bg-[#1c1c1e]/80 backdrop-blur-[20px] rounded-lg border border-[rgba(255,255,255,0.08)] px-3 py-1.5 text-xs text-muted-foreground pointer-events-none">
          Loading district boundaries…
        </div>
      )}

      <div className="hidden md:block">
        <TooltipProvider>
          <Tooltip open={showKeyboardHelp} onOpenChange={setShowKeyboardHelp}>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="absolute bottom-4 right-4 z-map-overlays h-7 w-7 opacity-60 hover:opacity-100"
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
    </div>
  );
}
