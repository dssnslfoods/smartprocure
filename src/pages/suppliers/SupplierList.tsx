import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Plus, Search, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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
  const [sortBy, setSortBy] = useState<'recent' | 'risk_desc' | 'risk_asc'>('recent');
  const { hasRole, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const canDelete = hasRole('admin') || isSuperAdmin;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [deleteTxDetails, setDeleteTxDetails] = useState<any[]>([]);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = async (supplier: any) => {
    setDeleteTarget(supplier);
    setDeleteBlocked(false);
    setDeleteTxDetails([]);
    setDeleteChecking(true);
    setDeleteOpen(true);

    const { data, error } = await supabase.rpc('check_supplier_transactions', { p_supplier_id: supplier.id });
    setDeleteChecking(false);
    if (error) {
      toast({ title: 'ตรวจสอบไม่สำเร็จ', description: error.message, variant: 'destructive' });
      setDeleteOpen(false);
      return;
    }
    if (data?.has_transactions) {
      setDeleteBlocked(true);
      setDeleteTxDetails(data.details || []);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleteBlocked) return;
    setDeleting(true);
    const { error } = await supabase.from('suppliers').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast({ title: 'ลบไม่สำเร็จ', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'ลบสำเร็จ', description: `ลบ ${deleteTarget.company_name} เรียบร้อย` });
      pagination.refresh();
    }
    setDeleteOpen(false);
    setDeleteTarget(null);
  };

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
    'brc_grade, brc_percent, ' +
    'certificate_expiry_date, created_at, ' +
    'supplier_risk_assessments(total_risk_score, assessed_at), ' +
    `supplier_certificates${certJoinKind}(certificate_type, expiry_date, certificate_no)`;

  // risk_level is an enum ordered low < medium < high < critical, so DESC surfaces
  // the worst BRCGS grades (D/critical) first — nulls (never assessed) always sort last.
  const sortConfig = {
    recent:    { orderColumn: 'created_at', orderAscending: false, orderNullsFirst: undefined },
    risk_desc: { orderColumn: 'risk_level', orderAscending: false, orderNullsFirst: false },
    risk_asc:  { orderColumn: 'risk_level', orderAscending: true,  orderNullsFirst: false },
  }[sortBy];

  const pagination = useSupabasePagination<any>({
    tableName: 'suppliers',
    pageSize: 20,
    filters,
    select: baseSelect,
    ...sortConfig,
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
        <Select value={sortBy} onValueChange={(v: any) => { setSortBy(v); pagination.goToPage(1); }}>
          <SelectTrigger className="w-[190px]"><SelectValue placeholder="เรียงตาม" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">ล่าสุด</SelectItem>
            <SelectItem value="risk_desc">ความเสี่ยงสูงสุดก่อน</SelectItem>
            <SelectItem value="risk_asc">ความเสี่ยงต่ำสุดก่อน</SelectItem>
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
                  {canDelete && <th className="text-right p-3 font-medium text-muted-foreground">จัดการ</th>}
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
                            const hasAssessment = assessments?.length > 0 || s.brc_grade != null;
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
                            if (latest?.total_risk_score != null) {
                              return (
                                <span className="font-semibold tabular-nums text-sm">
                                  {Number(latest.total_risk_score).toFixed(1)}
                                  <span className="text-[10px] text-muted-foreground font-normal">/100</span>
                                </span>
                              );
                            }
                            if (s.brc_grade != null) {
                              return (
                                <span className="font-semibold tabular-nums text-sm">
                                  {s.brc_grade}
                                  <span className="text-[10px] text-muted-foreground font-normal"> · {Number(s.brc_percent ?? 0).toFixed(0)}%</span>
                                </span>
                              );
                            }
                            return <span className="text-muted-foreground text-xs">—</span>;
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
                        {canDelete && (
                          <td className="p-3 text-right">
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.preventDefault(); handleDeleteClick(s); }}>
                              <Trash2 className="w-3 h-3 mr-1" /> ลบ
                            </Button>
                          </td>
                        )}
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

      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!open) { setDeleteOpen(false); setDeleteTarget(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {deleteBlocked ? <AlertTriangle className="w-5 h-5 text-amber-500" /> : <Trash2 className="w-5 h-5 text-red-500" />}
              {deleteBlocked ? 'ไม่สามารถลบได้' : 'ยืนยันการลบ Supplier'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {deleteChecking ? (
                  <div className="flex items-center gap-2 py-4"><Loader2 className="w-4 h-4 animate-spin" /> กำลังตรวจสอบ...</div>
                ) : deleteBlocked ? (
                  <>
                    <p>ไม่สามารถลบ <span className="font-semibold text-foreground">{deleteTarget?.company_name}</span> ได้ เนื่องจากมี Transaction:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {deleteTxDetails.map((d: any, i: number) => <li key={i}>{d.table}: {d.count} รายการ</li>)}
                    </ul>
                  </>
                ) : (
                  <p>คุณต้องการลบ <span className="font-semibold text-foreground">{deleteTarget?.company_name}</span> ออกจากระบบหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            {!deleteBlocked && !deleteChecking && (
              <AlertDialogAction onClick={handleConfirmDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
                {deleting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> กำลังลบ...</> : <><Trash2 className="w-4 h-4 mr-1" /> ยืนยันลบ</>}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
