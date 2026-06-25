import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { computeTechnicalScore, type TechCriterion } from '@/lib/technicalScore';
import { Plus, FileText, Building2, XCircle, Upload, Sparkles, Loader2, Trash2, Eye, ExternalLink, ChevronDown, ChevronUp, ListChecks } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

function safeStorageName(fileName: string): string {
  const ext = fileName.split('.').pop() || 'bin';
  return `${crypto.randomUUID()}.${ext}`;
}

interface Props {
  rfqId: string;
  rfqItems: any[];
}

export default function RFQQuotations({ rfqId, rfqItems }: Props) {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [declinedRows, setDeclinedRows] = useState<{ supplier_id: string; declined_at: string; declined_reason: string | null; company_name: string }[]>([]);
  const { user, hasRole, profile } = useAuth();
  const isSupplier   = hasRole('supplier');
  const mySupplierId = profile?.supplier_id ?? null;
  const { toast } = useToast();

  const [form, setForm] = useState({
    supplier_id: '',
    currency: 'USD',
    payment_term: '',
    delivery_terms: '',
    validity_days: '30',
    lead_time_days: '',
    warranty: '',
    discount: '0',
    vat: '0',
    spec_compliance_score: '',
    remark: '',
    notes: '',
  });
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});

  // Technical checklist (per-RFQ criteria + this quotation's responses)
  const [techCriteria, setTechCriteria] = useState<TechCriterion[]>([]);
  const [techResp, setTechResp] = useState<Record<string, { value: string; met: boolean }>>({});
  const techScore = computeTechnicalScore(
    techCriteria,
    Object.fromEntries(techCriteria.map(c => [c.id, !!techResp[c.id]?.met])),
  );

  // AI scan state
  const [scanning, setScanning] = useState(false);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanConfidence, setScanConfidence] = useState<string | null>(null);
  const [scanSupplierName, setScanSupplierName] = useState<string | null>(null);
  const [scanRejected, setScanRejected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expand/view quotation state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quotationItems, setQuotationItems] = useState<Record<string, any[]>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  const toggleExpand = async (qId: string) => {
    if (expandedId === qId) { setExpandedId(null); return; }
    setExpandedId(qId);
    if (!quotationItems[qId]) {
      const { data } = await supabase.from('quotation_items').select('*').eq('quotation_id', qId).order('created_at');
      if (data) setQuotationItems(prev => ({ ...prev, [qId]: data }));
    }
  };

  const handleDelete = async (qId: string, supplierId: string) => {
    setDeleting(qId);
    await supabase.from('quotation_items').delete().eq('quotation_id', qId);
    await supabase.from('quotations').delete().eq('id', qId);
    await supabase.from('rfq_suppliers').update({ responded: false }).eq('rfq_id', rfqId).eq('supplier_id', supplierId);
    toast({ title: 'ลบใบเสนอราคาแล้ว' });
    setDeleting(null);
    setExpandedId(null);
    fetchQuotations();
  };

  // Decline-to-quote state
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);
  const [myInviteRow, setMyInviteRow] = useState<{ id: string; declined_at: string | null; declined_reason: string | null; responded: boolean } | null>(null);

  const fetchQuotations = async () => {
    const { data } = await supabase
      .from('quotations')
      .select('*, suppliers(company_name)')
      .eq('rfq_id', rfqId)
      .order('created_at', { ascending: false });
    if (data) setQuotations(data);
    setLoading(false);
  };

  const fetchInvitedSuppliers = async () => {
    const { data } = await supabase
      .from('rfq_suppliers')
      .select('id, supplier_id, responded, declined_at, declined_reason, suppliers(id, company_name)')
      .eq('rfq_id', rfqId);
    if (data) {
      setSuppliers(data.map((r: any) => r.suppliers).filter(Boolean));
      setDeclinedRows(
        data
          .filter((r: any) => r.declined_at)
          .map((r: any) => ({
            supplier_id: r.supplier_id,
            declined_at: r.declined_at,
            declined_reason: r.declined_reason,
            company_name: r.suppliers?.company_name || 'Unknown',
          }))
      );
      if (mySupplierId) {
        const mine = data.find((r: any) => r.supplier_id === mySupplierId);
        setMyInviteRow(mine ? {
          id: mine.id,
          declined_at: mine.declined_at,
          declined_reason: mine.declined_reason,
          responded: mine.responded,
        } : null);
      }
    }
  };

  useEffect(() => {
    fetchQuotations();
    fetchInvitedSuppliers();
    supabase.from('rfq_technical_criteria').select('*').eq('rfq_id', rfqId).order('sort_order')
      .then(({ data }) => setTechCriteria((data as TechCriterion[]) || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqId, mySupplierId]);

  const handleDecline = async () => {
    if (!mySupplierId) return;
    if (!declineReason.trim()) {
      toast({ title: 'กรุณาใส่เหตุผล', variant: 'destructive' });
      return;
    }
    setDeclining(true);
    const { data, error } = await supabase
      .from('rfq_suppliers')
      .update({
        declined_at: new Date().toISOString(),
        declined_reason: declineReason.trim(),
        responded: true,
      })
      .eq('rfq_id', rfqId)
      .eq('supplier_id', mySupplierId)
      .select();
    setDeclining(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (!data || data.length === 0) {
      toast({
        title: 'บันทึกไม่สำเร็จ',
        description: 'อาจไม่มีสิทธิ์ — ตรวจสอบว่า account นี้ผูกกับ supplier และถูก invite ใน RFQ นี้',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'แจ้งจัดซื้อแล้ว', description: 'การถอนตัวพร้อมเหตุผลถูกบันทึก' });
    setDeclineOpen(false);
    setDeclineReason('');
    fetchInvitedSuppliers();
  };

  const handleUndoDecline = async () => {
    if (!mySupplierId) return;
    const { error } = await supabase
      .from('rfq_suppliers')
      .update({ declined_at: null, declined_reason: null, responded: false })
      .eq('rfq_id', rfqId)
      .eq('supplier_id', mySupplierId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'ยกเลิกการถอนตัวแล้ว' });
    fetchInvitedSuppliers();
  };

  // Auto-fill supplier when login as supplier role
  useEffect(() => {
    if (isSupplier && mySupplierId && !form.supplier_id) {
      setForm(p => ({ ...p, supplier_id: mySupplierId }));
    }
  }, [isSupplier, mySupplierId, form.supplier_id]);

  // AI Scan handler
  const handleScanFile = async (file: File) => {
    setScanFile(file);
    setScanning(true);
    setScanConfidence(null);
    setScanSupplierName(null);
    setScanRejected(false);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      const { data, error } = await supabase.functions.invoke('extract-quotation', {
        body: {
          file_base64: base64,
          mime_type: file.type,
          rfq_items: rfqItems.map(i => ({ item_name: i.item_name, quantity: i.quantity, unit: i.unit })),
        },
      });
      if (error) throw error;

      const extractedName = data.supplier_name || '';
      setScanSupplierName(extractedName);

      // Match supplier name against invited list (fuzzy)
      const normalize = (s: string) =>
        s.toLowerCase()
          .replace(/\s+/g, '')
          .replace(/บริษัท|จำกัด|มหาชน|\(มหาชน\)|co\.,?\s*ltd\.?|inc\.?|corp\.?|company|limited|llc|plc/gi, '')
          .replace(/[().,\-]/g, '')
          .trim();
      const bNorm = normalize(extractedName);
      const matched = bNorm ? suppliers.find(s => {
        const aNorm = normalize(s.company_name || '');
        if (!aNorm) return false;
        return aNorm === bNorm || aNorm.includes(bNorm) || bNorm.includes(aNorm);
      }) : null;

      if (!matched && !isSupplier) {
        setScanRejected(true);
        setScanConfidence(data.confidence || 'medium');
        toast({
          title: 'Supplier ไม่ตรงกับรายชื่อที่เชิญ',
          description: `AI อ่านได้: "${extractedName}" — ไม่พบใน Supplier ที่ Invite ไว้`,
          variant: 'destructive',
        });
        return;
      }

      // Auto-select supplier
      if (matched && !isSupplier) {
        setForm(prev => ({ ...prev, supplier_id: matched.id }));
      }

      setForm(prev => ({
        ...prev,
        currency: data.currency || prev.currency,
        lead_time_days: data.lead_time_days?.toString() || prev.lead_time_days,
        discount: data.discount?.toString() || prev.discount,
        vat: data.vat?.toString() || prev.vat,
        payment_term: data.payment_term || prev.payment_term,
        delivery_terms: data.delivery_terms || prev.delivery_terms,
        warranty: data.warranty || prev.warranty,
        validity_days: data.validity_days?.toString() || prev.validity_days,
        remark: [data.remark, data.quotation_no ? `เลขที่: ${data.quotation_no}` : null]
          .filter(Boolean).join(' · ') || prev.remark,
      }));
      if (Array.isArray(data.items) && data.items.length > 0) {
        const newPrices: Record<string, string> = {};
        for (const aiItem of data.items) {
          const idx = aiItem.rfq_item_index;
          if (idx != null && idx >= 0 && idx < rfqItems.length && aiItem.unit_price) {
            newPrices[rfqItems[idx].id] = aiItem.unit_price.toString();
          }
        }
        if (Object.keys(newPrices).length > 0) {
          setItemPrices(prev => ({ ...prev, ...newPrices }));
        }
      }
      setScanConfidence(data.confidence || 'medium');
      toast({
        title: 'AI อ่านใบเสนอราคาสำเร็จ',
        description: `Supplier: ${matched?.company_name || extractedName} · ความมั่นใจ: ${data.confidence || 'medium'}`,
      });
    } catch (err: any) {
      toast({ title: 'AI สแกนไม่สำเร็จ', description: err.message || 'ลองใหม่อีกครั้ง', variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.supplier_id) return;
    setSaving(true);

    const subtotal = rfqItems.reduce((sum, item) => {
      const unitPrice = parseFloat(itemPrices[item.id]) || 0;
      return sum + (item.quantity || 1) * unitPrice;
    }, 0);
    const discount = parseFloat(form.discount) || 0;
    const vat = parseFloat(form.vat) || 0;
    const totalAmount = Math.max(0, subtotal - discount + vat);

    // Upload quotation file to storage
    let attachmentUrl: string | null = null;
    if (scanFile) {
      const safeName = safeStorageName(scanFile.name);
      const storagePath = `${rfqId}/${safeName}`;
      const { error: upErr } = await supabase.storage.from('quotation-files').upload(storagePath, scanFile);
      if (upErr) {
        toast({ title: 'อัปโหลดไฟล์ไม่สำเร็จ', description: upErr.message, variant: 'destructive' });
      } else {
        const { data: urlData } = supabase.storage.from('quotation-files').getPublicUrl(storagePath);
        attachmentUrl = urlData?.publicUrl || null;
      }
    }

    const { data: quotation, error } = await supabase.from('quotations').insert({
      rfq_id: rfqId,
      supplier_id: form.supplier_id,
      price: subtotal,
      discount,
      vat,
      total_amount: totalAmount,
      currency: form.currency,
      payment_terms: form.payment_term,
      payment_term: form.payment_term,
      delivery_terms: form.delivery_terms,
      validity_days: parseInt(form.validity_days) || 30,
      lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : null,
      warranty: form.warranty || null,
      spec_compliance_score: techCriteria.length > 0
        ? techScore
        : (form.spec_compliance_score ? parseFloat(form.spec_compliance_score) : null),
      remark: form.remark || null,
      notes: form.notes || null,
      attachment_url: attachmentUrl,
      evaluation_status: 'submitted',
      submitted_at: new Date().toISOString(),
    }).select().single();

    if (error || !quotation) {
      toast({ title: 'Error', description: error?.message || 'Failed', variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Insert quotation items
    const qItems = rfqItems.filter(i => itemPrices[i.id]).map(item => ({
      quotation_id: quotation.id,
      rfq_item_id: item.id,
      item_name: item.item_name,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: parseFloat(itemPrices[item.id]) || 0,
      total_price: (item.quantity || 1) * (parseFloat(itemPrices[item.id]) || 0),
    }));

    if (qItems.length > 0) {
      await supabase.from('quotation_items').insert(qItems);
    }

    // Persist technical checklist responses
    if (techCriteria.length > 0) {
      await supabase.from('quotation_technical_responses').insert(
        techCriteria.map(c => ({
          quotation_id: quotation.id,
          criterion_id: c.id,
          value: techResp[c.id]?.value?.trim() || null,
          is_met: !!techResp[c.id]?.met,
        }))
      );
    }

    // Mark supplier as responded
    await supabase.from('rfq_suppliers').update({ responded: true }).eq('rfq_id', rfqId).eq('supplier_id', form.supplier_id);

    // Auto-change to evaluation when all invited suppliers have responded or declined
    const { data: allInvited } = await supabase.from('rfq_suppliers').select('responded, declined_at').eq('rfq_id', rfqId);
    if (allInvited && allInvited.length > 0) {
      const allDone = allInvited.every((r: any) => r.responded || r.declined_at);
      if (allDone) {
        const { data: rfqRow } = await supabase.from('rfqs').select('status').eq('id', rfqId).single();
        if (rfqRow?.status === 'published') {
          await supabase.from('rfqs').update({ status: 'evaluation' as any, updated_at: new Date().toISOString() }).eq('id', rfqId);
          toast({ title: 'Supplier ตอบครบแล้ว', description: 'สถานะเปลี่ยนเป็น Evaluation' });
        }
      }
    }

    toast({ title: 'Quotation submitted' });
    setOpen(false);
    setForm({ supplier_id: '', currency: 'USD', payment_term: '', delivery_terms: '', validity_days: '30', lead_time_days: '', warranty: '', discount: '0', vat: '0', spec_compliance_score: '', remark: '', notes: '' });
    setItemPrices({});
    setTechResp({});
    setScanFile(null);
    setScanConfidence(null);
    setScanSupplierName(null);
    setScanRejected(false);
    setSaving(false);
    fetchQuotations();
  };

  const canSubmit = hasRole('admin') || hasRole('procurement_officer') || hasRole('supplier');

  const declined = !!myInviteRow?.declined_at;

  return (
    <Card>
      {isSupplier && declined && (
        <div className="mx-6 mt-6 p-3 rounded-md border border-red-200 bg-red-50 text-sm">
          <div className="font-semibold text-red-700 flex items-center gap-1">
            <XCircle className="h-4 w-4" />
            คุณถอนตัวจาก RFQ นี้แล้ว
          </div>
          {myInviteRow?.declined_reason && (
            <div className="text-xs text-red-700 mt-1">
              เหตุผล: {myInviteRow.declined_reason}
            </div>
          )}
          <Button size="sm" variant="outline" className="mt-2" onClick={handleUndoDecline}>
            ยกเลิกการถอนตัว
          </Button>
        </div>
      )}
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Quotations ({quotations.length})</CardTitle>
        <div className="flex items-center gap-2">
          {isSupplier && mySupplierId && !declined && myInviteRow && (
            <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                  <XCircle className="w-4 h-4 mr-1" />ถอนตัว
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>ถอนตัว ไม่เสนอราคา</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    ระบุเหตุผลที่ไม่สามารถเสนอราคาในครั้งนี้ — ข้อความจะถูกส่งให้ทีมจัดซื้อ
                  </p>
                  <Textarea
                    rows={4}
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    placeholder="เช่น สินค้าขาดสต็อก, ไม่สามารถส่งภายใน lead time, ราคาวัตถุดิบไม่นิ่ง..."
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setDeclineOpen(false)}>ยกเลิก</Button>
                    <Button onClick={handleDecline} disabled={declining || !declineReason.trim()}
                      className="bg-red-600 hover:bg-red-700">
                      {declining ? 'กำลังบันทึก...' : 'ยืนยันถอนตัว'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {canSubmit && !declined && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />Submit Quotation</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Submit Quotation</DialogTitle></DialogHeader>
              <div className="space-y-4">

                {/* AI Scan Upload */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    อัปโหลดใบเสนอราคา (AI อ่านอัตโนมัติ)
                  </Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleScanFile(f); }}
                  />
                  {!scanFile ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={scanning}
                      className="w-full border-2 border-dashed rounded-lg p-4 flex flex-col items-center gap-2 text-sm text-muted-foreground hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer"
                    >
                      <Upload className="w-6 h-6" />
                      <span>คลิกเพื่ออัปโหลด PDF หรือรูปภาพ</span>
                      <span className="text-xs">AI จะอ่านราคา, เงื่อนไข และกรอกข้อมูลให้อัตโนมัติ</span>
                    </button>
                  ) : (
                    <div className={`border rounded-lg p-3 ${scanRejected ? 'bg-red-50 border-red-200' : 'bg-accent/30'}`}>
                      <div className="flex items-center gap-2">
                        <FileText className={`w-5 h-5 shrink-0 ${scanRejected ? 'text-red-500' : 'text-primary'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{scanFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(scanFile.size / 1024).toFixed(0)} KB
                            {scanConfidence && !scanRejected && (
                              <Badge variant={scanConfidence === 'high' ? 'default' : scanConfidence === 'medium' ? 'secondary' : 'destructive'}
                                className="ml-2 text-[10px] py-0">
                                ความมั่นใจ: {scanConfidence}
                              </Badge>
                            )}
                          </p>
                        </div>
                        {scanning ? (
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        ) : (
                          <Button type="button" variant="ghost" size="sm" className="text-xs"
                            onClick={() => { setScanFile(null); setScanConfidence(null); setScanSupplierName(null); setScanRejected(false); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                            เปลี่ยนไฟล์
                          </Button>
                        )}
                      </div>
                      {scanning && (
                        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> AI กำลังอ่านใบเสนอราคา...
                        </p>
                      )}
                      {scanRejected && scanSupplierName && (
                        <div className="mt-2 p-2 rounded bg-red-100 border border-red-200">
                          <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" />
                            Supplier ไม่ตรงกับรายชื่อที่เชิญ
                          </p>
                          <p className="text-xs text-red-600 mt-1">
                            AI อ่านได้: <span className="font-medium">"{scanSupplierName}"</span>
                          </p>
                          <p className="text-xs text-red-600">
                            Supplier ที่เชิญ: {suppliers.map(s => s.company_name).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Supplier *</Label>
                  {isSupplier && mySupplierId ? (
                    <div className="flex items-center gap-2 p-2.5 border rounded-md bg-muted/40">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">
                        {suppliers.find(s => s.id === mySupplierId)?.company_name
                          || profile?.full_name
                          || 'My company'}
                      </span>
                    </div>
                  ) : (
                    <Select value={form.supplier_id} onValueChange={v => setForm(p => ({ ...p, supplier_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {rfqItems.length > 0 && (
                  <div className="space-y-2">
                    <Label>Item Pricing</Label>
                    {rfqItems.map(item => (
                      <div key={item.id} className="flex items-center gap-2 p-2 border rounded">
                        <div className="flex-1 text-sm">
                          <span className="font-medium">{item.item_name}</span>
                          <span className="text-muted-foreground ml-1">({item.quantity || '—'} {item.unit || ''})</span>
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Unit price"
                          className="w-28"
                          value={itemPrices[item.id] || ''}
                          onChange={e => setItemPrices(p => ({ ...p, [item.id]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Currency</Label>
                    <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="THB">THB</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="ETB">ETB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Lead Time (days)</Label>
                    <Input type="number" value={form.lead_time_days} onChange={e => setForm(p => ({ ...p, lead_time_days: e.target.value }))} placeholder="14" />
                  </div>
                </div>
                <div className="grid gap-3 grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Discount</Label>
                    <Input type="number" step="0.01" value={form.discount} onChange={e => setForm(p => ({ ...p, discount: e.target.value }))} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">VAT</Label>
                    <Input type="number" step="0.01" value={form.vat} onChange={e => setForm(p => ({ ...p, vat: e.target.value }))} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Validity (days)</Label>
                    <Input value={form.validity_days} onChange={e => setForm(p => ({ ...p, validity_days: e.target.value }))} />
                  </div>
                </div>
                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Payment Term</Label>
                    <Input value={form.payment_term} onChange={e => setForm(p => ({ ...p, payment_term: e.target.value }))} placeholder="Net 30" />
                  </div>
                  {techCriteria.length === 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Spec Compliance % (0–100)</Label>
                      <Input type="number" min="0" max="100" value={form.spec_compliance_score} onChange={e => setForm(p => ({ ...p, spec_compliance_score: e.target.value }))} placeholder="85" />
                    </div>
                  )}
                </div>

                {techCriteria.length > 0 && (
                  <div className="space-y-2 rounded-lg border p-3 bg-purple-50/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5 text-purple-600" />เกณฑ์เทคนิค (Spec) — กรอกและติ๊กข้อที่ตรงตามข้อกำหนด</Label>
                      <Badge variant="outline" className="text-xs">Technical {techScore ?? 0}%</Badge>
                    </div>
                    {techCriteria.map(c => {
                      const r = techResp[c.id] || { value: '', met: false };
                      return (
                        <div key={c.id} className="grid grid-cols-[1fr_auto] gap-2 items-start border-b last:border-b-0 pb-2 last:pb-0">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{c.label}</span>
                              <Badge variant="secondary" className="text-[10px]">น้ำหนัก {c.weight}</Badge>
                            </div>
                            {c.description && <p className="text-[11px] text-muted-foreground">{c.description}</p>}
                            <Input className="h-8 text-xs" placeholder="ค่า spec ของคุณ" value={r.value}
                              onChange={e => setTechResp(p => ({ ...p, [c.id]: { ...r, value: e.target.value } }))} />
                          </div>
                          <label className="flex flex-col items-center gap-1 pt-1 cursor-pointer">
                            <Checkbox checked={r.met} onCheckedChange={v => setTechResp(p => ({ ...p, [c.id]: { ...r, met: !!v } }))} />
                            <span className="text-[10px] text-muted-foreground">ตรงตาม</span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Delivery Terms</Label>
                    <Input value={form.delivery_terms} onChange={e => setForm(p => ({ ...p, delivery_terms: e.target.value }))} placeholder="FOB, CIF..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Warranty</Label>
                    <Input value={form.warranty} onChange={e => setForm(p => ({ ...p, warranty: e.target.value }))} placeholder="12 months" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Remark</Label>
                  <Textarea value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} rows={2} placeholder="Any additional remarks..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Internal Notes</Label>
                  <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                </div>
                <Button onClick={handleSubmit} disabled={saving || scanning || scanRejected || !form.supplier_id} className="w-full">
                  {saving ? 'Submitting...' : 'Submit Quotation'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : quotations.length === 0 && declinedRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No quotations submitted yet</p>
        ) : (
          <div className="space-y-3">
            {quotations.map(q => {
              const isExpanded = expandedId === q.id;
              // Headline amount = ยอดก่อน VAT (net of discount, excluding VAT).
              const vatAmt = parseFloat(q.vat) || 0;
              const preVat = q.total_amount != null
                ? (q.total_amount as number) - vatAmt
                : (q.price ?? 0) - (parseFloat(q.discount) || 0);
              const qItems = quotationItems[q.id] || [];
              return (
              <div key={q.id} className="border rounded-lg overflow-hidden">
                {/* Header row — clickable */}
                <button
                  type="button"
                  onClick={() => toggleExpand(q.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{q.suppliers?.company_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {q.currency} {preVat.toLocaleString()} · {q.payment_term || q.payment_terms || '—'} · v{q.version}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-bold text-lg">{q.currency} {preVat.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">ก่อน VAT</p>
                      <p className="text-xs text-muted-foreground">{q.submitted_at ? new Date(q.submitted_at).toLocaleDateString() : '—'}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {q.attachment_url && (
                        <a href={q.attachment_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <Eye className="w-3.5 h-3.5" />ดูไฟล์ต้นฉบับ
                          </Button>
                        </a>
                      )}
                      {canSubmit && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
                              <Trash2 className="w-3.5 h-3.5" />ลบ
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>ลบใบเสนอราคา?</AlertDialogTitle>
                              <AlertDialogDescription>
                                ลบใบเสนอราคาจาก {q.suppliers?.company_name || 'Unknown'} ({q.currency} {q.total_amount?.toLocaleString()}) — ไม่สามารถกู้คืนได้
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(q.id, q.supplier_id)}
                                className="bg-red-600 hover:bg-red-700"
                                disabled={deleting === q.id}
                              >
                                {deleting === q.id ? 'กำลังลบ...' : 'ยืนยันลบ'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>

                    {/* Line items table */}
                    {qItems.length > 0 && (() => {
                      const itemsSubtotal = qItems.reduce((s: number, qi: any) => s + (parseFloat(qi.total_price) || 0), 0);
                      return (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">รายการราคา ({qItems.length})</p>
                        <div className="border rounded text-xs overflow-hidden">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-muted/50 text-muted-foreground">
                                <th className="text-left px-3 py-1.5 font-medium">รายการ</th>
                                <th className="text-right px-3 py-1.5 font-medium w-20">จำนวน</th>
                                <th className="text-right px-3 py-1.5 font-medium w-24">ราคา/หน่วย</th>
                                <th className="text-right px-3 py-1.5 font-medium w-28">รวม</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {qItems.map((qi: any) => (
                                <tr key={qi.id}>
                                  <td className="px-3 py-1.5">{qi.item_name}</td>
                                  <td className="px-3 py-1.5 text-right">{qi.quantity?.toLocaleString() || '—'} {qi.unit || ''}</td>
                                  <td className="px-3 py-1.5 text-right">{qi.unit_price?.toLocaleString() || '—'}</td>
                                  <td className="px-3 py-1.5 text-right font-medium">{qi.total_price?.toLocaleString() || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {/* Pricing summary */}
                          <div className="border-t bg-muted/30 px-3 py-2 space-y-0.5">
                            <div className="flex justify-between"><span className="text-muted-foreground">รวมก่อนส่วนลด</span><span className="font-medium">{q.currency} {itemsSubtotal.toLocaleString()}</span></div>
                            {parseFloat(q.discount) > 0 && (
                              <div className="flex justify-between"><span className="text-muted-foreground">ส่วนลด</span><span className="text-red-600">−{parseFloat(q.discount).toLocaleString()}</span></div>
                            )}
                            <div className="flex justify-between"><span className="text-muted-foreground">ราคาหลังส่วนลด</span><span className="font-medium">{q.currency} {(itemsSubtotal - (parseFloat(q.discount) || 0)).toLocaleString()}</span></div>
                            {parseFloat(q.vat) > 0 && (
                              <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span>+{parseFloat(q.vat).toLocaleString()}</span></div>
                            )}
                            <div className="flex justify-between border-t pt-1 mt-1 font-bold"><span>ราคารวมสุทธิ</span><span>{q.currency} {q.total_amount?.toLocaleString()}</span></div>
                          </div>
                        </div>
                      </div>
                      );
                    })()}

                    {/* Terms & conditions */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Lead Time:</span> <span className="font-medium">{q.lead_time_days ? `${q.lead_time_days} วัน` : '—'}</span></div>
                      <div><span className="text-muted-foreground">Validity:</span> <span className="font-medium">{q.validity_days ? `${q.validity_days} วัน` : '—'}</span></div>
                      <div><span className="text-muted-foreground">Payment:</span> <span className="font-medium">{q.payment_term || q.payment_terms || '—'}</span></div>
                      <div><span className="text-muted-foreground">Delivery:</span> <span className="font-medium">{q.delivery_terms || '—'}</span></div>
                      {q.warranty && <div><span className="text-muted-foreground">Warranty:</span> <span className="font-medium">{q.warranty}</span></div>}
                      {q.spec_compliance_score != null && <div><span className="text-muted-foreground">Spec:</span> <span className="font-medium">{q.spec_compliance_score}%</span></div>}
                    </div>
                    {q.remark && (
                      <div className="text-xs"><span className="text-muted-foreground">Remark:</span> {q.remark}</div>
                    )}
                  </div>
                )}
              </div>
              );
            })}

            {declinedRows.length > 0 && (
              <>
                <div className="pt-2 text-xs font-medium text-muted-foreground">
                  ถอนตัว ไม่เสนอราคา ({declinedRows.length})
                </div>
                {declinedRows.map(d => (
                  <div key={d.supplier_id} className="p-4 border border-red-200 rounded-lg bg-red-50/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                          <XCircle className="w-4 h-4 text-red-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{d.company_name}</p>
                          <p className="text-xs text-red-700 mt-0.5">
                            <span className="font-medium">เหตุผล:</span> {d.declined_reason || '— ไม่ระบุ —'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                          ถอนตัว
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(d.declined_at).toLocaleDateString('th-TH')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
