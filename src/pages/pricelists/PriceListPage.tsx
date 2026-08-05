import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Boxes, Package2, Wrench, MoreHorizontal, FileSpreadsheet, ArrowRight, Pin, History, Upload, FileDown, Plus, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CATEGORY_LABELS, CATEGORY_COLORS, CATEGORIES, type PriceListCategory } from '@/lib/priceListConstants';
import { exportCatalog } from '@/lib/catalogExcel';
import { useAuth } from '@/contexts/AuthContext';
import { assessCycle, loadPricelistCycle, CYCLE_STATUS_CLASS, CYCLE_STATUS_LABEL,
  type PricelistCycleSettings, DEFAULT_CYCLE } from '@/lib/pricelistCycle';

const CATEGORY_ICONS: Record<string, any> = {
  raw_material: Boxes,
  packaging:    Package2,
  service:      Wrench,
  other:        MoreHorizontal,
};

interface CatalogRow {
  id:          string;
  title:       string;
  category:    PriceListCategory;
  status:      string;
  valid_until: string | null;
  notes:       string | null;
  itemCount:   number;
  nominatedCount: number;
  myLastSubmissionAt?: string | null;   // supplier-only
}

export default function PriceListPage() {
  const { roles, profile, tenant } = useAuth();
  const { toast } = useToast();
  const isSupplier   = roles.includes('supplier');
  const mySupplierId = profile?.supplier_id ?? null;

  const [catalogs, setCatalogs] = useState<CatalogRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [exporting, setExporting] = useState(false);
  const [cycle, setCycle] = useState<PricelistCycleSettings>(DEFAULT_CYCLE);
  const [reloadKey, setReloadKey] = useState(0);

  const canManage = !isSupplier && (roles.includes('admin') || roles.includes('procurement_officer'));
  const [editing, setEditing] = useState<CatalogRow | null | 'new'>(null);
  const [form, setForm] = useState({ title: '', category: 'raw_material' as PriceListCategory, valid_until: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const openNew = () => { setForm({ title: '', category: 'raw_material', valid_until: '', notes: '' }); setEditing('new'); };
  const openEdit = (cat: CatalogRow) => {
    setForm({ title: cat.title, category: cat.category, valid_until: cat.valid_until || '', notes: cat.notes || '' });
    setEditing(cat);
  };

  const saveCatalog = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      category: form.category,
      valid_until: form.valid_until || null,
      notes: form.notes.trim() || null,
    };
    const { error } = editing === 'new'
      ? await supabase.from('price_lists').insert({ ...payload, status: 'active' })
      : await supabase.from('price_lists').update(payload).eq('id', (editing as CatalogRow).id);
    setSaving(false);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing === 'new' ? 'สร้าง Catalog แล้ว' : 'แก้ไข Catalog แล้ว' });
    setEditing(null);
    setReloadKey(k => k + 1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const count = await exportCatalog();
      toast({ title: '✓ Export สำเร็จ', description: `ส่งออก ${count} รายการเป็นไฟล์ Excel` });
    } catch (err: any) {
      toast({ title: 'Export ไม่สำเร็จ', description: err.message, variant: 'destructive' });
    }
    setExporting(false);
  };

  useEffect(() => { loadPricelistCycle().then(setCycle); }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: lists } = await supabase
        .from('price_lists')
        .select('id, title, category, status, valid_until, notes, price_list_items(id, is_nominated)')
        .order('category');

      let mySubmissionsByCatalog: Record<string, string> = {};
      if (isSupplier && mySupplierId && lists?.length) {
        const allItemIds = lists.flatMap((l: any) => (l.price_list_items || []).map((i: any) => i.id));
        if (allItemIds.length > 0) {
          const { data: offers } = await supabase
            .from('price_list_item_suppliers')
            .select('price_list_item_id, updated_at')
            .eq('supplier_id', mySupplierId)
            .in('price_list_item_id', allItemIds);
          // Build item→catalog map
          const itemToCatalog: Record<string, string> = {};
          lists.forEach((l: any) => (l.price_list_items || []).forEach((i: any) => { itemToCatalog[i.id] = l.id; }));
          (offers || []).forEach((o: any) => {
            const cat = itemToCatalog[o.price_list_item_id];
            if (!cat) return;
            const ts = o.updated_at;
            if (!mySubmissionsByCatalog[cat] || ts > mySubmissionsByCatalog[cat]) {
              mySubmissionsByCatalog[cat] = ts;
            }
          });
        }
      }

      let rows: CatalogRow[] = (lists || []).map((l: any) => ({
        id:        l.id,
        title:     l.title,
        category:  l.category,
        status:    l.status,
        valid_until: l.valid_until,
        notes:     l.notes,
        itemCount: l.price_list_items?.length ?? 0,
        nominatedCount: (l.price_list_items || []).filter((i: any) => i.is_nominated).length,
        myLastSubmissionAt: mySubmissionsByCatalog[l.id] || null,
      }));

      setCatalogs(rows);
      setLoading(false);
    })();
  }, [isSupplier, mySupplierId, reloadKey]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Master Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Catalog กลางของ {tenant?.name ?? 'องค์กร'} — แยกตามหมวดสินค้า ใช้สำหรับสร้าง Checklist เพื่อขอใบเสนอราคา
          </p>
        </div>
        {!isSupplier && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              <FileDown className="h-4 w-4 mr-2" />
              {exporting ? 'กำลังส่งออก...' : 'Export Excel'}
            </Button>
            <Link to="/price-lists/import">
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                นำเข้า Excel
              </Button>
            </Link>
            <Link to="/price-lists/quotation-history">
              <Button variant="outline">
                <History className="h-4 w-4 mr-2" />
                ประวัติใบเสนอราคา
              </Button>
            </Link>
            {canManage && (
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" />
                เพิ่ม Catalog
              </Button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">กำลังโหลด...</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {catalogs.map(cat => {
            const Icon = CATEGORY_ICONS[cat.category] || MoreHorizontal;
            const colorClass = CATEGORY_COLORS[cat.category] || '';
            const myStatus = isSupplier ? assessCycle(cat.myLastSubmissionAt || null, cycle.update_cycle_days) : null;
            return (
              <Card key={cat.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-3 rounded-lg ${colorClass}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg leading-tight">{cat.title}</h3>
                        <Badge variant="outline" className={`${colorClass} text-xs mt-1`}>
                          {CATEGORY_LABELS[cat.category]}
                        </Badge>
                        {cat.notes && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{cat.notes}</p>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="แก้ไข Catalog" onClick={() => openEdit(cat)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {myStatus && (
                    <div className="mt-3 pt-3 border-t">
                      <Badge variant="outline" className={`text-xs ${CYCLE_STATUS_CLASS[myStatus.status]}`}>
                        Pricelist สถานะ: {CYCLE_STATUS_LABEL[myStatus.status]}
                        {myStatus.lastAt && ` · ${myStatus.lastAt.toLocaleDateString('th-TH')}`}
                      </Badge>
                      {myStatus.status === 'overdue' && (
                        <p className="text-xs text-red-600 mt-1">
                          เกินรอบ {Math.abs(myStatus.daysRemaining ?? 0)} วัน — กรุณาส่ง pricelist ใหม่
                        </p>
                      )}
                      {myStatus.status === 'due_soon' && (
                        <p className="text-xs text-amber-700 mt-1">
                          ใกล้ครบรอบ — เหลือ {myStatus.daysRemaining} วัน
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t">
                    <div>
                      <div className="text-2xl font-bold">{cat.itemCount}</div>
                      <div className="text-xs text-muted-foreground">รายการในเล่ม</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-amber-700 flex items-center gap-1">
                        <Pin className="h-4 w-4" />
                        {cat.nominatedCount}
                      </div>
                      <div className="text-xs text-muted-foreground">Nominated</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold">
                        {cat.valid_until ? new Date(cat.valid_until).toLocaleDateString('th-TH') : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">ใช้ได้ถึง</div>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button asChild className="flex-1">
                      <Link to={`/price-lists/${cat.id}`}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        เปิด Catalog
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'เพิ่ม Catalog' : 'แก้ไข Catalog'}</DialogTitle>
            <DialogDescription>ตั้งชื่อ หมวดหมู่ วันที่ใช้ได้ถึง และหมายเหตุของ Catalog</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>ชื่อ Catalog *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <Label>หมวดหมู่</Label>
              <Select value={form.category} onValueChange={(v: PriceListCategory) => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ใช้ได้ถึง</Label>
              <Input type="date" value={form.valid_until} onChange={e => setForm(p => ({ ...p, valid_until: e.target.value }))} />
            </div>
            <div>
              <Label>หมายเหตุ</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>ยกเลิก</Button>
            <Button onClick={saveCatalog} disabled={saving || !form.title.trim()}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
