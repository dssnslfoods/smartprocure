import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Upload, Sparkles, Loader2, FileText, CheckCircle, AlertTriangle, X, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

interface AIExtractResult {
  company_name: string | null;
  tax_id: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  contact_person: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

const REQUIRED_FIELDS: { key: keyof typeof EMPTY_FORM; label: string }[] = [
  { key: 'company_name', label: 'ชื่อบริษัท' },
  { key: 'phone', label: 'เบอร์โทรศัพท์' },
];

const EMPTY_FORM = {
  company_name: '',
  tax_id: '',
  address: '',
  city: '',
  country: '',
  phone: '',
  email: '',
  website: '',
  contact_person: '',
  tier: '',
  notes: '',
};

export default function SupplierForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedFile, setScannedFile] = useState<{ name: string; type: string } | null>(null);
  const [aiResult, setAiResult] = useState<AIExtractResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const missingFields = REQUIRED_FIELDS.filter((f) => !form[f.key]?.trim());
  const canSave = missingFields.length === 0;

  const handleScanFile = useCallback(async (file: File) => {
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'ไฟล์ไม่รองรับ', description: 'กรุณาอัปโหลดไฟล์ PDF หรือรูปภาพ (PNG, JPG)', variant: 'destructive' });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'ไฟล์ใหญ่เกินไป', description: 'ขนาดไฟล์สูงสุด 20 MB', variant: 'destructive' });
      return;
    }

    setScanning(true);
    setScannedFile({ name: file.name, type: file.type });
    setAiResult(null);

    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('extract-supplier', {
        body: { file_base64: base64, mime_type: file.type },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result = data as AIExtractResult;
      setAiResult(result);

      setForm({
        company_name: result.company_name || '',
        tax_id: result.tax_id || '',
        address: result.address || '',
        city: result.city || '',
        country: result.country || '',
        phone: result.phone || '',
        email: result.email || '',
        website: result.website || '',
        contact_person: result.contact_person || '',
        tier: '',
        notes: '',
      });

      toast({
        title: 'สแกนเอกสารสำเร็จ',
        description: `ความมั่นใจ: ${result.confidence === 'high' ? 'สูง' : result.confidence === 'medium' ? 'ปานกลาง' : 'ต่ำ'} — กรุณาตรวจสอบข้อมูลก่อนบันทึก`,
      });
    } catch (err: any) {
      toast({ title: 'สแกนไม่สำเร็จ', description: err.message || 'ไม่สามารถอ่านข้อมูลจากเอกสารได้', variant: 'destructive' });
      setScannedFile(null);
    } finally {
      setScanning(false);
    }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleScanFile(file);
  }, [handleScanFile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleScanFile(file);
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      toast({
        title: 'ข้อมูลไม่ครบ',
        description: `กรุณากรอก: ${missingFields.map((f) => f.label).join(', ')}`,
        variant: 'destructive',
      });
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmSave = async () => {
    setShowConfirm(false);
    setLoading(true);
    const { company_name, tax_id, address, city, country, phone, email, website, contact_person, tier, notes } = form;
    const { error } = await supabase.from('suppliers').insert({
      company_name, tax_id, address, city, country, phone, email, website, contact_person, tier: tier || null,
      notes: notes || null,
      status: 'draft' as any,
      created_by: user?.id,
    } as any);
    setLoading(false);
    if (error) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'บันทึกสำเร็จ', description: `เพิ่ม ${company_name} เรียบร้อย` });
      navigate('/suppliers');
    }
  };

  const confidenceBadge = aiResult && (
    <Badge variant={aiResult.confidence === 'high' ? 'default' : aiResult.confidence === 'medium' ? 'secondary' : 'destructive'}
      className={aiResult.confidence === 'high' ? 'bg-green-100 text-green-800' : aiResult.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' : ''}>
      {aiResult.confidence === 'high' ? 'ความมั่นใจสูง' : aiResult.confidence === 'medium' ? 'ความมั่นใจปานกลาง' : 'ความมั่นใจต่ำ'}
    </Badge>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link to="/suppliers">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">เพิ่มผู้จัดจำหน่าย</h1>
          <p className="text-sm text-muted-foreground">ลงทะเบียนผู้จัดจำหน่ายใหม่ — กรอกเอง หรือ สแกนจากเอกสาร</p>
        </div>
      </div>

      {/* AI Scan Section */}
      <Card className="border-dashed border-2 border-orange-200 bg-orange-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-orange-500" />
            <CardTitle className="text-base">AI สแกนเอกสาร</CardTitle>
          </div>
          <CardDescription>อัปโหลดใบเสนอราคา, ใบแจ้งหนี้, หรือเอกสารทางการค้า — AI จะดึงข้อมูลผู้จัดจำหน่ายให้อัตโนมัติ</CardDescription>
        </CardHeader>
        <CardContent>
          {scanning ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              <p className="text-sm text-muted-foreground">กำลังสแกนเอกสาร...</p>
            </div>
          ) : scannedFile && aiResult ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-medium">{scannedFile.name}</span>
                  {confidenceBadge}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setScannedFile(null); setAiResult(null); setForm({ ...EMPTY_FORM }); }}>
                  <X className="w-4 h-4 mr-1" /> ล้าง
                </Button>
              </div>
              {aiResult.notes && (
                <Alert><AlertDescription className="text-xs">{aiResult.notes}</AlertDescription></Alert>
              )}
              {aiResult.confidence === 'low' && (
                <Alert variant="destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>AI อ่านเอกสารได้ไม่ชัด กรุณาตรวจสอบข้อมูลอย่างละเอียด</AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-orange-500 bg-orange-100/50' : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50/50'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-600">ลากไฟล์มาวางที่นี่ หรือ คลิกเพื่อเลือกไฟล์</p>
              <p className="text-xs text-gray-400 mt-1">รองรับ PDF, PNG, JPG (สูงสุด 20 MB)</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleFileSelect} />
        </CardContent>
      </Card>

      {/* Form Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ข้อมูลบริษัท</CardTitle>
          {aiResult && (
            <CardDescription className="flex items-center gap-1 text-orange-600">
              <Eye className="w-3.5 h-3.5" /> ข้อมูลจาก AI — กรุณาตรวจสอบก่อนบันทึก
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  ชื่อบริษัท <span className="text-red-500">*</span>
                  {aiResult && form.company_name && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.company_name} onChange={(e) => handleChange('company_name', e.target.value)}
                  placeholder="เช่น บริษัท ABC จำกัด" className={!form.company_name ? 'border-red-300' : ''} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  เลขประจำตัวผู้เสียภาษี
                  {aiResult && form.tax_id && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.tax_id} onChange={(e) => handleChange('tax_id', e.target.value)} placeholder="เลข 13 หลัก" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  ผู้ติดต่อ
                  {aiResult && form.contact_person && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.contact_person} onChange={(e) => handleChange('contact_person', e.target.value)} placeholder="ชื่อผู้ติดต่อ" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  เบอร์โทรศัพท์ <span className="text-red-500">*</span>
                  {aiResult && form.phone && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.phone} onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="0xx-xxx-xxxx" className={!form.phone ? 'border-red-300' : ''} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  อีเมล
                  {aiResult && form.email && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} placeholder="email@example.com" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  เว็บไซต์
                  {aiResult && form.website && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.website} onChange={(e) => handleChange('website', e.target.value)} placeholder="https://" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="flex items-center gap-1">
                  ที่อยู่
                  {aiResult && form.address && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.address} onChange={(e) => handleChange('address', e.target.value)} placeholder="ที่อยู่เต็ม" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  จังหวัด
                  {aiResult && form.city && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.city} onChange={(e) => handleChange('city', e.target.value)} placeholder="จังหวัด" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  ประเทศ
                  {aiResult && form.country && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.country} onChange={(e) => handleChange('country', e.target.value)} placeholder="ประเทศ" />
              </div>
              <div className="space-y-2">
                <Label>ระดับ (Tier)</Label>
                <Select value={form.tier} onValueChange={(v) => handleChange('tier', v)}>
                  <SelectTrigger><SelectValue placeholder="เลือกระดับ" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical_tier_1">Critical Tier 1</SelectItem>
                    <SelectItem value="non_critical_tier_1">Non-Critical Tier 1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>หมายเหตุ</Label>
              <Textarea value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} placeholder="หมายเหตุเพิ่มเติม" />
            </div>

            {/* Validation warnings */}
            {missingFields.length > 0 && (
              <Alert variant="destructive" className="bg-red-50 border-red-200">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  กรุณากรอกข้อมูลที่จำเป็น: <strong>{missingFields.map((f) => f.label).join(', ')}</strong>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <Link to="/suppliers"><Button variant="outline">ยกเลิก</Button></Link>
              <Button type="submit" disabled={loading || !canSave} className="bg-orange-500 hover:bg-orange-600">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังบันทึก...</> : <><CheckCircle className="w-4 h-4 mr-2" /> ตรวจสอบ & บันทึก</>}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ยืนยันการบันทึกผู้จัดจำหน่าย</DialogTitle>
            <DialogDescription>กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนบันทึก</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[120px_1fr] gap-y-2">
              <span className="text-muted-foreground">ชื่อบริษัท:</span>
              <span className="font-medium">{form.company_name}</span>
              {form.tax_id && <><span className="text-muted-foreground">Tax ID:</span><span>{form.tax_id}</span></>}
              {form.contact_person && <><span className="text-muted-foreground">ผู้ติดต่อ:</span><span>{form.contact_person}</span></>}
              {form.phone && <><span className="text-muted-foreground">โทรศัพท์:</span><span>{form.phone}</span></>}
              {form.email && <><span className="text-muted-foreground">อีเมล:</span><span>{form.email}</span></>}
              {form.address && <><span className="text-muted-foreground">ที่อยู่:</span><span>{form.address}</span></>}
              {form.city && <><span className="text-muted-foreground">จังหวัด:</span><span>{form.city}</span></>}
              {form.country && <><span className="text-muted-foreground">ประเทศ:</span><span>{form.country}</span></>}
              {form.website && <><span className="text-muted-foreground">เว็บไซต์:</span><span>{form.website}</span></>}
              {form.tier && <><span className="text-muted-foreground">ระดับ:</span><span>{form.tier === 'critical_tier_1' ? 'Critical Tier 1' : 'Non-Critical Tier 1'}</span></>}
            </div>
            {aiResult && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-xs text-muted-foreground">ข้อมูลจาก AI Scan — {confidenceBadge}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>กลับไปแก้ไข</Button>
            <Button onClick={handleConfirmSave} disabled={loading} className="bg-orange-500 hover:bg-orange-600">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังบันทึก...</> : 'ยืนยัน บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
