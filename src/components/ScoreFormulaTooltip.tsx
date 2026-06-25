import { Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

// Single source of truth for the bid-scoring formulas shown in tooltips.
// Mirrors the logic in src/lib/scoring.ts and src/lib/bidRisk.ts.
export const SCORE_FORMULAS: Record<string, { title: string; lines: string[] }> = {
  commercial: {
    title: 'Commercial (น้ำหนัก 60%)',
    lines: [
      'Commercial = Price×60% + Lead Time×30% + Payment Term×10%',
      'Price = ราคาต่ำสุด ÷ ราคารายนี้ × 100 (ถูกสุด = 100)',
      'Lead Time = lead ต่ำสุด ÷ lead รายนี้ × 100',
      'Payment Term = ตามวันเครดิต (≤15:90, ≤30:80, ≤45:70, ≤60:60 …)',
    ],
  },
  technical: {
    title: 'Technical (น้ำหนัก 25%)',
    lines: [
      'Technical = Σ(น้ำหนักข้อที่ผ่าน) ÷ Σ(น้ำหนักทั้งหมด) × 100',
      'จาก Technical checklist ที่ supplier กรอกตอนเสนอราคา',
      '(ถ้าไม่มี checklist ใช้ค่า Spec Compliance % ที่กรอกเอง)',
    ],
  },
  risk: {
    title: 'Risk Score (น้ำหนัก 15%)',
    lines: [
      'Risk Score = (1 − BRC/10) × 100  (ยิ่งปลอดภัย ยิ่งสูง)',
      'BRC = ความเสี่ยงเฉลี่ยถ่วงน้ำหนักตามเกณฑ์ของหมวด catalog ที่ดึง item มา',
      'ขาดเกณฑ์บังคับ → ด้านนั้น = 10/10 (เสี่ยงสูงสุด → Risk Score 0)',
    ],
  },
  final: {
    title: 'Final Score',
    lines: [
      'Final = Commercial×60% + Technical×25% + Risk×15%',
      'เรียงอันดับจาก Final มาก → น้อย',
    ],
  },
};

/** Small info icon that reveals a scoring formula on hover. */
export function ScoreInfo({ k }: { k: keyof typeof SCORE_FORMULAS }) {
  const f = SCORE_FORMULAS[k];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={`สูตร ${f.title}`} className="inline-flex align-middle ml-1 text-muted-foreground hover:text-foreground">
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-semibold mb-1">{f.title}</p>
        {f.lines.map((l, i) => <p key={i} className="text-xs leading-relaxed">{l}</p>)}
      </TooltipContent>
    </Tooltip>
  );
}
