import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, Save, RefreshCw } from 'lucide-react';
import RiskBadge from '@/components/RiskBadge';
import { classifyRiskLevel } from '@/lib/eligibility';
import { RISK_FACTORS } from '@/types/procurement';
import type { SupplierRiskAssessment } from '@/types/procurement';

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
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const riskLevel = classifyRiskLevel(total);
  const canEdit = hasRole('admin') || hasRole('procurement_officer') || hasRole('approver');

  useEffect(() => {
    const fetch = async () => {
      if (!supplierId) return;
      const [supRes, asmRes] = await Promise.all([
        supabase.from('suppliers').select('*').eq('id', supplierId).single(),
        supabase.from('supplier_risk_assessments')
          .select('*')
          .eq('supplier_id', supplierId)
          .order('assessed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (supRes.data) setSupplier(supRes.data);
      if (asmRes.data) {
        setExisting(asmRes.data);
        const s: Scores = { ...EMPTY_SCORES };
        for (const f of RISK_FACTORS) {
          s[f.key] = (asmRes.data as any)[f.key] ?? 0;
        }
        setScores(s);
        setNotes(asmRes.data.notes ?? '');
      }
      setLoading(false);
    };
    fetch();
  }, [supplierId]);

  const handleSave = async () => {
    if (!supplierId || !user) return;
    setSaving(true);

    const payload = {
      supplier_id: supplierId,
      ...scores,
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
  };

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

      <div className="grid gap-4 md:grid-cols-2">
        {RISK_FACTORS.map(({ key, label, description }) => (
          <Card key={key}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <span className="text-2xl font-bold tabular-nums w-10 text-right">{scores[key as FactorKey]}</span>
              </div>
              <Slider
                min={0}
                max={10}
                step={1}
                value={[scores[key as FactorKey]]}
                onValueChange={([v]) => setScore(key as FactorKey, v)}
                disabled={!canEdit}
                className="cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0 (None)</span>
                <span>5 (Moderate)</span>
                <span>10 (Severe)</span>
              </div>
            </CardContent>
          </Card>
        ))}
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
