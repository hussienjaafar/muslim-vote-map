/**
 * ActBlue Timestamp Normalization Utility
 *
 * ActBlue sends timestamps in Eastern Time (America/New_York), often without
 * a timezone suffix. This utility normalizes them to proper UTC before storage
 * in PostgreSQL's TIMESTAMPTZ columns.
 *
 * Without this normalization:
 * - "2026-06-08 13:34:22" (intended as EDT) -> stored as 13:34 UTC
 * - When converted back to ET -> 09:34 ET (wrong by 4 hours)
 *
 * With this normalization:
 * - "2026-06-08 13:34:22" (no TZ) -> "2026-06-08T17:34:22.000Z" (correct UTC)
 * - When converted back to ET -> 13:34 ET (correct)
 */

/**
 * Normalizes ActBlue timestamps to proper UTC ISO 8601 format.
 *
 * @param timestamp - Raw timestamp from ActBlue (date, paidAt, createdAt, etc.)
 * @returns ISO 8601 UTC timestamp (e.g., "2026-06-08T17:34:22.000Z")
 */
export function normalizeActBlueTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) {
    return new Date().toISOString();
  }

  const trimmed = String(timestamp).trim();

  // Already carries timezone info: "Z", "+HH:MM", "-HH:MM", "+HHMM", "-HHMM"
  const hasTimezone = /[Zz]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed);

  if (hasTimezone) {
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) {
      console.warn('[actblue-timezone] Invalid timestamp with TZ:', trimmed);
      return new Date().toISOString();
    }
    return parsed.toISOString();
  }

  // No timezone suffix - assume Eastern Time. Determine EST (-05:00) vs EDT (-04:00).
  const isoMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/,
  );

  if (isoMatch) {
    const [, year, month, day, hour, minute, second, ms] = isoMatch;
    const dateForDST = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const offset = isEasternDST(dateForDST) ? '-04:00' : '-05:00';
    const msStr = ms ? `.${ms}` : '';
    const withTimezone = `${year}-${month}-${day}T${hour}:${minute}:${second}${msStr}${offset}`;
    const parsed = new Date(withTimezone);
    if (isNaN(parsed.getTime())) {
      console.warn('[actblue-timezone] Failed to parse reconstructed timestamp:', withTimezone);
      return new Date().toISOString();
    }
    return parsed.toISOString();
  }

  // Date-only format: YYYY-MM-DD (assume midnight Eastern)
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const dateForDST = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const offset = isEasternDST(dateForDST) ? '-04:00' : '-05:00';
    const withTimezone = `${year}-${month}-${day}T00:00:00${offset}`;
    const parsed = new Date(withTimezone);
    if (isNaN(parsed.getTime())) {
      console.warn('[actblue-timezone] Failed to parse date-only timestamp:', trimmed);
      return new Date().toISOString();
    }
    return parsed.toISOString();
  }

  // Fallback: native parsing (less reliable)
  console.warn('[actblue-timezone] Unknown format, using native parsing:', trimmed);
  const fallback = new Date(trimmed);
  if (isNaN(fallback.getTime())) {
    console.error('[actblue-timezone] Unparseable timestamp:', trimmed);
    return new Date().toISOString();
  }
  return fallback.toISOString();
}

/**
 * Determines if a given date falls within Eastern Daylight Time (EDT).
 * US DST rules (since 2007): 2nd Sunday in March through 1st Sunday in November.
 */
function isEasternDST(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed

  if (month < 2 || month > 10) return false; // Jan, Feb, Dec
  if (month > 2 && month < 10) return true; // Apr - Oct

  if (month === 2) {
    const secondSunday = getNthSundayOfMonth(year, 2, 2);
    return date.getDate() >= secondSunday;
  }
  if (month === 10) {
    const firstSunday = getNthSundayOfMonth(year, 10, 1);
    return date.getDate() < firstSunday;
  }
  return false;
}

/** Day-of-month for the Nth Sunday of a given (0-indexed) month. */
function getNthSundayOfMonth(year: number, month: number, n: number): number {
  const firstDay = new Date(year, month, 1);
  const daysUntilSunday = (7 - firstDay.getDay()) % 7;
  const firstSunday = 1 + daysUntilSunday;
  return firstSunday + (n - 1) * 7;
}
