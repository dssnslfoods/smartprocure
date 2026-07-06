// BRCGS supplier assessment engine (redesigned per NSL "Smart procurement" standard).
//
// Each supplier type has scored topics. A topic is evaluated automatically from:
//   - evidence  : supplier certificates / documents (keyword match, expiry-checked)
//   - quotation : the supplier's quotation in an RFQ (price / delivery / credit)
//   - manual    : a stored one-time evaluation (audit score, experience, risk assessment)
// scoring_mode 'best_match' picks the highest-scoring matched option;
// 'additive' sums every matched option (capped at target_score).
import { supabase } from '@/integrations/supabase/client';
import type { RiskLevel } from '@/types/procurement';

export type BrcSupplierType =
  | 'rm_primary_pk' | 'secondary_pk' | 'service'
  | 'chemical_food' | 'chemical_nonfood'
  | 'equipment_food' | 'equipment_nonfood';

export const SUPPLIER_TYPE_LABEL: Record<BrcSupplierType, string> = {
  rm_primary_pk: 'วัตถุดิบ / บรรจุภัณฑ์หลัก (RM / Primary PK)',
  secondary_pk: 'บรรจุภัณฑ์รอง (Secondary / Tertiary PK)',
  service: 'บริการ (Service)',
  chemical_food: 'เคมี Food grade',
  chemical_nonfood: 'เคมี Non-food grade',
  equipment_food: 'อุปกรณ์สัมผัสอาหาร (Equipment food contact)',
  equipment_nonfood: 'อุปกรณ์ทั่วไป (Equipment non-food contact)',
};

export const SUPPLIER_TYPES = Object.keys(SUPPLIER_TYPE_LABEL) as BrcSupplierType[];

export interface BrcTopic {
  id: string;
  supplier_type: string;
  section: string;
  topic: string;
  scoring_mode: 'best_match' | 'additive';
  auto_source: 'evidence' | 'quotation' | 'manual';
  quotation_field: 'price' | 'delivery' | 'credit' | null;
  target_score: number;
  sort_order: number;
  active: boolean;
}

export interface BrcOption {
  id: string;
  topic_id: string;
  label: string;
  score: number;
  match_type: 'certificate' | 'document' | 'manual' | 'auto';
  match_keywords: string[];
  requirement: string | null;
  sort_order: number;
}

export interface BrcGradeBand {
  supplier_type: string;
  grade: string;
  label_th: string;
  min_score: number;
  max_score: number;
}

export interface BrcManualScore {
  supplier_id: string;
  topic_id: string;
  option_id: string | null;
  note: string | null;
}

export interface SupplierCert { certificate_type: string | null; expiry_date: string | null; }
export interface SupplierDoc  { document_type: string | null; document_name: string | null; }

/** A file uploaded against a specific assessment topic/option. */
export interface BrcEvidence {
  id: string;
  supplier_id: string;
  topic_id: string;
  option_id: string | null;
  file_url: string;
  file_name: string;
  file_size: number | null;
  expiry_date: string | null;
  note: string | null;
  created_at: string;
}

/** Quotation context for auto-scoring competition topics in an RFQ. */
export interface QuotationContext {
  effectivePrice: number;        // this supplier's net price
  minPrice: number;              // lowest net price among all quotes
  leadTimeDays: number | null;
  minLeadTimeDays: number | null;
  paymentTermDays: number | null; // parsed from payment_term
}

export interface TopicResult {
  topic: BrcTopic;
  options: BrcOption[];
  matchedOptions: { option: BrcOption; via: string }[]; // via = evidence name / 'quotation' / 'manual'
  evidence: BrcEvidence[];       // files uploaded directly against this topic
  score: number;
  maxScore: number;
  pending: boolean;              // true when manual not yet evaluated or quotation ctx missing
}

