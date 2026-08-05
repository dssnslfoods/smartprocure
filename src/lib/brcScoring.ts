// BRCGS supplier assessment engine (redesigned per NSL "Smart procurement" standard).
//
// Each supplier type has scored topics. A topic is evaluated automatically from:
//   - evidence  : supplier certificates / documents (keyword match, expiry-checked)
//   - quotation : the supplier's quotation in an RFQ (price / delivery / credit)
//   - manual    : a stored one-time evaluation (audit score, experience, risk assessment)
// scoring_mode 'best_match' picks the highest-scoring matched option;
// 'additive' sums every matched option (capped at target_score).
import { supabase } from '@/integrations/supabase/client';
import { isExpired } from '@/lib/dateUtils';
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

export type CriterionGroup = 'safety_quality' | 'commercial';

export interface BrcTopic {
  id: string;
  supplier_type: string;
  section: string;
  topic: string;
  scoring_mode: 'best_match' | 'additive';
  auto_source: 'evidence' | 'quotation' | 'manual';
  quotation_field: 'price' | 'delivery' | 'credit' | null;
  criterion_group: CriterionGroup;
  target_score: number;
  sort_order: number;
  active: boolean;
}

/** Per-supplier-category weight split between the two criterion groups (sum = 100). */
export interface BrcCategoryWeight {
  supplier_type: string;
  safety_weight: number;
  commercial_weight: number;
}

/** Default minimum safety-group weight per BRCGS Clause 3.5.1.3 (configurable).
 *  Policy: BRCGS grade is safety/quality only — commercial factors (price/delivery/
 *  credit) are scored in the separate RFQ Commercial pillar, so the default is 100%. */
export const BRC_SAFETY_MIN_DEFAULT = 50;
export const BRC_SAFETY_RECOMMENDED = 100;

export interface BrcOption {
  id: string;
  topic_id: string;
  label: string;
  score: number;
  match_type: 'certificate' | 'document' | 'manual' | 'auto';
  match_keywords: string[];
  requirement: string | null;
  is_mandatory: boolean;    // qualification gate — must satisfy ≥1 mandatory option per topic
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
  mandatoryMet: boolean | null;  // null = no mandatory options in this topic; else pass/fail of the gate
}

