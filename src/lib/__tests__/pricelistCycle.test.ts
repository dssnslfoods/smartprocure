import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  assessCycle,
  DEFAULT_CYCLE,
  CYCLE_STATUS_LABEL,
  CYCLE_STATUS_CLASS,
  type CycleStatus,
} from '@/lib/pricelistCycle';

const DAY = 24 * 3600 * 1000;

// Frozen "now" used by every date-sensitive test below.
const NOW = new Date('2026-08-03T05:00:00.000Z');

/** ISO string for a moment `days` days before NOW (fractions allowed). */
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

describe('DEFAULT_CYCLE', () => {
  it('defaults to a 90 day update cycle and 90 day hold', () => {
    expect(DEFAULT_CYCLE).toEqual({ update_cycle_days: 90, hold_until_days: 90 });
  });
});

describe('CYCLE_STATUS_LABEL / CYCLE_STATUS_CLASS', () => {
  const statuses: CycleStatus[] = ['never', 'fresh', 'due_soon', 'overdue'];

  it('has a Thai label for every status', () => {
    expect(Object.keys(CYCLE_STATUS_LABEL).sort()).toEqual([...statuses].sort());
    for (const s of statuses) {
      expect(typeof CYCLE_STATUS_LABEL[s]).toBe('string');
      expect(CYCLE_STATUS_LABEL[s].length).toBeGreaterThan(0);
    }
    expect(CYCLE_STATUS_LABEL.never).toBe('ยังไม่ส่ง');
    expect(CYCLE_STATUS_LABEL.fresh).toBe('ส่งแล้ว');
    expect(CYCLE_STATUS_LABEL.due_soon).toBe('ใกล้ครบรอบ');
    expect(CYCLE_STATUS_LABEL.overdue).toBe('เกินรอบ');
  });

  it('has a distinct badge class for every status', () => {
    expect(Object.keys(CYCLE_STATUS_CLASS).sort()).toEqual([...statuses].sort());
    const values = statuses.map(s => CYCLE_STATUS_CLASS[s]);
    expect(new Set(values).size).toBe(statuses.length);
  });
});

