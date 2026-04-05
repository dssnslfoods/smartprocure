import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, GripVertical } from 'lucide-react';

interface CriterionRow {
  criteria_name: string;
  description: string;
  weight: number;
  sort_order: number;
}

export default function EvaluationTemplateForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [criteria, setCriteria] = useState<CriterionRow[]>([
    { criteria_name: 'Price Competitiveness', description: 'Cost effectiveness vs market', weight: 30, sort_order: 1 },
    { criteria_name: 'Quality', description: 'Product/service quality standards', weight: 25, sort_order: 2 },
    { criteria_name: 'Delivery', description: 'On-time delivery performance', weight: 20, sort_order: 3 },
    { criteria_name: 'Service', description: 'Customer service & responsiveness', weight: 15, sort_order: 4 },
    { criteria_name: 'ESG Compliance', description: 'Environmental, Social, Governance', weight: 10, sort_order: 5 },
  ]);

  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);

  const addCriterion = () => {
    setCriteria([...criteria, { criteria_name: '', description: '', weight: 0, sort_order: criteria.length + 1 }]);
  };

  const removeCriterion = (idx: number) => {
    setCriteria(criteria.filter((_, i) => i !== idx));
  };

  const updateCriterion = (idx: number, field: keyof CriterionRow, value: any) => {
    const updated = [...criteria];
    (updated[idx] as any)[field] = value;
    setCriteria(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) { toast.error('Template name is required'); return; }
    if (criteria.length === 0) { toast.error('Add at least one criterion'); return; }
    if (totalWeight !== 100) { toast.error(`Weights must total 100% (currently ${totalWeight}%)`); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: tmpl, error: tmplErr } = await supabase.from('evaluation_templates').insert({
      template_name: templateName,
      is_active: true,
      created_by: user?.id,
    }).select().single();

    if (tmplErr || !tmpl) { toast.error(tmplErr?.message || 'Failed to create template'); setLoading(false); return; }

    const { error: critErr } = await supabase.from('evaluation_criteria').insert(
      criteria.map((c) => ({ ...c, template_id: tmpl.id }))
    );
    setLoading(false);
    if (critErr) { toast.error(critErr.message); return; }
    toast.success('Template created');
    navigate('/evaluations');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/evaluations')}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold">Create Evaluation Template</h1>
          <p className="text-sm text-muted-foreground">Define weighted criteria for supplier scoring</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Template Info</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-w-md">
              <Label>Template Name *</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Standard Supplier Evaluation" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Criteria & Weights</CardTitle>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold ${totalWeight === 100 ? 'text-green-600' : 'text-destructive'}`}>
                  Total: {totalWeight}%
                </span>
                <Button type="button" variant="outline" size="sm" onClick={addCriterion} className="gap-1"><Plus className="w-3 h-3" /> Add</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {criteria.map((c, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                <GripVertical className="w-4 h-4 text-muted-foreground mt-2.5 shrink-0" />
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4 space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input value={c.criteria_name} onChange={(e) => updateCriterion(i, 'criteria_name', e.target.value)} placeholder="Criterion name" />
                  </div>
                  <div className="md:col-span-5 space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input value={c.description} onChange={(e) => updateCriterion(i, 'description', e.target.value)} placeholder="Brief description" />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs">Weight %</Label>
                    <Input type="number" min={0} max={100} value={c.weight} onChange={(e) => updateCriterion(i, 'weight', parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="shrink-0 mt-5 text-muted-foreground hover:text-destructive" onClick={() => removeCriterion(i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Template'}</Button>
          <Button type="button" variant="outline" onClick={() => navigate('/evaluations')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