export interface BrcAssessment {
  supplierType: BrcSupplierType;
  topics: TopicResult[];
  totalScore: number;            // raw sum of matched scores (display "points")
  maxScore: number;              // full standard total (e.g. 125)
  assessedMax: number;           // total of topics actually assessable now
  percent: number;               // 0..100 — group-weighted achievement (drives grade/risk)
  grade: string | null;          // A/B/C/D
  gradeLabel: string | null;
  level: RiskLevel;              // mapped for existing UI
  pendingCount: number;          // topics awaiting manual evaluation
  // Group breakdown (BRCGS Clause 3.5.1.3 — safety must weigh ≥ commercial)
  safetyScore: number;
  safetyMax: number;
  safetyPercent: number | null;  // null when no assessable safety topics
  commercialScore: number;
  commercialMax: number;
  commercialPercent: number | null;
  safetyWeight: number;          // configured % weight applied
  commercialWeight: number;
  // Mandatory qualification gate (separate from scoring)
  mandatoryPassed: boolean;                              // false = ineligible for RFQ
  mandatoryFailures: { topic: string; options: string[] }[]; // unmet mandatory requirements
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase();

// Expiry handling lives in dateUtils so every module treats a bare `yyyy-mm-dd`
// the same way (parsed as LOCAL midnight, not UTC).

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
  groupWeights?: { safety: number; commercial: number },
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
      // A topic is only "awaiting assessment" when there is nothing to score yet.
      // Evidence that already matched counts immediately — previously a single
      // manual fallback option (e.g. "No certificate but audit > 75%") held the
      // whole topic pending even when a certificate had been matched, so the
      // supplier's uploads produced no score at all.
      if (topic.auto_source === 'manual') {
        if (!manualOpt) pending = true;
      } else if (hasManualOptions && !manualOpt && matched.length === 0) {
        pending = true;
      }
    }

    // Mandatory options are a pass/fail gate, not a rated criterion — exclude them
    // from the score (having a required cert is a prerequisite, not bonus points).
    const scoringMatched = matched.filter(m => !m.option.is_mandatory);
    let score = 0;
    if (topic.scoring_mode === 'best_match') {
      score = scoringMatched.reduce((mx, m) => Math.max(mx, m.option.score), 0);
    } else {
      // additive: sum distinct matched options
      const seen = new Set<string>();
      for (const m of scoringMatched) {
        if (!seen.has(m.option.id)) { seen.add(m.option.id); score += m.option.score; }
      }
      score = Math.min(score, topic.target_score);
    }

    // Mandatory gate: for evidence/manual topics that have mandatory options,
    // the supplier must satisfy at least one of them (OR within the topic).
    let mandatoryMet: boolean | null = null;
    if (topic.auto_source !== 'quotation') {
      const mandatoryOpts = options.filter(o => o.is_mandatory);
      if (mandatoryOpts.length > 0) {
        const matchedIds = new Set(matched.map(m => m.option.id));
        mandatoryMet = mandatoryOpts.some(o => matchedIds.has(o.id));
      }
    }

    // Failing the gate disqualifies the supplier from this category, so partial
    // marks on the topic would be meaningless — it scores nothing until the
    // required document is in place. Uploading evidence stays open throughout.
    if (mandatoryMet === false) score = 0;

    return { topic, options, matchedOptions: matched, evidence: topicEvidence, score, maxScore: topic.target_score, pending, mandatoryMet };
  });

  const totalScore = results.reduce((a, r) => a + r.score, 0);
  const maxScore = results.reduce((a, r) => a + r.maxScore, 0);
  // Topics that can't be assessed yet (no quotation ctx / no manual pick) are excluded
  // from the achievable max so grading stays fair; they still show as "pending".
  const assessedMax = results.reduce((a, r) => a + (r.pending ? 0 : r.maxScore), 0);

  // ── Group breakdown (BRCGS Clause 3.5.1.3) ──────────────────────────────
  // Safety/Quality and Commercial groups are scored independently, then combined
  // by the configured category weights so the safety group can be made dominant.
  const grp = (g: CriterionGroup) => {
    const rs = results.filter(r => r.topic.criterion_group === g && !r.pending);
    const score = rs.reduce((a, r) => a + r.score, 0);
    const max = rs.reduce((a, r) => a + r.maxScore, 0);
    return { score, max, frac: max > 0 ? score / max : null as number | null };
  };
  const safety = grp('safety_quality');
  const commercial = grp('commercial');

  // Default weights reproduce the legacy behaviour (weight ∝ each group's max),
  // so scoring is unchanged until an explicit category weight is configured.
  const wSafety = groupWeights?.safety ?? safety.max;
  const wCommercial = groupWeights?.commercial ?? commercial.max;

  // Combine only the groups that actually have assessable topics (renormalise weights).
  let num = 0, den = 0;
  if (safety.frac != null)     { num += wSafety * safety.frac;         den += wSafety; }
  if (commercial.frac != null) { num += wCommercial * commercial.frac; den += wCommercial; }
  const weightedFrac = den > 0 ? num / den : 0;
  const percent = Math.round(weightedFrac * 100);

  // Grade the weighted achievement against the band thresholds (as % of the standard max).
  const typeBands = bands
    .filter(b => b.supplier_type === supplierType)
    .sort((a, b) => b.min_score - a.min_score);
  const bandScore = weightedFrac * maxScore;
  const band = den > 0
    ? typeBands.find(b => bandScore >= b.min_score) ?? typeBands[typeBands.length - 1] ?? null
    : null;

  const gradeToLevel: Record<string, RiskLevel> = { A: 'low', B: 'medium', C: 'high', D: 'critical' };

  const mandatoryFailures = results
    .filter(r => r.mandatoryMet === false)
    .map(r => ({ topic: r.topic.topic, options: r.options.filter(o => o.is_mandatory).map(o => o.label) }));

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
    safetyScore: safety.score,
    safetyMax: safety.max,
    safetyPercent: safety.frac != null ? Math.round(safety.frac * 100) : null,
    commercialScore: commercial.score,
    commercialMax: commercial.max,
    commercialPercent: commercial.frac != null ? Math.round(commercial.frac * 100) : null,
    safetyWeight: den > 0 ? Math.round((wSafety / (wSafety + wCommercial)) * 100) : 0,
    commercialWeight: den > 0 ? Math.round((wCommercial / (wSafety + wCommercial)) * 100) : 0,
    mandatoryPassed: mandatoryFailures.length === 0,
    mandatoryFailures,
  };
}

