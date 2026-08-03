import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkSupplierEligibility, riskLevelToScore, classifyRiskLevel } from '@/lib/eligibility';

/** Local-midnight-anchored ISO (yyyy-mm-dd) offset from the frozen "today". */
function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Same as above but with an explicit midday time so string->Date parsing is local, not UTC. */
function localDaysFromNow(days: number): string {
  return `${isoDaysFromNow(days)}T12:00:00`;
}

describe('riskLevelToScore', () => {
  it('maps each known risk level', () => {
    expect(riskLevelToScore('low')).toBe(100);
    expect(riskLevelToScore('medium')).toBe(75);
    expect(riskLevelToScore('high')).toBe(50);
    expect(riskLevelToScore('critical')).toBe(0);
  });

  it('defaults null/undefined to 100', () => {
    expect(riskLevelToScore(null)).toBe(100);
    expect(riskLevelToScore(undefined)).toBe(100);
  });

  it('defaults unknown values to 100', () => {
    expect(riskLevelToScore('bogus' as never)).toBe(100);
  });
});

describe('classifyRiskLevel', () => {
  it('classifies boundary values', () => {
    expect(classifyRiskLevel(0)).toBe('low');
    expect(classifyRiskLevel(30)).toBe('low');
    expect(classifyRiskLevel(30.0001)).toBe('medium');
    expect(classifyRiskLevel(31)).toBe('medium');
    expect(classifyRiskLevel(60)).toBe('medium');
    expect(classifyRiskLevel(61)).toBe('high');
    expect(classifyRiskLevel(80)).toBe('high');
    expect(classifyRiskLevel(81)).toBe('critical');
    expect(classifyRiskLevel(100)).toBe('critical');
  });

  it('treats negative scores as low and >100 as critical', () => {
    expect(classifyRiskLevel(-50)).toBe('low');
    expect(classifyRiskLevel(1000)).toBe('critical');
  });

  it('returns critical for NaN (all comparisons false)', () => {
    // Documents actual behaviour: every `<=` comparison is false for NaN,
    // so the function falls through to 'critical'.
    expect(classifyRiskLevel(Number.NaN)).toBe('critical');
  });

  it('is NOT the inverse of riskLevelToScore (see report: suspected bug)', () => {
    // riskLevelToScore('low') === 100, but classifyRiskLevel(100) === 'critical'.
    // The two functions use opposite score polarities.
    expect(classifyRiskLevel(riskLevelToScore('low'))).toBe('critical');
    expect(classifyRiskLevel(riskLevelToScore('critical'))).toBe('low');
  });
});

