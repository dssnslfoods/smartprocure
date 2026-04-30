import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Save, RefreshCw, ExternalLink } from 'lucide-react';
import RiskBadge from '@/components/RiskBadge';
import { classifyRiskLevel } from '@/lib/eligibility';
import { RISK_FACTORS } from '@/types/procurement';
import type { SupplierRiskAssessment } from '@/types/procurement';

type FactorKey = typeof RISK_FACTORS[number]['key'];
type Scores = Record<FactorKey, number>;

const EMPTY: Scores = {
  food_safety_risk: 0, quality_risk: 0, delivery_risk: 0,
  financial_risk: 0, certificate_risk: 0, food_fraud_risk: 0,
  allergen_risk: 0, country_risk: 0, critical_material_risk: 0, ncr_history_risk: 0,
};

interface Props {
  supplierId: string;
  onRiskUpdated?: () => void;
}

export default function SupplierRiskTab({ supplierId, onRiskUpdated }: Props) {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const [existing, setExisting] = useState<SupplierRiskAssessment | null>(null);
  const [scores, setScores] = useState<Scores>(EMPTY);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const riskLevel = classifyRiskLevel(total);
  const canEdit = hasRole('admin') || hasRole('procurement_officer') || hasRole('approver');

  const pct = (total / 100) * 100;
  const barColor =
    riskLevel === 'low'    ? 'bg-emerald-500' :
    riskLevel === 'medium' ? 'bg-yellow-500'  :
    riskLevel === 'high'   ? 'bg-orange-500'  :
                              'bg-red-500';

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('supplier_risk_assessments')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('assessed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setExisting(data);
        const s: Scores = { ...EMPTY };
        for (const f of RISK_FACTORS) s[f.key] = (data as any)[f.key] ?? 0;
        setScores(s);
        setNotes(data.notes ?? '');
      }
      setLoading(false);
    };
    fetch();
  }, [supplierId]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      supplier_id: supplierId, ...scores,
      notes: notes || null, assessed_by: user.id,
      assessed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
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
      toast({ title: 'Assessment saved', description: `Risk level: ${riskLevel}` });
      onRiskUpdated?.();
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Current Risk Level</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {existing ? `Last assessed ${new Date(existing.assessed_at).toLocaleDateString()}` : 'Not yet assessed'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RiskBadge level={riskLevel} score={total} size="md" />
          <Link to={`/vendor-risk/${supplierId}`}>
            <Button variant="outline" size="sm">
              <ExternalLink className="w-3.5 h-3.5 mr-1" />Full Assessment
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Risk Score</span>
            <span className="font-bold tabular-nums">{total.toFixed(1)} / 100</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div className={`h-2.5 rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {RISK_FACTORS.map(({ key, label }) => (
          <div key={key} className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-medium">{label}</span>
              <span className="tabular-nums font-bold">{scores[key as FactorKey]}</span>
            </div>
            <Slider
              min={0} max={10} step={1}
              value={[scores[key as FactorKey]]}
              onValueChange={([v]) => setScores(p => ({ ...p, [key]: v }))}
              disabled={!canEdit}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Notes</p>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Assessment notes..."
          rows={3}
          disabled={!canEdit}
        />
      </div>

      {canEdit && (
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          {saving ? 'Saving...' : existing ? 'Update' : 'Save Assessment'}
        </Button>
      )}
    </div>
  );
}
