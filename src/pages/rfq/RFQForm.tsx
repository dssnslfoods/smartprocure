import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ArrowLeft, Plus, Trash2, ChevronsUpDown, Check, Search, Package, Users, Send, Save, ShieldCheck, Lock, BookOpen, RefreshCw, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { computeDimensionRisks, type RiskCriterion, type SupplierCert, type SupplierDoc } from '@/lib/riskCriteria';
import { computeSupplierEligibility, type SupplierEligibility } from '@/lib/brcScoring';
import { requiredCertsForCatalogItems, checkCatalogEligibility, type CatalogEligibility } from '@/lib/catalogCerts';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/priceListConstants';

interface CatalogItem {
  id: string;
  price_list_id: string;
  item_code: string | null;
  item_name: string;
  description: string | null;
  unit: string | null;
  group_name: string | null;
  reference_price: number | null;
}

interface CatalogBook {
  id: string;
  title: string;
  category: string;
  itemCount: number;
}

interface SupplierOption {
  id: string;
  company_name: string;
  category: string | null;
  tier: string | null;
  contact_person: string | null;
  brcScore: number | null;
  brcMet: number;
  brcTotal: number;
}

interface LineItem {
  item_name: string;
  description: string;
  quantity: string;
  unit: string;
  specifications: string;
  catalog_item_id: string | null;
}