export interface BrcAssessment {
  supplierType: BrcSupplierType;
  topics: TopicResult[];
  totalScore: number;
  maxScore: number;              // full standard total (e.g. 125)
  assessedMax: number;           // total of topics actually assessable now
  percent: number;               // 0..100 of assessedMax
  grade: string | null;          // A/B/C/D
  gradeLabel: string | null;
  level: RiskLevel;              // mapped for existing UI
  pendingCount: number;          // topics awaiting manual evaluation
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase();

function isExpired(expiry: string | null): boolean {
  if (!expiry) return false;
  const d = new Date(expiry);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/** Returns matched evidence name, or null. */
function matchEvidence(opt: BrcOption, certs: SupplierCert[], docs: SupplierDoc[]): string | null {
  const kws = (opt.match_keywords || []).map(norm).filter(Boolean);
  if (kws.length === 0) return null;
  if (opt.match_type === 'certificate') {
    const hit = certs.find(c => !isExpired(c.expiry_date) && kws.some(kw => norm(c.certificate_type).includes(kw)));
    return hit ? (hit.certificate_type || 'certificate') : null;
  }
  if (opt.match_type === 'document') {
    const hit = docs.find(d => kws.some(kw => `${norm(d.document_type)} ${norm(d.document_name)}`.includes(kw)));
    return hit ? (hit.document_name || hit.document_type || 'document') : null;
  }
  return null;
}

export function parsePaymentTermDays(term: string | null | undefined): number | null {
  if (!term) return null;
  const m = term.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** Score a quotation-derived topic. Options must be sorted best→worst. */
function scoreQuotationTopic(topic: BrcTopic, options: BrcOption[], ctx: QuotationContext): BrcOption | null {
  const sorted = [...options].sort((a, b) => b.score - a.score);
  const best = sorted[0], mid = sorted[1] ?? sorted[0], worst = sorted[sorted.length - 1];
  switch (topic.quotation_field) {
    case 'price':
      if (ctx.effectivePrice <= 0) return worst;
      if (ctx.effectivePrice <= ctx.minPrice) return best;
      if (ctx.effectivePrice <= ctx.minPrice * 1.1) return mid; // within 10% = negotiable
      return worst;
    case 'delivery':
      if (ctx.leadTimeDays == null || ctx.leadTimeDays <= 0) return worst;
      if (ctx.minLeadTimeDays != null && ctx.leadTimeDays <= ctx.minLeadTimeDays) return best;
      return mid;
    case 'credit': {
      const days = ctx.paymentTermDays;
      if (days == null || days <= 0) return worst;
      if (days >= 30) return best;
      return mid;
    }
    default:
      return null;
  }
}

/** Evaluate one supplier against the BRC standard for its type. */
export function evaluateBrc(
  supplierType: BrcSupplierType,
  topics: BrcTopic[],
  optionsByTopic: Record<string, BrcOption[]>,
  certs: SupplierCert[],
  docs: SupplierDoc[],
  manualByTopic: Record<string, BrcManualScore>,
  bands: BrcGradeBand[],
  quotationCtx?: QuotationContext,
  evidence: BrcEvidence[] = [],
): BrcAssessment {
  const relevant = topics
    .filter(t => t.active && t.supplier_type === supplierType)
    .sort((a, b) => a.sort_order - b.sort_order);

  const results: TopicResult[] = relevant.map(topic => {
    const options = (optionsByTopic[topic.id] || []).sort((a, b) => a.sort_order - b.sort_order);
    const matched: { option: BrcOption; via: string }[] = [];
    const topicEvidence = evidence.filter(e => e.topic_id === topic.id);
    let pending = false;

    // Manual pick (applies to any topic that has a stored manual selection)
    const manual = manualByTopic[topic.id];
    const manualOpt = manual?.option_id ? options.find(o => o.id === manual.option_id) : undefined;

    if (topic.auto_source === 'quotation') {
      if (quotationCtx) {
        const opt = scoreQuotationTopic(topic, options, quotationCtx);
        if (opt) matched.push({ option: opt, via: 'quotation' });
      } else if (manualOpt) {
        matched.push({ option: manualOpt, via: 'manual' });
      } else {
        pending = true;
      }
    } else {
      // evidence matching for cert/doc options
      for (const opt of options) {
        if (opt.match_type === 'certificate' || opt.match_type === 'document') {
          const via = matchEvidence(opt, certs, docs);
          if (via) {
            matched.push({ option: opt, via });
          } else {
            // a file uploaded directly against this option also counts (expiry-checked)
            const direct = topicEvidence.find(e => e.option_id === opt.id && !isExpired(e.expiry_date));
            if (direct) matched.push({ option: opt, via: direct.file_name });
          }
        }
      }
      // manual options resolved from stored pick (uploaded files on manual options
      // are supporting attachments only — staff still confirms the pick)
      if (manualOpt) matched.push({ option: manualOpt, via: 'manual' });
      const hasManualOptions = options.some(o => o.match_type === 'manual');
      if (hasManualOptions && !manualOpt) pending = true;
      if (topic.auto_source === 'manual' && !manualOpt) pending = true;
    }

    let score = 0;
    if (topic.scoring_mode === 'best_match') {
      score = matched.reduce((mx, m) => Math.max(mx, m.option.score), 0);
    } else {
      // additive: sum distinct matched options
      const seen = new Set<string>();
      for (const m of matched) {
        if (!seen.has(m.option.id)) { seen.add(m.option.id); score += m.option.score; }
      }
      score = Math.min(score, topic.target_score);
    }

    return { topic, options, matchedOptions: matched, evidence: topicEvidence, score, maxScore: topic.target_score, pending };
  });

  const totalScore = results.reduce((a, r) => a + r.score, 0);
  const maxScore = results.reduce((a, r) => a + r.maxScore, 0);
  // Topics that can't be assessed yet (no quotation ctx / no manual pick) are excluded
  // from the achievable max so grading stays fair; they still show as "pending".
  const assessedMax = results.reduce((a, r) => a + (r.pending ? 0 : r.maxScore), 0);
  const percent = assessedMax > 0 ? Math.round((totalScore / assessedMax) * 100) : 0;

  // Grade against band thresholds scaled to the assessable portion of the standard.
  const scale = maxScore > 0 ? assessedMax / maxScore : 0;
  const typeBands = bands
    .filter(b => b.supplier_type === supplierType)
    .sort((a, b) => b.min_score - a.min_score);
  const band = scale > 0
    ? typeBands.find(b => totalScore >= b.min_score * scale) ?? typeBands[typeBands.length - 1] ?? null
    : null;

  const gradeToLevel: Record<string, RiskLevel> = { A: 'low', B: 'medium', C: 'high', D: 'critical' };

  return {
    supplierType,
    topics: results,
    totalScore,
    maxScore,
    assessedMax,
    percent,
    grade: band?.grade ?? null,
    gradeLabel: band?.label_th ?? null,
    level: band ? gradeToLevel[band.grade] ?? 'critical' : 'critical',
    pendingCount: results.filter(r => r.pending).length,
  };
}

/** Load the full BRC standard (topics + options + bands) once. */
export async function loadBrcStandard() {
  const [tRes, oRes, bRes] = await Promise.all([
    supabase.from('brc_topics' as any).select('*').order('sort_order'),
    supabase.from('brc_options' as any).select('*').order('sort_order'),
    supabase.from('brc_grade_bands' as any).select('*'),
  ]);
  const topics = (tRes.data as unknown as BrcTopic[]) || [];
  const options = (oRes.data as unknown as BrcOption[]) || [];
  const bands = (bRes.data as unknown as BrcGradeBand[]) || [];
  const optionsByTopic: Record<string, BrcOption[]> = {};
  options.forEach(o => (optionsByTopic[o.topic_id] ??= []).push(o));
  return { topics, optionsByTopic, bands };
}

/** Load supplier evidence + manual scores for a set of suppliers. */
export async function loadSupplierEvidence(supplierIds: string[]) {
  const ids = Array.from(new Set(supplierIds)).filter(Boolean);
  if (ids.length === 0) {
    return { certsBy: {}, docsBy: {}, manualBy: {}, typesBy: {}, evidenceBy: {} } as {
      certsBy: Record<string, SupplierCert[]>;
      docsBy: Record<string, SupplierDoc[]>;
      manualBy: Record<string, Record<string, BrcManualScore>>;
      typesBy: Record<string, string | null>;
      evidenceBy: Record<string, BrcEvidence[]>;
    };
  }
  const [cRes, dRes, mRes, sRes, eRes] = await Promise.all([
    supabase.from('supplier_certificates').select('supplier_id, certificate_type, expiry_date').in('supplier_id', ids),
    supabase.from('supplier_documents').select('supplier_id, document_type, document_name').in('supplier_id', ids),
    supabase.from('brc_manual_scores' as any).select('*').in('supplier_id', ids),
    supabase.from('suppliers').select('id, brc_supplier_type').in('id', ids),
    supabase.from('brc_evidence' as any).select('*').in('supplier_id', ids).order('created_at', { ascending: false }),
  ]);
  const certsBy: Record<string, SupplierCert[]> = {};
  (cRes.data || []).forEach((c: any) => (certsBy[c.supplier_id] ??= []).push(c));
  const docsBy: Record<string, SupplierDoc[]> = {};
  (dRes.data || []).forEach((d: any) => (docsBy[d.supplier_id] ??= []).push(d));
  const manualBy: Record<string, Record<string, BrcManualScore>> = {};
  ((mRes.data as any[]) || []).forEach((m: any) => ((manualBy[m.supplier_id] ??= {})[m.topic_id] = m));
  const typesBy: Record<string, string | null> = {};
  ((sRes.data as any[]) || []).forEach((s: any) => (typesBy[s.id] = s.brc_supplier_type));
  const evidenceBy: Record<string, BrcEvidence[]> = {};
  ((eRes.data as any[]) || []).forEach((e: any) => (evidenceBy[e.supplier_id] ??= []).push(e));
  return { certsBy, docsBy, manualBy, typesBy, evidenceBy };
}
