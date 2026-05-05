import type { MetricType } from '@/store/mapStore';

export interface ColorStop {
  value: number;
  color: string;
  label: string;
}

// Wide dynamic range ramps: starts at near-void (invisible), ends at luminous bright.
// The full spectrum from invisible → dim → medium → vivid → glowing gives maximum
// perceptual distinction across the data range. No pastels, no washed-out whites.
export const colorScales: Record<MetricType, ColorStop[]> = {
  // Blue: near-void → dark navy → medium blue → luminous blue
  // Stops tuned to actual data: most states 2K-60K, top tier 100K-600K
  // More stops in the upper range to distinguish CA(605K) from MI(234K) from PA(124K)
  population: [
    { value: 0, color: '#0d0d10', label: '0' },
    { value: 2000, color: '#0e1420', label: '2K' },
    { value: 8000, color: '#101e38', label: '8K' },
    { value: 20000, color: '#142c54', label: '20K' },
    { value: 50000, color: '#183d75', label: '50K' },
    { value: 90000, color: '#1d52a0', label: '90K' },
    { value: 150000, color: '#2563eb', label: '150K' },
    { value: 250000, color: '#3b82f6', label: '250K' },
    { value: 400000, color: '#60a5fa', label: '400K' },
    { value: 600000, color: '#93c5fd', label: '600K' },
  ],
  // Green: near-void → dark forest → medium green → luminous emerald
  donors: [
    { value: 0, color: '#0d0f0d', label: '0' },
    { value: 200, color: '#0e1a14', label: '200' },
    { value: 500, color: '#102820', label: '500' },
    { value: 1000, color: '#143a2c', label: '1K' },
    { value: 3000, color: '#185540', label: '3K' },
    { value: 8000, color: '#1c7555', label: '8K' },
    { value: 15000, color: '#20996a', label: '15K' },
    { value: 30000, color: '#28b97e', label: '30K' },
    { value: 50000, color: '#34d399', label: '50K' },
  ],
  // Purple: near-void → dark indigo → medium violet → luminous purple
  // Data: top states CA(7993), NY(7826), TX(4591), VA(4209), most 500-3000
  activists: [
    { value: 0, color: '#0e0d12', label: '0' },
    { value: 100, color: '#151225', label: '100' },
    { value: 500, color: '#201a40', label: '500' },
    { value: 1000, color: '#2e2360', label: '1K' },
    { value: 2000, color: '#3f2e85', label: '2K' },
    { value: 3000, color: '#5b3fb5', label: '3K' },
    { value: 5000, color: '#7c3aed', label: '5K' },
    { value: 8000, color: '#a78bfa', label: '8K' },
  ],
  // Amber: near-void → dark brown → medium orange → luminous amber
  // Data: most states with data cluster 40-62%, need resolution there
  // States without election data show 0% (handled as "No data" in UI)
  turnout: [
    { value: 0, color: '#0f0d0a', label: '0%' },
    { value: 20, color: '#181208', label: '20%' },
    { value: 35, color: '#281d0a', label: '35%' },
    { value: 42, color: '#3d2b0d', label: '42%' },
    { value: 48, color: '#5c3e12', label: '48%' },
    { value: 53, color: '#845518', label: '53%' },
    { value: 58, color: '#b4700e', label: '58%' },
    { value: 65, color: '#f59e0b', label: '65%' },
  ],
  // Impact (district-level): gray → red → yellow → green (0-100 score)
  impact: [
    { value: 0, color: '#1a1a1a', label: '0' },
    { value: 10, color: '#7f1d1d', label: '10' },
    { value: 25, color: '#b91c1c', label: '25' },
    { value: 40, color: '#ca8a04', label: '40' },
    { value: 60, color: '#a3e635', label: '60' },
    { value: 80, color: '#22c55e', label: '80' },
    { value: 100, color: '#16a34a', label: '100' },
  ],
};

// Separate scale for state-level impact (count of impactable districts, 0-15 range)
export const impactCountScale: ColorStop[] = [
  { value: 0, color: '#1a1a1a', label: '0' },
  { value: 1, color: '#92400e', label: '1' },
  { value: 3, color: '#b45309', label: '3' },
  { value: 5, color: '#d97706', label: '5' },
  { value: 8, color: '#f59e0b', label: '8' },
  { value: 12, color: '#fbbf24', label: '12' },
  { value: 15, color: '#fde68a', label: '15+' },
];

export function getColorForValue(value: number, metric: MetricType): string {
  const stops = colorScales[metric];
  if (value <= stops[0].value) return stops[0].color;
  if (value >= stops[stops.length - 1].value) return stops[stops.length - 1].color;
  
  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i].value) {
      const t = (value - stops[i - 1].value) / (stops[i].value - stops[i - 1].value);
      return lerpColor(stops[i - 1].color, stops[i].color, t);
    }
  }
  return stops[stops.length - 1].color;
}

function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

export function getMetricValue(
  state: { muslim_voters: number; political_donors: number; political_activists: number; vote_2024_pct: number | null; donor_gold_count?: number | null; donor_silver_count?: number | null },
  metric: MetricType
): number {
  switch (metric) {
    case 'population': return state.muslim_voters;
    case 'donors': return (state.donor_gold_count ?? 0) + (state.donor_silver_count ?? 0);
    case 'activists': return state.political_activists;
    case 'turnout': return Number(state.vote_2024_pct ?? 0);
    case 'impact': return 0; // Impact is district-only
  }
}

export const metricLabels: Record<MetricType, string> = {
  population: 'Muslim Voters',
  donors: 'Political Donors',
  activists: 'Political Activists',
  turnout: '2024 Turnout',
  impact: 'Impact Score',
};