/** Load the full BRC standard (topics + options + bands + category weights) once. */
export async function loadBrcStandard() {
  const [tRes, oRes, bRes, wRes] = await Promise.all([
    supabase.from('brc_topics' as any).select('*').order('sort_order'),
    supabase.from('brc_options' as any).select('*').order('sort_order'),
    supabase.from('brc_grade_bands' as any).select('*'),
    supabase.from('brc_weight_config' as any).select('*'),
  ]);
  const topics = (tRes.data as unknown as BrcTopic[]) || [];
  const options = (oRes.data as unknown as BrcOption[]) || [];
  const bands = (bRes.data as unknown as BrcGradeBand[]) || [];
  const optionsByTopic: Record<string, BrcOption[]> = {};
  options.forEach(o => (optionsByTopic[o.topic_id] ??= []).push(o));
  const weightsByType: Record<string, BrcCategoryWeight> = {};
  ((wRes.data as unknown as BrcCategoryWeight[]) || []).forEach(w => { weightsByType[w.supplier_type] = w; });
  return { topics, optionsByTopic, bands, weightsByType };
}

/** Resolve the group-weight argument for evaluateBrc from a loaded config map. */
export function groupWeightsFor(
  weightsByType: Record<string, BrcCategoryWeight>,
  supplierType: string,
): { safety: number; commercial: number } | undefined {
  const w = weightsByType[supplierType];
  return w ? { safety: w.safety_weight, commercial: w.commercial_weight } : undefined;
}

export interface SupplierEligibility {
  passed: boolean;
  failures: { topic: string; options: string[] }[];
}

/**
 * Compute the mandatory qualification gate for a set of suppliers (evidence-based,
 * no RFQ/quotation context). A supplier is ineligible when it fails any mandatory
 * requirement of its BRCGS category — used to gate RFQ invitations.
 */
export async function computeSupplierEligibility(
  supplierIds: string[],
): Promise<Record<string, SupplierEligibility>> {
  const ids = Array.from(new Set(supplierIds)).filter(Boolean);
  const out: Record<string, SupplierEligibility> = {};
  if (ids.length === 0) return out;
  const [{ topics, optionsByTopic, bands, weightsByType }, evidence] = await Promise.all([
    loadBrcStandard(),
    loadSupplierEvidence(ids),
  ]);
  // No mandatory options configured anywhere → everyone passes (fast path).
  const anyMandatory = Object.values(optionsByTopic).some(opts => opts.some(o => o.is_mandatory));
  if (!anyMandatory) {
    ids.forEach(sid => { out[sid] = { passed: true, failures: [] }; });
    return out;
  }
  for (const sid of ids) {
    // Only gate suppliers whose BRCGS category is explicitly set — an unclassified
    // supplier can't fairly be held to a specific category's mandatory requirements.
    const st = evidence.typesBy[sid] as BrcSupplierType | null;
    if (!st || !SUPPLIER_TYPES.includes(st)) {
      out[sid] = { passed: true, failures: [] };
      continue;
    }
    const brc = evaluateBrc(
      st, topics, optionsByTopic,
      evidence.certsBy[sid] || [], evidence.docsBy[sid] || [],
      evidence.manualBy[sid] || {}, bands, undefined,
      evidence.evidenceBy[sid] || [], groupWeightsFor(weightsByType, st),
    );
    out[sid] = { passed: brc.mandatoryPassed, failures: brc.mandatoryFailures };
  }
  return out;
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
