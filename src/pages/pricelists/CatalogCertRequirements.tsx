import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, Plus, Trash2, Package, Boxes, Loader2 } from 'lucide-react';
import {
  loadBrcCertOptions, loadCatalogRequirements,
  type CertOption, type CatalogCertRequirement,
} from '@/lib/catalogCerts';

interface Props {
  priceListId: string;
  items: { id: string; item_name: string; item_code: string | null }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function CatalogCertRequirements({ priceListId, items, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [certOptions, setCertOptions] = useState<CertOption[]>([]);
  const [catalog, setCatalog] = useState<CatalogCertRequirement[]>([]);
  const [byItem, setByItem] = useState<Record<string, CatalogCertRequirement[]>>({});
  const [itemId, setItemId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [opts, reqs] = await Promise.all([loadBrcCertOptions(), loadCatalogRequirements(priceListId)]);
    setCertOptions(opts);
    setCatalog(reqs.catalog);
    setByItem(reqs.byItem);
    setLoading(false);
  }, [priceListId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const addReq = async (scope: { catalog: boolean }, cert: CertOption) => {
    // Prevent duplicate keyword sets in the same scope.
    const key = cert.keywords.slice().sort().join('|');
    const existing = scope.catalog ? catalog : (byItem[itemId] || []);
    if (existing.some(r => r.match_keywords.slice().sort().join('|') === key)) {
      toast({ title: 'มีใบรับรองนี้อยู่แล้ว', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('catalog_cert_requirements' as any).insert({
      price_list_id: scope.catalog ? priceListId : null,
      price_list_item_id: scope.catalog ? null : itemId,
      label: cert.label,
      match_keywords: cert.keywords,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) { toast({ title: 'เพิ่มไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'เพิ่มใบรับรองบังคับแล้ว', description: cert.label });
    load();
  };

  const removeReq = async (id: string) => {
    await supabase.from('catalog_cert_requirements' as any).delete().eq('id', id);
    toast({ title: 'ลบแล้ว' });
    load();
  };

  const itemReqs = itemId ? (byItem[itemId] || []) : [];
  const itemHasOverride = itemReqs.length > 0;

  const Picker = ({ onPick, disabledKeys }: { onPick: (c: CertOption) => void; disabledKeys: Set<string> }) => (
    <Select value="" onValueChange={(v) => { const c = certOptions.find(o => o.label === v); if (c) onPick(c); }}>
      <SelectTrigger className="h-9"><SelectValue placeholder="+ เพิ่มใบรับรองที่ต้องมี" /></SelectTrigger>
      <SelectContent>
        {certOptions.map(o => {
          const key = o.keywords.slice().sort().join('|');
          return (
            <SelectItem key={o.label} value={o.label} disabled={disabledKeys.has(key)} className="text-xs">
              {o.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );

  const ReqChips = ({ reqs }: { reqs: CatalogCertRequirement[] }) => (
    <div className="flex flex-wrap gap-1.5">
      {reqs.length === 0 ? (
        <span className="text-xs text-muted-foreground">— ยังไม่กำหนด —</span>
      ) : reqs.map(r => (
        <Badge key={r.id} variant="outline" className="gap-1 border-red-300 bg-red-50 text-red-700">
          <ShieldCheck className="w-3 h-3" />{r.label}
          <button onClick={() => removeReq(r.id)} className="ml-0.5 hover:text-red-900"><Trash2 className="w-3 h-3" /></button>
        </Badge>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-teal-600" />ใบรับรองบังคับเข้าร่วม</DialogTitle>
          <DialogDescription>
            supplier ต้องมีใบรับรองที่กำหนด (ไม่หมดอายุ) จึงจะถูกเชิญเข้าเสนอราคา RFQ ที่มีสินค้าจาก catalog นี้
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground text-sm">กำลังโหลด...</div>
        ) : (
          <div className="space-y-5">
            {/* Catalog-level */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-semibold">
                <Boxes className="w-4 h-4 text-primary" />ทั้ง Catalog (สินค้าทุกตัวในเล่มนี้)
              </Label>
              <ReqChips reqs={catalog} />
              <Picker onPick={c => addReq({ catalog: true }, c)} disabledKeys={new Set(catalog.map(r => r.match_keywords.slice().sort().join('|')))} />
            </div>

            {/* Item-level override */}
            <div className="space-y-2 border-t pt-4">
              <Label className="flex items-center gap-1.5 text-sm font-semibold">
                <Package className="w-4 h-4 text-primary" />เจาะจงรายสินค้า (Override)
              </Label>
              <p className="text-[11px] text-muted-foreground">
                ถ้าสินค้าใดกำหนดที่นี่ จะ<b>ใช้แทน</b>เงื่อนไขระดับ catalog สำหรับสินค้านั้น
              </p>
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="เลือกสินค้า..." /></SelectTrigger>
                <SelectContent>
                  {items.map(it => (
                    <SelectItem key={it.id} value={it.id} className="text-xs">
                      {it.item_code ? `[${it.item_code}] ` : ''}{it.item_name}
                      {byItem[it.id]?.length ? '  •' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {itemId && (
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    {itemHasOverride ? 'สินค้านี้ใช้เงื่อนไขเฉพาะด้านล่าง' : 'สินค้านี้ยังสืบทอดเงื่อนไขจาก catalog — เพิ่มด้านล่างเพื่อ override'}
                  </p>
                  <ReqChips reqs={itemReqs} />
                  <Picker onPick={c => addReq({ catalog: false }, c)} disabledKeys={new Set(itemReqs.map(r => r.match_keywords.slice().sort().join('|')))} />
                </div>
              )}
            </div>

            {busy && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />กำลังบันทึก...</p>}

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>ปิด</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
