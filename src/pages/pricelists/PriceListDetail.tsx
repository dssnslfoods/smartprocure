import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Search, Pin, FileSpreadsheet, Upload, Lock, AlertCircle,
  CheckCircle2, Download, ChevronDown, ChevronRight, Gavel, Save, Calculator,
  Clock, AlertTriangle,
} from 'lucide-react';
import { assessCycle, loadPricelistCycle, CYCLE_STATUS_CLASS, CYCLE_STATUS_LABEL,
  type PricelistCycleSettings, DEFAULT_CYCLE } from '@/lib/pricelistCycle';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  CATEGORY_LABELS, CATEGORY_COLORS,
  NOMINATION_STATUS_LABELS, NOMINATION_STATUS_COLORS,
} from '@/lib/priceListConstants';
import {
  exportChecklistToExcel, importQuotationFromExcel,
  type CatalogItemRow, type ImportResult,
} from '@/lib/priceListExcel';

interface CatalogHeader {
  id: string;
  title: string;
  category: string;
  status: string;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
}

interface OfferRow {
  id:                string;
  supplier_id:       string;
  unit_price:        number;
  moq:               number | null;
  lead_time_days:    number | null;
  reference_quotation_no: string | null;
  notes:             string | null;
  valid_from:        string | null;
  valid_until:       string | null;
  is_preferred:      boolean;
  updated_at:        string | null;
  supplier:          { id: string; company_name: string } | null;
}

interface ItemRow extends CatalogItemRow {
  nomination_status: string | null;
  nominated_customer: string | null;
  designated_supplier_name?: string;
  offers: OfferRow[];
}

interface SupplierOption { id: string; company_name: string }

/** Compute "ราคากลาง" per spec:
 *  - Nominated  → unit_price of the nominated supplier (if any offer)
 *  - Open       → AVG of all suppliers' unit prices
 */
function computeBaseline(it: ItemRow): { value: number | null; source: 'nominated' | 'avg' | 'none'; n: number } {
  if (it.is_nominated) {
    const off = it.offers.find(o => o.supplier_id === it.designated_supplier_id);
    return off
      ? { value: Number(off.unit_price), source: 'nominated', n: 1 }
      : { value: null, source: 'none', n: 0 };
  }
  if (it.offers.length === 0) return { value: null, source: 'none', n: 0 };
  const sum = it.offers.reduce((a, o) => a + Number(o.unit_price), 0);
  return { value: sum / it.offers.length, source: 'avg', n: it.offers.length };
}

