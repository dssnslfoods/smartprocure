import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { useSupabasePagination } from '@/hooks/use-supabase-pagination';
import { PaginationControls } from '@/components/PaginationControls';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-blue-500/10 text-blue-600',
  closed: 'bg-muted text-muted-foreground',
  awarded: 'bg-emerald-500/10 text-emerald-600',
};

const RFQ_STATUSES = ['draft', 'published', 'closed', 'awarded'];

export default function RFQList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { hasRole } = useAuth();

  const filters = useCallback((query: any) => {
    let filteredQuery = query;
    if (search) {
      filteredQuery = filteredQuery.or(`title.ilike.%${search}%,rfq_number.ilike.%${search}%`);
    }
    if (statusFilter !== 'all') {
      filteredQuery = filteredQuery.eq('status', statusFilter);
    }
    return filteredQuery;
  }, [search, statusFilter]);

  const pagination = useSupabasePagination<any>({
    tableName: 'rfqs',
    pageSize: 20,
    filters,
  });

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
            {RFQ_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
              {pagination.loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : pagination.items.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No RFQs found</td></tr>
              ) : (
                pagination.items.map((r) => (
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
