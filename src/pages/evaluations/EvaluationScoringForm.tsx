import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { ArrowLeft, Star } from 'lucide-react';

export default function EvaluationScoringForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [criteria, setCriteria] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [period, setPeriod] = useState('');
  const [notes, setNotes] = useState('');
  const [scores, setScores] = useState<Record<string, { score: number; comment: string }>>({});

  useEffect(() => {
    Promise.all([
      supabase.from('suppliers').select('id, company_name').eq('status', 'approved'),
      supabase.from('evaluation_templates').select('id, template_name').eq('is_active', true),
    ]).then(([supRes, tmplRes]) => {
      if (supRes.data) setSuppliers(supRes.data);
      if (tmplRes.data) setTemplates(tmplRes.data);
    });
  }, []);

  useEffect(() => {
    if (!selectedTemplate) { setCriteria([]); setScores({}); return; }
    supabase.from('evaluation_criteria').select('*').eq('template_id', selectedTemplate).order('sort_order').then(({ data }) => {
      if (data) {
        setCriteria(data);
        const init: Record<string, { score: number; comment: string }> = {};
        data.forEach((c) => { init[c.id] = { score: 3, comment: '' }; });
        setScores(init);
      }
    });
  }, [selectedTemplate]);

  const totalWeight = criteria.reduce((s, c) => s + Number(c.weight), 0);
  const weightedScore = criteria.reduce((s, c) => {
    const sc = scores[c.id]?.score || 0;
    return s + (sc * Number(c.weight) / (totalWeight || 1));
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || !selectedTemplate) { toast.error('Select supplier and template'); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: evalData, error: evalErr } = await supabase.from('supplier_evaluations').insert({
      supplier_id: selectedSupplier,
      template_id: selectedTemplate,
      evaluator_id: user?.id,
      evaluation_period: period || null,
      total_score: parseFloat(weightedScore.toFixed(2)),
      status: 'completed',
      notes: notes || null,
    }).select().single();

    if (evalErr || !evalData) { toast.error(evalErr?.message || 'Failed'); setLoading(false); return; }

    const scoreRows = criteria.map((c) => ({
      evaluation_id: evalData.id,
      criteria_id: c.id,
      score: scores[c.id]?.score || 3,
      comment: scores[c.id]?.comment || null,
    }));

    const { error: scErr } = await supabase.from('supplier_evaluation_scores').insert(scoreRows);

    // Update score summary
    await supabase.from('supplier_score_summary').upsert({
      supplier_id: selectedSupplier,
      overall_score: parseFloat(weightedScore.toFixed(2)),
      last_calculated_at: new Date().toISOString(),
    }, { onConflict: 'supplier_id' });

    setLoading(false);
    if (scErr) toast.error(scErr.message);
    else { toast.success('Evaluation submitted'); navigate('/evaluations'); }
  };

  const setScore = (criteriaId: string, score: number) => {
    setScores({ ...scores, [criteriaId]: { ...scores[criteriaId], score } });
  };
  const setComment = (criteriaId: string, comment: string) => {
    setScores({ ...scores, [criteriaId]: { ...scores[criteriaId], comment } });
  };

  const getScoreLabel = (s: number) => {
    if (s <= 1) return 'Poor';
    if (s <= 2) return 'Below Average';
    if (s <= 3) return 'Average';
    if (s <= 4) return 'Good';
    return 'Excellent';
  };

  const getScoreColor = (s: number) => {
    if (s <= 1) return 'text-destructive';
    if (s <= 2) return 'text-orange-500';
    if (s <= 3) return 'text-yellow-600';
    if (s <= 4) return 'text-blue-600';
    return 'text-green-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/evaluations')}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold">Score Supplier</h1>
          <p className="text-sm text-muted-foreground">Evaluate supplier performance</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Evaluation Setup</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Supplier *</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Template *</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. Q1 2026" />
            </div>
          </CardContent>
        </Card>

        {criteria.length > 0 && (
          <>
            {/* Weighted Score Preview */}
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Star className="w-6 h-6 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Weighted Total Score</p>
                    <p className={`text-3xl font-bold ${getScoreColor(weightedScore)}`}>{weightedScore.toFixed(2)} / 5.00</p>
                  </div>
                </div>
                <span className={`text-lg font-semibold ${getScoreColor(weightedScore)}`}>{getScoreLabel(weightedScore)}</span>
              </CardContent>
            </Card>

            {/* Criteria scoring */}
            {criteria.map((c) => {
              const s = scores[c.id]?.score || 3;
              return (
                <Card key={c.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{c.criteria_name}</p>
                        <p className="text-xs text-muted-foreground">{c.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs text-muted-foreground">Weight: {c.weight}%</span>
                        <p className={`text-xl font-bold ${getScoreColor(s)}`}>{s}/5</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-muted-foreground w-8">1</span>
                      <Slider min={1} max={5} step={1} value={[s]} onValueChange={([v]) => setScore(c.id, v)} className="flex-1" />
                      <span className="text-xs text-muted-foreground w-8">5</span>
                      <span className={`text-sm font-medium min-w-[80px] text-right ${getScoreColor(s)}`}>{getScoreLabel(s)}</span>
                    </div>
                    <Input placeholder="Optional comment for this criterion" value={scores[c.id]?.comment || ''} onChange={(e) => setComment(c.id, e.target.value)} />
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}

        <Card>
          <CardContent className="p-4 space-y-2">
            <Label>Overall Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="General evaluation notes..." rows={3} />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading || criteria.length === 0}>
            {loading ? 'Submitting...' : 'Submit Evaluation'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/evaluations')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
