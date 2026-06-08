// Eastern-Time date range helpers for the Fundraising Intelligence dashboard.
// All presets/custom ranges are expressed as inclusive ET calendar dates
// (YYYY-MM-DD), matching the ET day-bucketing of daily_aggregated_metrics.

export type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'custom';

export type RangeSelection = {
  preset: RangePreset;
  /** Inclusive ET start date, YYYY-MM-DD */
  start: string;
  /** Inclusive ET end date, YYYY-MM-DD */
  end: string;
};

export type ResolvedRange = {
  start: string;
  end: string;
  granularity: 'hour' | 'day';
  label: string;
};

export const MAX_CUSTOM_DAYS = 180;

const ET_TZ = 'America/New_York';

/** Current ET calendar date as YYYY-MM-DD. */
export function etToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** ET date N days before today, YYYY-MM-DD. */
export function etDaysAgo(days: number): string {
  return addDays(etToday(), -days);
}

/** Add (or subtract) days to a YYYY-MM-DD date string; returns YYYY-MM-DD. */
export function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Use a UTC anchor so arithmetic is DST-agnostic (we only care about the calendar date).
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** Inclusive day count between two YYYY-MM-DD dates. */
export function daySpan(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Build a RangeSelection for a preset. */
export function presetSelection(preset: Exclude<RangePreset, 'custom'>): RangeSelection {
  const today = etToday();
  switch (preset) {
    case 'today':
      return { preset, start: today, end: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { preset, start: y, end: y };
    }
    case '7d':
      return { preset, start: etDaysAgo(6), end: today };
    case '30d':
      return { preset, start: etDaysAgo(29), end: today };
    case '90d':
      return { preset, start: etDaysAgo(89), end: today };
  }
}

const FMT_MD = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const FMT_MDY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

function fmtDate(dateStr: string, withYear = false): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return (withYear ? FMT_MDY : FMT_MD).format(d);
}

/** Resolve a selection into start/end + granularity + a human label. */
export function resolveRange(sel: RangeSelection): ResolvedRange {
  const singleDay = sel.start === sel.end;
  const granularity: 'hour' | 'day' = singleDay ? 'hour' : 'day';

  let label: string;
  if (sel.preset === 'today') label = 'Today · hourly';
  else if (sel.preset === 'yesterday') label = 'Yesterday · hourly';
  else if (sel.preset === '7d') label = 'Last 7 days · daily';
  else if (sel.preset === '30d') label = 'Last 30 days · daily';
  else if (sel.preset === '90d') label = 'Last 90 days · daily';
  else if (singleDay) label = `${fmtDate(sel.start)} · hourly`;
  else label = `${fmtDate(sel.start)} – ${fmtDate(sel.end, true)} · daily`;

  return { start: sel.start, end: sel.end, granularity, label };
}

// --- ET day boundaries -> UTC instants (for filtering timestamptz columns) ---

/** Whether a YYYY-MM-DD ET date falls in Eastern Daylight Time. */
function isEasternDST(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const month = m - 1;
  if (month < 2 || month > 10) return false;
  if (month > 2 && month < 10) return true;
  const nthSunday = (year: number, mon: number, n: number) => {
    const first = new Date(Date.UTC(year, mon, 1));
    const daysUntilSunday = (7 - first.getUTCDay()) % 7;
    return 1 + daysUntilSunday + (n - 1) * 7;
  };
  if (month === 2) return d >= nthSunday(y, 2, 2);
  if (month === 10) return d < nthSunday(y, 10, 1);
  return false;
}

/** UTC ISO instant for 00:00 ET at the start of the given ET date. */
export function etDayStartUtc(dateStr: string): string {
  const offset = isEasternDST(dateStr) ? '-04:00' : '-05:00';
  return new Date(`${dateStr}T00:00:00${offset}`).toISOString();
}

/** UTC ISO instant for 00:00 ET at the start of the day AFTER the given ET date. */
export function etDayEndUtc(dateStr: string): string {
  return etDayStartUtc(addDays(dateStr, 1));
}
