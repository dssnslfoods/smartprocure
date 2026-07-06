import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileBadge, FileText, Zap, UserCheck, CheckCircle2, CircleDashed, Trophy } from 'lucide-react';
import {
  evaluateBrc, loadBrcStandard, loadSupplierEvidence,
  SUPPLIER_TYPES, SUPPLIER_TYPE_LABEL,
  type BrcAssessment, type BrcSupplierType, type BrcTopic, type BrcOption,
  type BrcGradeBand, type BrcManualScore, type SupplierCert, type SupplierDoc,
} from '@/lib/brcScoring';

const GRADE_STYLE: Record<string, { badge: string; card: string }> = {
  A: { badge: 'bg-green-600 text-white', card: 'border-green-300 bg-green-50/60' },
  B: { badge: 'bg-blue-600 text-white', card: 'border-blue-300 bg-blue-50/60' },
  C: { badge: 'bg-orange-500 text-white', card: 'border-orange-300 bg-orange-50/60' },
  D: { badge: 'bg-red-600 text-white', card: 'border-red-300 bg-red-50/60' },
};

interface Props {
  supplierId: string;
  onRiskUpdated?: () => void;
}

export default function SupplierBrcAssessment({ supplierId, onRiskUpdated }: Props) {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole('admin') || hasRole('procurement_officer') || hasRole('approver');

  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState<BrcTopic[]>([]);
  const [optionsByTopic, setOptionsByTopic] = useState<Record<string, BrcOption[]>>({});
  const [bands, setBands] = useState<BrcGradeBand[]>([]);
  const [certs, setCerts] = useState<SupplierCert[]>([]);
  const [docs, setDocs] = useState<SupplierDoc[]>([]);
  const [manual, setManual] = useState<Record<string, BrcManualScore>>({});
  const [supplierType, setSupplierType] = useState<BrcSupplierType>('rm_primary_pk');

  const load = useCallback(async () => {
    setLoading(true);
    const [standard, evidence] = await Promise.all([
      loadBrcStandard(),
      loadSupplierEvidence([supplierId]),
    ]);
    setTopics(standard.topics);
    setOptionsByTopic(standard.optionsByTopic);
    setBands(standard.bands);
    setCerts(evidence.certsBy[supplierId] || []);
    setDocs(evidence.docsBy[supplierId] || []);
    setManual(evidence.manualBy[supplierId] || {});
    const st = evidence.typesBy[supplierId] as BrcSupplierType | null;
    if (st && SUPPLIER_TYPES.includes(st)) setSupplierType(st);
    setLoading(false);
  }, [supplierId]);

  useEffect(() => { load(); }, [load]);

  const changeType = async (st: BrcSupplierType) => {
    setSupplierType(st);
    await supabase.from('suppliers').update({ brc_supplier_type: st } as any).eq('id', supplierId);
    onRiskUpdated?.();
  };

  const pickManual = async (topicId: string, optionId: string) => {
    const { error } = await supabase.from('brc_manual_scores' as any).upsert({
      supplier_id: supplierId,
      topic_id: topicId,
      option_id: optionId === '_none' ? null : optionId,
      scored_by: user?.id ?? null,
      scored_at: new Date().toISOString(),
    }, { onConflict: 'supplier_id,topic_id' });
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    setManual(prev => ({ ...prev, [topicId]: { supplier_id: supplierId, topic_id: topicId, option_id: optionId === '_none' ? null : optionId, note: null } }));
    onRiskUpdated?.();
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">กำลังโหลด...</div>;

  const brc: BrcAssessment = evaluateBrc(supplierType, topics, optionsByTopic, certs, docs, manual, bands);
  const gs = brc.grade ? GRADE_STYLE[brc.grade] : null;
  const sections = Array.from(new Set(brc.topics.map(r => r.topic.section)));

  return (
    <div className="space-y-4">
      {/* Type + grade summary */}
      <Card className={gs?.card || ''}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-1.5 min-w-[260px]">
              <Label className="text-xs">ประเภท Supplier (BRCGS)</Label>
              <Select value={supplierType} onValueChange={v => changeType(v as BrcSupplierType)} disabled={!canEdit}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPLIER_TYPES.map(st => <SelectItem key={st} value={st}>{SUPPLIER_TYPE_LABEL[st]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">คะแนนรวม (ส่วนที่ประเมินได้)</p>
                <p className="text-2xl font-bold tabular-nums">{brc.totalScore} <span className="text-sm text-muted-foreground font-normal">/ {brc.assessedMax}</span></p>
                {brc.pendingCount > 0 && (
                  <p className="text-[11px] text-amber-600">รอประเมิน {brc.pendingCount} หัวข้อ (Competition ประเมิน auto ตอน RFQ)</p>
                )}
              </div>
              {brc.grade && (
                <div className="text-center">
                  <span className={`inline-flex items-center justify-center w-14 h-14 rounded-full text-2xl font-bold ${gs?.badge}`}>{brc.grade}</span>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-[140px]">{brc.gradeLabel?.split('/')[0]}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Topics per section */}
      {sections.map(section => (
        <div key={section} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{section}</h3>
          {brc.topics.filter(r => r.topic.section === section).map(r => {
            const t = r.topic;
            const isQuotation = t.auto_source === 'quotation';
            const manualOptions = r.options.filter(o => o.match_type === 'manual');
            const hasManualChoice = t.auto_source === 'manual' || manualOptions.length > 0;
            const selected = manual[t.id]?.option_id ?? '_none';
            return (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.pending
                          ? <CircleDashed className="w-4 h-4 text-amber-500 shrink-0" />
                          : <CheckCircle2 className={`w-4 h-4 shrink-0 ${r.score >= r.maxScore ? 'text-green-600' : r.score > 0 ? 'text-blue-500' : 'text-red-400'}`} />}
                        <span className="font-medium text-sm">{t.topic}</span>
                        {isQuotation && (
                          <Badge variant="secondary" className="text-[10px] gap-1 bg-amber-50 text-amber-700 border border-amber-200">
                            <Zap className="w-3 h-3" />Auto ตอน RFQ
                          </Badge>
                        )}
                      </div>

                      {/* Matched evidence */}
                      {r.matchedOptions.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {r.matchedOptions.map((m, i) => (
                            <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                              {m.option.match_type === 'certificate' ? <FileBadge className="w-3 h-3 text-blue-500" />
                                : m.option.match_type === 'document' ? <FileText className="w-3 h-3 text-violet-500" />
                                : <UserCheck className="w-3 h-3 text-slate-500" />}
                              <span className="font-medium text-foreground">{m.option.label}</span>
                              <span>(+{Number(m.option.score)})</span>
                              {m.via !== 'manual' && m.via !== 'quotation' && <span className="text-[10px]">— พบ: {m.via}</span>}
                            </p>
                          ))}
                        </div>
                      )}
                      {r.matchedOptions.length === 0 && !r.pending && !isQuotation && (
                        <p className="text-xs text-red-500 mt-1">ไม่พบใบรับรอง/เอกสารที่เข้าเกณฑ์ — อัปโหลดได้ที่แท็บ ใบรับรอง / Documents</p>
                      )}
                      {isQuotation && (
                        <p className="text-xs text-muted-foreground mt-1">ระบบให้คะแนนอัตโนมัติจากใบเสนอราคาตอนเปรียบเทียบใน RFQ (ราคา / การส่งมอบ / เครดิตเทอม)</p>
                      )}

                      {/* Manual evaluation dropdown */}
                      {hasManualChoice && !isQuotation && (
                        <div className="mt-2 max-w-md">
                          <Select value={selected} onValueChange={v => pickManual(t.id, v)} disabled={!canEdit}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="เลือกผลประเมิน (Manual)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none" className="text-xs text-muted-foreground">— ยังไม่ประเมิน —</SelectItem>
                              {(t.auto_source === 'manual' ? r.options : manualOptions).map(o => (
                                <SelectItem key={o.id} value={o.id} className="text-xs">
                                  {o.label} (+{Number(o.score)}){o.requirement ? ` — ${o.requirement}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-bold tabular-nums ${r.pending ? 'text-amber-500' : r.score >= r.maxScore ? 'text-green-600' : r.score > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                        {r.pending ? '—' : r.score}<span className="text-xs text-muted-foreground font-normal">/{r.maxScore}</span>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}

      {/* Grade bands reference */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />ช่วงคะแนนเกรด — {SUPPLIER_TYPE_LABEL[supplierType]}</p>
          <div className="flex gap-2 flex-wrap">
            {bands.filter(b => b.supplier_type === supplierType).sort((a, b) => b.min_score - a.min_score).map(b => (
              <Badge key={b.grade} variant="outline" className="text-xs">
                <span className="font-bold mr-1">{b.grade}</span> {b.min_score}–{b.max_score} · {b.label_th.split('/')[0].trim()}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
