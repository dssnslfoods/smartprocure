import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-blue-500/10 text-blue-600',
  closed: 'bg-muted text-muted-foreground',
  evaluation: 'bg-amber-500/10 text-amber-600',
  awarded: 'bg-emerald-500/10 text-emerald-600',
};

export default function RFQList() {
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const { hasRole } = useAuth();

  useEffect(() => {
    const fetchRfqs = async () => {
      const { data } = await supabase.from('rfqs').select('*').order('created_at', { ascending: false });
      if (data) setRfqs(data);
      setLoading(false);
    };
    fetchRfqs();
  }, []);

  const filtered = rfqs.filter((r) => {
    const matchesSearch = r.title?.toLowerCase().includes(search.toLowerCase()) ||
      r.rfq_number?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pagination = usePagination(filtered, { pageSize: 20 });
  const statuses = [...new Set(rfqs.map(r => r.status).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Requests for Quotation</h1>
          <p className="text-sm text-muted-foreground">Manage RFQ lifecycle</p>
        </div>
        {(hasRole('admin') || hasRole('procurement_officer')) && (
          <Link to="/rfq/new">
            <Button><Plus className="w-4 h-4 mr-2" />Create RFQ</Button>
          </Link>
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search RFQs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">RFQ #</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Deadline</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : pagination.paginatedItems.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No RFQs found</td></tr>
              ) : (
                pagination.paginatedItems.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">
                      <Link to={`/rfq/${r.id}`} className="text-primary hover:underline">{r.rfq_number || '—'}</Link>
                    </td>
                    <td className="p-3">{r.title}</td>
                    <td className="p-3 text-muted-foreground">{r.deadline ? new Date(r.deadline).toLocaleDateString() : '—'}</td>
                    <td className="p-3"><Badge variant="secondary" className={statusColors[r.status] || ''}>{r.status}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <PaginationControls {...pagination} />
        </CardContent>
      </Card>
    </div>
  );
}