describe('checkSupplierEligibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mid-month, mid-day so ±30 day arithmetic never crosses a DST/month edge oddly.
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); // 2026-06-15 local
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('defaults / empty input', () => {
    it('returns fully eligible for an empty supplier object', () => {
      const r = checkSupplierEligibility({});
      expect(r).toEqual({ status: 'eligible', reasons: [], canInvite: true, canAward: true });
    });

    it('treats null supplier_type / risk_level as new + low', () => {
      const r = checkSupplierEligibility({ supplier_type: null, risk_level: null });
      expect(r.status).toBe('eligible');
      expect(r.reasons).toEqual([]);
      expect(r.canInvite).toBe(true);
      expect(r.canAward).toBe(true);
    });

    it('treats undefined certificate_expiry_date as no certificate', () => {
      const r = checkSupplierEligibility({ certificate_expiry_date: undefined });
      expect(r.status).toBe('eligible');
      expect(r.reasons).toEqual([]);
    });

    it('ignores an empty-string certificate_expiry_date (falsy)', () => {
      const r = checkSupplierEligibility({ certificate_expiry_date: '' });
      expect(r.status).toBe('eligible');
      expect(r.reasons).toEqual([]);
    });
  });

  describe('blacklist / blocked short-circuit', () => {
    it('blocks a blacklisted supplier', () => {
      const r = checkSupplierEligibility({ is_blacklisted: true });
      expect(r.status).toBe('blocked');
      expect(r.canInvite).toBe(false);
      expect(r.canAward).toBe(false);
      expect(r.reasons).toEqual(['Supplier is blocked and cannot be invited or awarded.']);
    });

    it("blocks supplier_type 'blocked'", () => {
      const r = checkSupplierEligibility({ supplier_type: 'blocked' });
      expect(r.status).toBe('blocked');
      expect(r.canInvite).toBe(false);
      expect(r.canAward).toBe(false);
    });

    it('short-circuits: no other reasons are collected once blocked', () => {
      const r = checkSupplierEligibility({
        is_blacklisted: true,
        risk_level: 'critical',
        supplier_type: 'nominated',
        status: 'suspended',
        certificate_expiry_date: localDaysFromNow(-100),
      });
      expect(r.reasons).toHaveLength(1);
      expect(r.reasons[0]).toContain('blocked');
    });

    it('is_blacklisted false does not block', () => {
      const r = checkSupplierEligibility({ is_blacklisted: false });
      expect(r.status).toBe('eligible');
    });
  });

  describe('critical risk', () => {
    it('blocks award but still allows invitation', () => {
      const r = checkSupplierEligibility({ risk_level: 'critical' });
      expect(r.status).toBe('blocked');
      expect(r.canAward).toBe(false);
      expect(r.canInvite).toBe(true);
      expect(r.reasons[0]).toContain('Critical risk supplier cannot be awarded');
    });

    it("supplier_type 'critical' alone does not block (only risk_level does)", () => {
      const r = checkSupplierEligibility({ supplier_type: 'critical' });
      expect(r.status).toBe('eligible');
      expect(r.canAward).toBe(true);
    });
  });

  describe('high risk / QA approval', () => {
    it('requires QA when qa_approval_status is missing', () => {
      const r = checkSupplierEligibility({ risk_level: 'high' });
      expect(r.status).toBe('requires_qa');
      expect(r.canAward).toBe(false);
      expect(r.canInvite).toBe(true);
      expect(r.reasons).toContain('High risk supplier requires QA approval before award.');
    });

    it('requires QA when qa_approval_status is pending / rejected / null', () => {
      for (const qa of ['pending', 'rejected', null]) {
        const r = checkSupplierEligibility({ risk_level: 'high', qa_approval_status: qa });
        expect(r.status).toBe('requires_qa');
        expect(r.canAward).toBe(false);
      }
    });

    it("allows award when qa_approval_status is 'approved' but still reports the reason", () => {
      const r = checkSupplierEligibility({ risk_level: 'high', qa_approval_status: 'approved' });
      expect(r.status).toBe('eligible');
      expect(r.canAward).toBe(true);
      expect(r.reasons).toContain('High risk supplier requires QA approval before award.');
    });

    it('medium risk adds no reasons', () => {
      const r = checkSupplierEligibility({ risk_level: 'medium' });
      expect(r).toEqual({ status: 'eligible', reasons: [], canInvite: true, canAward: true });
    });
  });

  describe('certificate expiry boundaries', () => {
    it('flags an expired certificate (yesterday)', () => {
      const r = checkSupplierEligibility({ certificate_expiry_date: localDaysFromNow(-1) });
      expect(r.status).toBe('warning');
      expect(r.canAward).toBe(false);
      expect(r.canInvite).toBe(true);
      expect(r.reasons).toContain(
        'Certificate has expired. An exception approval is required before award.',
      );
    });

    it('does NOT treat a certificate expiring exactly today as expired', () => {
      const r = checkSupplierEligibility({ certificate_expiry_date: localDaysFromNow(0) });
      expect(r.canAward).toBe(true);
      expect(r.status).toBe('warning');
      expect(r.reasons).toEqual(['Certificate expires within 30 days.']);
    });

    it('warns for a certificate expiring in 29 days', () => {
      const r = checkSupplierEligibility({ certificate_expiry_date: localDaysFromNow(29) });
      expect(r.status).toBe('warning');
      expect(r.canAward).toBe(true);
      expect(r.reasons).toEqual(['Certificate expires within 30 days.']);
    });

    it('warns for a certificate expiring exactly in 30 days (inclusive boundary)', () => {
      // Matches docExpiryStatus so the same certificate never reads as fine on one
      // screen and expiring on another.
      const r = checkSupplierEligibility({ certificate_expiry_date: isoDaysFromNow(30) });
      expect(r.status).toBe('warning');
      expect(r.reasons).toContain('Certificate expires within 30 days.');
    });

    it('does not warn for a certificate expiring in 31+ days', () => {
      const r = checkSupplierEligibility({ certificate_expiry_date: localDaysFromNow(31) });
      expect(r.status).toBe('eligible');
      expect(r.reasons).toEqual([]);
      expect(r.canAward).toBe(true);
    });

    it('surfaces an unparseable expiry date instead of ignoring it', () => {
      const r = checkSupplierEligibility({ certificate_expiry_date: 'not-a-date' });
      expect(r.status).toBe('warning');
      expect(r.reasons).toContain('Certificate expiry date is unreadable and must be corrected.');
    });

    it('treats a bare yyyy-mm-dd for today as still valid in any timezone', () => {
      // A date-only value is parsed as LOCAL midnight, so a certificate expiring
      // today is never reported as already expired — previously it was, in every
      // timezone west of UTC.
      const r = checkSupplierEligibility({ certificate_expiry_date: isoDaysFromNow(0) });
      expect(r.canAward).toBe(true);
      expect(r.reasons).not.toContain(
        'Certificate has expired. An exception approval is required before award.',
      );
    });
  });

  describe('nominated suppliers', () => {
    it('blocks award and sets requires_nomination', () => {
      const r = checkSupplierEligibility({ supplier_type: 'nominated' });
      expect(r.status).toBe('requires_nomination');
      expect(r.canAward).toBe(false);
      expect(r.canInvite).toBe(true);
      expect(r.reasons).toContain(
        'Nominated supplier must have customer nomination evidence before award.',
      );
    });

    it('does not downgrade an existing warning status', () => {
      const r = checkSupplierEligibility({
        supplier_type: 'nominated',
        certificate_expiry_date: localDaysFromNow(-1),
      });
      expect(r.status).toBe('warning');
      expect(r.reasons).toHaveLength(2);
      expect(r.canAward).toBe(false);
    });

    it('does not downgrade requires_qa', () => {
      const r = checkSupplierEligibility({ supplier_type: 'nominated', risk_level: 'high' });
      expect(r.status).toBe('requires_qa');
      expect(r.canAward).toBe(false);
    });
  });

  describe('suspended accounts', () => {
    it('blocks invite and award and overrides any prior status', () => {
      const r = checkSupplierEligibility({ status: 'suspended', supplier_type: 'nominated' });
      expect(r.status).toBe('blocked');
      expect(r.canInvite).toBe(false);
      expect(r.canAward).toBe(false);
      expect(r.reasons).toContain('Supplier account is suspended.');
    });

    it('other status values are ignored', () => {
      expect(checkSupplierEligibility({ status: 'active' }).status).toBe('eligible');
      expect(checkSupplierEligibility({ status: '' }).status).toBe('eligible');
    });
  });

  describe('combinations', () => {
    it('accumulates every applicable reason', () => {
      const r = checkSupplierEligibility({
        risk_level: 'critical',
        supplier_type: 'nominated',
        certificate_expiry_date: localDaysFromNow(-5),
        status: 'suspended',
      });
      expect(r.status).toBe('blocked');
      expect(r.canInvite).toBe(false);
      expect(r.canAward).toBe(false);
      expect(r.reasons).toHaveLength(4);
    });

    it('critical risk + high-ish combos keep canInvite true without suspension', () => {
      const r = checkSupplierEligibility({
        risk_level: 'critical',
        certificate_expiry_date: localDaysFromNow(10),
      });
      expect(r.canInvite).toBe(true);
      expect(r.canAward).toBe(false);
      expect(r.status).toBe('blocked'); // warning does not overwrite blocked
      expect(r.reasons).toHaveLength(2);
    });

    it('returns a fresh reasons array per call', () => {
      const a = checkSupplierEligibility({ risk_level: 'high' });
      const b = checkSupplierEligibility({ risk_level: 'high' });
      expect(a.reasons).not.toBe(b.reasons);
    });
  });
});
