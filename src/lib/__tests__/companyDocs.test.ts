import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// companyDocs imports the real Supabase client, which throws at module load when
// VITE_SUPABASE_* env vars are absent. Stub it — only the pure exports are tested.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => ({ eq: () => ({ data: [] }) }) }) }) },
}));

import { safeStorageName, docExpiryStatus } from '@/lib/companyDocs';

/** yyyy-mm-dd for a local date offset from the frozen "today". */
function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local-noon timestamp so parsing is timezone-independent. */
const localDaysFromNow = (days: number) => `${isoDaysFromNow(days)}T12:00:00`;

describe('safeStorageName', () => {
  describe('plain ASCII names', () => {
    it('leaves a already-safe name untouched', () => {
      expect(safeStorageName('invoice_2026-01.pdf')).toBe('invoice_2026-01.pdf');
      expect(safeStorageName('Report-v2.PDF')).toBe('Report-v2.PDF');
    });

    it('replaces spaces with a single underscore', () => {
      expect(safeStorageName('my file.pdf')).toBe('my_file.pdf');
      expect(safeStorageName('my   spaced   file.pdf')).toBe('my_spaced_file.pdf');
    });

    it('collapses runs of unsafe characters into one underscore', () => {
      expect(safeStorageName('a!!!@@@b.pdf')).toBe('a_b.pdf');
      expect(safeStorageName('a (1) [copy].png')).toBe('a_1_copy_.png');
    });

    it('keeps underscores and hyphens', () => {
      expect(safeStorageName('a_b-c.txt')).toBe('a_b-c.txt');
    });
  });

  describe('Thai characters', () => {
    it('collapses an all-Thai base name to a single underscore', () => {
      expect(safeStorageName('เอกสาร.pdf')).toBe('_.pdf');
      expect(safeStorageName('ภพ.20.pdf')).toBe('_20.pdf');
    });

    it('keeps ASCII parts around Thai characters', () => {
      expect(safeStorageName('doc-ใบรับรอง-2026.pdf')).toBe('doc-_-2026.pdf');
    });

    it('handles Thai with spaces', () => {
      expect(safeStorageName('หนังสือ รับรอง บริษัท.pdf')).toBe('_.pdf');
    });

    it('produces an ASCII-only result for any Thai input', () => {
      const out = safeStorageName('สำเนาบัตรประชาชน ๑๒๓.jpeg');
      // eslint-disable-next-line no-control-regex
      expect(/^[\x00-\x7F]*$/.test(out)).toBe(true);
      expect(out).toBe('_.jpeg');
    });
  });

  describe('extensions', () => {
    it('returns the base unchanged when there is no extension', () => {
      expect(safeStorageName('README')).toBe('README');
      expect(safeStorageName('my file')).toBe('my_file');
      expect(safeStorageName('เอกสาร')).toBe('_');
    });

    it('treats a leading dot as part of the base, not an extension', () => {
      // lastIndexOf('.') === 0 fails the `dot > 0` guard.
      expect(safeStorageName('.gitignore')).toBe('_gitignore');
      expect(safeStorageName('.pdf')).toBe('_pdf');
    });

    it('splits on the LAST dot only', () => {
      expect(safeStorageName('a.b.c.pdf')).toBe('a_b_c.pdf');
      expect(safeStorageName('archive.tar.gz')).toBe('archive_tar.gz');
    });

    it('strips unsafe characters from the extension too', () => {
      expect(safeStorageName('doc.ไทย')).toBe('doc.');
      expect(safeStorageName('doc.p df')).toBe('doc.pdf');
    });

    it('handles a trailing dot (empty extension)', () => {
      expect(safeStorageName('file.')).toBe('file.');
    });

    it('handles consecutive dots before the extension', () => {
      // Split is on the LAST dot, so base is 'name..' -> 'name_' and ext is '.pdf'.
      expect(safeStorageName('name...pdf')).toBe('name_.pdf');
    });
  });

  describe('fallbacks and limits', () => {
    it("falls back to 'file' for an empty name", () => {
      expect(safeStorageName('')).toBe('file');
    });

    it('truncates the base to 60 characters, keeping the extension', () => {
      const long = 'a'.repeat(200) + '.pdf';
      const out = safeStorageName(long);
      expect(out).toBe('a'.repeat(60) + '.pdf');
      expect(out).toHaveLength(64);
    });

    it('truncates after sanitising, not before', () => {
      const name = 'x y '.repeat(50) + '.pdf'; // sanitises to x_y_x_y_...
      const out = safeStorageName(name);
      expect(out.slice(0, -4)).toHaveLength(60);
      expect(out.endsWith('.pdf')).toBe(true);
    });

    it('does not truncate a long extension (only the base is capped)', () => {
      const out = safeStorageName('a.' + 'z'.repeat(100));
      expect(out).toBe('a.' + 'z'.repeat(100));
    });

    it('never returns an empty string', () => {
      for (const n of ['', '.', '..', 'ก', ' ', '   ']) {
        expect(safeStorageName(n).length).toBeGreaterThan(0);
      }
    });
  });
});

describe('docExpiryStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); // 2026-06-15 local, midday
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'none' for null", () => {
    expect(docExpiryStatus(null)).toBe('none');
  });

  it("returns 'none' for an empty string (falsy)", () => {
    expect(docExpiryStatus('')).toBe('none');
  });

  it("returns 'none' for undefined", () => {
    expect(docExpiryStatus(undefined as unknown as null)).toBe('none');
  });

  it("returns 'expired' for yesterday", () => {
    expect(docExpiryStatus(localDaysFromNow(-1))).toBe('expired');
  });

  it("returns 'expired' for long-past dates", () => {
    expect(docExpiryStatus('2020-01-01T12:00:00')).toBe('expired');
  });

  it("returns 'expiring' for exactly today (boundary, not expired)", () => {
    expect(docExpiryStatus(localDaysFromNow(0))).toBe('expiring');
  });

  it("returns 'expiring' inside the 30-day window", () => {
    expect(docExpiryStatus(localDaysFromNow(1))).toBe('expiring');
    expect(docExpiryStatus(localDaysFromNow(15))).toBe('expiring');
    expect(docExpiryStatus(localDaysFromNow(29))).toBe('expiring');
  });

  it("returns 'expiring' for exactly +30 days (inclusive <=)", () => {
    expect(docExpiryStatus(localDaysFromNow(30))).toBe('expiring');
  });

  it("returns 'valid' from +31 days onward", () => {
    expect(docExpiryStatus(localDaysFromNow(31))).toBe('valid');
    expect(docExpiryStatus(localDaysFromNow(365))).toBe('valid');
  });

  it('normalises the time-of-day component (late-in-day expiry today is not expired)', () => {
    expect(docExpiryStatus(`${isoDaysFromNow(0)}T23:59:59`)).toBe('expiring');
    expect(docExpiryStatus(`${isoDaysFromNow(0)}T00:00:00`)).toBe('expiring');
  });

  it("returns 'valid' for an unparseable date (see report: suspected bug)", () => {
    // NaN fails every comparison, so garbage silently reads as a valid document.
    expect(docExpiryStatus('not-a-date')).toBe('valid');
    expect(docExpiryStatus('2026-13-45')).toBe('valid');
  });

  it('is stable across the day boundary via fake timers', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 23, 59, 59));
    expect(docExpiryStatus(localDaysFromNow(0))).toBe('expiring');
    vi.setSystemTime(new Date(2026, 5, 16, 0, 0, 1));
    expect(docExpiryStatus('2026-06-15T12:00:00')).toBe('expired');
  });
});
