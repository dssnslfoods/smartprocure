import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Leaf, Users, Shield, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface Props { supplierId: string; }

const riskColors: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-600',
  medium: 'bg-amber-500/10 text-amber-600',
  high: 'bg-destructive/10 text-destructive',
};

export default function SupplierESG({ supplierId }: Props) {
  const [esg, setEsg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user, hasRole } = useAuth();
  const [form, setForm] = useState({
    environmental_score: '', social_score: '', governance_score: '',
    compliance_status: 'pending', risk_level: 'low', notes: '',
  });

  const fetchESG = async () => {
    const { data } = await supabase.from('supplier_esg_profiles').select('*').eq('supplier_id', supplierId).maybeSingle();
    if (data) {
      setEsg(data);
      setForm({
        environmental_score: data.environmental_score?.toString() || '',
        social_score: data.social_score?.toString() || '',
        governance_score: data.governance_score?.toString() || '',
        compliance_status: data.compliance_status || 'pending',
        risk_level: data.risk_level || 'low',
        notes: data.notes || '',
      });
    }
    setLoading(false);
  };

  useEffect(() => { fetchESG(); }, [supplierId]);

  const calcTotal = () => {
    const e = parseFloat(form.environmental_score) || 0;
    const s = parseFloat(form.social_score) || 0;
    const g = parseFloat(form.governance_score) || 0;
    return Math.round(((e + s + g) / 3) * 100) / 100;
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      supplier_id: supplierId,
      environmental_score: parseFloat(form.environmental_score) || 0,
      social_score: parseFloat(form.social_score) || 0,
      governance_score: parseFloat(form.governance_score) || 0,
      esg_score: calcTotal(),
      compliance_status: form.compliance_status,
      risk_level: form.risk_level,
      notes: form.notes,
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    };

    const { error } = esg
      ? await supabase.from('supplier_esg_profiles').update(payload).eq('id', esg.id)
      : await supabase.from('supplier_esg_profiles').insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'ESG profile saved' });
      fetchESG();
    }
  };

  const canEdit = hasRole('admin') || hasRole('procurement_officer');

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Score Overview */}
      <Card>
        <CardHeader><CardTitle className="text-base">ESG Score Overview</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <div className="text-4xl font-bold text-primary">{calcTotal()}</div>
            <p className="text-sm text-muted-foreground">Overall ESG Score (0-100)</p>
          </div>
          <div className="space-y-3">
            <ScoreBar icon={Leaf} label="Environmental" value={parseFloat(form.environmental_score) || 0} color="text-emerald-600" />
            <ScoreBar icon={Users} label="Social" value={parseFloat(form.social_score) || 0} color="text-blue-600" />
            <ScoreBar icon={Shield} label="Governance" value={parseFloat(form.governance_score) || 0} color="text-violet-600" />
          </div>
          <div className="flex gap-3 pt-2">
            <Badge variant="secondary" className={riskColors[form.risk_level] || ''}>
              Risk: {form.risk_level}
            </Badge>
            <Badge variant="secondary">
              Compliance: {form.compliance_status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Edit Form */}
      <Card>
        <CardHeader><CardTitle className="text-base">Update ESG Profile</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Environmental</Label>
              <Input type="number" min="0" max="100" step="0.1" value={form.environmental_score} onChange={e => setForm(p => ({ ...p, environmental_score: e.target.value }))} disabled={!canEdit} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Social</Label>
              <Input type="number" min="0" max="100" step="0.1" value={form.social_score} onChange={e => setForm(p => ({ ...p, social_score: e.target.value }))} disabled={!canEdit} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Governance</Label>
              <Input type="number" min="0" max="100" step="0.1" value={form.governance_score} onChange={e => setForm(p => ({ ...p, governance_score: e.target.value }))} disabled={!canEdit} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Risk Level</Label>
            <Select value={form.risk_level} onValueChange={v => setForm(p => ({ ...p, risk_level: v }))} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Compliance Status</Label>
            <Select value={form.compliance_status} onValueChange={v => setForm(p => ({ ...p, compliance_status: v }))} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="compliant">Compliant</SelectItem>
                <SelectItem value="non_compliant">Non-Compliant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} disabled={!canEdit} rows={3} />
          </div>
          {canEdit && (
            <Button onClick={handleSave} disabled={saving} className="w-full">
              <Save className="w-4 h-4 mr-1" />{saving ? 'Saving...' : 'Save ESG Profile'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreBar({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5"><Icon className={`w-4 h-4 ${color}`} />{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  );
}
