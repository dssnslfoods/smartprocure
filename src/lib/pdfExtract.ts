// Extract text and expiry date from PDF files client-side using pdfjs-dist

import * as pdfjsLib from 'pdfjs-dist';

// Use local worker to avoid CDN dependency
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const texts: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texts.push(content.items.map((item: any) => item.str).join(' '));
  }
  return texts.join('\n');
}

// Thai month names
const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1, กุมภาพันธ์: 2, มีนาคม: 3, เมษายน: 4,
  พฤษภาคม: 5, มิถุนายน: 6, กรกฎาคม: 7, สิงหาคม: 8,
  กันยายน: 9, ตุลาคม: 10, พฤศจิกายน: 11, ธันวาคม: 12,
};

const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, oct: 10, nov: 11, dec: 12,
};

function thaiYearToAD(year: number): number {
  // Thai Buddhist Era: BE = AD + 543
  return year > 2400 ? year - 543 : year;
}

export function extractExpiryDate(text: string): Date | null {
  const normalized = text.replace(/\s+/g, ' ');

  // Keywords that indicate expiry
  const expiryKeywords = [
    'expir', 'valid until', 'valid thru', 'valid through', 'validity',
    'หมดอายุ', 'สิ้นสุด', 'ใช้ได้ถึง', 'วันสิ้นอายุ', 'expire',
  ];

  const lines = normalized.split(/[\n\r|]/);
  const candidates: { date: Date; proximity: number }[] = [];

  // Pattern 1: DD/MM/YYYY or DD-MM-YYYY
  const p1 = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g;
  // Pattern 2: YYYY-MM-DD (ISO)
  const p2 = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g;
  // Pattern 3: DD MonthName YYYY (EN or TH)
  const p3 = /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})/gi;
  // Pattern 4: Thai DD MonthName BE/AD
  const thaiMonthPattern = Object.keys(THAI_MONTHS).join('|');
  const p4 = new RegExp(`(\\d{1,2})\\s+(${thaiMonthPattern})\\s+(\\d{4})`, 'g');
  // Pattern 5: MonthName DD, YYYY
  const p5 = /(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})[,\s]+(\d{4})/gi;

  const allPatterns = [p1, p2, p3, p4, p5];

  lines.forEach((line, lineIdx) => {
    const lowerLine = line.toLowerCase();
    const isNearKeyword = expiryKeywords.some(k => lowerLine.includes(k));
    const proximity = isNearKeyword ? 10 : lineIdx;

    // P1: DD/MM/YYYY
    let m: RegExpExecArray | null;
    const rp1 = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g;
    while ((m = rp1.exec(line)) !== null) {
      const y = thaiYearToAD(parseInt(m[3]));
      const mo = parseInt(m[2]);
      const d = parseInt(m[1]);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        candidates.push({ date: new Date(y, mo - 1, d), proximity });
      }
    }

    // P2: YYYY-MM-DD
    const rp2 = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g;
    while ((m = rp2.exec(line)) !== null) {
      const y = thaiYearToAD(parseInt(m[1]));
      const mo = parseInt(m[2]);
      const d = parseInt(m[3]);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        candidates.push({ date: new Date(y, mo - 1, d), proximity });
      }
    }

    // P3: EN month name
    const rp3 = /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})/gi;
    while ((m = rp3.exec(line)) !== null) {
      const mo = EN_MONTHS[m[2].toLowerCase()];
      const y = thaiYearToAD(parseInt(m[3]));
      const d = parseInt(m[1]);
      if (mo && d >= 1 && d <= 31) {
        candidates.push({ date: new Date(y, mo - 1, d), proximity });
      }
    }

    // P4: Thai month name
    const rp4 = new RegExp(`(\\d{1,2})\\s+(${thaiMonthPattern})\\s+(\\d{4})`, 'g');
    while ((m = rp4.exec(line)) !== null) {
      const mo = THAI_MONTHS[m[2]];
      const y = thaiYearToAD(parseInt(m[3]));
      const d = parseInt(m[1]);
      if (mo && d >= 1 && d <= 31) {
        candidates.push({ date: new Date(y, mo - 1, d), proximity });
      }
    }

    // P5: Month DD, YYYY
    const rp5 = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})[,\s]+(\d{4})/gi;
    while ((m = rp5.exec(line)) !== null) {
      const mo = EN_MONTHS[m[1].toLowerCase()];
      const y = thaiYearToAD(parseInt(m[3]));
      const d = parseInt(m[2]);
      if (mo && d >= 1 && d <= 31) {
        candidates.push({ date: new Date(y, mo - 1, d), proximity });
      }
    }
  });

  if (candidates.length === 0) return null;

  // Prefer dates near expiry keywords, then latest date (most likely to be expiry)
  const future = candidates.filter(c => c.date > new Date(2000, 0, 1));
  if (future.length === 0) return null;

  const keywordMatches = future.filter(c => c.proximity === 10);
  const pool = keywordMatches.length > 0 ? keywordMatches : future;

  // Return latest date from the best pool
  return pool.reduce((best, c) => c.date > best.date ? c : best).date;
}

export function certStatus(expiryDate: Date | null | undefined): 'valid' | 'expiring' | 'expired' | 'unknown' {
  if (!expiryDate) return 'unknown';
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (expiryDate < now) return 'expired';
  if (expiryDate < in30) return 'expiring';
  return 'valid';
}

export function certStatusLabel(status: ReturnType<typeof certStatus>): string {
  return { valid: 'ใช้งานได้', expiring: 'ใกล้หมดอายุ', expired: 'หมดอายุแล้ว', unknown: 'ไม่ระบุ' }[status];
}

export function certStatusColor(status: ReturnType<typeof certStatus>): string {
  return {
    valid:    'bg-green-100 text-green-800 border-green-200',
    expiring: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    expired:  'bg-red-100 text-red-800 border-red-200',
    unknown:  'bg-gray-100 text-gray-600 border-gray-200',
  }[status];
}
