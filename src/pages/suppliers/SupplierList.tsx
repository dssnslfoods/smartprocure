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
import RiskBadge, { SupplierTypeBadge } from '@/components/RiskBadge';

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
const CERT_TYPES = ['GMP', 'HACCP', 'ISO9001', 'ISO22000', 'BRCGS', 'FSSC22000', 'HALAL', 'IFS', 'KOSHER'];

export default function SupplierList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [certFilter, setCertFilter] = useState('all');         // certificate type
  const [certStatusFilter, setCertStatusFilter] = useState('all'); // valid / expiring / expired / missing
  const { hasRole } = useAuth();

  const filters = useCallback((query: any) => {
    let q = query;
    if (search) {
      q = q.or(`company_name.ilike.%${search}%,tax_id.ilike.%${search}%,supplier_code.ilike.%${search}%`);
    }
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (tierFilter   !== 'all') q = q.eq('tier', tierFilter);

    // Certificate-type filter — uses inner-join on the embedded table
    if (certFilter !== 'all') {
      q = q.eq('supplier_certificates.certificate_type', certFilter);
    }

    // Certificate-status filter
    const today = new Date().toISOString().slice(0, 10);
    const in90  = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
    if (certStatusFilter === 'valid') {
      q = q.gte('supplier_certificates.expiry_date', in90);
    } else if (certStatusFilter === 'expiring') {
      q = q.gte('supplier_certificates.expiry_date', today).lt('supplier_certificates.expiry_date', in90);
    } else if (certStatusFilter === 'expired') {
      q = q.lt('supplier_certificates.expiry_date', today);
    }
    return q;
  }, [search, statusFilter, tierFilter, certFilter, certStatusFilter]);

  // When filtering by cert type or cert status, switch the join to inner so the row only
  // appears if the matching cert row exists. Otherwise leave a normal left join.
  const certJoinKind = (certFilter !== 'all' || (certStatusFilter !== 'all' && certStatusFilter !== 'missing')) ? '!inner' : '';
  const baseSelect =
    'id, company_name, supplier_code, supplier_type, tax_id, email, status, tier, risk_level, ' +
    'certificate_expiry_date, created_at, ' +
    'supplier_risk_assessments(total_risk_score, assessed_at), ' +
    `supplier_certificates${certJoinKind}(certificate_type, expiry_date, certificate_no)`;

  const pagination = useSupabasePagination<any>({
    tableName: 'suppliers',
    pageSize: 20,
    filters,
    select: baseSelect,
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
        <Select value={certFilter} onValueChange={setCertFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Certificate" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Certificates</SelectItem>
            {CERT_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={certStatusFilter} onValueChange={setCertStatusFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Cert Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Cert Status</SelectItem>
            <SelectItem value="valid">ใช้งานได้ (&gt; 90 วัน)</SelectItem>
            <SelectItem value="expiring">ใกล้หมดอายุ (≤ 90 วัน)</SelectItem>
            <SelectItem value="expired">หมดอายุแล้ว</SelectItem>
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
                  <th className="text-left p-3 font-medium text-muted-foreground">Code</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Risk</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">คะแนนความเสี่ยง</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Certificates</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {pagination.loading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : pagination.items.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No suppliers found</td></tr>
                ) : (
                  pagination.items.map((s) => {
                    return (
                      <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium">
                          <Link to={`/suppliers/${s.id}`} className="text-primary hover:underline">{s.company_name}</Link>
                        </td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{s.supplier_code || '—'}</td>
                        <td className="p-3"><SupplierTypeBadge type={s.supplier_type} /></td>
                        <td className="p-3">
                          <Badge variant="secondary" className={statusColors[s.status] || ''}>{s.status}</Badge>
                        </td>
                        <td className="p-3">
                          {(() => {
                            const assessments = s.supplier_risk_assessments as any[];
                            const hasAssessment = assessments?.length > 0;
                            return hasAssessment
                              ? <RiskBadge level={s.risk_level} />
                              : <span className="text-muted-foreground text-xs">ยังไม่ประเมิน</span>;
                          })()}
                        </td>
                        <td className="p-3 text-right">
                          {(() => {
                            const latest = (s.supplier_risk_assessments as any[])?.sort(
                              (a: any, b: any) => new Date(b.assessed_at).getTime() - new Date(a.assessed_at).getTime()
                            )[0];
                            return latest?.total_risk_score != null ? (
                              <span className="font-semibold tabular-nums text-sm">
                                {Number(latest.total_risk_score).toFixed(1)}
                                <span className="text-[10px] text-muted-foreground font-normal">/100</span>
                              </span>
                            ) : <span className="text-muted-foreground text-xs">—</span>;
                          })()}
                        </td>
                        <td className="p-3">
                          {(() => {
                            const certs = (s.supplier_certificates as any[]) || [];
                            if (certs.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
                            const today = new Date().toISOString().slice(0, 10);
                            const in90  = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
                            return (
                              <div className="flex flex-wrap gap-1 max-w-[260px]">
                                {certs.slice(0, 4).map((c: any, i: number) => {
                                  const exp = c.expiry_date as string | null;
                                  const tone = !exp ? 'bg-zinc-100 text-zinc-600' :
                                    exp < today ? 'bg-red-100 text-red-700' :
                                    exp < in90 ? 'bg-amber-100 text-amber-800' :
                                                 'bg-emerald-100 text-emerald-700';
                                  return (
                                    <span key={i} title={exp ? `หมดอายุ ${new Date(exp).toLocaleDateString('th-TH')}` : ''}
                                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${tone}`}>
                                      {c.certificate_type}
                                    </span>
                                  );
                                })}
                                {certs.length > 4 && (
                                  <span className="text-[10px] text-muted-foreground">+{certs.length - 4}</span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    );
                  })
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
