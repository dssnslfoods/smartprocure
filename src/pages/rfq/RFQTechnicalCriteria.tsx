import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ListChecks, Save } from 'lucide-react';
import type { TechCriterion } from '@/lib/technicalScore';

type Draft = { id?: string; label: string; description: string; weight: number; sort_order: number };

/**
 * Procurement-side editor for an RFQ's weighted technical checklist.
 * Suppliers fill these items in when submitting a quotation (RFQQuotations).
 */
export default function RFQTechnicalCriteria({ rfqId, canManage }: { rfqId: string; canManage: boolean }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Draft[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('rfq_technical_criteria')
      .select('*').eq('rfq_id', rfqId).order('sort_order');
    setRows(((data as TechCriterion[]) || []).map(c => ({
      id: c.id, label: c.label, description: c.description || '', weight: c.weight, sort_order: c.sort_order,
    })));
    setRemoved([]); setDirty(false); setLoading(false);
  };
  useEffect(() => { load(); }, [rfqId]);

  const totalWeight = rows.reduce((a, r) => a + (Number(r.weight) || 0), 0);

  const update = (i: number, patch: Partial<Draft>) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
    setDirty(true);
  };
  const addRow = () => {
    setRows(prev => [...prev, { label: '', description: '', weight: 1, sort_order: (prev.length + 1) * 10 }]);
    setDirty(true);
  };
  const removeRow = (i: number) => {
    setRows(prev => {
      const r = prev[i];
      if (r.id) setRemoved(x => [...x, r.id!]);
      return prev.filter((_, idx) => idx !== i);
    });
    setDirty(true);
  };

  const save = async () => {
    const valid = rows.filter(r => r.label.trim());
    if (rows.some(r => !r.label.trim())) {
      toast({ title: 'กรุณาใส่ชื่อเกณฑ์ให้ครบทุกข้อ', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (removed.length) {
        await supabase.from('rfq_technical_criteria').delete().in('id', removed);
      }
      const updates = valid.filter(r => r.id);
      const inserts = valid.filter(r => !r.id);
      for (const r of updates) {
        await supabase.from('rfq_technical_criteria').update({
          label: r.label.trim(), description: r.description.trim() || null,
          weight: Number(r.weight) || 1, sort_order: r.sort_order, updated_at: new Date().toISOString(),
        }).eq('id', r.id!);
      }
      if (inserts.length) {
        await supabase.from('rfq_technical_criteria').insert(inserts.map((r, idx) => ({
          rfq_id: rfqId, label: r.label.trim(), description: r.description.trim() || null,
          weight: Number(r.weight) || 1, sort_order: r.sort_order || (rows.length + idx) * 10,
        })));
      }
      toast({ title: 'บันทึกเกณฑ์เทคนิคแล้ว', description: `${valid.length} ข้อ` });
      await load();
    } catch (err: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  // Suppliers / non-managers: read-only summary.
  if (!canManage) {
    if (loading || rows.length === 0) return null;
    return (
      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ListChecks className="w-4 h-4 text-purple-600" />เกณฑ์เทคนิค (Technical) — {rows.length} ข้อ</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id || i} className="flex items-start justify-between gap-3 text-sm border rounded-lg p-2.5">
              <div><span className="font-medium">{r.label}</span>{r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}</div>
              <Badge variant="outline" className="shrink-0">น้ำหนัก {r.weight}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2"><ListChecks className="w-4 h-4 text-purple-600" />เกณฑ์เทคนิค (Technical Checklist)</CardTitle>
        <div className="flex items-center gap-2">
          {totalWeight > 0 && <span className="text-xs text-muted-foreground">น้ำหนักรวม {totalWeight}</span>}
          <Button size="sm" variant="outline" onClick={addRow}><Plus className="w-4 h-4 mr-1" />เพิ่มข้อ</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground -mt-1">
          กำหนดรายการ spec ที่ supplier ต้องกรอกตอนเสนอราคา แต่ละข้อมีน้ำหนัก — คะแนน Technical = ผลรวมถ่วงน้ำหนักของข้อที่ "ตรงตามข้อกำหนด"
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">กำลังโหลด...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีเกณฑ์ — กด "เพิ่มข้อ" เพื่อสร้าง checklist</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.id || i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-start border rounded-lg p-2.5">
                <div className="space-y-1.5">
                  <Input value={r.label} placeholder="เช่น ความหนาเหล็ก ≥ 0.22 mm" onChange={e => update(i, { label: e.target.value })} />
                  <Input value={r.description} placeholder="คำอธิบาย / ข้อกำหนด (ถ้ามี)" className="text-xs h-8" onChange={e => update(i, { description: e.target.value })} />
                </div>
                <div className="w-20">
                  <label className="text-[10px] text-muted-foreground">น้ำหนัก</label>
                  <Input type="number" min={0.5} step={0.5} value={r.weight} onChange={e => update(i, { weight: parseFloat(e.target.value) })} />
                </div>
                <Button variant="ghost" size="icon" className="mt-4" onClick={() => removeRow(i)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
              </div>
            ))}
          </div>
        )}
        {dirty && (
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={saving}><Save className="w-4 h-4 mr-1" />{saving ? 'กำลังบันทึก...' : 'บันทึกเกณฑ์'}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
