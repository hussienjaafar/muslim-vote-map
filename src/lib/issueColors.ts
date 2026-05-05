// Per-issue color palette for the Issue Donor Map.
// Each issue picked in the multi-compare gets one of these palettes,
// allocated in order. Single-issue mode uses palette[0].

export interface IssuePalette {
  name: string;
  // 8-stop ramp from near-void → vivid for heatmap rendering
  ramp: string[];
  // Solid swatch shown in the legend / selector
  swatch: string;
}

export const ISSUE_PALETTES: IssuePalette[] = [
  {
    name: 'blue',
    swatch: '#3b82f6',
    ramp: ['#0d0d10', '#0e1420', '#101e38', '#142c54', '#1d52a0', '#2563eb', '#3b82f6', '#60a5fa'],
  },
  {
    name: 'rose',
    swatch: '#f43f5e',
    ramp: ['#0f0a0c', '#1c0a12', '#350f1d', '#5e162e', '#8b1d3f', '#c41f50', '#f43f5e', '#fb7185'],
  },
  {
    name: 'emerald',
    swatch: '#10b981',
    ramp: ['#0a0f0c', '#0e1a14', '#102820', '#143a2c', '#185540', '#1c7555', '#10b981', '#34d399'],
  },
];

/**
 * Build a Mapbox GL `interpolate` color expression for a given palette,
 * scaled across [0, max].
 */
export function buildIssueColorExpression(
  property: string,
  palette: IssuePalette,
  max: number,
): any[] {
  const safeMax = max > 0 ? max : 1;
  const stops: any[] = [];
  palette.ramp.forEach((color, i) => {
    const value = (i / (palette.ramp.length - 1)) * safeMax;
    stops.push(value, color);
  });
  return ['interpolate', ['linear'], ['coalesce', ['get', property], 0], ...stops];
}

export function getIssuePalette(index: number): IssuePalette {
  return ISSUE_PALETTES[index % ISSUE_PALETTES.length];
}

// ---------------------------------------------------------------------------
// Data-driven scaling for outlier-heavy choropleths
// ---------------------------------------------------------------------------

export type ScaleMode = 'quantile' | 'linear' | 'log';

/**
 * Compute 8 numeric breakpoints from a values array, given a scaling mode.
 * - quantile: P0, P10, P25, P50, P75, P90, P95, P99
 * - linear (winsorized): evenly spaced from 0 → P95 (caps outliers)
 * - log: log10(v+1) evenly spaced from 0 → log10(P99+1)
 *
 * Returned array always has 8 strictly-increasing-ish numbers safe to feed
 * into a Mapbox `interpolate` expression.
 */
export function computeScaleStops(values: number[], mode: ScaleMode): number[] {
  const nonZero = values.filter(v => v > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return [0, 1, 2, 3, 4, 5, 6, 7];

  const pct = (p: number): number => {
    const idx = Math.min(nonZero.length - 1, Math.max(0, Math.floor((p / 100) * (nonZero.length - 1))));
    return nonZero[idx];
  };

  let raw: number[];
  if (mode === 'quantile') {
    raw = [0, pct(10), pct(25), pct(50), pct(75), pct(90), pct(95), pct(99)];
  } else if (mode === 'log') {
    const cap = Math.max(pct(99), 1);
    const logCap = Math.log10(cap + 1);
    raw = Array.from({ length: 8 }, (_, i) => {
      const t = i / 7;
      const logVal = t * logCap;
      return Math.pow(10, logVal) - 1;
    });
    raw[0] = 0;
  } else {
    // linear winsorized at P95
    const cap = Math.max(pct(95), 1);
    raw = [0, cap * 0.05, cap * 0.15, cap * 0.3, cap * 0.5, cap * 0.7, cap * 0.85, cap];
  }

  // Ensure strictly increasing
  for (let i = 1; i < raw.length; i++) {
    if (raw[i] <= raw[i - 1]) raw[i] = raw[i - 1] + 1;
  }
  return raw;
}

/**
 * Build a Mapbox `interpolate` color expression using the 8 palette colors
 * paired with 8 data-driven stops.
 */
export function buildScaledColorExpression(
  property: string,
  palette: IssuePalette,
  stops: number[],
): any[] {
  const interp: any[] = ['interpolate', ['linear'], ['coalesce', ['get', property], 0]];
  for (let i = 0; i < palette.ramp.length; i++) {
    interp.push(stops[i] ?? i, palette.ramp[i]);
  }
  return interp;
}
