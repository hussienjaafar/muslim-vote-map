import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStatesData } from '@/hooks/useVoterData';
import { useCartItems } from '@/queries/useDataProductQueries';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { getColorForValue, getMetricValue, metricLabels } from '@/lib/colorScales';
import type { MetricType } from '@/store/mapStore';
import { Map as MapIcon } from 'lucide-react';
import { STATE_ABBREVIATIONS } from '@/lib/us-states';
import { fipsToState } from '@/lib/geoUtils';
import { formatNumber } from '@/lib/geoUtils';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import type { FeatureCollection, Feature, Geometry, Position } from 'geojson';

const WIDTH = 960;
const HEIGHT = 600;

const projection = geoAlbersUsa().scale(1050).translate([WIDTH / 2, HEIGHT / 2]);
const pathGenerator = geoPath().projection(projection);

// Small states that need labels pushed outside
const SMALL_STATES = new Set(['DC', 'DE', 'CT', 'RI', 'NJ', 'MD', 'MA', 'NH', 'VT']);

// Rewind a ring to the desired winding order
function ringArea(ring: Position[]): number {
  let area = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const j = (i + 1) % n;
    area += ring[i][0] * ring[j][1];
    area -= ring[j][0] * ring[i][1];
  }
  return area / 2;
}

function rewindRing(ring: Position[], clockwise: boolean): Position[] {
  const area = ringArea(ring);
  if ((clockwise && area > 0) || (!clockwise && area < 0)) {
    return ring.slice().reverse();
  }
  return ring;
}

function rewindFeature(feature: Feature): Feature {
  const geom = feature.geometry;
  if (!geom) return feature;

  if (geom.type === 'Polygon') {
    const coords = (geom as any).coordinates as Position[][];
    const rewound = coords.map((ring, i) => rewindRing(ring, i === 0)); // exterior CW, holes CCW
    return { ...feature, geometry: { ...geom, coordinates: rewound } };
  }
  if (geom.type === 'MultiPolygon') {
    const coords = (geom as any).coordinates as Position[][][];
    const rewound = coords.map(polygon =>
      polygon.map((ring, i) => rewindRing(ring, i === 0))
    );
    return { ...feature, geometry: { ...geom, coordinates: rewound } };
  }
  return feature;
}

const METRIC_OPTIONS: { key: MetricType; label: string }[] = [
  { key: 'population', label: 'Population' },
  { key: 'turnout', label: 'Turnout' },
  { key: 'donors', label: 'Donors' },
];

