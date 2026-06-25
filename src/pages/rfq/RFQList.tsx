import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Copy } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Link, useNavigate } from 'react-router-dom';
import { useSupabasePagination } from '@/hooks/use-supabase-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/i18n';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-blue-500/10 text-blue-600',
  closed: 'bg-muted text-muted-foreground',
  evaluation: 'bg-amber-500/10 text-amber-600',
  awarded: 'bg-emerald-500/10 text-emerald-600',
};

const RFQ_STATUSES = ['draft', 'published', 'closed', 'evaluation', 'awarded'];

export default function RFQList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { hasRole, profile, user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isSupplier = hasRole('supplier');
  const canManage = hasRole('admin') || hasRole('procurement_officer');
  const mySupplierId = profile?.supplier_id ?? null;
  const [duplicating, setDuplicating] = useState<string | null>(null);

  // Clone an RFQ as a new draft — copies items, technical checklist, and invited
  // suppliers, but not quotations/awards. Saves re-entering everything.
  const duplicateRfq = async (id: string) => {
    setDuplicating(id);
    try {
      const { data: src, error: srcErr } = await supabase.from('rfqs').select('*').eq('id', id).single();
      if (srcErr || !src) throw srcErr || new Error('RFQ not found');

      const rfqNumber = `RFQ-${Date.now().toString(36).toUpperCase()}`;
      const { data: newRfq, error } = await supabase.from('rfqs').insert({
        rfq_number: rfqNumber,
        title: `${src.title} (สำเนา)`,
        description: src.description,
        notes: src.notes,
        deadline: src.deadline,
        status: 'draft',
        created_by: user?.id,
      }).select().single();
      if (error || !newRfq) throw error || new Error('create failed');

      const [{ data: items }, { data: crit }, { data: sups }] = await Promise.all([
        supabase.from('rfq_items').select('item_name, description, quantity, unit, specifications, source_price_list_item_id').eq('rfq_id', id),
        supabase.from('rfq_technical_criteria').select('label, description, weight, sort_order').eq('rfq_id', id),
        supabase.from('rfq_suppliers').select('supplier_id').eq('rfq_id', id),
      ]);
      await Promise.all([
        items?.length ? supabase.from('rfq_items').insert(items.map((i: any) => ({ ...i, rfq_id: newRfq.id }))) : null,
        crit?.length ? supabase.from('rfq_technical_criteria').insert(crit.map((c: any) => ({ ...c, rfq_id: newRfq.id }))) : null,
        sups?.length ? supabase.from('rfq_suppliers').insert(sups.map((s: any) => ({ rfq_id: newRfq.id, supplier_id: s.supplier_id }))) : null,
      ].filter(Boolean) as any);

      toast({ title: 'คัดลอก RFQ แล้ว', description: `สร้าง ${rfqNumber} เป็น Draft — แก้ไขรายละเอียดแล้วเผยแพร่ได้เลย` });
      navigate(`/rfq/${newRfq.id}`);
    } catch (e: any) {
      toast({ title: 'คัดลอกไม่สำเร็จ', description: e.message, variant: 'destructive' });
    }
    setDuplicating(null);
  };

  // For supplier users: only show RFQs they're invited to
  const [myRfqIds, setMyRfqIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (!isSupplier || !mySupplierId) { setMyRfqIds(null); return; }
    supabase.from('rfq_suppliers').select('rfq_id').eq('supplier_id', mySupplierId)
      .then(({ data }) => setMyRfqIds(data?.map(r => r.rfq_id) || []));
  }, [isSupplier, mySupplierId]);

  const filters = useCallback((query: any) => {
    let filteredQuery = query;
    if (search) {
      filteredQuery = filteredQuery.or(`title.ilike.%${search}%,rfq_number.ilike.%${search}%`);
    }
    if (statusFilter !== 'all') {
      filteredQuery = filteredQuery.eq('status', statusFilter);
    }
    if (isSupplier && myRfqIds !== null) {
      if (myRfqIds.length === 0) {
        filteredQuery = filteredQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
      } else {
        filteredQuery = filteredQuery.in('id', myRfqIds);
      }
      filteredQuery = filteredQuery.neq('status', 'draft');
    }
    return filteredQuery;
  }, [search, statusFilter, isSupplier, myRfqIds]);

  const pagination = useSupabasePagination<any>({
    tableName: 'rfqs',
    pageSize: 20,
    filters,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('rfq.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('rfq.subtitle')}</p>
        </div>
        {(hasRole('admin') || hasRole('procurement_officer')) && (
          <Link to="/rfq/new">
            <Button><Plus className="w-4 h-4 mr-2" />{t('rfq.newRfq')}</Button>
          </Link>
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('rfq.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {RFQ_STATUSES.map(s => <SelectItem key={s} value={s}>{t(`rfq.statuses.${s}` as any, s)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">{t('rfq.rfqNumber')}</th>
                <th className="text-left p-3 font-medium text-muted-foreground">{t('rfq.rfqTitle')}</th>
                <th className="text-left p-3 font-medium text-muted-foreground">{t('rfq.deadline')}</th>
                <th className="text-left p-3 font-medium text-muted-foreground">{t('rfq.status')}</th>
                {canManage && <th className="text-right p-3 font-medium text-muted-foreground">{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {pagination.loading ? (
                <tr><td colSpan={canManage ? 5 : 4} className="p-8 text-center text-muted-foreground">{t('common.loading')}</td></tr>
              ) : pagination.items.length === 0 ? (
                <tr><td colSpan={canManage ? 5 : 4} className="p-8 text-center text-muted-foreground">{t('common.noData')}</td></tr>
              ) : (
                pagination.items.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">
                      <Link to={`/rfq/${r.id}`} className="text-primary hover:underline">{r.rfq_number || '—'}</Link>
                    </td>
                    <td className="p-3">{r.title}</td>
                    <td className="p-3 text-muted-foreground">{r.deadline ? new Date(r.deadline).toLocaleDateString() : '—'}</td>
                    <td className="p-3"><Badge variant="secondary" className={statusColors[r.status] || ''}>{r.status}</Badge></td>
                    {canManage && (
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="sm" className="text-xs" disabled={duplicating === r.id}
                          title="คัดลอก RFQ นี้เป็น Draft ใหม่ (รวมรายการ, เกณฑ์เทคนิค, supplier ที่เชิญ)"
                          onClick={() => duplicateRfq(r.id)}>
                          <Copy className="w-3.5 h-3.5 mr-1" />{duplicating === r.id ? 'กำลังคัดลอก...' : 'Duplicate'}
                        </Button>
                      </td>
                    )}
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
