import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BarChart3 } from 'lucide-react';

export default function EvaluationComparison() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [criteria, setCriteria] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [scoreData, setScoreData] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('evaluation_templates').select('id, template_name').eq('is_active', true).then(({ data }) => {
      if (data) setTemplates(data);
    });
  }, []);

  useEffect(() => {
    if (!selectedTemplate) return;
    setLoading(true);
    Promise.all([
      supabase.from('evaluation_criteria').select('*').eq('template_id', selectedTemplate).order('sort_order'),
      supabase.from('supplier_evaluations').select('*, suppliers(company_name), supplier_evaluation_scores(criteria_id, score)').eq('template_id', selectedTemplate).eq('status', 'completed'),
    ]).then(([critRes, evalRes]) => {
      if (critRes.data) setCriteria(critRes.data);
      if (evalRes.data) {
        setEvaluations(evalRes.data);
        const sd: Record<string, Record<string, number>> = {};
        evalRes.data.forEach((ev: any) => {
          sd[ev.id] = {};
          ev.supplier_evaluation_scores?.forEach((s: any) => {
            sd[ev.id][s.criteria_id] = s.score;
          });
        });
        setScoreData(sd);
      }
      setLoading(false);
    });
  }, [selectedTemplate]);

  // Sort evaluations by total_score descending (auto-ranking)
  const ranked = [...evaluations].sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

  const getScoreColor = (s: number) => {
    if (s <= 1) return 'bg-red-100 text-red-800';
    if (s <= 2) return 'bg-orange-100 text-orange-800';
    if (s <= 3) return 'bg-yellow-100 text-yellow-800';
    if (s <= 4) return 'bg-blue-100 text-blue-800';
    return 'bg-green-100 text-green-800';
  };

  const getBarWidth = (s: number) => `${(s / 5) * 100}%`;
  const getBarColor = (s: number) => {
    if (s <= 2) return 'bg-destructive';
    if (s <= 3) return 'bg-yellow-500';
    if (s <= 4) return 'bg-blue-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/evaluations')}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold">Comparison Matrix</h1>
          <p className="text-sm text-muted-foreground">Compare supplier scores side by side with auto-ranking</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="max-w-sm space-y-2">
            <Label>Select Template</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger><SelectValue placeholder="Choose evaluation template" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading && <p className="text-center text-muted-foreground">Loading...</p>}

      {!loading && selectedTemplate && ranked.length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No completed evaluations for this template</CardContent></Card>
      )}

      {!loading && ranked.length > 0 && (
        <>
          {/* Ranking Summary */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Auto-Ranking</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {ranked.map((ev, i) => (
                <div key={ev.id} className="flex items-center gap-4">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${i === 0 ? 'bg-yellow-100 text-yellow-800' : i === 1 ? 'bg-gray-100 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-800' : 'bg-muted text-muted-foreground'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm truncate">{ev.suppliers?.company_name}</span>
                      <Badge className={getScoreColor(ev.total_score || 0)}>{(ev.total_score || 0).toFixed(2)}/5</Badge>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${getBarColor(ev.total_score || 0)}`} style={{ width: getBarWidth(ev.total_score || 0) }} />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Full Matrix Table */}
          <Card>
            <CardHeader><CardTitle className="text-base">Detailed Comparison Matrix</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-muted/50">Criterion</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Weight</th>
                    {ranked.map((ev, i) => (
                      <th key={ev.id} className="text-center p-3 font-medium text-muted-foreground min-w-[120px]">
                        <div className="flex flex-col items-center">
                          <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center mb-1 ${i === 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-muted'}`}>{i + 1}</span>
                          {ev.suppliers?.company_name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {criteria.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium sticky left-0 bg-background">{c.criteria_name}</td>
                      <td className="p-3 text-center text-muted-foreground">{c.weight}%</td>
                      {ranked.map((ev) => {
                        const s = scoreData[ev.id]?.[c.id] || 0;
                        return (
                          <td key={ev.id} className="p-3 text-center">
                            <Badge className={getScoreColor(s)} variant="secondary">{s}/5</Badge>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 bg-muted/30 font-bold">
                    <td className="p-3 sticky left-0 bg-muted/30">Weighted Total</td>
                    <td className="p-3 text-center">100%</td>
                    {ranked.map((ev) => (
                      <td key={ev.id} className="p-3 text-center">
                        <span className={`text-lg font-bold ${ev.total_score >= 4 ? 'text-green-600' : ev.total_score >= 3 ? 'text-blue-600' : 'text-orange-600'}`}>
                          {(ev.total_score || 0).toFixed(2)}
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
