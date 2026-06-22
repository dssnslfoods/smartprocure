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
import { ArrowLeft, Plus, Trash2, ChevronsUpDown, Check, Search, Package, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface CatalogItem {
  id: string;
  item_code: string | null;
  item_name: string;
  description: string | null;
  unit: string | null;
  group_name: string | null;
  reference_price: number | null;
}

interface SupplierOption {
  id: string;
  company_name: string;
  category: string | null;
  tier: string | null;
  contact_person: string | null;
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
  const [form, setForm] = useState({ title: '', description: '', deadline: '', notes: '' });
  const [items, setItems] = useState<LineItem[]>([
    { item_name: '', description: '', quantity: '', unit: '', specifications: '', catalog_item_id: null },
  ]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());

  // Catalog items for search
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  // Suppliers for selection
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [supplierSearch, setSupplierSearch] = useState('');

  useEffect(() => {
    const fetchCatalog = async () => {
      const { data } = await supabase.from('price_list_items')
        .select('id, item_code, item_name, description, unit, group_name, reference_price')
        .order('item_name');
      setCatalogItems((data as CatalogItem[]) || []);
      setCatalogLoading(false);
    };
    const fetchSuppliers = async () => {
      const { data } = await supabase.from('suppliers')
        .select('id, company_name, category, tier, contact_person')
        .not('is_blacklisted', 'eq', true)
        .order('company_name');
      setSuppliers((data as SupplierOption[]) || []);
      setSuppliersLoading(false);
    };
    fetchCatalog();
    fetchSuppliers();
  }, []);

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

  const toggleSupplier = (id: string) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.filter(i => i.item_name.trim()).length === 0) {
      toast({ title: 'กรุณาเพิ่ม Line Item', description: 'ต้องมีอย่างน้อย 1 รายการ', variant: 'destructive' });
      return;
    }
    if (selectedSuppliers.size === 0) {
      toast({ title: 'กรุณาเลือก Supplier', description: 'ต้องเลือกผู้จัดจำหน่ายอย่างน้อย 1 ราย', variant: 'destructive' });
      return;
    }
    setSaving(true);

    const rfqNumber = `RFQ-${Date.now().toString(36).toUpperCase()}`;
    const { data: rfq, error } = await supabase.from('rfqs').insert({
      rfq_number: rfqNumber,
      title: form.title,
      description: form.description,
      deadline: form.deadline || null,
      notes: form.notes,
      status: 'draft',
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

    // Insert selected suppliers
    if (selectedSuppliers.size > 0) {
      await supabase.from('rfq_suppliers').insert(
        Array.from(selectedSuppliers).map(supplierId => ({
          rfq_id: rfq.id,
          supplier_id: supplierId,
        }))
      );
    }

    toast({ title: 'สร้าง RFQ สำเร็จ', description: `${rfqNumber} — ${validItems.length} รายการ, ${selectedSuppliers.size} ผู้จัดจำหน่าย` });
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

      <form onSubmit={handleSubmit} className="space-y-4">
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

        {/* Line Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4" /> รายการสินค้า (Line Items)
              </CardTitle>
              <CardDescription>เลือกจาก Catalog หรือพิมพ์เอง</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="w-4 h-4 mr-1" />เพิ่มรายการ</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">รายการ #{i + 1}</span>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(i)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>

                {/* Catalog Search */}
                <CatalogCombobox
                  catalogItems={catalogItems}
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
                filteredSuppliers.map(s => (
                  <label key={s.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent cursor-pointer">
                    <Checkbox
                      checked={selectedSuppliers.has(s.id)}
                      onCheckedChange={() => toggleSupplier(s.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{s.company_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[s.contact_person, s.category].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    {s.tier && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {s.tier === 'critical_tier_1' ? 'Critical' : 'Non-Critical'}
                      </Badge>
                    )}
                  </label>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link to="/rfq"><Button variant="outline">ยกเลิก</Button></Link>
          <Button type="submit" disabled={saving}>
            {saving ? 'กำลังสร้าง...' : 'สร้าง RFQ'}
          </Button>
        </div>
      </form>
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
