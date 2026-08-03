import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseLocalDate, todayLocal, isExpired, daysUntil, expiryStatus } from '@/lib/dateUtils';

// Fixed "now" so nothing goes stale: 15 Jun 2026, 10:30 local.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 15, 10, 30, 0));
});
afterEach(() => vi.useRealTimers());

/** Local-midnight date, built without any string parsing. */
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('parseLocalDate', () => {
  it('parses a bare yyyy-mm-dd as LOCAL midnight, not UTC', () => {
    // The whole point of the helper: `new Date('2026-08-03')` is UTC midnight,
    // which is the previous day in every timezone west of UTC.
    expect(parseLocalDate('2026-08-03')).toEqual(local(2026, 8, 3));
  });

  it('is timezone-independent for date-only values', () => {
    const parsed = parseLocalDate('2026-08-03')!;
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(3);
    expect(parsed.getHours()).toBe(0);
  });

  it('normalises a full timestamp to local midnight', () => {
    expect(parseLocalDate('2026-08-03T18:45:00Z')?.getHours()).toBe(0);
  });

  it('returns null for missing input', () => {
    expect(parseLocalDate(null)).toBeNull();
    expect(parseLocalDate(undefined)).toBeNull();
    expect(parseLocalDate('')).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(parseLocalDate('not-a-date')).toBeNull();
    expect(parseLocalDate('2026-13-45')).toBeNull();
  });

  it('rejects impossible dates instead of silently rolling them over', () => {
    // Raw JS turns 31 Feb into 3 Mar; the helper must not.
    expect(parseLocalDate('2026-02-31')).toBeNull();
    expect(parseLocalDate('2026-04-31')).toBeNull();
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(parseLocalDate('2024-02-29')).toEqual(local(2024, 2, 29));
    expect(parseLocalDate('2026-02-29')).toBeNull();
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseLocalDate('  2026-08-03  ')).toEqual(local(2026, 8, 3));
  });
});

describe('todayLocal', () => {
  it('returns today at local midnight', () => {
    expect(todayLocal()).toEqual(local(2026, 6, 15));
  });
});

describe('isExpired', () => {
  it('is false for a certificate expiring today', () => {
    expect(isExpired('2026-06-15')).toBe(false);
  });

  it('is true from the day after expiry', () => {
    expect(isExpired('2026-06-14')).toBe(true);
  });

  it('is false for a future date', () => {
    expect(isExpired('2026-06-16')).toBe(false);
  });

  it('treats missing or unreadable values as not expired', () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired(undefined)).toBe(false);
    expect(isExpired('not-a-date')).toBe(false);
  });
});

describe('daysUntil', () => {
  it('counts whole days forward and backward', () => {
    expect(daysUntil('2026-06-15')).toBe(0);
    expect(daysUntil('2026-06-16')).toBe(1);
    expect(daysUntil('2026-06-14')).toBe(-1);
    expect(daysUntil('2026-07-15')).toBe(30);
  });

  it('is unaffected by the time of day', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 23, 59, 59));
    expect(daysUntil('2026-06-16')).toBe(1);
  });

  it('returns null when the value is unusable', () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil('nope')).toBeNull();
  });
});

describe('expiryStatus', () => {
  it("reports 'none' when no date is recorded", () => {
    expect(expiryStatus(null)).toBe('none');
    expect(expiryStatus('')).toBe('none');
  });

  it("reports 'invalid' for an unreadable date rather than a false 'valid'", () => {
    expect(expiryStatus('not-a-date')).toBe('invalid');
    expect(expiryStatus('2026-02-31')).toBe('invalid');
  });

  it("reports 'expired' only from the day after expiry", () => {
    expect(expiryStatus('2026-06-14')).toBe('expired');
    expect(expiryStatus('2026-06-15')).toBe('expiring'); // today — still usable
  });

  it("reports 'expiring' inside the window, inclusive of the boundary", () => {
    expect(expiryStatus('2026-07-15')).toBe('expiring'); // exactly +30
    expect(expiryStatus('2026-07-14')).toBe('expiring');
  });

  it("reports 'valid' beyond the window", () => {
    expect(expiryStatus('2026-07-16')).toBe('valid'); // +31
  });

  it('honours a custom warning window', () => {
    expect(expiryStatus('2026-06-22', 7)).toBe('expiring'); // exactly +7
    expect(expiryStatus('2026-06-23', 7)).toBe('valid');
    expect(expiryStatus('2026-07-15', 7)).toBe('valid');
  });

  it('never reports a past date as healthy regardless of the window', () => {
    expect(expiryStatus('2020-01-01', 3650)).toBe('expired');
  });
});
