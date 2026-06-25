import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { RISK_FACTORS } from '@/types/procurement';
import { DIMENSION_LABEL, type RiskCriterion } from '@/lib/riskCriteria';

interface CatalogLite {
  id: string;
  title: string;
  category: string;
  accessRiskRules: Record<string, number>;
}

export function CatalogAccessDialog({
  catalog, onClose, onSaved,
}: { catalog: CatalogLite | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [rules, setRules] = useState<Record<string, number>>({});
  const [dimsWithCriteria, setDimsWithCriteria] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!catalog) return;
    setRules({ ...catalog.accessRiskRules });
    // Which dimensions actually have criteria for this catalog's category (or global)?
    supabase.from('risk_criteria').select('dimension, category').eq('active', true)
      .then(({ data }) => {
        const set = new Set<string>();
        ((data as RiskCriterion[]) || []).forEach(c => {
          if (c.category === null || c.category === catalog.category) set.add(c.dimension);
        });
        setDimsWithCriteria(set);
      });
  }, [catalog]);

  if (!catalog) return null;

  const toggle = (dim: string, on: boolean) =>
    setRules(prev => {
      const next = { ...prev };
      if (on) next[dim] = prev[dim] ?? 5;
      else delete next[dim];
      return next;
    });

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('price_lists').update({ access_risk_rules: rules }).eq('id', catalog.id);
    setSaving(false);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'บันทึกเกณฑ์การเข้าถึงแล้ว', description: Object.keys(rules).length ? `${Object.keys(rules).length} เงื่อนไข` : 'เปิดให้ทุก supplier เข้าถึง' });
    onSaved();
  };

  return (
    <Dialog open={!!catalog} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>เกณฑ์การเข้าถึง — {catalog.title}</DialogTitle>
          <DialogDescription>
            เลือกด้านความเสี่ยงที่ supplier ต้องผ่าน และกำหนดคะแนนความเสี่ยงสูงสุดที่ยอมรับได้ (0 = ดีที่สุด, 10 = แย่ที่สุด)
            หาก supplier มีคะแนนเกินเกณฑ์ จะไม่เห็น catalog นี้
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {RISK_FACTORS.map(f => {
            const enabled = f.key in rules;
            const hasCriteria = dimsWithCriteria.has(f.key);
            return (
              <div key={f.key} className={`rounded-lg border p-3 ${enabled ? 'border-teal-300 bg-teal-50/40' : ''}`}>
                <div className="flex items-center gap-3">
                  <Checkbox checked={enabled} onCheckedChange={v => toggle(f.key, !!v)} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{f.label}</span>
                      {!hasCriteria && <Badge variant="secondary" className="text-[10px]">ยังไม่มีเกณฑ์</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{f.description}</p>
                  </div>
                  {enabled && <span className="text-lg font-bold tabular-nums w-12 text-right">≤ {rules[f.key]}</span>}
                </div>
                {enabled && (
                  <div className="mt-3 pl-7">
                    <Slider min={0} max={10} step={1} value={[rules[f.key]]}
                      onValueChange={([v]) => setRules(prev => ({ ...prev, [f.key]: v }))} />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>0 เข้มงวด</span><span>5</span><span>10 ผ่อนปรน</span>
                    </div>
                    {!hasCriteria && (
                      <p className="text-[11px] text-amber-600 mt-1">
                        ยังไม่มีเกณฑ์ในด้านนี้สำหรับหมวด {DIMENSION_LABEL[f.key]} — supplier จะถือว่า "ไม่ถูกประเมิน" และผ่านอัตโนมัติ
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
