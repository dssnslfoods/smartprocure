import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ShieldOff, ShieldCheck, Loader2 } from 'lucide-react';

interface Props {
  supplier: { id: string; company_name: string; is_blacklisted?: boolean | null; blacklist_reason?: string | null };
  onChanged: () => void;
  size?: 'sm' | 'default';
}

/**
 * The single place a supplier is blacklisted/unblacklisted from — every caller
 * (Supplier list, approval screen, edit page) shares this so a reason is always
 * required and every change lands in supplier_blacklist_history.
 */
export default function SupplierBlacklistAction({ supplier, onChanged, size = 'sm' }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const blacklisted = !!supplier.is_blacklisted;

  const submit = async () => {
    const nextBlacklisted = !blacklisted;
    if (nextBlacklisted && !reason.trim()) return; // reason required to blacklist
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('suppliers').update({
      is_blacklisted: nextBlacklisted,
      blacklist_reason: nextBlacklisted ? reason.trim() : null,
      blacklisted_at: nextBlacklisted ? new Date().toISOString() : null,
      blacklisted_by: nextBlacklisted ? (userData.user?.id ?? null) : null,
      blacklisted_by_email: nextBlacklisted ? (userData.user?.email ?? null) : null,
    } as any).eq('id', supplier.id);
    if (error) {
      setSaving(false);
      toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.from('supplier_blacklist_history').insert({
      supplier_id: supplier.id,
      action: nextBlacklisted ? 'blacklisted' : 'unblacklisted',
      reason: reason.trim() || null,
      changed_by: userData.user?.id ?? null,
      changed_by_email: userData.user?.email ?? null,
    });
    setSaving(false);
    setOpen(false);
    setReason('');
    toast({
      title: nextBlacklisted ? 'บล็อก Supplier แล้ว' : 'ปลดบล็อกแล้ว',
      description: nextBlacklisted
        ? `${supplier.company_name} จะไม่แสดงในกระบวนการ RFQ อีก`
        : `${supplier.company_name} กลับมาเข้าร่วม RFQ ได้ตามปกติ`,
    });
    onChanged();
  };

  return (
    <>
      {blacklisted ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700 gap-1">
            <ShieldOff className="w-3 h-3" />Blacklisted
          </Badge>
          <Button variant="ghost" size={size} className="text-xs text-muted-foreground" onClick={() => { setReason(''); setOpen(true); }}>
            ปลดบล็อก
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size={size} className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setReason(''); setOpen(true); }}>
          <ShieldOff className="w-3.5 h-3.5 mr-1" />บล็อก (Blacklist)
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {blacklisted ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <ShieldOff className="w-4 h-4 text-red-600" />}
              {blacklisted ? `ปลดบล็อก "${supplier.company_name}"` : `บล็อก "${supplier.company_name}"`}
            </DialogTitle>
            <DialogDescription>
              {blacklisted
                ? 'Supplier จะกลับมาถูกเชิญ/เข้าร่วม RFQ ได้ตามปกติ'
                : 'Supplier จะไม่ถูกแสดงชื่อในกระบวนการ RFQ ทั้งหมด (สร้าง RFQ, เชิญเสนอราคา) จนกว่าจะปลดบล็อก'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">
              เหตุผล {!blacklisted && <span className="text-red-500">*</span>}
            </Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder={blacklisted ? 'หมายเหตุ (ถ้ามี)' : 'ระบุเหตุผลที่บล็อก Supplier รายนี้'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button
              size="sm"
              variant={blacklisted ? 'default' : 'destructive'}
              disabled={saving || (!blacklisted && !reason.trim())}
              onClick={submit}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
              {saving ? 'กำลังบันทึก...' : blacklisted ? 'ยืนยันปลดบล็อก' : 'ยืนยันบล็อก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
