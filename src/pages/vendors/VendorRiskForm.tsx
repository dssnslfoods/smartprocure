import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, RefreshCw, Check, X, Sparkles, Pencil } from 'lucide-react';
import RiskBadge from '@/components/RiskBadge';
import { classifyRiskLevel } from '@/lib/eligibility';
import { RISK_FACTORS } from '@/types/procurement';
import type { SupplierRiskAssessment } from '@/types/procurement';
import { computeDimensionRisks, CATEGORY_OPTIONS,
  type RiskCriterion, type SupplierCert, type SupplierDoc, type CatalogCategory } from '@/lib/riskCriteria';

type FactorKey = typeof RISK_FACTORS[number]['key'];
type Scores = Record<FactorKey, number>;

const EMPTY_SCORES: Scores = {
  food_safety_risk: 0, quality_risk: 0, delivery_risk: 0,
  financial_risk: 0, certificate_risk: 0, food_fraud_risk: 0,
  allergen_risk: 0, country_risk: 0, critical_material_risk: 0, ncr_history_risk: 0,
};

export default function VendorRiskForm() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();

  const [supplier, setSupplier] = useState<any>(null);
  const [existing, setExisting] = useState<SupplierRiskAssessment | null>(null);
  const [scores, setScores] = useState<Scores>(EMPTY_SCORES);
  const [overrides, setOverrides] = useState<Set<FactorKey>>(new Set());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // BRC criteria auto-computation
  const [criteria, setCriteria] = useState<RiskCriterion[]>([]);
  const [certs, setCerts] = useState<SupplierCert[]>([]);
  const [docs, setDocs] = useState<SupplierDoc[]>([]);
  const [category, setCategory] = useState<CatalogCategory | 'all'>('all');

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const riskLevel = classifyRiskLevel(total);
  const canEdit = hasRole('admin') || hasRole('procurement_officer') || hasRole('approver');

  const dimResults = useMemo(
    () => computeDimensionRisks(criteria, certs, docs, category),
    [criteria, certs, docs, category],
  );

  useEffect(() => {
    const fetch = async () => {
      if (!supplierId) return;
      const [supRes, asmRes, critRes, certRes, docRes] = await Promise.all([
        supabase.from('suppliers').select('*').eq('id', supplierId).single(),
        supabase.from('supplier_risk_assessments')
          .select('*')
          .eq('supplier_id', supplierId)
          .order('assessed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('risk_criteria').select('*').eq('active', true),
        supabase.from('supplier_certificates').select('certificate_type, expiry_date').eq('supplier_id', supplierId),
        supabase.from('supplier_documents').select('document_type, document_name').eq('supplier_id', supplierId),
      ]);
      if (supRes.data) setSupplier(supRes.data);
      setCriteria((critRes.data as RiskCriterion[]) || []);
      setCerts((certRes.data as SupplierCert[]) || []);
      setDocs((docRes.data as SupplierDoc[]) || []);
      if (asmRes.data) {
        setExisting(asmRes.data);
        const s: Scores = { ...EMPTY_SCORES };
        for (const f of RISK_FACTORS) {
          s[f.key] = (asmRes.data as any)[f.key] ?? 0;
        }
        setScores(s);
        const mo = (asmRes.data as any).manual_overrides || {};
        setOverrides(new Set(Object.keys(mo) as FactorKey[]));
        setNotes(asmRes.data.notes ?? '');
      }
      setLoading(false);
    };
    fetch();
  }, [supplierId]);

  // Auto-fill non-overridden dimensions from the computed criteria scores.
  useEffect(() => {
    setScores(prev => {
      let changed = false;
      const next = { ...prev };
      for (const f of RISK_FACTORS) {
        if (overrides.has(f.key)) continue;
        const computed = dimResults[f.key]?.score;
        const val = computed == null ? 0 : computed;
        if (next[f.key] !== val) { next[f.key] = val; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [dimResults, overrides]);

  const handleSave = async () => {
    if (!supplierId || !user) return;
    setSaving(true);

    const manual_overrides: Record<string, number> = {};
    for (const key of overrides) manual_overrides[key] = scores[key];

    const payload = {
      supplier_id: supplierId,
      ...scores,
      manual_overrides,
      notes: notes || null,
      assessed_by: user.id,
      assessed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let error;
    if (existing) {
      ({ error } = await supabase.from('supplier_risk_assessments').update(payload).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('supplier_risk_assessments').insert({ ...payload, created_at: new Date().toISOString() }));
    }

    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // sync risk_level back to supplier (trigger may also handle this)
      await supabase.from('suppliers').update({ risk_level: riskLevel }).eq('id', supplierId);
      toast({ title: 'Assessment saved', description: `Risk level updated to ${riskLevel} (${total.toFixed(1)}/100).` });
      if (!existing) {
        const { data } = await supabase
          .from('supplier_risk_assessments')
          .select('*')
          .eq('supplier_id', supplierId)
          .order('assessed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) setExisting(data);
      }
      setSupplier((prev: any) => ({ ...prev, risk_level: riskLevel }));
    }
  };

  const setScore = (key: FactorKey, val: number) => {
    setScores(prev => ({ ...prev, [key]: val }));
    setOverrides(prev => new Set(prev).add(key));   // manual change = override
  };

  const resetDimension = (key: FactorKey) => {
    setOverrides(prev => { const n = new Set(prev); n.delete(key); return n; });
  };

  const resetAllToComputed = () => setOverrides(new Set());

  const pct = (total / 100) * 100;
  const barColor =
    riskLevel === 'low'      ? 'bg-emerald-500' :
    riskLevel === 'medium'   ? 'bg-yellow-500'  :
    riskLevel === 'high'     ? 'bg-orange-500'  :
                               'bg-red-500';

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  if (!supplier) return <div className="text-center py-16 text-muted-foreground">Supplier not found.</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link to="/vendor-risk">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Risk Assessment</h1>
          <p className="text-sm text-muted-foreground">{supplier.company_name} · {supplier.supplier_code || supplier.id.slice(0, 8)}</p>
        </div>
        <RiskBadge level={supplier.risk_level} size="md" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Risk Score Summary</span>
            <span className="text-3xl font-bold tabular-nums">{total.toFixed(1)} <span className="text-base font-normal text-muted-foreground">/ 100</span></span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
            <div className={`h-3 rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0 — Low</span>
            <span>30 — Medium</span>
            <span>60 — High</span>
            <span>80 — Critical → 100</span>
          </div>
          <div className="pt-1">
            <RiskBadge level={riskLevel} score={total} size="md" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
          <p className="text-sm flex-1 min-w-[200px]">
            คะแนนคำนวณอัตโนมัติจากเอกสาร/ใบรับรองตามเกณฑ์ BRC — ปรับ slider เพื่อ override ได้
          </p>
          <Select value={category} onValueChange={v => setCategory(v as any)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกหมวด</SelectItem>
              {CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {canEdit && overrides.size > 0 && (
            <Button variant="outline" size="sm" onClick={resetAllToComputed}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />คำนวณใหม่ทั้งหมด ({overrides.size})
            </Button>
          )}
          <Link to={`/suppliers/${supplierId}`} className="text-xs text-primary hover:underline">จัดการเอกสาร →</Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {RISK_FACTORS.map(({ key, label, description }) => {
          const k = key as FactorKey;
          const dim = dimResults[key];
          const overridden = overrides.has(k);
          const computed = dim?.score ?? null;
          return (
          <Card key={key} className={dim?.mandatoryUnmet ? 'border-red-300' : ''}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    {label}
                    {overridden
                      ? <Badge variant="outline" className="text-[9px] gap-0.5"><Pencil className="w-2.5 h-2.5" />override</Badge>
                      : computed != null && <Badge className="bg-teal-500/10 text-teal-600 text-[9px] gap-0.5"><Sparkles className="w-2.5 h-2.5" />auto</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {overridden && canEdit && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" title="กลับไปใช้ค่าคำนวณ" onClick={() => resetDimension(k)}>
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  )}
                  <span className="text-2xl font-bold tabular-nums w-10 text-right">{scores[k]}</span>
                </div>
              </div>
              <Slider
                min={0}
                max={10}
                step={1}
                value={[scores[k]]}
                onValueChange={([v]) => setScore(k, v)}
                disabled={!canEdit}
                className="cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0 (None)</span>
                <span>5 (Moderate)</span>
                <span>10 (Severe)</span>
              </div>

              {dim && dim.criteria.length > 0 && (
                <div className="pt-2 border-t space-y-1">
                  {dim.mandatoryUnmet && (
                    <p className="text-[11px] text-red-600 font-medium">ขาดเกณฑ์บังคับ → ความเสี่ยงสูงสุด</p>
                  )}
                  {dim.criteria.map(c => (
                    <div key={c.id} className="flex items-center gap-1.5 text-[11px]">
                      {c.met
                        ? <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                        : <X className="w-3 h-3 text-red-400 shrink-0" />}
                      <span className={c.met ? 'text-muted-foreground' : 'text-foreground'}>{c.name_th}</span>
                      {c.is_mandatory && <span className="text-red-500 text-[9px]">*</span>}
                    </div>
                  ))}
                </div>
              )}
              {dim == null && (
                <p className="text-[11px] text-muted-foreground pt-2 border-t">ยังไม่มีเกณฑ์ในหมวดนี้ — กรอกด้วยตนเอง</p>
              )}
            </CardContent>
          </Card>
        );})}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Assessment Notes</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            placeholder="Add any supporting notes, evidence references, or observations..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            disabled={!canEdit}
          />
        </CardContent>
      </Card>

      {existing && (
        <p className="text-xs text-muted-foreground">
          Last assessed: {new Date(existing.assessed_at).toLocaleString()}
        </p>
      )}

      {canEdit && (
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? 'Saving...' : existing ? 'Update Assessment' : 'Save Assessment'}
          </Button>
          <Link to="/vendor-risk"><Button variant="outline">Cancel</Button></Link>
        </div>
      )}
    </div>
  );
}
