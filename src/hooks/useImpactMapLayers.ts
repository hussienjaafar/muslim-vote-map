import { useMemo } from 'react';
import type { MetricType } from '@/store/mapStore';
import { colorScales, impactCountScale, type ColorStop } from '@/lib/colorScales';

export const FIPS_TO_ABBR: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '60': 'AS', '66': 'GU', '69': 'MP', '72': 'PR', '78': 'VI',
};

const ABBR_TO_FIPS: Record<string, string> = Object.fromEntries(
  Object.entries(FIPS_TO_ABBR).map(([k, v]) => [v, k])
);

export function buildDistrictCode(stateCode: string, districtNum: number | string): string {
  const num = typeof districtNum === 'string' ? parseInt(districtNum, 10) : districtNum;
  return `${stateCode}-${String(num).padStart(3, '0')}`;
}

export function getStateFromFips(fips: string): string | null {
  return FIPS_TO_ABBR[fips] ?? null;
}

export function buildColorExpression(property: string, colorStops: ColorStop[]): any[] {
  const stops = colorStops.flatMap(s => [s.value, s.color]);
  return ['interpolate', ['linear'], ['coalesce', ['get', property], 0], ...stops];
}

const BORDER = '#64748b';
const STATE_BORDER_DISTRICT_VIEW = '#94a3b8'; // Brighter slate-400 for state borders during district view
const DISTRICT_BORDER = '#475569';            // Subtle slate-600 for district borders
const NO_DATA_FILL = '#2a3a50';

interface UseImpactMapLayersParams {
  states: any[] | null;
  districts: any[] | null;
  activeMetric: MetricType;
  localDistrictColorStops: ColorStop[] | null;
  showDistricts: boolean;
  statesGeoJSON: any | null;
  districtsGeoJSON: any | null;
}

function getMetricField(metric: MetricType): string {
  switch (metric) {
    case 'population': return 'muslim_voters';
    case 'donors': return 'total_donors';
    case 'activists': return 'political_activists';
    case 'turnout': return 'vote_2024_pct';
    case 'impact': return 'muslim_voters'; // states don't have impact; fallback
  }
}

function getDistrictMetricField(metric: MetricType): string | null {
  switch (metric) {
    case 'population': return 'muslim_voters';
    case 'turnout': return 'actual_turnout_pct';
    case 'activists': return 'political_activists';
    case 'donors': return 'total_donors';
    case 'impact': return 'impactScore';
  }
}

