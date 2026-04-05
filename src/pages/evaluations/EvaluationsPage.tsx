import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, FileText, BarChart3, Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';

export default function EvaluationsPage() {
  const navigate = useNavigate();
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [evalSearch, setEvalSearch] = useState('');
  const { hasRole } = useAuth();

  useEffect(() => {
    Promise.all([
      supabase.from('supplier_evaluations').select('*, suppliers(company_name)').order('created_at', { ascending: false }),
      supabase.from('evaluation_templates').select('*, evaluation_criteria(id)').order('created_at', { ascending: false }),
    ]).then(([evRes, tmplRes]) => {
      if (evRes.data) setEvaluations(evRes.data);
      if (tmplRes.data) setTemplates(tmplRes.data);
      setLoading(false);
    });
  }, []);

  const canManage = hasRole('admin') || hasRole('procurement_officer');

  const filteredEvals = evaluations.filter(ev =>
    ev.suppliers?.company_name?.toLowerCase().includes(evalSearch.toLowerCase()) ||
    ev.evaluation_period?.toLowerCase().includes(evalSearch.toLowerCase())
  );

  const evalPagination = usePagination(filteredEvals, { pageSize: 20 });
  const tmplPagination = usePagination(templates, { pageSize: 20 });

  const getScoreBadge = (score: number | null) => {
    if (!score) return <span className="text-muted-foreground">—</span>;
    const color = score >= 4 ? 'bg-green-100 text-green-800' : score >= 3 ? 'bg-blue-100 text-blue-800' : score >= 2 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
    return <Badge className={color}>{score.toFixed(2)}/5</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Evaluations & Scoring</h1>
          <p className="text-sm text-muted-foreground">Weighted criteria scoring & comparison</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/evaluations/compare')} className="gap-2"><BarChart3 className="w-4 h-4" /> Compare</Button>
            <Button variant="outline" onClick={() => navigate('/evaluations/templates/new')} className="gap-2"><FileText className="w-4 h-4" /> New Template</Button>
            <Button onClick={() => navigate('/evaluations/score')} className="gap-2"><Plus className="w-4 h-4" /> Score Supplier</Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="evaluations">
        <TabsList>
          <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="evaluations" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search evaluations..." value={evalSearch} onChange={(e) => setEvalSearch(e.target.value)} className="pl-9" />
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Period</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Score</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : evalPagination.paginatedItems.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No evaluations found</td></tr>
                  ) : (
                    evalPagination.paginatedItems.map((ev) => (
                      <tr key={ev.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{ev.suppliers?.company_name || '—'}</td>
                        <td className="p-3 text-muted-foreground">{ev.evaluation_period || '—'}</td>
                        <td className="p-3">{getScoreBadge(ev.total_score)}</td>
                        <td className="p-3"><Badge variant="secondary">{ev.status || 'draft'}</Badge></td>
                        <td className="p-3 text-muted-foreground">{ev.created_at ? new Date(ev.created_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <PaginationControls {...evalPagination} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Template Name</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Criteria Count</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : tmplPagination.paginatedItems.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No templates</td></tr>
                  ) : (
                    tmplPagination.paginatedItems.map((t) => (
                      <tr key={t.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{t.template_name}</td>
                        <td className="p-3 text-muted-foreground">{t.evaluation_criteria?.length || 0} criteria</td>
                        <td className="p-3"><Badge variant={t.is_active ? 'default' : 'secondary'}>{t.is_active ? 'Active' : 'Inactive'}</Badge></td>
                        <td className="p-3 text-muted-foreground">{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <PaginationControls {...tmplPagination} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
