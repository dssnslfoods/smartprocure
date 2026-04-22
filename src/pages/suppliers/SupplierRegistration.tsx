import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Building2, User, FileText, Landmark, ChevronRight, ChevronLeft, Check, Upload, X } from 'lucide-react';

const STEPS = [
  { id: 'company', label: 'ข้อมูลบริษัท', icon: Building2 },
  { id: 'contact', label: 'ข้อมูลติดต่อ', icon: User },
  { id: 'banking', label: 'ข้อมูลธนาคาร', icon: Landmark },
  { id: 'documents', label: 'เอกสาร', icon: FileText },
  { id: 'account', label: 'สร้างบัญชี', icon: Check },
];

interface DocFile {
  file: File;
  type: string;
  name: string;
}

export default function SupplierRegistration() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    company_name: '', tax_id: '', address: '', city: '', country: 'Thailand',
    phone: '', email: '', website: '', notes: '',
    contact_name: '', contact_position: '', contact_email: '', contact_phone: '',
    bank_name: '', bank_branch: '', account_name: '', account_number: '', account_type: 'savings',
    swift_code: '',
    reg_email: '', password: '', confirm_password: '', full_name: '',
  });

  const [docFiles, setDocFiles] = useState<DocFile[]>([]);

  const update = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const addDocFile = (file: File, type: string) => {
    setDocFiles(prev => [...prev, { file, type, name: file.name }]);
  };

  const removeDocFile = (index: number) => {
    setDocFiles(prev => prev.filter((_, i) => i !== index));
  };

  const docTypes = [
    { value: 'company_certificate', label: 'หนังสือรับรองบริษัท' },
    { value: 'vat_registration', label: 'ภพ.20 (ใบทะเบียนภาษีมูลค่าเพิ่ม)' },
    { value: 'commercial_registration', label: 'หนังสือจดทะเบียนพาณิชย์' },
    { value: 'id_card', label: 'สำเนาบัตรประชาชนกรรมการ' },
    { value: 'bank_certificate', label: 'หนังสือรับรองบัญชีธนาคาร' },
    { value: 'financial_statement', label: 'งบการเงิน' },
    { value: 'other', label: 'เอกสารอื่นๆ' },
  ];

  const [selectedDocType, setSelectedDocType] = useState('company_certificate');

  const validateStep = () => {
    switch (step) {
      case 0:
        if (!form.company_name || !form.tax_id) {
          toast({ title: 'กรุณากรอกชื่อบริษัทและเลขประจำตัวผู้เสียภาษี', variant: 'destructive' });
          return false;
        }
        return true;
      case 1:
        if (!form.contact_name || !form.contact_email) {
          toast({ title: 'กรุณากรอกชื่อผู้ติดต่อและอีเมล', variant: 'destructive' });
          return false;
        }
        return true;
      case 2: return true;
      case 3:
        if (docFiles.length === 0) {
          toast({ title: 'กรุณาอัปโหลดเอกสารอย่างน้อย 1 รายการ', variant: 'destructive' });
          return false;
        }
        return true;
      case 4:
        if (!form.reg_email || !form.password || !form.full_name) {
          toast({ title: 'กรุณากรอกข้อมูลบัญชีให้ครบถ้วน', variant: 'destructive' });
          return false;
        }
        if (form.password.length < 6) {
          toast({ title: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', variant: 'destructive' });
          return false;
        }
        if (form.password !== form.confirm_password) {
          toast({ title: 'รหัสผ่านไม่ตรงกัน', variant: 'destructive' });
          return false;
        }
        return true;
      default: return true;
    }
  };

  const nextStep = () => {
    if (validateStep()) setStep(s => Math.min(s + 1, STEPS.length - 1));
  };
  const prevStep = () => setStep(s => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setLoading(true);

    try {
      // Clear any existing session before creating new user
      await supabase.auth.signOut();

      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.reg_email,
        password: form.password,
        options: {
          data: { full_name: form.full_name },
          emailRedirectTo: window.location.origin,
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('ไม่สามารถสร้างบัญชีได้');

      const userId = authData.user.id;

      // 2. Assign supplier role
      const { error: roleError } = await supabase.from('user_roles').insert({ user_id: userId, role: 'supplier' });
      if (roleError) throw roleError;

      // 3. Create supplier record
      const { data: supplier, error: supError } = await supabase.from('suppliers').insert({
        company_name: form.company_name,
        tax_id: form.tax_id,
        address: form.address,
        city: form.city,
        country: form.country,
        phone: form.phone,
        email: form.contact_email || form.reg_email,
        website: form.website,
        notes: form.notes,
        status: 'submitted',
        created_by: userId,
      }).select().single();

      if (supError) throw supError;

      // 4. Link profile to supplier
      await supabase.from('profiles').update({
        supplier_id: supplier.id,
        full_name: form.full_name,
        phone: form.contact_phone,
      }).eq('id', userId);

      // 5. Create contact
      if (form.contact_name) {
        await supabase.from('supplier_contacts').insert({
          supplier_id: supplier.id,
          contact_name: form.contact_name,
          position: form.contact_position,
          email: form.contact_email,
          phone: form.contact_phone,
          is_primary: true,
        });
      }

      // 6. Store banking info in notes (or a dedicated field)
      if (form.bank_name || form.account_number) {
        const bankInfo = `ธนาคาร: ${form.bank_name}, สาขา: ${form.bank_branch}, ชื่อบัญชี: ${form.account_name}, เลขที่: ${form.account_number}, ประเภท: ${form.account_type}, SWIFT: ${form.swift_code}`;
        await supabase.from('suppliers').update({
          notes: [form.notes, `\n\n--- ข้อมูลธนาคาร ---\n${bankInfo}`].filter(Boolean).join(''),
        }).eq('id', supplier.id);
      }

      // 7. Upload documents
      for (const doc of docFiles) {
        const filePath = `${supplier.id}/${Date.now()}_${doc.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('supplier-documents')
          .upload(filePath, doc.file);

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('supplier-documents').getPublicUrl(filePath);
          await supabase.from('supplier_documents').insert({
            supplier_id: supplier.id,
            document_name: doc.name,
            document_type: doc.type,
            file_url: urlData.publicUrl,
            file_size: doc.file.size,
            uploaded_by: userId,
          });
        }
      }

      // 8. Create audit log
      await supabase.from('audit_logs').insert({
        entity_type: 'supplier',
        entity_id: supplier.id,
        action: 'supplier_self_registration',
        new_values: { company_name: form.company_name, email: form.reg_email },
        performed_by: userId,
      });

      // 9. Notify all admins
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (adminRoles && adminRoles.length > 0) {
        const notifs = adminRoles.map(r => ({
          user_id: r.user_id,
          title: 'Supplier ลงทะเบียนใหม่',
          message: `${form.company_name} ส่งคำขอลงทะเบียน กรุณาตรวจสอบข้อมูลและเอกสาร`,
          type: 'supplier_registration',
          link: '/admin/supplier-approvals',
        }));
        await supabase.from('notifications').insert(notifs);
      }

      // Sign out - supplier needs admin approval before accessing
      await supabase.auth.signOut();

      toast({
        title: 'ลงทะเบียนสำเร็จ!',
        description: 'ข้อมูลของท่านจะถูกตรวจสอบโดยผู้ดูแลระบบ เมื่อได้รับการอนุมัติแล้วจะสามารถเข้าสู่ระบบได้',
      });

      navigate('/login?registered=true');
    } catch (err: any) {
      // Ensure new user session is cleared on any error
      await supabase.auth.signOut();
      toast({ title: 'เกิดข้อผิดพลาด', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-xl">SP</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">ลงทะเบียน Supplier ใหม่</h1>
          <p className="text-sm text-muted-foreground mt-1">Smart Procurement — NSL Foods PLC</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center mb-8 gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={s.id} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' :
                  isDone ? 'bg-primary/10 text-primary' :
                  'bg-muted text-muted-foreground'
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />}
              </div>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{STEPS[step].label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step 0: Company Info */}
            {step === 0 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>ชื่อบริษัท *</Label>
                    <Input value={form.company_name} onChange={e => update('company_name', e.target.value)} placeholder="บริษัท ตัวอย่าง จำกัด" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>เลขประจำตัวผู้เสียภาษี (Tax ID) *</Label>
                    <Input value={form.tax_id} onChange={e => update('tax_id', e.target.value)} placeholder="0105XXXXXXXXX" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>เว็บไซต์</Label>
                    <Input value={form.website} onChange={e => update('website', e.target.value)} placeholder="https://www.example.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>ที่อยู่</Label>
                  <Textarea value={form.address} onChange={e => update('address', e.target.value)} rows={2} placeholder="ที่อยู่บริษัท" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>จังหวัด/เมือง</Label>
                    <Input value={form.city} onChange={e => update('city', e.target.value)} placeholder="กรุงเทพมหานคร" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ประเทศ</Label>
                    <Input value={form.country} onChange={e => update('country', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>เบอร์โทรศัพท์</Label>
                    <Input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="02-XXX-XXXX" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>หมายเหตุ</Label>
                  <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} placeholder="ข้อมูลเพิ่มเติมเกี่ยวกับบริษัท" />
                </div>
              </>
            )}

            {/* Step 1: Contact Info */}
            {step === 1 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>ชื่อผู้ติดต่อ *</Label>
                  <Input value={form.contact_name} onChange={e => update('contact_name', e.target.value)} placeholder="ชื่อ-นามสกุล" />
                </div>
                <div className="space-y-1.5">
                  <Label>ตำแหน่ง</Label>
                  <Input value={form.contact_position} onChange={e => update('contact_position', e.target.value)} placeholder="ผู้จัดการฝ่ายขาย" />
                </div>
                <div className="space-y-1.5">
                  <Label>อีเมลผู้ติดต่อ *</Label>
                  <Input type="email" value={form.contact_email} onChange={e => update('contact_email', e.target.value)} placeholder="contact@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>เบอร์โทรผู้ติดต่อ</Label>
                  <Input value={form.contact_phone} onChange={e => update('contact_phone', e.target.value)} placeholder="08X-XXX-XXXX" />
                </div>
              </div>
            )}

            {/* Step 2: Banking Info */}
            {step === 2 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>ชื่อธนาคาร</Label>
                  <Input value={form.bank_name} onChange={e => update('bank_name', e.target.value)} placeholder="ธนาคารกสิกรไทย" />
                </div>
                <div className="space-y-1.5">
                  <Label>สาขา</Label>
                  <Input value={form.bank_branch} onChange={e => update('bank_branch', e.target.value)} placeholder="สาขาสำนักงานใหญ่" />
                </div>
                <div className="space-y-1.5">
                  <Label>ชื่อบัญชี</Label>
                  <Input value={form.account_name} onChange={e => update('account_name', e.target.value)} placeholder="บริษัท ตัวอย่าง จำกัด" />
                </div>
                <div className="space-y-1.5">
                  <Label>เลขที่บัญชี</Label>
                  <Input value={form.account_number} onChange={e => update('account_number', e.target.value)} placeholder="XXX-X-XXXXX-X" />
                </div>
                <div className="space-y-1.5">
                  <Label>ประเภทบัญชี</Label>
                  <Select value={form.account_type} onValueChange={v => update('account_type', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="savings">ออมทรัพย์</SelectItem>
                      <SelectItem value="current">กระแสรายวัน</SelectItem>
                      <SelectItem value="fixed">ฝากประจำ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>SWIFT Code</Label>
                  <Input value={form.swift_code} onChange={e => update('swift_code', e.target.value)} placeholder="KASITHBK" />
                </div>
              </div>
            )}

            {/* Step 3: Documents */}
            {step === 3 && (
              <>
                <p className="text-sm text-muted-foreground">กรุณาอัปโหลดเอกสารที่จำเป็นต่อไปนี้ (อย่างน้อย 1 รายการ)</p>
                <div className="flex gap-3 items-end">
                  <div className="flex-1 space-y-1.5">
                    <Label>ประเภทเอกสาร</Label>
                    <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {docTypes.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="doc-upload" className="cursor-pointer">
                      <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                        <Upload className="w-4 h-4" /> เลือกไฟล์
                      </div>
                    </Label>
                    <input
                      id="doc-upload"
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          addDocFile(file, selectedDocType);
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>
                </div>

                {docFiles.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <Label>เอกสารที่เลือก ({docFiles.length} ไฟล์)</Label>
                    {docFiles.map((doc, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {docTypes.find(d => d.value === doc.type)?.label || doc.type}
                              {' · '}
                              {(doc.file.size / 1024).toFixed(0)} KB
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeDocFile(i)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">เอกสารที่แนะนำ:</p>
                  <ul className="list-disc ml-4 space-y-0.5">
                    <li>หนังสือรับรองบริษัท (ไม่เกิน 3 เดือน)</li>
                    <li>ภพ.20 (ใบทะเบียนภาษีมูลค่าเพิ่ม)</li>
                    <li>สำเนาบัตรประชาชนกรรมการผู้มีอำนาจ</li>
                    <li>หนังสือรับรองบัญชีธนาคาร (Book Bank)</li>
                  </ul>
                  <p>รองรับไฟล์: PDF, JPG, PNG, DOC, DOCX (ไม่เกิน 10 MB)</p>
                </div>
              </>
            )}

            {/* Step 4: Account */}
            {step === 4 && (
              <>
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-foreground mb-2">
                  <p>สร้างบัญชีเพื่อเข้าใช้งานระบบ หลังจากส่งข้อมูลแล้ว ผู้ดูแลระบบจะตรวจสอบข้อมูลและเอกสาร เมื่อได้รับอนุมัติท่านจะสามารถเข้าสู่ระบบได้</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>ชื่อ-นามสกุล *</Label>
                    <Input value={form.full_name} onChange={e => update('full_name', e.target.value)} placeholder="ชื่อ นามสกุล" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>อีเมลสำหรับเข้าสู่ระบบ *</Label>
                    <Input type="email" value={form.reg_email} onChange={e => update('reg_email', e.target.value)} placeholder="you@company.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>รหัสผ่าน *</Label>
                    <Input type="password" value={form.password} onChange={e => update('password', e.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ยืนยันรหัสผ่าน *</Label>
                    <Input type="password" value={form.confirm_password} onChange={e => update('confirm_password', e.target.value)} placeholder="กรอกรหัสผ่านอีกครั้ง" />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <div>
            {step > 0 && (
              <Button variant="outline" onClick={prevStep}>
                <ChevronLeft className="w-4 h-4 mr-1" /> ย้อนกลับ
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Link to="/login">
              <Button variant="ghost">ยกเลิก</Button>
            </Link>
            {step < STEPS.length - 1 ? (
              <Button onClick={nextStep}>
                ถัดไป <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? 'กำลังส่งข้อมูล...' : 'ส่งข้อมูลลงทะเบียน'}
              </Button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          มีบัญชีแล้ว? <Link to="/login" className="text-primary hover:underline">เข้าสู่ระบบ</Link>
        </p>
      </div>
    </div>
  );
}
