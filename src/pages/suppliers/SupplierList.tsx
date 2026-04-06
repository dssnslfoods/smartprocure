import { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabasePagination } from '@/hooks/use-supabase-pagination';
import { PaginationControls } from '@/components/PaginationControls';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-info/10 text-info',
  review: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  suspended: 'bg-muted text-muted-foreground',
};

const SUPPLIER_STATUSES = ['draft', 'submitted', 'review', 'approved', 'rejected', 'suspended'];
const SUPPLIER_TIERS = ['Silver', 'Gold', 'Platinum'];

export default function SupplierList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const { hasRole } = useAuth();

  const filters = useCallback((query: any) => {
    let filteredQuery = query;
    if (search) {
      filteredQuery = filteredQuery.or(`company_name.ilike.%${search}%,tax_id.ilike.%${search}%`);
    }
    if (statusFilter !== 'all') {
      filteredQuery = filteredQuery.eq('status', statusFilter);
    }
    if (tierFilter !== 'all') {
      filteredQuery = filteredQuery.eq('tier', tierFilter);
    }
    return filteredQuery;
  }, [search, statusFilter, tierFilter]);

  const pagination = useSupabasePagination<any>({
    tableName: 'suppliers',
    pageSize: 20,
    filters,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Manage supplier registrations</p>
        </div>
        {(hasRole('admin') || hasRole('procurement_officer')) && (
          <Link to="/suppliers/new">
            <Button><Plus className="w-4 h-4 mr-2" />Add Supplier</Button>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {SUPPLIER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            {SUPPLIER_TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Company</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Tax ID</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Tier</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {pagination.loading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : pagination.items.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No suppliers found</td></tr>
                ) : (
                  pagination.items.map((s) => (
                    <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">
                        <Link to={`/suppliers/${s.id}`} className="text-primary hover:underline">{s.company_name}</Link>
                      </td>
                      <td className="p-3 text-muted-foreground">{s.tax_id || '—'}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className={statusColors[s.status] || ''}>{s.status}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{s.tier || '—'}</td>
                      <td className="p-3 text-muted-foreground">{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls {...pagination} />
        </CardContent>
      </Card>
    </div>
  );
}
