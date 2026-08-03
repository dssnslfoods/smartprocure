// Single source of truth for expiry-date handling.
//
// Postgres `date` columns arrive as a bare `yyyy-mm-dd` string. `new Date('2026-08-03')`
// parses that as **UTC** midnight, so comparing it against a **local** midnight shifts the
// effective date by a day in every timezone west of UTC — a certificate expiring today
// reads as already expired. These helpers always parse date-only values as LOCAL midnight.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a date value to LOCAL midnight. Returns null when missing or unparseable. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const m = DATE_ONLY.exec(String(value).trim());
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    // Reject impossible dates that JS would roll over (e.g. 2026-02-31 → 3 Mar).
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  const dt = new Date(String(value));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/** Today at local midnight. */
export function todayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * True when the value is a usable date strictly before today.
 * Missing or unparseable values are NOT treated as expired — callers that need to
 * surface bad data should use `expiryStatus`, which reports 'invalid' explicitly.
 */
export function isExpired(value: string | null | undefined): boolean {
  const d = parseLocalDate(value);
  return d !== null && d < todayLocal();
}

/** Whole days from today until the date (negative when past). null when unusable. */
export function daysUntil(value: string | null | undefined): number | null {
  const d = parseLocalDate(value);
  if (d === null) return null;
  return Math.round((d.getTime() - todayLocal().getTime()) / 86_400_000);
}

export type ExpiryStatus = 'valid' | 'expiring' | 'expired' | 'none' | 'invalid';

/**
 * Classify an expiry date. `warnDays` is inclusive — exactly `warnDays` away is
 * already 'expiring'. An unparseable value reports 'invalid' rather than silently
 * reading as healthy.
 */
export function expiryStatus(value: string | null | undefined, warnDays = 30): ExpiryStatus {
  if (value == null || value === '') return 'none';
  const days = daysUntil(value);
  if (days === null) return 'invalid';
  if (days < 0) return 'expired';
  if (days <= warnDays) return 'expiring';
  return 'valid';
}