export function HomeMiniMap() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: statesData } = useStatesData();
  const { data: cartItems } = useCartItems();
  const [hoveredState, setHoveredState] = useState<{ code: string; cx: number; cy: number } | null>(null);
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
  const [clickedState, setClickedState] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const [activeMetric, setActiveMetric] = useState<MetricType>('population');

  useEffect(() => {
    fetch('/geojson/us-states.json')
      .then(r => r.json())
      .then((data: FeatureCollection) => setGeoData(data));
  }, []);

  const { data: savedRegions } = useQuery({
    queryKey: ['saved-regions-codes', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('saved_regions')
        .select('region_code, region_type')
        .eq('user_id', user!.id);
      return new Set((data ?? []).filter(r => r.region_type === 'state').map(r => r.region_code));
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const stateValues = useMemo(() => {
    const lookup: Record<string, number> = {};
    statesData?.forEach(s => {
      const val = getMetricValue(
        {
          muslim_voters: s.muslim_voters,
          political_donors: s.political_donors ?? 0,
          political_activists: s.political_activists ?? 0,
          vote_2024_pct: s.vote_2024_pct != null ? Number(s.vote_2024_pct) : null,
          donor_gold_count: s.donor_gold_count,
          donor_silver_count: s.donor_silver_count,
        },
        activeMetric,
      );
      lookup[s.state_code] = val;
    });
    return lookup;
  }, [statesData, activeMetric]);

  const cartStateCodes = useMemo(() => {
    const codes = new Set<string>();
    cartItems?.forEach(item => {
      if (item.geo_type === 'state') codes.add(item.geo_code);
      else if (item.geo_type === 'district' && item.geo_code.length >= 2) {
        codes.add(item.geo_code.substring(0, 2));
      }
    });
    return codes;
  }, [cartItems]);

  const features = useMemo(() => {
    if (!geoData) return [];
    return geoData.features
      .filter((f: Feature) => f.geometry && typeof f.id === 'string' && f.id <= '56')
      .map(rewindFeature);
  }, [geoData]);

  return (
    <div className="surgical-glass border border-white/[0.06] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapIcon className="w-4 h-4 text-primary" />
          <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">National Overview</h2>
        </div>
        <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5">
          {METRIC_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setActiveMetric(opt.key)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                activeMetric === opt.key
                  ? 'bg-primary/20 text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={`w-full h-auto cursor-pointer transition-all duration-300 ${exiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
        role="img"
        aria-label="US state overview map"
        style={{ transformOrigin: 'center center' }}
      >
        <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="hsl(var(--muted) / 0.28)" rx="4" />

        {features.map((feature) => {
          const fips = feature.id as string;
          const stateCode = fipsToState[fips];
          if (!stateCode) return null;

          const d = pathGenerator(feature as Feature<Geometry>);
          if (!d) return null;

          const value = stateValues[stateCode] ?? 0;
          const minThreshold = activeMetric === 'population' ? 2000 : activeMetric === 'turnout' ? 5 : 50;
          const fill = value < minThreshold
            ? 'hsl(var(--secondary))'
            : getColorForValue(value, activeMetric);
          const isSaved = savedRegions?.has(stateCode) ?? false;
          const inCart = cartStateCodes.has(stateCode);
          const isHovered = hoveredState?.code === stateCode;

          const centroid = pathGenerator.centroid(feature as Feature<Geometry>);
          const hasValidCentroid = centroid && !isNaN(centroid[0]);

          return (
            <g
              key={fips}
              onClick={() => {
                if (exiting) return;
                setClickedState(stateCode);
                setExiting(true);
                setTimeout(() => navigate(`/map?region=${stateCode}&type=state`), 350);
              }}
              onMouseEnter={() => hasValidCentroid
                ? setHoveredState({ code: stateCode, cx: centroid[0], cy: centroid[1] })
                : setHoveredState({ code: stateCode, cx: WIDTH / 2, cy: HEIGHT / 2 })
              }
              onMouseLeave={() => setHoveredState(null)}
              className="cursor-pointer"
            >
              <path
                d={d}
                fill={clickedState === stateCode ? 'hsl(var(--primary))' : fill}
                stroke={clickedState === stateCode ? 'hsl(var(--primary))' : isSaved ? 'hsl(var(--primary))' : isHovered ? 'hsl(var(--foreground) / 0.5)' : 'hsl(var(--foreground) / 0.25)'}
                strokeWidth={clickedState === stateCode ? 3 : isSaved ? 2.5 : isHovered ? 1.5 : 0.8}
                className="transition-all duration-200"
                style={clickedState === stateCode ? { filter: 'drop-shadow(0 0 8px hsl(var(--primary) / 0.6))' } : undefined}
              />
              {hasValidCentroid && !SMALL_STATES.has(stateCode) && (
                <text
                  x={centroid[0]}
                  y={centroid[1]}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="hsl(var(--foreground))"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  paintOrder="stroke"
                  className="pointer-events-none select-none"
                  style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.03em' }}
                >
                  {stateCode}
                </text>
              )}
              {hasValidCentroid && inCart && (
                <circle
                  cx={centroid[0] + 12}
                  cy={centroid[1] - 10}
                  r={5}
                  fill="hsl(var(--primary))"
                  stroke="hsl(var(--background))"
                  strokeWidth={1.5}
                  className="pointer-events-none"
                />
              )}
            </g>
          );
        })}

        {/* Tooltip */}
        {hoveredState && (() => {
          const name = STATE_ABBREVIATIONS[hoveredState.code] ?? hoveredState.code;
          const metricVal = stateValues[hoveredState.code] ?? 0;
          const metricSuffix = activeMetric === 'turnout' ? '%' : '';
          const label = `${name}: ${activeMetric === 'turnout' ? metricVal.toFixed(1) : formatNumber(metricVal)}${metricSuffix} ${metricLabels[activeMetric]?.toLowerCase() ?? ''}`;
          const textWidth = label.length * 7 + 24;
          const tooltipHeight = 28;
          const rawX = hoveredState.cx - textWidth / 2;
          const clampedX = Math.max(2, Math.min(rawX, WIDTH - textWidth - 2));
          const above = hoveredState.cy - tooltipHeight - 12;
          const tooltipY = above < 4 ? hoveredState.cy + 20 : above;
          return (
            <g className="pointer-events-none">
              <rect
                x={clampedX}
                y={tooltipY}
                width={textWidth}
                height={tooltipHeight}
                rx={4}
                fill="hsl(var(--popover))"
                stroke="hsl(var(--border))"
                strokeWidth={1}
              />
              <text
                x={clampedX + textWidth / 2}
                y={tooltipY + tooltipHeight / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="hsl(var(--popover-foreground))"
                style={{ fontSize: '12px', fontWeight: 600 }}
              >
                {label}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
          <span>In cart</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm border border-primary" />
          <span>Saved</span>
        </div>
        <div className="flex-1" />
        <span className="opacity-60">Click a state to explore</span>
      </div>
    </div>
  );
}