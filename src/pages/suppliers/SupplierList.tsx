import { useState, useCallback } from 'react';
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
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-info/10 text-info',
  review: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  suspended: 'bg-muted text-muted-foreground',
};

const SUPPLIER_STATUSES = ['draft', 'submitted', 'review', 'approved', 'rejected', 'suspended'];

const RISK_OPTIONS = [
  { value: 'all', label: 'All Risks' },
  { value: 'ความเสี่ยงมาก', label: '🔴 ความเสี่ยงมาก' },
  { value: 'ความเสี่ยงปานกลาง', label: '🟡 ความเสี่ยงปานกลาง' },
  { value: 'ความเสี่ยงน้อย', label: '🟢 ความเสี่ยงน้อย' },
];

const ABC_OPTIONS = [
  { value: 'all', label: 'All ABC' },
  { value: '3', label: 'A · มากกว่า 5MB' },
  { value: '2', label: 'B · 1-5 MB' },
  { value: '1', label: 'C · น้อยกว่า 1MB' },
];

const XYZ_OPTIONS = [
  { value: 'all', label: 'All XYZ' },
  { value: '1', label: 'X · ผู้ขายรายเดียว' },
  { value: '2', label: 'Y · 2-4 ราย' },
  { value: '3', label: 'Z · มากกว่า 4 ราย' },
];

const SORT_OPTIONS = [
  { value: 'total_spend.desc', label: 'Spend (High → Low)' },
  { value: 'priority_score.desc', label: 'Priority (High → Low)' },
  { value: 'company_name.asc', label: 'Name (A → Z)' },
  { value: 'created_at.desc', label: 'Newest first' },
];

const fmtTHB = (n: number | null | undefined) => n == null ? '—' : Number(n).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const fmtTHBShort = (n: number | null | undefined) => {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
};

const ABC_LETTER: Record<number, string> = { 3: 'A', 2: 'B', 1: 'C' };
const XYZ_LETTER: Record<number, string> = { 1: 'X', 2: 'Y', 3: 'Z' };

function priorityBadge(p: number | null | undefined) {
  if (p == null) return <span className="text-muted-foreground">—</span>;
  if (p >= 7) return <Badge variant="destructive">P{p}</Badge>;
  if (p >= 4) return <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20">P{p}</Badge>;
  return <Badge variant="secondary">P{p}</Badge>;
}

function riskBadge(label: string | null | undefined) {
  if (!label) return <span className="text-muted-foreground">—</span>;
  if (label === 'ความเสี่ยงมาก') return <Badge className="bg-red-100 text-red-700 hover:bg-red-200">🔴 มาก</Badge>;
  if (label === 'ความเสี่ยงปานกลาง') return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200">🟡 ปานกลาง</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200">🟢 น้อย</Badge>;
}

export default function SupplierList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [abcFilter, setAbcFilter] = useState('all');
  const [xyzFilter, setXyzFilter] = useState('all');
  const [sort, setSort] = useState('total_spend.desc');
  const { hasRole } = useAuth();

  const filters = useCallback((query: any) => {
    let q = query;
    if (search) q = q.or(`company_name.ilike.%${search}%,tax_id.ilike.%${search}%`);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (riskFilter !== 'all') q = q.eq('risk_label', riskFilter);
    if (abcFilter !== 'all') q = q.eq('abc_class', Number(abcFilter));
    if (xyzFilter !== 'all') q = q.eq('xyz_class', Number(xyzFilter));
    return q;
  }, [search, statusFilter, riskFilter, abcFilter, xyzFilter]);

  const [orderColumn, orderDir] = sort.split('.');
  const pagination = useSupabasePagination<any>({
    tableName: 'suppliers',
    pageSize: 20,
    filters,
    orderColumn,
    orderAscending: orderDir === 'asc',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">จัดการ supplier พร้อม ABC-XYZ classification</p>
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
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {SUPPLIER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Risk" /></SelectTrigger>
          <SelectContent>
            {RISK_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={abcFilter} onValueChange={setAbcFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="ABC" /></SelectTrigger>
          <SelectContent>
            {ABC_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={xyzFilter} onValueChange={setXyzFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="XYZ" /></SelectTrigger>
          <SelectContent>
            {XYZ_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
                  <th className="text-left p-3 font-medium text-muted-foreground">ABC-XYZ</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Priority</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Risk</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Spend (THB)</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Items</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {pagination.loading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : pagination.items.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No suppliers found</td></tr>
                ) : (
                  pagination.items.map((s) => (
                    <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">
                        <Link to={`/suppliers/${s.id}`} className="text-primary hover:underline">{s.company_name}</Link>
                        {s.is_preferred && <Badge variant="outline" className="ml-2 text-[10px]">⭐ Preferred</Badge>}
                      </td>
                      <td className="p-3">
                        {s.abc_class && s.xyz_class ? (
                          <span className={cn(
                            'font-mono font-semibold text-xs px-2 py-0.5 rounded border',
                            (s.priority_score ?? 0) >= 7 ? 'bg-red-50 border-red-200 text-red-700' :
                            (s.priority_score ?? 0) >= 4 ? 'bg-amber-50 border-amber-200 text-amber-700' :
                            'bg-emerald-50 border-emerald-200 text-emerald-700'
                          )}>
                            {ABC_LETTER[s.abc_class]}{XYZ_LETTER[s.xyz_class]}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3">{priorityBadge(s.priority_score)}</td>
                      <td className="p-3">{riskBadge(s.risk_label)}</td>
                      <td className="p-3 text-right font-mono text-xs">{fmtTHB(s.total_spend)}</td>
                      <td className="p-3 text-right text-muted-foreground">{s.num_items ?? '—'}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className={statusColors[s.status] || ''}>{s.status}</Badge>
                      </td>
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
