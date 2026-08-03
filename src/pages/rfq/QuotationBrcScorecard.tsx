import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck, CheckCircle2, CircleDashed, AlertTriangle, Zap,
  FileBadge, FileText, UserCheck,
} from 'lucide-react';
import { SUPPLIER_TYPE_LABEL, type BrcAssessment, type TopicResult } from '@/lib/brcScoring';

const GRADE_BADGE: Record<string, string> = {
  A: 'bg-green-600 text-white',
  B: 'bg-blue-600 text-white',
  C: 'bg-orange-500 text-white',
  D: 'bg-red-600 text-white',
};

/** The quotation values that drove the Competition (commercial) scores. */
export interface QuoteCtxInfo {
  netPrice: number;
  minPrice: number;
  currency: string;
  leadTimeDays: number | null;
  minLeadTimeDays: number | null;
  paymentTerm: string | null;
  paymentTermDays: number | null;
}

/** Explain, per commercial topic, which quotation value produced the score. */
function commercialBasis(r: TopicResult, ctx: QuoteCtxInfo): string | null {
  switch (r.topic.quotation_field) {
    case 'price':
      return `ราคาสุทธิ ${ctx.currency} ${ctx.netPrice.toLocaleString()}`
        + (ctx.minPrice > 0 ? ` · ต่ำสุดในรอบนี้ ${ctx.currency} ${ctx.minPrice.toLocaleString()}` : '');
    case 'delivery':
      return ctx.leadTimeDays != null
        ? `Lead time ${ctx.leadTimeDays} วัน` + (ctx.minLeadTimeDays != null ? ` · เร็วสุดในรอบนี้ ${ctx.minLeadTimeDays} วัน` : '')
        : 'ไม่ได้ระบุ Lead time ในใบเสนอราคา';
    case 'credit':
      return ctx.paymentTermDays != null
        ? `เครดิต ${ctx.paymentTermDays} วัน (จาก "${ctx.paymentTerm ?? '—'}")`
        : `อ่านจำนวนวันจาก "${ctx.paymentTerm ?? '—'}" ไม่ได้`;
    default:
      return null;
  }
}

