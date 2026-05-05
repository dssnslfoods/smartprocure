import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Boxes, Package2, Wrench, MoreHorizontal, FileSpreadsheet, ArrowRight, Pin, History,
  Plus, Edit2, Trash2, Users, Globe, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CATEGORY_LABELS, CATEGORY_COLORS, type PriceListCategory } from '@/lib/priceListConstants';
import { useAuth } from '@/contexts/AuthContext';
import { assessCycle, loadPricelistCycle, CYCLE_STATUS_CLASS, CYCLE_STATUS_LABEL,
  type PricelistCycleSettings, DEFAULT_CYCLE } from '@/lib/pricelistCycle';
import { toast } from 'sonner';

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
  visibleSupplierCount: number;
  myLastSubmissionAt?: string | null;
}

const EMPTY_CAT = {
  id: '', title: '', category: 'raw_material' as PriceListCategory,
  valid_until: '', notes: '',
};

export default function PriceListPage() {
  const { roles, profile } = useAuth();
  const isSupplier   = roles.includes('supplier');
  const canManage    = roles.includes('admin') || roles.includes('procurement_officer');
  const mySupplierId = profile?.supplier_id ?? null;

  const [catalogs, setCatalogs] = useState<CatalogRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [cycle, setCycle] = useState<PricelistCycleSettings>(DEFAULT_CYCLE);

  // Catalog edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_CAT);
  const [editSaving, setEditSaving] = useState(false);

  // Visibility dialog
  const [visOpen, setVisOpen] = useState(false);
  const [visCatalog, setVisCatalog] = useState<CatalogRow | null>(null);
  const [visSuppliers, setVisSuppliers] = useState<{ id: string; company_name: string }[]>([]);
  const [visSelected, setVisSelected] = useState<Set<string>>(new Set());
  const [visSaving, setVisSaving] = useState(false);
  const [visSearch, setVisSearch] = useState('');

  useEffect(() => { loadPricelistCycle().then(setCycle); }, []);

  const fetchCatalogs = async () => {
    setLoading(true);

    // Authoritative visibility: ask the server which catalogs the current
    // user is allowed to see. This sidesteps any RLS / PostgREST cache
    // edge cases that could leak hidden catalogs to suppliers.
    const { data: visibleIds } = await supabase.rpc('my_visible_catalog_ids');
    const ids = ((visibleIds as any[]) || []).map((r: any) => typeof r === 'string' ? r : r.my_visible_catalog_ids).filter(Boolean);

    let query = supabase
      .from('price_lists')
      .select('id, title, category, status, valid_until, notes, price_list_items(id, is_nominated), price_list_visible_suppliers(id)');
    if (Array.isArray(ids) && ids.length > 0) {
      query = query.in('id', ids);
    } else if (isSupplier) {
      // Supplier with no visible catalogs — return empty
      setCatalogs([]); setLoading(false); return;
    }
    const { data: lists } = await query.order('category');

    let mySubmissionsByCatalog: Record<string, string> = {};
    if (isSupplier && mySupplierId && lists?.length) {
      const allItemIds = lists.flatMap((l: any) => (l.price_list_items || []).map((i: any) => i.id));
      if (allItemIds.length > 0) {
        const { data: offers } = await supabase
          .from('price_list_item_suppliers')
          .select('price_list_item_id, updated_at')
          .eq('supplier_id', mySupplierId)
          .in('price_list_item_id', allItemIds);
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

    const rows: CatalogRow[] = (lists || []).map((l: any) => ({
      id:        l.id,
      title:     l.title,
      category:  l.category,
      status:    l.status,
      valid_until: l.valid_until,
      notes:     l.notes,
      itemCount: l.price_list_items?.length ?? 0,
      nominatedCount: (l.price_list_items || []).filter((i: any) => i.is_nominated).length,
      visibleSupplierCount: l.price_list_visible_suppliers?.length ?? 0,
      myLastSubmissionAt: mySubmissionsByCatalog[l.id] || null,
    }));
    setCatalogs(rows);
    setLoading(false);
  };

  useEffect(() => { fetchCatalogs(); /* eslint-disable-next-line */ }, [isSupplier, mySupplierId]);

  // ── Catalog CRUD ──────────────────────────────────────────────────────────
  const openNewCatalog = () => {
    setEditForm({ ...EMPTY_CAT });
    setEditOpen(true);
  };
  const openEditCatalog = (c: CatalogRow) => {
    setEditForm({
      id: c.id, title: c.title, category: c.category,
      valid_until: c.valid_until || '', notes: c.notes || '',
    });
    setEditOpen(true);
  };
  const saveCatalog = async () => {
    if (!editForm.title || !editForm.category) {
      toast.error('กรุณากรอกชื่อและหมวด');
      return;
    }
    setEditSaving(true);
    const payload: any = {
      title: editForm.title,
      category: editForm.category,
      valid_until: editForm.valid_until || null,
      notes: editForm.notes || null,
      status: 'active',
    };
    let error;
    if (editForm.id) {
      ({ error } = await supabase.from('price_lists').update(payload).eq('id', editForm.id));
    } else {
      payload.version = 1;
      payload.valid_from = new Date().toISOString().slice(0, 10);
      ({ error } = await supabase.from('price_lists').insert(payload));
    }
    setEditSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(editForm.id ? 'อัปเดต Catalog แล้ว' : 'สร้าง Catalog ใหม่แล้ว');
      setEditOpen(false);
      fetchCatalogs();
    }
  };
  const deleteCatalog = async (c: CatalogRow) => {
    if (!confirm(`ลบ Catalog "${c.title}" ถาวร?\n\nคำเตือน: รายการสินค้าทั้งหมด (${c.itemCount}) จะถูกลบด้วย`)) return;
    const { error } = await supabase.from('price_lists').delete().eq('id', c.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('ลบ Catalog แล้ว');
      fetchCatalogs();
    }
  };

  // ── Visibility management ─────────────────────────────────────────────────
  const openVisibility = async (c: CatalogRow) => {
    setVisCatalog(c);
    setVisSearch('');
    setVisOpen(true);

    const [supRes, allowRes] = await Promise.all([
      supabase.from('suppliers').select('id, company_name').eq('status', 'approved').order('company_name'),
      supabase.from('price_list_visible_suppliers').select('supplier_id').eq('price_list_id', c.id),
    ]);
    setVisSuppliers(supRes.data || []);
    setVisSelected(new Set((allowRes.data || []).map((r: any) => r.supplier_id)));
  };
  const toggleVis = (sid: string) => {
    setVisSelected(prev => {
      const n = new Set(prev);
      if (n.has(sid)) n.delete(sid); else n.add(sid);
      return n;
    });
  };
  const setAllVis = (selected: boolean) => {
    if (selected) setVisSelected(new Set(visSuppliers.map(s => s.id)));
    else setVisSelected(new Set());
  };
  const saveVisibility = async () => {
    if (!visCatalog) return;
    setVisSaving(true);
    // Replace strategy: delete then insert
    await supabase.from('price_list_visible_suppliers').delete().eq('price_list_id', visCatalog.id);
    if (visSelected.size > 0) {
      const rows = Array.from(visSelected).map(sid => ({
        price_list_id: visCatalog.id,
        supplier_id: sid,
      }));
      const { error } = await supabase.from('price_list_visible_suppliers').insert(rows);
      if (error) {
        toast.error(error.message);
        setVisSaving(false);
        return;
      }
    }
    setVisSaving(false);
    setVisOpen(false);
    toast.success(
      visSelected.size === 0
        ? 'ตั้งเป็น Public — supplier ทุกรายเห็นได้'
        : `จำกัดให้ ${visSelected.size} supplier เห็น`,
    );
    fetchCatalogs();
  };

  const filteredVisSuppliers = visSuppliers.filter(s =>
    !visSearch || s.company_name.toLowerCase().includes(visSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Master Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Catalog กลางของ NSL Foods PLC — แยกตามหมวดสินค้า
          </p>
        </div>
        <div className="flex gap-2">
          {!isSupplier && (
            <Link to="/price-lists/quotation-history">
              <Button variant="outline" className="shrink-0">
                <History className="h-4 w-4 mr-2" />
                ประวัติใบเสนอราคา
              </Button>
            </Link>
          )}
          {canManage && (
            <Button onClick={openNewCatalog}>
              <Plus className="h-4 w-4 mr-2" />
              สร้าง Catalog ใหม่
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">กำลังโหลด...</CardContent></Card>
      ) : catalogs.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          ยังไม่มี Catalog — {canManage ? 'กดปุ่ม "สร้าง Catalog ใหม่" เพื่อเริ่มต้น' : 'ติดต่อผู้ดูแลระบบ'}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {catalogs.map(cat => {
            const Icon = CATEGORY_ICONS[cat.category] || MoreHorizontal;
            const colorClass = CATEGORY_COLORS[cat.category] || '';
            const myStatus = isSupplier ? assessCycle(cat.myLastSubmissionAt || null, cycle.update_cycle_days) : null;
            const isPublic = cat.visibleSupplierCount === 0;
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
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <Badge variant="outline" className={`${colorClass} text-xs`}>
                            {CATEGORY_LABELS[cat.category]}
                          </Badge>
                          {!isSupplier && (
                            isPublic ? (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                <Globe className="h-3 w-3 mr-1" /> Public
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                <Lock className="h-3 w-3 mr-1" /> {cat.visibleSupplierCount} supplier
                              </Badge>
                            )
                          )}
                        </div>
                        {cat.notes && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{cat.notes}</p>
                        )}
                      </div>
                    </div>
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

                  <div className="mt-4 flex gap-2 flex-wrap">
                    <Button asChild className="flex-1">
                      <Link to={`/price-lists/${cat.id}`}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        เปิด Catalog
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                    {canManage && (
                      <>
                        <Button variant="outline" size="icon" title="จัดการ Supplier ที่มองเห็น" onClick={() => openVisibility(cat)}>
                          <Users className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" title="แก้ไข Catalog" onClick={() => openEditCatalog(cat)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" title="ลบ Catalog" className="text-red-600" onClick={() => deleteCatalog(cat)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Catalog edit/create dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editForm.id ? 'แก้ไข Catalog' : 'สร้าง Catalog ใหม่'}</DialogTitle>
            <DialogDescription>
              ตั้งค่าข้อมูลพื้นฐานของ catalog — รายการสินค้าจัดการได้ในหน้า detail
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>ชื่อ Catalog *</Label>
              <Input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                     placeholder="เช่น Master Catalog — วัตถุดิบ" />
            </div>
            <div className="space-y-1.5">
              <Label>หมวด *</Label>
              <Select value={editForm.category} onValueChange={(v: any) => setEditForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ใช้ได้ถึง</Label>
              <Input type="date" value={editForm.valid_until}
                     onChange={e => setEditForm(p => ({ ...p, valid_until: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Textarea rows={2} value={editForm.notes}
                        onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="คำอธิบาย / scope ของ catalog นี้" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveCatalog} disabled={editSaving}>
              {editSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visibility dialog */}
      <Dialog open={visOpen} onOpenChange={setVisOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              จัดการ Supplier ที่มองเห็น
            </DialogTitle>
            <DialogDescription>
              {visCatalog?.title}
            </DialogDescription>
          </DialogHeader>

          <div className={`p-3 rounded-md border text-sm ${
            visSelected.size === 0 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            {visSelected.size === 0 ? (
              <><Globe className="h-4 w-4 inline mr-1" /> <strong>Public</strong> — supplier ที่ approved ทุกรายมองเห็น catalog นี้ได้</>
            ) : (
              <><Lock className="h-4 w-4 inline mr-1" /> <strong>Restricted</strong> — เฉพาะ {visSelected.size} supplier ที่เลือก</>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Input placeholder="ค้นหา supplier..." value={visSearch} onChange={e => setVisSearch(e.target.value)} />
            <Button variant="outline" size="sm" onClick={() => setAllVis(true)}>เลือกทั้งหมด</Button>
            <Button variant="outline" size="sm" onClick={() => setAllVis(false)}>ล้าง</Button>
          </div>

          <div className="flex-1 overflow-y-auto border rounded-md divide-y">
            {filteredVisSuppliers.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">ไม่พบ supplier</p>
            ) : filteredVisSuppliers.map(s => (
              <label key={s.id} className="flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer">
                <Checkbox checked={visSelected.has(s.id)} onCheckedChange={() => toggleVis(s.id)} />
                <span className="text-sm flex-1">{s.company_name}</span>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVisOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveVisibility} disabled={visSaving}>
              {visSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
