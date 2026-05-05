import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, AlertCircle, CheckCircle2, Copy, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

export default function SupplierForm() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    tax_id: '',
    address: '',
    city: '',
    country: '',
    phone: '',
    email: '',
    website: '',
    tier: '',
    notes: '',
  });

  // Result dialog state
  const [resultOpen, setResultOpen] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Atomic RPC: dedupe email + create supplier (+ login if email present)
    const { data, error } = await supabase.rpc('admin_create_supplier_with_user', {
      p_company_name: form.company_name,
      p_email:        form.email || null,
      p_tax_id:       form.tax_id || null,
      p_phone:        form.phone || null,
      p_address:      form.address || null,
      p_city:         form.city || null,
      p_country:      form.country || null,
      p_website:      form.website || null,
      p_tier:         form.tier || null,
      p_notes:        form.notes || null,
      p_password:     null, // auto-generate
    });

    setLoading(false);

    if (error) {
      toast({ title: 'เกิดข้อผิดพลาด', description: error.message, variant: 'destructive' });
      return;
    }

    setResult(data);
    setResultOpen(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'คัดลอกแล้ว' });
  };

  const closeResultAndGo = (path: string) => {
    setResultOpen(false);
    navigate(path);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link to="/suppliers">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">เพิ่ม Supplier ใหม่</h1>
          <p className="text-sm text-muted-foreground">
            ระบบจะตรวจสอบอีเมลซ้ำในระบบและสร้างบัญชี login ให้ supplier อัตโนมัติ
          </p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">ข้อมูลบริษัท</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>ชื่อบริษัท *</Label>
                <Input value={form.company_name} onChange={(e) => handleChange('company_name', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>เลขประจำตัวผู้เสียภาษี</Label>
                <Input value={form.tax_id} onChange={(e) => handleChange('tax_id', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>อีเมล (จะใช้เป็น username สำหรับ login)</Label>
                <Input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)}
                       placeholder="contact@company.com" />
                <p className="text-xs text-muted-foreground">
                  หากกรอกอีเมล ระบบจะตรวจสอบความซ้ำซ้อนและสร้างบัญชี login ให้อัตโนมัติ
                </p>
              </div>
              <div className="space-y-2">
                <Label>เบอร์โทรศัพท์</Label>
                <Input value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>เมือง / จังหวัด</Label>
                <Input value={form.city} onChange={(e) => handleChange('city', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>ประเทศ</Label>
                <Input value={form.country} onChange={(e) => handleChange('country', e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>ที่อยู่</Label>
                <Input value={form.address} onChange={(e) => handleChange('address', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>เว็บไซต์</Label>
                <Input value={form.website} onChange={(e) => handleChange('website', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select value={form.tier} onValueChange={(v) => handleChange('tier', v)}>
                  <SelectTrigger><SelectValue placeholder="เลือก tier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical_tier_1">Critical Tier 1</SelectItem>
                    <SelectItem value="non_critical_tier_1">Non-Critical Tier 1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>หมายเหตุ</Label>
              <Textarea value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} />
            </div>
            <div className="flex justify-end gap-3">
              <Link to="/suppliers"><Button type="button" variant="outline">ยกเลิก</Button></Link>
              <Button type="submit" disabled={loading}>{loading ? 'กำลังบันทึก...' : 'บันทึก Supplier'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Result dialog: success / duplicate */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-lg">
          {result?.success ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                  สร้าง Supplier เรียบร้อย
                </DialogTitle>
                <DialogDescription>{result.message}</DialogDescription>
              </DialogHeader>

              {result.login_created && (
                <div className="space-y-3 mt-2">
                  <div className="rounded-md border bg-emerald-50 border-emerald-200 p-3 space-y-3">
                    <p className="text-xs font-semibold text-emerald-800">
                      🔑 ข้อมูล login สำหรับ supplier (โปรดบันทึกหรือส่งต่อให้ supplier)
                    </p>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Username (Email)</Label>
                      <div className="flex gap-2">
                        <Input readOnly value={result.email} className="font-mono text-xs" />
                        <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(result.email)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {result.generated_password && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">รหัสผ่านชั่วคราว</Label>
                        <div className="flex gap-2">
                          <Input readOnly value={result.generated_password} className="font-mono text-xs" />
                          <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(result.generated_password)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <p className="text-[11px] text-amber-700">
                          ⚠️ รหัสผ่านนี้จะแสดงเพียงครั้งเดียว — admin สามารถ reset ใหม่ได้จากหน้า Admin Settings
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => closeResultAndGo('/suppliers')}>กลับไปรายการ</Button>
                <Button onClick={() => closeResultAndGo(`/suppliers/${result.supplier_id}`)}>
                  เปิด Supplier
                </Button>
              </DialogFooter>
            </>
          ) : result?.duplicate ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-700">
                  <AlertCircle className="h-5 w-5" />
                  พบอีเมลซ้ำในระบบ
                </DialogTitle>
                <DialogDescription>{result.message}</DialogDescription>
              </DialogHeader>

              <div className="rounded-md border bg-amber-50 border-amber-200 p-3 text-sm">
                {result.duplicate_kind === 'supplier_email' && (
                  <>
                    <p>อีเมล <strong className="font-mono">{form.email}</strong> ถูกใช้กับ supplier ที่มีอยู่แล้ว</p>
                    <p className="text-xs text-muted-foreground mt-2">กรุณาเปิด supplier เดิม หรือใช้อีเมลอื่น</p>
                  </>
                )}
                {result.duplicate_kind === 'auth_user' && (
                  <>
                    <p>อีเมล <strong className="font-mono">{form.email}</strong> ถูกใช้กับบัญชีผู้ใช้ในระบบแล้ว</p>
                    <p className="text-xs text-muted-foreground mt-2">อาจเป็นบัญชี admin หรือ supplier ที่ลงทะเบียนเอง — กรุณาใช้อีเมลอื่น</p>
                  </>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setResultOpen(false)}>แก้ไขข้อมูล</Button>
                {result.existing_supplier_id && (
                  <Button onClick={() => closeResultAndGo(`/suppliers/${result.existing_supplier_id}`)}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" /> เปิด Supplier เดิม
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