export function useImpactMapLayers({
  states,
  districts,
  activeMetric,
  localDistrictColorStops,
  showDistricts,
  statesGeoJSON,
  districtsGeoJSON,
}: UseImpactMapLayersParams) {
  const stateMetricField = getMetricField(activeMetric);
  const districtMetricField = getDistrictMetricField(activeMetric);

  // Pre-compute impact district counts per state
  const impactCountsByState = useMemo(() => {
    const counts = new Map<string, number>();
    if (!districts) return counts;
    for (const d of districts) {
      if (d.can_impact) {
        counts.set(d.state_code, (counts.get(d.state_code) || 0) + 1);
      }
    }
    return counts;
  }, [districts]);

  const enrichedStatesGeoJSON = useMemo(() => {
    if (!statesGeoJSON || !Array.isArray(statesGeoJSON.features)) return null;
    const stateMap = new Map((states || []).map((s: any) => [s.state_code, s]));
    return {
      type: 'FeatureCollection' as const,
      features: statesGeoJSON.features.map((f: any) => {
        const fips = f.id || f.properties?.STATE;
        const abbr = FIPS_TO_ABBR[fips];
        const stateData = abbr ? stateMap.get(abbr) : null;
        const hasData = !!stateData;
        // Compute synthetic total_donors for donor metric
        const enrichedState = stateData ? {
          ...stateData,
          total_donors: (stateData.donor_gold_count ?? 0) + (stateData.donor_silver_count ?? 0),
        } : null;
        const impactDistrictCount = abbr ? (impactCountsByState.get(abbr) || 0) : 0;
        // For impact metric, use the count of impactable districts
        const metricValue = activeMetric === 'impact'
          ? impactDistrictCount
          : Number(enrichedState ? (enrichedState[stateMetricField] ?? 0) : 0);
        return {
          ...f,
          properties: {
            ...f.properties,
            stateCode: abbr || '',
            metricValue,
            impactDistrictCount,
            hasData: hasData ? 1 : 0,
            stateName: f.properties?.name || stateData?.state_name || '',
          },
        };
      }),
    };
  }, [statesGeoJSON, states, stateMetricField, activeMetric, impactCountsByState]);

  const enrichedDistrictsGeoJSON = useMemo(() => {
    if (!districtsGeoJSON || !districts || !districtMetricField || !Array.isArray(districtsGeoJSON.features)) return null;
    const districtMap = new Map(districts.map(d => [d.cd_code, d]));

    // Pre-compute per-state min/max for relative scaling
    const stateRanges = new Map<string, { min: number; max: number }>();
    for (const d of districts) {
      const enriched = {
        ...d,
        total_donors: (d.donor_gold_count ?? 0) + (d.donor_silver_count ?? 0),
      };
      const val = Number(enriched[districtMetricField!] ?? 0);
      if (val <= 0) continue;
      const existing = stateRanges.get(d.state_code);
      if (existing) {
        existing.min = Math.min(existing.min, val);
        existing.max = Math.max(existing.max, val);
      } else {
        stateRanges.set(d.state_code, { min: val, max: val });
      }
    }

    return {
      type: 'FeatureCollection' as const,
      features: districtsGeoJSON.features.map((f: any) => {
        const stateFips = f.properties?.STATE || f.properties?.STATEFP;
        const cdNum = f.properties?.CD || f.properties?.CD119FP || f.properties?.CD118FP || f.properties?.CDFP;
        const abbr = FIPS_TO_ABBR[stateFips];
        const cdCode = abbr && cdNum ? buildDistrictCode(abbr, cdNum) : '';
        const distData = districtMap.get(cdCode);
        // Compute synthetic total_donors for donor metric
        const enrichedDist = distData ? {
          ...distData,
          total_donors: (distData.donor_gold_count ?? 0) + (distData.donor_silver_count ?? 0),
          // Fallback: use muslim_registered if muslim_voters is 0
          muslim_voters: (distData.muslim_voters || 0) > 0 ? distData.muslim_voters : (distData.muslim_registered ?? 0),
          // Impact score: ratio of untapped voters to margin
          impactScore: distData.margin_votes && distData.margin_votes > 0
            ? Math.min(((distData.didnt_vote_2024 ?? 0) / distData.margin_votes) * 100, 100)
            : 0,
        } : null;

        const canImpact = distData?.can_impact === true;

        // For impact metric, use the raw impactScore (already 0-100)
        const isImpactMetric = activeMetric === 'impact';
        const rawValue = enrichedDist ? Number((enrichedDist as any)[districtMetricField!] ?? 0) : 0;

        // Normalize to 0-100 relative to the district's own state range (skip for impact — already 0-100)
        const range = abbr ? stateRanges.get(abbr) : null;
        let normalizedValue = 0;
        if (isImpactMetric) {
          normalizedValue = rawValue; // Already 0-100
        } else if (range && range.max > range.min && rawValue > 0) {
          normalizedValue = ((rawValue - range.min) / (range.max - range.min)) * 100;
        } else if (rawValue > 0) {
          normalizedValue = 50; // Single-district states get mid-range
        }

        return {
          ...f,
          properties: {
            ...f.properties,
            cdCode,
            stateCode: abbr || '',
            metricValue: normalizedValue, // 0-100 normalized per-state
            rawMetricValue: rawValue,      // Original value for tooltips
            canImpact: canImpact ? 1 : 0,  // 1/0 for maplibre expressions
            impactScore: enrichedDist?.impactScore ?? 0,
            districtName: distData ? `${abbr}-${cdNum}` : f.properties?.NAME || '',
          },
        };
      }),
    };
  }, [districtsGeoJSON, districts, districtMetricField, activeMetric]);

  // Build layers — static paint, no hover/selection logic
  const globalStops = colorScales[activeMetric];
  // For state-level impact, use the count-based color scale
  const stateStops = activeMetric === 'impact' ? impactCountScale : globalStops;

  const stateColorExpr = useMemo(() => {
    const baseColorExpr = buildColorExpression('metricValue', stateStops);
    return ['case', ['==', ['get', 'hasData'], 0], NO_DATA_FILL, baseColorExpr] as any;
  }, [JSON.stringify(stateStops)]);

  // District color uses normalized 0-100 values mapped to the metric's color ramp
  const districtColorExpr = useMemo(() => {
    if (!districtMetricField) return '#333333';
    // Build a 0-100 normalized ramp using the metric's colors
    const normalizedStops: ColorStop[] = globalStops.map((stop, i) => ({
      value: globalStops.length > 1 ? (i / (globalStops.length - 1)) * 100 : 0,
      color: stop.color,
      label: stop.label,
    }));
    return buildColorExpression('metricValue', normalizedStops);
  }, [districtMetricField, JSON.stringify(globalStops)]);

  const statesFillLayer = useMemo(() => ({
    id: 'states-fill',
    type: 'fill' as const,
    source: 'states',
    paint: {
      'fill-color': stateColorExpr,
      // In district view: dim but still visible for geographic context
      'fill-opacity': showDistricts ? 0.15 : 0.85,
    },
  }), [stateColorExpr, showDistricts]);

  // State borders — thicker and brighter during district view for visual hierarchy
  const statesBorderLayer = useMemo(() => ({
    id: 'states-border',
    type: 'line' as const,
    source: 'states',
    paint: {
      'line-color': showDistricts ? STATE_BORDER_DISTRICT_VIEW : BORDER,
      'line-width': showDistricts ? 2.5 : 1.5,
      'line-opacity': 1,
    },
  }), [showDistricts]);

  const statesBorderGlowLayer = useMemo(() => ({
    id: 'states-border-glow',
    type: 'line' as const,
    source: 'states',
    paint: {
      'line-color': 'transparent',
      'line-width': 0,
      'line-blur': 4,
      'line-opacity': 0.5,
    },
  }), []);

  // District layers
  const districtsFillLayer = useMemo(() => ({
    id: 'districts-fill',
    type: 'fill' as const,
    source: 'districts',
    layout: {
      visibility: (showDistricts && districtMetricField ? 'visible' : 'none') as 'visible' | 'none',
    },
    paint: {
      'fill-color': districtColorExpr,
      // When impact metric is active, dim non-impact districts
      'fill-opacity': activeMetric === 'impact'
        ? ['case', ['==', ['get', 'canImpact'], 1], 0.85, 0.2] as any
        : 0.75,
    },
  }), [districtColorExpr, showDistricts, districtMetricField, activeMetric]);

  const districtsBorderLayer = useMemo(() => ({
    id: 'districts-border',
    type: 'line' as const,
    source: 'districts',
    layout: {
      visibility: (showDistricts && districtMetricField ? 'visible' : 'none') as 'visible' | 'none',
    },
    paint: {
      'line-color': DISTRICT_BORDER,
      'line-width': 1,
      'line-opacity': 0.7,
    },
  }), [showDistricts, districtMetricField]);

  const districtsBorderGlowLayer = useMemo(() => ({
    id: 'districts-border-glow',
    type: 'line' as const,
    source: 'districts',
    layout: {
      visibility: (showDistricts && districtMetricField ? 'visible' : 'none') as 'visible' | 'none',
    },
    paint: {
      'line-color': 'transparent',
      'line-width': 0,
      'line-blur': 4,
      'line-opacity': 0.5,
    },
  }), [showDistricts, districtMetricField]);

  // Gold/amber border around impact districts — always visible when districts are shown
  const IMPACT_BORDER_COLOR = '#f59e0b';
  const districtsImpactBorderLayer = useMemo(() => ({
    id: 'districts-impact-border',
    type: 'line' as const,
    source: 'districts',
    filter: ['==', ['get', 'canImpact'], 1],
    layout: {
      visibility: (showDistricts ? 'visible' : 'none') as 'visible' | 'none',
    },
    paint: {
      'line-color': IMPACT_BORDER_COLOR,
      'line-width': 2.5,
      'line-blur': 1,
      'line-opacity': 0.9,
    },
  }), [showDistricts]);

  return {
    enrichedStatesGeoJSON,
    enrichedDistrictsGeoJSON,
    statesFillLayer,
    statesBorderLayer,
    statesBorderGlowLayer,
    districtsFillLayer,
    districtsBorderLayer,
    districtsBorderGlowLayer,
    districtsImpactBorderLayer,
  };
}