describe('assessCycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('no submission yet', () => {
    it('returns the "never" assessment for null', () => {
      expect(assessCycle(null, 90)).toEqual({
        status: 'never',
        lastAt: null,
        nextDueAt: null,
        daysSince: null,
        daysRemaining: null,
      });
    });

    it('treats an empty string as "never" (falsy short-circuit)', () => {
      expect(assessCycle('', 90)).toEqual({
        status: 'never',
        lastAt: null,
        nextDueAt: null,
        daysSince: null,
        daysRemaining: null,
      });
    });

    it('ignores cycleDays entirely when there is no submission', () => {
      expect(assessCycle(null, 0).status).toBe('never');
      expect(assessCycle(null, -5).status).toBe('never');
    });
  });

  describe('status boundaries (90 day cycle)', () => {
    it('is "fresh" when submitted just now', () => {
      const r = assessCycle(daysAgo(0), 90);
      expect(r.status).toBe('fresh');
      expect(r.daysSince).toBe(0);
      expect(r.daysRemaining).toBe(90);
    });

    it('is "fresh" at exactly 8 days remaining (one past the warning threshold)', () => {
      const r = assessCycle(daysAgo(82), 90);
      expect(r.daysRemaining).toBe(8);
      expect(r.status).toBe('fresh');
    });

    it('is "due_soon" at exactly 7 days remaining (threshold is inclusive)', () => {
      const r = assessCycle(daysAgo(83), 90);
      expect(r.daysRemaining).toBe(7);
      expect(r.status).toBe('due_soon');
    });

    it('is "due_soon" at exactly 0 days remaining (due today, not yet overdue)', () => {
      const r = assessCycle(daysAgo(90), 90);
      expect(r.daysRemaining).toBe(0);
      expect(r.daysSince).toBe(90);
      expect(r.status).toBe('due_soon');
    });

    it('is "overdue" once a full day past due', () => {
      const r = assessCycle(daysAgo(91), 90);
      expect(r.daysRemaining).toBe(-1);
      expect(r.status).toBe('overdue');
    });

    it('is "overdue" well past the cycle and reports how many days late', () => {
      const r = assessCycle(daysAgo(100), 90);
      expect(r.daysSince).toBe(100);
      expect(r.daysRemaining).toBe(-10);
      expect(r.status).toBe('overdue');
    });
  });

  describe('sub-day rounding', () => {
    it('floors daysSince (partial days do not count)', () => {
      const r = assessCycle(daysAgo(9.9), 90);
      expect(r.daysSince).toBe(9);
    });

    it('ceils daysRemaining, so any remaining fraction counts as a whole day', () => {
      // 89.5 days elapsed of a 90 day cycle => 0.5 days left => ceil => 1
      const r = assessCycle(daysAgo(89.5), 90);
      expect(r.daysRemaining).toBe(1);
      expect(r.status).toBe('due_soon');
    });

    it('a fraction of a day past due still ceils to 0 and stays "due_soon"', () => {
      const r = assessCycle(daysAgo(90.5), 90);
      expect(r.daysRemaining).toBe(-0); // Math.ceil(-0.5) === -0
      expect(r.daysRemaining! === 0).toBe(true);
      expect(r.status).toBe('due_soon');
    });
  });

  describe('returned dates', () => {
    it('echoes the parsed submission date and derives nextDueAt = last + cycleDays', () => {
      const iso = '2026-05-05T05:00:00.000Z';
      const r = assessCycle(iso, 90);
      expect(r.lastAt).toBeInstanceOf(Date);
      expect(r.lastAt!.toISOString()).toBe(iso);
      expect(r.nextDueAt).toBeInstanceOf(Date);
      expect(r.nextDueAt!.getTime()).toBe(new Date(iso).getTime() + 90 * DAY);
    });

    it('accepts a date-only ISO string', () => {
      const r = assessCycle('2026-08-01', 90);
      expect(r.lastAt!.toISOString()).toBe('2026-08-01T00:00:00.000Z');
      expect(r.status).toBe('fresh');
    });
  });

  describe('unusual cycle lengths', () => {
    it('cycleDays = 0 makes a submission made right now due immediately (due_soon)', () => {
      const r = assessCycle(daysAgo(0), 0);
      expect(r.nextDueAt!.getTime()).toBe(r.lastAt!.getTime());
      expect(r.daysRemaining).toBe(0);
      expect(r.status).toBe('due_soon');
    });

    it('cycleDays = 0 makes any past submission overdue', () => {
      const r = assessCycle(daysAgo(1), 0);
      expect(r.daysRemaining).toBe(-1);
      expect(r.status).toBe('overdue');
    });

    it('a negative cycle is always overdue', () => {
      const r = assessCycle(daysAgo(0), -10);
      expect(r.daysRemaining).toBe(-10);
      expect(r.status).toBe('overdue');
    });

    it('a very long cycle stays fresh', () => {
      const r = assessCycle(daysAgo(0), 3650);
      expect(r.status).toBe('fresh');
      expect(r.daysRemaining).toBe(3650);
    });
  });

  describe('edge cases', () => {
    it('reports negative daysSince for a submission dated in the future', () => {
      const r = assessCycle(daysAgo(-10), 90); // 10 days from now
      expect(r.daysSince).toBe(-10);
      expect(r.daysRemaining).toBe(100);
      expect(r.status).toBe('fresh');
    });

    // Documents current behaviour: an unparsable date yields NaN arithmetic and,
    // because every NaN comparison is false, silently falls through to "fresh".
    it('reports an unparsable date as "never" rather than a healthy "fresh"', () => {
      const r = assessCycle('not-a-real-date', 90);
      expect(r.status).toBe('never');
      expect(r.lastAt).toBeNull();
      expect(r.nextDueAt).toBeNull();
      expect(r.daysSince).toBeNull();
      expect(r.daysRemaining).toBeNull();
    });

    it('does not mutate or depend on call order', () => {
      const first = assessCycle(daysAgo(10), 90);
      const second = assessCycle(daysAgo(10), 90);
      expect(second).toEqual(first);
    });
  });
});