export default function PriceListDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { roles, profile } = useAuth();
  const isAdmin       = roles.includes('admin');
  const isProcurement = roles.includes('procurement_officer') || isAdmin;
  const isSupplier    = roles.includes('supplier');
  const mySupplierId  = profile?.supplier_id ?? null;

  const [header, setHeader] = useState<CatalogHeader | null>(null);
  const [items, setItems]   = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'nominated' | 'open' | 'mine' | 'no_offers'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [targetSupplierId, setTargetSupplierId] = useState<string>('');
  const [rfqNumber, setRfqNumber] = useState('');

  const [cycle, setCycle] = useState<PricelistCycleSettings>(DEFAULT_CYCLE);
  useEffect(() => { loadPricelistCycle().then(setCycle); }, []);

  // Inline edit of target_quantity (procurement only)
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

  const fileRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);

  // Final Quotation dialog
  const [fqOpen, setFqOpen] = useState(false);
  const [fqSupplierIds, setFqSupplierIds] = useState<Set<string>>(new Set());
  const [fqTitle, setFqTitle] = useState('');
  const [fqDeadline, setFqDeadline] = useState('');
  const [fqSubmitting, setFqSubmitting] = useState(false);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    const [headerRes, itemsRes] = await Promise.all([
      supabase.from('price_lists').select('id,title,category,status,valid_from,valid_until,notes').eq('id', id).single(),
      supabase.from('price_list_items')
        .select(`id,item_code,item_name,description,unit,reference_price,target_quantity,moq,lead_time_days,
                 is_nominated,nomination_status,nominated_customer,designated_supplier_id,sort_order,
                 designated_supplier:suppliers!designated_supplier_id(id,company_name),
                 offers:price_list_item_suppliers(id,supplier_id,unit_price,moq,lead_time_days,
                   reference_quotation_no,notes,valid_from,valid_until,is_preferred,updated_at,
                   supplier:suppliers(id,company_name))`)
        .eq('price_list_id', id)
        .order('sort_order'),
    ]);
    if (headerRes.data) setHeader(headerRes.data as CatalogHeader);
    if (itemsRes.data) {
      setItems(itemsRes.data.map((r: any) => ({
        ...r,
        designated_supplier_name: r.designated_supplier?.company_name ?? null,
        offers: (r.offers || []) as OfferRow[],
      })));
    }
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    if (!isProcurement) return;
    supabase.from('suppliers').select('id, company_name').eq('status', 'approved').order('company_name')
      .then(({ data }) => setSuppliers(data || []));
  }, [isProcurement]);

  // Last submission per supplier in this catalog = MAX(updated_at) of their offers
  const lastSubmittedBySupplier = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach(it => it.offers.forEach(o => {
      const ts = o.updated_at || o.valid_from || null;
      if (!ts) return;
      const cur = map.get(o.supplier_id);
      if (!cur || ts > cur) map.set(o.supplier_id, ts);
    }));
    return map;
  }, [items]);

  const myCycle = useMemo(() => {
    if (!isSupplier || !mySupplierId) return null;
    return assessCycle(lastSubmittedBySupplier.get(mySupplierId) || null, cycle.update_cycle_days);
  }, [isSupplier, mySupplierId, lastSubmittedBySupplier, cycle.update_cycle_days]);

  const visibleItems = useMemo(() => {
    let list = items;
    if (isSupplier && mySupplierId) {
      list = list.filter(i => !i.is_nominated || i.designated_supplier_id === mySupplierId);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i =>
        i.item_name.toLowerCase().includes(q) ||
        (i.item_code || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q)
      );
    }
    if (filterMode === 'nominated') list = list.filter(i => i.is_nominated);
    if (filterMode === 'open')      list = list.filter(i => !i.is_nominated);
    if (filterMode === 'no_offers') list = list.filter(i => i.offers.length === 0);
    if (filterMode === 'mine' && mySupplierId) {
      list = list.filter(i => i.designated_supplier_id === mySupplierId);
    }
    return list;
  }, [items, search, filterMode, isSupplier, mySupplierId]);

  const canSelect = (it: ItemRow): boolean => {
    if (!isSupplier) return true;
    if (!it.is_nominated) return true;
    return it.designated_supplier_id === mySupplierId;
  };

  const toggle = (itId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(itId)) next.delete(itId); else next.add(itId);
      return next;
    });
  };

  const toggleAll = () => {
    const eligible = visibleItems.filter(canSelect).map(i => i.id);
    if (eligible.every(eid => selected.has(eid))) {
      setSelected(prev => { const n = new Set(prev); eligible.forEach(eid => n.delete(eid)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); eligible.forEach(eid => n.add(eid)); return n; });
    }
  };

  const toggleExpand = (itId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(itId)) next.delete(itId); else next.add(itId);
      return next;
    });
  };

  // Inline save target_quantity (procurement)
  const saveQty = async (itemId: string) => {
    const raw = qtyDraft[itemId];
    if (raw === undefined) return;
    const value = raw === '' ? null : Number(raw);
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      toast.error('ปริมาณไม่ถูกต้อง');
      return;
    }
    const { error } = await supabase.from('price_list_items')
      .update({ target_quantity: value })
      .eq('id', itemId);
    if (error) { toast.error(error.message); return; }
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, target_quantity: value } : i));
    setQtyDraft(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    toast.success('บันทึกปริมาณแล้ว');
  };

  const handleExport = () => {
    if (!header) return;
    if (selected.size === 0) { toast.error('กรุณาเลือกอย่างน้อย 1 รายการ'); return; }
    const rows = items.filter(i => selected.has(i.id));
    const supplierName = isSupplier
      ? (profile?.full_name || '')
      : (suppliers.find(s => s.id === targetSupplierId)?.company_name || '');
    exportChecklistToExcel(rows, {
      catalogTitle: header.title,
      catalogId:    header.id,
      category:     CATEGORY_LABELS[header.category] || header.category,
      supplierName,
      supplierId:   isSupplier ? (mySupplierId || undefined) : (targetSupplierId || undefined),
      rfqNumber:    rfqNumber || undefined,
      validUntil:   header.valid_until || undefined,
    });
    toast.success(`Export ${selected.size} รายการสำเร็จ`);
  };

  const handleImport = async (file: File) => {
    try {
      const result = await importQuotationFromExcel(file);
      setImportPreview(result);
      if (result.errors.length > 0) toast.warning(`พบ ${result.errors.length} ข้อผิดพลาด`);
      else toast.success(`อ่านไฟล์สำเร็จ ${result.rows.length} รายการ`);
    } catch (e: any) {
      toast.error('อ่านไฟล์ไม่สำเร็จ: ' + (e.message || e));
    }
  };

  const confirmImport = async () => {
    if (!importPreview || importPreview.rows.length === 0) return;
    const supplierId = isSupplier ? mySupplierId : targetSupplierId;
    if (!supplierId) { toast.error('กรุณาเลือก supplier ก่อนบันทึก'); return; }

    const { data: itemsData } = await supabase
      .from('price_list_items')
      .select('id, is_nominated, designated_supplier_id')
      .in('id', importPreview.rows.map(r => r.price_list_item_id));

    const allowed = new Set(
      (itemsData || []).filter((i: any) =>
        !i.is_nominated || i.designated_supplier_id === supplierId
      ).map((i: any) => i.id)
    );
    const accepted = importPreview.rows.filter(r => allowed.has(r.price_list_item_id));
    const blocked  = importPreview.rows.length - accepted.length;
    if (accepted.length === 0) { toast.error('ไม่มีรายการที่อนุญาตให้ supplier นี้เสนอราคา'); return; }

    const upserts = accepted.map(r => ({
      price_list_item_id: r.price_list_item_id,
      supplier_id:        supplierId!,
      unit_price:         r.bid_price ?? 0,
      moq:                r.bid_moq,
      lead_time_days:     r.bid_lead_time,
      reference_quotation_no: r.reference_quotation_no,
      notes:              r.notes,
      currency:           'THB',
      valid_from:         new Date().toISOString().slice(0, 10),
    }));

    const { error } = await supabase.from('price_list_item_suppliers')
      .upsert(upserts, { onConflict: 'price_list_item_id,supplier_id' });
    if (error) { toast.error('บันทึกไม่สำเร็จ: ' + error.message); return; }

    toast.success(`บันทึก ${accepted.length} รายการ` + (blocked > 0 ? ` (ข้าม ${blocked})` : ''));
    setImportPreview(null);
    setSelected(new Set());
    reload();
  };

  // ----- Final Quotation: build RFQ from selected items + chosen suppliers -----
  const selectedItemsForFQ = useMemo(() => items.filter(i => selected.has(i.id)), [items, selected]);
  const candidateSuppliersForFQ = useMemo(() => {
    // Union of all suppliers who already bid on the selected items
    const map = new Map<string, string>();
    selectedItemsForFQ.forEach(it => {
      if (it.is_nominated && it.designated_supplier_id) {
        const ds = it.designated_supplier_name || '';
        map.set(it.designated_supplier_id, ds);
      } else {
        it.offers.forEach(o => o.supplier && map.set(o.supplier.id, o.supplier.company_name));
      }
    });
    return Array.from(map.entries()).map(([sid, name]) => ({ id: sid, company_name: name }));
  }, [selectedItemsForFQ]);

  const openFinalQuotation = () => {
    if (selected.size === 0) { toast.error('กรุณาเลือกรายการที่ต้องการขอ Final Quotation'); return; }
    if (candidateSuppliersForFQ.length === 0) {
      toast.error('ยังไม่มี supplier ใดเสนอราคาในรายการที่เลือก');
      return;
    }
    setFqSupplierIds(new Set(candidateSuppliersForFQ.map(s => s.id)));
    setFqTitle(`Final Quotation — ${header?.title || ''}`);
    const d = new Date(); d.setDate(d.getDate() + 7);
    setFqDeadline(d.toISOString().slice(0, 16));
    setFqOpen(true);
  };

  const submitFinalQuotation = async () => {
    if (fqSupplierIds.size === 0) { toast.error('เลือก supplier อย่างน้อย 1 ราย'); return; }
    setFqSubmitting(true);
    try {
      // 1) RFQ header
      const { data: rfq, error: rfqErr } = await supabase
        .from('rfqs')
        .insert({
          title: fqTitle,
          description: `สร้างจาก Catalog: ${header?.title}`,
          status: 'draft',
          deadline: fqDeadline ? new Date(fqDeadline).toISOString() : null,
          rfq_number: `RFQ-${Date.now()}`,
        })
        .select('id, rfq_number')
        .single();
      if (rfqErr || !rfq) throw rfqErr || new Error('สร้าง RFQ ไม่สำเร็จ');

      // 2) RFQ items, with source link to catalog
      // Filter out nominated items going to non-nominated suppliers
      const itemsRows = selectedItemsForFQ.map(it => ({
        rfq_id: rfq.id,
        item_name: it.item_name,
        description: it.description,
        quantity: it.target_quantity,
        unit: it.unit,
        source_price_list_item_id: it.id,
      }));
      const { error: itemsErr } = await supabase.from('rfq_items').insert(itemsRows);
      if (itemsErr) throw itemsErr;

      // 3) Suppliers — but exclude any supplier who would only be invited because of items they aren't nominated for
      //    Simple rule: invite chosen suppliers; nomination check happens at quotation time.
      const supRows = Array.from(fqSupplierIds).map(sid => ({
        rfq_id: rfq.id, supplier_id: sid,
      }));
      const { error: supErr } = await supabase.from('rfq_suppliers').insert(supRows);
      if (supErr) throw supErr;

      toast.success(`สร้าง Final Quotation สำเร็จ (${rfq.rfq_number})`);
      setFqOpen(false);
      navigate(`/rfq/${rfq.id}`);
    } catch (e: any) {
      toast.error('สร้างไม่สำเร็จ: ' + (e.message || e));
    } finally {
      setFqSubmitting(false);
    }
  };

  if (loading) return <Card><CardContent className="p-12 text-center text-muted-foreground">กำลังโหลด...</CardContent></Card>;
  if (!header) return <Card><CardContent className="p-12 text-center">ไม่พบ Catalog</CardContent></Card>;

  const eligibleSelectable = visibleItems.filter(canSelect);
  const allEligibleSelected = eligibleSelectable.length > 0 && eligibleSelectable.every(i => selected.has(i.id));
  const nominatedToMine = items.filter(i => i.is_nominated && i.designated_supplier_id === mySupplierId).length;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link to="/price-lists"><ArrowLeft className="h-4 w-4 mr-1" />Catalogs</Link>
        </Button>
        <h1 className="text-2xl font-bold">{header.title}</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="outline" className={CATEGORY_COLORS[header.category] || ''}>
            {CATEGORY_LABELS[header.category] || header.category}
          </Badge>
          <Badge>{header.status}</Badge>
          {header.valid_until && (
            <span className="text-xs text-muted-foreground">
              ใช้ได้ถึง {new Date(header.valid_until).toLocaleDateString('th-TH')}
            </span>
          )}
        </div>
      </div>

      {/* Supplier cycle banner */}
      {isSupplier && myCycle && (
        <Card className={`border-2 ${
          myCycle.status === 'overdue'  ? 'border-red-300 bg-red-50' :
          myCycle.status === 'due_soon' ? 'border-amber-300 bg-amber-50' :
          myCycle.status === 'fresh'    ? 'border-emerald-300 bg-emerald-50' :
                                          'border-zinc-300 bg-zinc-50'
        }`}>
          <CardContent className="p-4 flex items-center gap-3 flex-wrap">
            {myCycle.status === 'overdue' ? <AlertTriangle className="h-5 w-5 text-red-600" /> :
             myCycle.status === 'due_soon' ? <Clock className="h-5 w-5 text-amber-600" /> :
             myCycle.status === 'fresh' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> :
                                          <AlertCircle className="h-5 w-5 text-zinc-500" />}
            <div className="flex-1 text-sm">
              <div className="font-semibold">
                {myCycle.status === 'never'    ? 'คุณยังไม่ได้ส่ง pricelist สำหรับ catalog นี้' :
                 myCycle.status === 'overdue'  ? `เกินรอบการอัปเดตแล้ว ${Math.abs(myCycle.daysRemaining ?? 0)} วัน — กรุณาส่ง pricelist ใหม่` :
                 myCycle.status === 'due_soon' ? `ใกล้ครบรอบ — เหลือ ${myCycle.daysRemaining} วัน` :
                                                 `ส่ง pricelist แล้ว — ครั้งถัดไปอีก ${myCycle.daysRemaining} วัน`}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {myCycle.lastAt && `ส่งล่าสุด: ${myCycle.lastAt.toLocaleDateString('th-TH')} · `}
                รอบอัปเดต: ทุก {cycle.update_cycle_days} วัน
                {cycle.hold_until_days ? ` · ยืนราคาอย่างน้อย ${cycle.hold_until_days} วัน` : ''}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm">
              <span className="font-semibold">{selected.size}</span> รายการที่เลือก
              {isSupplier && nominatedToMine > 0 && (
                <span className="ml-3 text-amber-700">
                  <Pin className="inline h-3 w-3 mr-1" />ลูกค้าระบุให้คุณ {nominatedToMine} รายการ
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={handleExport} disabled={selected.size === 0}>
                <Download className="h-4 w-4 mr-2" />Export Checklist (.xlsx)
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />Import Quotation
              </Button>
              {isProcurement && (
                <Button variant="default" className="bg-purple-600 hover:bg-purple-700"
                  onClick={openFinalQuotation} disabled={selected.size === 0}>
                  <Gavel className="h-4 w-4 mr-2" />ขอ Final Quotation
                </Button>
              )}
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }} />
            </div>
          </div>

          {isProcurement && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t">
              <div>
                <Label className="text-xs">ส่ง Checklist ให้ Supplier (เลือกได้)</Label>
                <Select value={targetSupplierId || '__open__'}
                  onValueChange={v => setTargetSupplierId(v === '__open__' ? '' : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="— เปิดให้ทุกราย —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__open__">— เปิดให้ทุกราย —</SelectItem>
                    {suppliers.map(s => (<SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">เลขที่ RFQ (เลือกได้)</Label>
                <Input className="mt-1" value={rfqNumber} onChange={e => setRfqNumber(e.target.value)} placeholder="RFQ-2026-0001" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="ค้นหา รหัส / ชื่อ / รายละเอียด..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {([
            ['all', 'ทั้งหมด'],
            ['nominated', '🔒 Nominated'],
            ['open', 'เปิดเสนอราคาได้'],
            ['no_offers', 'ยังไม่มีราคา'],
            ...(isSupplier ? [['mine', 'ที่ระบุให้ฉัน'] as const] : []),
          ] as const).map(([mode, label]) => (
            <button key={mode} onClick={() => setFilterMode(mode as any)}
              className={`px-3 py-1.5 rounded-md text-xs border transition ${
                filterMode === mode ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 hover:bg-muted'
              }`}>{label}</button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 w-10">
                    <Checkbox checked={allEligibleSelected} onCheckedChange={toggleAll} aria-label="เลือกทั้งหมด" />
                  </th>
                  <th className="p-3 w-8"></th>
                  <th className="p-3 text-left font-medium text-muted-foreground">รหัส / สินค้า</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">หน่วย</th>
                  <th className="p-3 text-right font-medium text-muted-foreground">ปริมาณที่ขอ</th>
                  <th className="p-3 text-right font-medium text-muted-foreground">ราคากลาง</th>
                  <th className="p-3 text-center font-medium text-muted-foreground">เสนอแล้ว</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Nominated</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">ไม่พบรายการ</td></tr>
                ) : visibleItems.map(it => {
                  const blocked = !canSelect(it);
                  const baseline = computeBaseline(it);
                  const isExpanded = expanded.has(it.id);
                  const draftQty = qtyDraft[it.id];
                  const isEditingQty = draftQty !== undefined;

                  return (
                    <Fragment key={it.id}>
                      <tr className={`border-b ${it.is_nominated ? 'bg-amber-50/40' : ''} hover:bg-muted/30`}>
                        <td className="p-3">
                          <Checkbox checked={selected.has(it.id)} disabled={blocked}
                            onCheckedChange={() => toggle(it.id)} aria-label={`เลือก ${it.item_name}`} />
                        </td>
                        <td className="p-3">
                          <button onClick={() => toggleExpand(it.id)} className="text-muted-foreground hover:text-foreground">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{it.item_code || '—'}</span>
                            {it.is_nominated && <Lock className="h-3 w-3 text-amber-700" />}
                            <span className="font-medium">{it.item_name}</span>
                          </div>
                          {it.description && <div className="text-xs text-muted-foreground line-clamp-1">{it.description}</div>}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{it.unit || '—'}</td>
                        <td className="p-3 text-right">
                          {isProcurement ? (
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                value={isEditingQty ? draftQty : (it.target_quantity ?? '')}
                                onChange={e => setQtyDraft(prev => ({ ...prev, [it.id]: e.target.value }))}
                                onBlur={() => isEditingQty && saveQty(it.id)}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                className="h-7 w-20 text-right font-mono text-xs"
                              />
                              {isEditingQty && (
                                <button onClick={() => saveQty(it.id)} className="text-primary hover:text-primary/80">
                                  <Save className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="font-mono text-xs">{it.target_quantity?.toLocaleString('th-TH') ?? '—'}</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {baseline.value != null ? (
                            <div className="flex flex-col items-end">
                              <span className="font-mono font-semibold">
                                {baseline.value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Calculator className="h-2.5 w-2.5" />
                                {baseline.source === 'nominated' ? 'จาก nominated' : `เฉลี่ย ${baseline.n} ราย`}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">— ยังไม่มีราคา —</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant={it.offers.length === 0 ? 'outline' : 'default'} className="text-xs">
                            {it.offers.length} ราย
                          </Badge>
                        </td>
                        <td className="p-3">
                          {it.is_nominated ? (
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className={`text-xs ${NOMINATION_STATUS_COLORS[it.nomination_status || ''] || ''}`}>
                                {NOMINATION_STATUS_LABELS[it.nomination_status || ''] || it.nomination_status}
                              </Badge>
                              <span className="text-xs text-muted-foreground line-clamp-1">{it.designated_supplier_name || '—'}</span>
                            </div>
                          ) : (<span className="text-xs text-muted-foreground">เปิดเสนอ</span>)}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={8} className="p-4">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">
                              Suppliers ที่เคยเสนอราคา ({it.offers.length} ราย)
                            </div>
                            {it.offers.length === 0 ? (
                              <div className="text-sm text-muted-foreground italic">ยังไม่มี supplier เสนอราคารายการนี้</div>
                            ) : (
                              <table className="w-full text-xs border rounded">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="p-2 text-left">Supplier</th>
                                    <th className="p-2 text-right">ราคา/หน่วย</th>
                                    <th className="p-2 text-right">MOQ</th>
                                    <th className="p-2 text-right">Lead Time</th>
                                    <th className="p-2 text-left">Ref. Quotation</th>
                                    <th className="p-2 text-left">ใช้ได้ถึง</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {it.offers
                                    .slice()
                                    .sort((a, b) => Number(a.unit_price) - Number(b.unit_price))
                                    .map(o => {
                                      const isNomSup = it.is_nominated && o.supplier_id === it.designated_supplier_id;
                                      const submitTs = lastSubmittedBySupplier.get(o.supplier_id) || o.updated_at;
                                      const supCycle = assessCycle(submitTs || null, cycle.update_cycle_days);
                                      return (
                                        <tr key={o.id} className={`border-t ${isNomSup ? 'bg-amber-50' : ''}`}>
                                          <td className="p-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              {isNomSup && <Lock className="h-3 w-3 text-amber-700" />}
                                              <span>{o.supplier?.company_name || '—'}</span>
                                              <Badge variant="outline" className={`text-[10px] ${CYCLE_STATUS_CLASS[supCycle.status]}`}>
                                                {CYCLE_STATUS_LABEL[supCycle.status]}
                                                {supCycle.lastAt && ` · ${supCycle.lastAt.toLocaleDateString('th-TH')}`}
                                              </Badge>
                                            </div>
                                          </td>
                                          <td className="p-2 text-right font-mono">
                                            {Number(o.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                          </td>
                                          <td className="p-2 text-right">{o.moq ?? '—'}</td>
                                          <td className="p-2 text-right">{o.lead_time_days ? `${o.lead_time_days} วัน` : '—'}</td>
                                          <td className="p-2">{o.reference_quotation_no || '—'}</td>
                                          <td className="p-2">{o.valid_until ? new Date(o.valid_until).toLocaleDateString('th-TH') : '—'}</td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Import preview */}
      {importPreview && (
        <Card className="border-blue-300">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />Preview ใบเสนอราคา
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setImportPreview(null)}>ปิด</Button>
            </div>
            {importPreview.errors.length > 0 && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-xs space-y-1">
                <div className="flex items-center gap-1 font-semibold text-red-700">
                  <AlertCircle className="h-3 w-3" /> พบข้อผิดพลาด {importPreview.errors.length} รายการ
                </div>
                {importPreview.errors.slice(0, 5).map((e, i) => (<div key={i}>แถว {e.row}: {e.message}</div>))}
              </div>
            )}
            <div className="text-sm mb-3 flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />พร้อมบันทึก {importPreview.rows.length} รายการ
            </div>
            {isProcurement && !targetSupplierId && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                ⚠ กรุณาเลือก supplier ในแถบด้านบนก่อนบันทึก
              </div>
            )}
            <div className="max-h-64 overflow-auto border rounded">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">Item ID</th>
                    <th className="p-2 text-right">ปริมาณ</th>
                    <th className="p-2 text-right">ราคาเสนอ</th>
                    <th className="p-2 text-left">Ref Quotation</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-mono">{r.price_list_item_id.slice(0, 8)}</td>
                      <td className="p-2 text-right">{r.target_quantity ?? '—'}</td>
                      <td className="p-2 text-right font-mono">{r.bid_price?.toLocaleString('th-TH')}</td>
                      <td className="p-2">{r.reference_quotation_no || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.rows.length > 50 && (
                <div className="p-2 text-xs text-center text-muted-foreground">
                  ... และอีก {importPreview.rows.length - 50} รายการ
                </div>
              )}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportPreview(null)}>ยกเลิก</Button>
              <Button onClick={confirmImport}
                disabled={importPreview.rows.length === 0 || (isProcurement && !targetSupplierId)}>
                ยืนยันบันทึก
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Final Quotation dialog */}
      {fqOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setFqOpen(false)}>
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Gavel className="h-5 w-5 text-purple-600" />
                <h3 className="text-lg font-semibold">ขอ Final Quotation</h3>
              </div>

              <div className="space-y-1">
                <Label>หัวข้อ RFQ</Label>
                <Input value={fqTitle} onChange={e => setFqTitle(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>กำหนดส่ง (Deadline)</Label>
                <Input type="datetime-local" value={fqDeadline} onChange={e => setFqDeadline(e.target.value)} />
              </div>

              <div>
                <div className="text-sm font-medium mb-2">
                  รายการสินค้า {selectedItemsForFQ.length} รายการ
                </div>
                <div className="border rounded max-h-48 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr><th className="p-2 text-left">รหัส</th><th className="p-2 text-left">ชื่อ</th><th className="p-2 text-right">ปริมาณ</th></tr>
                    </thead>
                    <tbody>
                      {selectedItemsForFQ.map(it => (
                        <tr key={it.id} className="border-t">
                          <td className="p-2 font-mono">{it.item_code}</td>
                          <td className="p-2">{it.item_name} {it.is_nominated && <Lock className="inline h-3 w-3 text-amber-700" />}</td>
                          <td className="p-2 text-right">{it.target_quantity ?? '—'} {it.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">เชิญ Suppliers ({fqSupplierIds.size} ราย)</div>
                <div className="border rounded max-h-48 overflow-auto">
                  {candidateSuppliersForFQ.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground italic">ยังไม่มี supplier ที่เคยเสนอราคารายการเหล่านี้</div>
                  ) : candidateSuppliersForFQ.map(s => (
                    <label key={s.id} className="flex items-center gap-2 p-2 border-b cursor-pointer hover:bg-muted/30">
                      <Checkbox checked={fqSupplierIds.has(s.id)}
                        onCheckedChange={() => setFqSupplierIds(prev => {
                          const n = new Set(prev);
                          if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
                          return n;
                        })} />
                      <span className="text-sm">{s.company_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setFqOpen(false)}>ยกเลิก</Button>
                <Button onClick={submitFinalQuotation} disabled={fqSubmitting || fqSupplierIds.size === 0}
                  className="bg-purple-600 hover:bg-purple-700">
                  {fqSubmitting ? 'กำลังสร้าง...' : 'สร้าง RFQ'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