export default function QuotationBrcScorecard({ brc, ctx }: { brc: BrcAssessment; ctx: QuoteCtxInfo }) {
  const safety = brc.topics.filter(r => r.topic.criterion_group !== 'commercial');
  const commercial = brc.topics.filter(r => r.topic.criterion_group === 'commercial');
  const commercialScore = commercial.reduce((a, r) => a + r.score, 0);
  const commercialMax = commercial.reduce((a, r) => a + r.maxScore, 0);
  const sections = Array.from(new Set(safety.map(r => r.topic.section)));

  const TopicRow = ({ r }: { r: TopicResult }) => {
    const basis = r.topic.criterion_group === 'commercial' ? commercialBasis(r, ctx) : null;
    return (
      <div className="flex items-start justify-between gap-3 py-1.5 border-b last:border-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {r.pending
              ? <CircleDashed className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              : <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${r.score >= r.maxScore ? 'text-green-600' : r.score > 0 ? 'text-blue-500' : 'text-red-400'}`} />}
            <span className="text-xs font-medium">{r.topic.topic}</span>
            {r.mandatoryMet === false && (
              <Badge variant="outline" className="text-[9px] py-0 gap-0.5 border-red-300 bg-red-50 text-red-700">
                <AlertTriangle className="w-2.5 h-2.5" />ไม่ผ่านบังคับ
              </Badge>
            )}
          </div>
          {/* Matched evidence (safety) */}
          {r.matchedOptions.length > 0 && (
            <div className="ml-5 mt-0.5 space-y-0.5">
              {r.matchedOptions.map((m, i) => (
                <p key={i} className="text-[11px] text-muted-foreground flex items-center gap-1">
                  {m.option.match_type === 'certificate' ? <FileBadge className="w-2.5 h-2.5 text-blue-500" />
                    : m.option.match_type === 'document' ? <FileText className="w-2.5 h-2.5 text-violet-500" />
                    : m.via === 'quotation' ? <Zap className="w-2.5 h-2.5 text-amber-500" />
                    : <UserCheck className="w-2.5 h-2.5 text-slate-500" />}
                  <span className="text-foreground">{m.option.label}</span>
                  {m.via !== 'manual' && m.via !== 'quotation' && <span>— พบ: {m.via}</span>}
                </p>
              ))}
            </div>
          )}
          {basis && <p className="ml-5 mt-0.5 text-[11px] text-amber-700">⚡ {basis}</p>}
          {r.matchedOptions.length === 0 && !r.pending && !basis && (
            <p className="ml-5 mt-0.5 text-[11px] text-red-500">ไม่พบหลักฐานที่เข้าเกณฑ์</p>
          )}
          {r.pending && <p className="ml-5 mt-0.5 text-[11px] text-amber-600">รอประเมิน</p>}
        </div>
        <span className={`text-xs font-bold tabular-nums shrink-0 ${r.pending ? 'text-amber-500' : r.score >= r.maxScore ? 'text-green-600' : r.score > 0 ? 'text-blue-600' : 'text-red-500'}`}>
          {r.pending ? '—' : r.score}<span className="text-[10px] text-muted-foreground font-normal">/{r.maxScore}</span>
        </span>
      </div>
    );
  };

  return (
    <div className="rounded-lg border bg-background p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          <span className="text-xs font-semibold">ผลประเมิน BRCGS จากใบเสนอราคานี้</span>
          <Badge variant="outline" className="text-[10px]">{SUPPLIER_TYPE_LABEL[brc.supplierType]?.split('(')[0].trim()}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            ความปลอดภัย {brc.safetyScore}/{brc.safetyMax}
          </span>
          {brc.grade && (
            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${GRADE_BADGE[brc.grade]}`}>
              {brc.grade}
            </span>
          )}
        </div>
      </div>

      {/* Mandatory gate */}
      {brc.mandatoryFailures.length > 0 && (
        <div className="flex items-start gap-1.5 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span>ไม่ผ่านเอกสารบังคับ: {brc.mandatoryFailures.map(f => `${f.topic} (ต้องมี ${f.options.join(' / ')})`).join(', ')}</span>
        </div>
      )}

      {/* Safety & quality — counts toward the BRCGS grade */}
      {sections.map(section => (
        <div key={section}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{section}</p>
          {safety.filter(r => r.topic.section === section).map(r => <TopicRow key={r.topic.id} r={r} />)}
        </div>
      ))}

      {/* Competition — scored from this quotation */}
      {commercial.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Competition (จากใบเสนอราคา)
            </p>
            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
              รวม {commercialScore}/{commercialMax}
            </span>
          </div>
          {commercial.map(r => <TopicRow key={r.topic.id} r={r} />)}
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {brc.commercialWeight === 0
              ? 'หมวดนี้ให้คะแนนไว้เพื่อตรวจสอบ แต่ไม่นับในเกรด BRCGS — ราคา/ส่งมอบ/เครดิต ถูกคิดที่เสา Commercial ตอนเปรียบเทียบราคา จึงไม่นับซ้ำ'
              : `หมวดนี้นับในเกรด BRCGS ตามน้ำหนักเชิงพาณิชย์ ${brc.commercialWeight}%`}
          </p>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground border-t pt-2">
        คะแนนคำนวณอัตโนมัติจากใบรับรอง/เอกสารของ supplier และค่าในใบเสนอราคาฉบับนี้ —
        ตรวจสอบค่าที่ใช้ได้จากบรรทัด ⚡ ด้านบน หากไม่ถูกต้องให้แก้ไขหรือส่งใบเสนอราคาใหม่ แล้วคะแนนจะอัปเดตทันที
      </p>
    </div>
  );
}