export default function RFQForm() {
  const navigate = useNavigate();
  const { user, tenantId } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', deadline: '', notes: '' });
  const [items, setItems] = useState<LineItem[]>([
    { item_name: '', description: '', quantity: '', unit: '', specifications: '', catalog_item_id: null },
  ]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());

  // Catalog books, then items within the chosen book — procurement picks the
  // catalog first, and only then browses/selects items that live in it.
  const [catalogBooks, setCatalogBooks] = useState<CatalogBook[]>([]);
  const [catalogBooksLoading, setCatalogBooksLoading] = useState(true);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [pendingCatalogId, setPendingCatalogId] = useState<string | null>(null); // awaiting confirm to switch
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const scopedCatalogItems = selectedCatalogId
    ? catalogItems.filter(c => c.price_list_id === selectedCatalogId)
    : [];
  const selectedCatalog = catalogBooks.find(b => b.id === selectedCatalogId) || null;

  // Suppliers for selection
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [eligibility, setEligibility] = useState<Record<string, SupplierEligibility>>({});
  const [catalogElig, setCatalogElig] = useState<Record<string, CatalogEligibility>>({});

  useEffect(() => {
    const fetchCatalog = async () => {
      const [booksRes, itemsRes] = await Promise.all([
        supabase.from('price_lists')
          .select('id, title, category, price_list_items(id)')
          .order('category').order('title'),
        supabase.from('price_list_items')
          .select('id, price_list_id, item_code, item_name, description, unit, group_name, reference_price')
          .order('item_name'),
      ]);
      const books: CatalogBook[] = ((booksRes.data as any[]) || []).map(b => ({
        id: b.id, title: b.title, category: b.category,
        itemCount: (b.price_list_items || []).length,
      }));
      setCatalogBooks(books);
      setCatalogBooksLoading(false);
      setCatalogItems((itemsRes.data as CatalogItem[]) || []);
      setCatalogLoading(false);
    };
    const fetchSuppliers = async () => {
      const [supRes, critRes, certRes, docRes] = await Promise.all([
        supabase.from('suppliers')
          .select('id, company_name, category, tier, contact_person')
          .not('is_blacklisted', 'eq', true),
        supabase.from('risk_criteria').select('*').eq('active', true),
        supabase.from('supplier_certificates').select('supplier_id, certificate_type, expiry_date'),
        supabase.from('supplier_documents').select('supplier_id, document_type, document_name'),
      ]);
      const allSuppliers = (supRes.data || []) as { id: string; company_name: string; category: string | null; tier: string | null; contact_person: string | null }[];
      const criteria = (critRes.data as RiskCriterion[]) || [];
      const certsBy: Record<string, SupplierCert[]> = {};
      (certRes.data || []).forEach((c: any) => (certsBy[c.supplier_id] ??= []).push(c));
      const docsBy: Record<string, SupplierDoc[]> = {};
      (docRes.data || []).forEach((d: any) => (docsBy[d.supplier_id] ??= []).push(d));

      const enriched: SupplierOption[] = allSuppliers.map(s => {
        if (criteria.length === 0) {
          return { ...s, brcScore: null, brcMet: 0, brcTotal: 0 };
        }
        const dims = computeDimensionRisks(criteria, certsBy[s.id] || [], docsBy[s.id] || [], 'all');
        const dimList = Object.values(dims);
        const totalCriteria = dimList.reduce((a, d) => a + d.criteria.length, 0);
        const metCriteria = dimList.reduce((a, d) => a + d.criteria.filter(c => c.met).length, 0);
        const wSum = dimList.reduce((a, d) => a + d.totalWeight, 0);
        const risk10 = wSum > 0
          ? dimList.reduce((a, d) => a + (d.score ?? 0) * d.totalWeight, 0) / wSum
          : 0;
        const riskScore = Math.round((1 - risk10 / 10) * 100);
        return { ...s, brcScore: riskScore, brcMet: metCriteria, brcTotal: totalCriteria };
      });

      enriched.sort((a, b) => {
        if (a.brcScore !== null && b.brcScore !== null) return b.brcScore - a.brcScore;
        if (a.brcScore !== null) return -1;
        if (b.brcScore !== null) return 1;
        return a.company_name.localeCompare(b.company_name);
      });

      setSuppliers(enriched);
      setSuppliersLoading(false);

      // BRCGS mandatory qualification gate — block ineligible suppliers.
      const elig = await computeSupplierEligibility(allSuppliers.map(s => s.id));
      setEligibility(elig);
    };
    fetchCatalog();
    fetchSuppliers();
  }, []);

  // Recompute catalog-cert eligibility whenever the selected catalog items change.
  const catalogItemKey = items.map(i => i.catalog_item_id).filter(Boolean).join(',');
  useEffect(() => {
    const catalogItemIds = items.map(i => i.catalog_item_id).filter(Boolean) as string[];
    const supIds = suppliers.map(s => s.id);
    if (catalogItemIds.length === 0 || supIds.length === 0) { setCatalogElig({}); return; }
    let cancelled = false;
    (async () => {
      const certs = await requiredCertsForCatalogItems(catalogItemIds);
      if (cancelled) return;
      const elig = await checkCatalogEligibility(supIds, certs);
      if (!cancelled) setCatalogElig(elig);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogItemKey, suppliers]);

  const addItem = () => setItems(p => [...p, { item_name: '', description: '', quantity: '', unit: '', specifications: '', catalog_item_id: null }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, value: string | null) =>
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const selectCatalogItem = (i: number, catalogItem: CatalogItem) => {
    setItems(p => p.map((item, idx) => idx === i ? {
      ...item,
      item_name: catalogItem.item_name,
      description: catalogItem.description || '',
      unit: catalogItem.unit || '',
      specifications: catalogItem.group_name ? `กลุ่ม: ${catalogItem.group_name}` : '',
      catalog_item_id: catalogItem.id,
    } : item));
  };

  const emptyItem: LineItem = { item_name: '', description: '', quantity: '', unit: '', specifications: '', catalog_item_id: null };
  const itemsHaveContent = items.some(i => i.item_name.trim() || i.catalog_item_id);

  // Switching catalogs mid-form would leave line items pointing at items from
  // the wrong book, so confirm first if anything's already been entered.
  const requestCatalogChange = (id: string) => {
    if (id === selectedCatalogId) return;
    if (itemsHaveContent) { setPendingCatalogId(id); return; }
    setSelectedCatalogId(id);
  };
  const confirmCatalogChange = () => {
    if (!pendingCatalogId) return;
    setSelectedCatalogId(pendingCatalogId);
    setItems([emptyItem]);
    setPendingCatalogId(null);
  };

  // Combined mandatory gate: supplier-category (BRCGS) + catalog/product certs.
  const supplierBlock = (id: string): string | null => {
    const e = eligibility[id];
    if (e && !e.passed) return e.failures.map(f => `${f.topic} (ต้องมี ${f.options.join(' / ')})`).join(', ');
    const c = catalogElig[id];
    if (c && !c.passed) return `ใบรับรองสินค้า: ${c.missing.join(', ')}`;
    return null;
  };

  const toggleSupplier = (id: string) => {
    const reason = supplierBlock(id);
    if (reason && !selectedSuppliers.has(id)) {
      toast({ title: 'ผู้จัดจำหน่ายไม่ผ่านเอกสารบังคับ', description: `ขาด: ${reason}`, variant: 'destructive' });
      return;
    }
    setSelectedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredSuppliers = supplierSearch
    ? suppliers.filter(s =>
        s.company_name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
        s.category?.toLowerCase().includes(supplierSearch.toLowerCase()) ||
        s.contact_person?.toLowerCase().includes(supplierSearch.toLowerCase())
      )
    : suppliers;

  const validateForm = () => {
    if (items.filter(i => i.item_name.trim()).length === 0) {
      toast({ title: 'กรุณาเพิ่ม Line Item', description: 'ต้องมีอย่างน้อย 1 รายการ', variant: 'destructive' });
      return false;
    }
    if (selectedSuppliers.size === 0) {
      toast({ title: 'กรุณาเลือก Supplier', description: 'ต้องเลือกผู้จัดจำหน่ายอย่างน้อย 1 ราย', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleSubmit = async (status: 'draft' | 'published') => {
    if (!validateForm()) return;
    setSaving(true);
    setPublishConfirmOpen(false);

    const rfqNumber = `RFQ-${Date.now().toString(36).toUpperCase()}`;
    const { data: rfq, error } = await supabase.from('rfqs').insert({
      rfq_number: rfqNumber,
      title: form.title,
      description: form.description,
      deadline: form.deadline || null,
      notes: form.notes,
      status,
      created_by: user?.id,
    }).select().single();

    if (error || !rfq) {
      toast({ title: 'สร้าง RFQ ไม่สำเร็จ', description: error?.message || 'Unknown error', variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Insert line items
    const validItems = items.filter(i => i.item_name.trim());
    if (validItems.length > 0) {
      await supabase.from('rfq_items').insert(
        validItems.map(i => ({
          rfq_id: rfq.id,
          item_name: i.item_name,
          description: i.description,
          quantity: parseFloat(i.quantity) || null,
          unit: i.unit,
          specifications: i.specifications,
          source_price_list_item_id: i.catalog_item_id || null,
        }))
      );
    }

    // Insert selected suppliers — defensively drop any that fail either mandatory gate.
    const eligibleSelected = Array.from(selectedSuppliers).filter(id => !supplierBlock(id));
    if (eligibleSelected.length > 0) {
      await supabase.from('rfq_suppliers').insert(
        eligibleSelected.map(supplierId => ({
          rfq_id: rfq.id,
          supplier_id: supplierId,
        }))
      );
    }

    const statusLabel = status === 'published' ? 'Published' : 'Draft';
    toast({ title: 'สร้าง RFQ สำเร็จ', description: `${rfqNumber} — ${statusLabel} · ${validItems.length} รายการ, ${eligibleSelected.length} ผู้จัดจำหน่าย` });
    setSaving(false);
    navigate(`/rfq/${rfq.id}`);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link to="/rfq"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">สร้าง RFQ</h1>
          <p className="text-sm text-muted-foreground">สร้างใบขอเสนอราคาใหม่</p>
        </div>
      </div>

      <form onSubmit={e => e.preventDefault()} className="space-y-4">
        {/* General Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">ข้อมูลทั่วไป</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>ชื่อ RFQ *</Label>
                <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required placeholder="เช่น ขอราคาวัตถุดิบ Q3/2026" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>รายละเอียด</Label>
                <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>กำหนดส่ง</Label>
                <Input type="datetime-local" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>หมายเหตุ</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </CardContent>
        </Card>

        {/* Step 1: pick the Catalog first */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> 1. เลือก Catalog
            </CardTitle>
            <CardDescription>รายการสินค้าด้านล่างจะดึงมาจาก Catalog ที่เลือกเท่านั้น</CardDescription>
          </CardHeader>
          <CardContent>
            {selectedCatalog ? (
              <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg border bg-accent/30">
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{selectedCatalog.title}</div>
                    <div className="text-xs text-muted-foreground">{selectedCatalog.itemCount} รายการในเล่ม</div>
                  </div>
                  <Badge variant="outline" className={cn('text-xs shrink-0', CATEGORY_COLORS[selectedCatalog.category])}>
                    {CATEGORY_LABELS[selectedCatalog.category] || selectedCatalog.category}
                  </Badge>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  if (itemsHaveContent) setPendingCatalogId('__reset__');
                  else { setSelectedCatalogId(null); setItems([emptyItem]); }
                }}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />เปลี่ยน Catalog
                </Button>
              </div>
            ) : (
              <CatalogBookPicker books={catalogBooks} loading={catalogBooksLoading} onSelect={requestCatalogChange} />
            )}
          </CardContent>
        </Card>

        {/* Step 2: pick items from that Catalog */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4" /> 2. รายการสินค้า (Line Items)
              </CardTitle>
              <CardDescription>
                {selectedCatalog ? `เลือกจาก "${selectedCatalog.title}" หรือพิมพ์เอง` : 'เลือก Catalog ด้านบนก่อน จึงจะเพิ่มรายการได้'}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={!selectedCatalogId}>
              <Plus className="w-4 h-4 mr-1" />เพิ่มรายการ
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedCatalogId ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                กรุณาเลือก Catalog ก่อนเพื่อเริ่มเพิ่มรายการสินค้า
              </div>
            ) : items.map((item, i) => (
              <div key={i} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">รายการ #{i + 1}</span>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(i)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>

                {/* Catalog Search — scoped to the chosen Catalog */}
                <CatalogCombobox
                  catalogItems={scopedCatalogItems}
                  loading={catalogLoading}
                  selectedId={item.catalog_item_id}
                  onSelect={(ci) => selectCatalogItem(i, ci)}
                />

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">ชื่อสินค้า *</Label>
                    <Input value={item.item_name} onChange={e => updateItem(i, 'item_name', e.target.value)} placeholder="เช่น น้ำตาลทราย 50 กก." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">จำนวน</Label>
                    <Input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} placeholder="100" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">หน่วย</Label>
                    <Input value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)} placeholder="ถุง" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">คุณสมบัติ / สเปค</Label>
                  <Input value={item.specifications} onChange={e => updateItem(i, 'specifications', e.target.value)} placeholder="ISO certified, food-grade..." />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Confirm switching Catalog when line items already have content */}
        <AlertDialog open={!!pendingCatalogId} onOpenChange={v => !v && setPendingCatalogId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />เปลี่ยน Catalog?
              </AlertDialogTitle>
              <AlertDialogDescription>
                รายการสินค้าที่เลือกไว้ทั้งหมดผูกกับ Catalog เดิม การเปลี่ยน Catalog จะล้างรายการที่กรอกไว้และเริ่มใหม่
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingCatalogId(null)}>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingCatalogId === '__reset__') { setSelectedCatalogId(null); setItems([emptyItem]); setPendingCatalogId(null); }
                  else confirmCatalogChange();
                }}
              >
                ยืนยันเปลี่ยน
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Supplier Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> เลือกผู้จัดจำหน่าย
              {selectedSuppliers.size > 0 && (
                <Badge variant="secondary" className="ml-2">{selectedSuppliers.size} ราย</Badge>
              )}
            </CardTitle>
            <CardDescription>เลือก Supplier ที่ต้องการให้เสนอราคา</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหาผู้จัดจำหน่าย..."
                value={supplierSearch}
                onChange={e => setSupplierSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Selected suppliers badges */}
            {selectedSuppliers.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suppliers.filter(s => selectedSuppliers.has(s.id)).map(s => (
                  <Badge key={s.id} variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/10" onClick={() => toggleSupplier(s.id)}>
                    {s.company_name}
                    <span className="text-muted-foreground ml-0.5">×</span>
                  </Badge>
                ))}
              </div>
            )}

            <div className="border rounded-lg max-h-60 overflow-y-auto divide-y">
              {suppliersLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
              ) : filteredSuppliers.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">ไม่พบผู้จัดจำหน่าย</div>
              ) : (
                filteredSuppliers.map(s => {
                  const blockReason = supplierBlock(s.id);
                  const blocked = !!blockReason;
                  return (
                  <label key={s.id} className={cn('flex items-center gap-3 px-3 py-2.5', blocked ? 'opacity-60 cursor-not-allowed bg-red-50/40' : 'hover:bg-accent cursor-pointer')}>
                    <Checkbox
                      checked={selectedSuppliers.has(s.id)}
                      disabled={blocked}
                      onCheckedChange={() => toggleSupplier(s.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{s.company_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {blocked
                          ? <span className="text-red-600">ขาดเอกสารบังคับ: {blockReason}</span>
                          : ([s.contact_person, s.category].filter(Boolean).join(' · ') || '—')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {blocked && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 border-red-300 bg-red-50 text-red-700">
                          <Lock className="w-3 h-3" />บล็อก
                        </Badge>
                      )}
                      {s.brcScore !== null && (
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] gap-0.5',
                            s.brcScore >= 75 ? 'border-green-300 bg-green-50 text-green-700' :
                            s.brcScore >= 50 ? 'border-amber-300 bg-amber-50 text-amber-700' :
                            'border-red-300 bg-red-50 text-red-700'
                          )}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          BRC {s.brcMet}/{s.brcTotal}
                        </Badge>
                      )}
                      {s.tier && (
                        <Badge variant="outline" className="text-xs">
                          {s.tier === 'critical_tier_1' ? 'Critical' : 'Non-Critical'}
                        </Badge>
                      )}
                    </div>
                  </label>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link to="/rfq"><Button variant="outline">ยกเลิก</Button></Link>
          <Button variant="secondary" disabled={saving} onClick={() => handleSubmit('draft')} className="gap-1.5">
            <Save className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก Draft'}
          </Button>
          <Button disabled={saving} onClick={() => { if (validateForm()) setPublishConfirmOpen(true); }} className="gap-1.5">
            <Send className="w-4 h-4" />Publish ทันที
          </Button>
        </div>

        <Dialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Publish RFQ ทันที?</DialogTitle>
              <DialogDescription>
                เมื่อ Publish แล้ว Supplier ที่ถูกเชิญจะเห็นรายการนี้และสามารถส่งใบเสนอราคาได้ทันที
                หาก Draft ไว้ก่อน Supplier จะยังไม่เห็นรายการจนกว่าจะเปลี่ยนสถานะเป็น Published
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => { setPublishConfirmOpen(false); handleSubmit('draft'); }}>
                <Save className="w-4 h-4 mr-1.5" />Draft ก่อน
              </Button>
              <Button onClick={() => handleSubmit('published')} disabled={saving}>
                <Send className="w-4 h-4 mr-1.5" />{saving ? 'กำลังสร้าง...' : 'Publish เลย'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </form>
    </div>
  );
}

// Step 1 — pick which Catalog book this RFQ buys from.
function CatalogBookPicker({ books, loading, onSelect }: {
  books: CatalogBook[];
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = search
    ? books.filter(b => b.title.toLowerCase().includes(search.toLowerCase()))
    : books;
  const grouped = filtered.reduce((acc, b) => {
    (acc[b.category] ??= []).push(b);
    return acc;
  }, {} as Record<string, CatalogBook[]>);

  if (loading) return <div className="p-4 text-center text-sm text-muted-foreground">กำลังโหลด Catalog...</div>;
  if (books.length === 0) return <div className="p-4 text-center text-sm text-muted-foreground">ยังไม่มี Catalog ในระบบ</div>;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="ค้นหาชื่อ Catalog..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>
      <div className="border rounded-lg max-h-72 overflow-y-auto divide-y">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">ไม่พบ Catalog</div>
        ) : (
          Object.entries(grouped).map(([category, list]) => (
            <div key={category}>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                {CATEGORY_LABELS[category] || category}
              </div>
              {list.map(b => (
                <button key={b.id} type="button" onClick={() => onSelect(b.id)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent">
                  <div className="flex items-center gap-2 min-w-0">
                    <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{b.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{b.itemCount} รายการ</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Catalog Combobox component
function CatalogCombobox({ catalogItems, loading, selectedId, onSelect }: {
  catalogItems: CatalogItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (item: CatalogItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = selectedId ? catalogItems.find(c => c.id === selectedId) : null;

  const filtered = search
    ? catalogItems.filter(c =>
        c.item_name.toLowerCase().includes(search.toLowerCase()) ||
        c.item_code?.toLowerCase().includes(search.toLowerCase()) ||
        c.group_name?.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 50)
    : catalogItems.slice(0, 50);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open}
          className="w-full justify-between text-left font-normal h-9 text-sm">
          {selected ? (
            <span className="truncate">
              {selected.item_code ? `[${selected.item_code}] ` : ''}{selected.item_name}
            </span>
          ) : (
            <span className="text-muted-foreground">ค้นหาจาก Catalog...</span>
          )}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="พิมพ์ชื่อ หรือ รหัสสินค้า..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{loading ? 'กำลังโหลด...' : 'ไม่พบสินค้า'}</CommandEmpty>
            <CommandGroup>
              {filtered.map(c => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => { onSelect(c); setOpen(false); setSearch(''); }}
                  className="flex items-center gap-2"
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", selectedId === c.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {c.item_code && <span className="text-muted-foreground mr-1">[{c.item_code}]</span>}
                      {c.item_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[c.unit, c.group_name, c.reference_price ? `฿${c.reference_price.toLocaleString()}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
