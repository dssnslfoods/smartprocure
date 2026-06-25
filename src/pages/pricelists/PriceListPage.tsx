import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Boxes, Package2, Wrench, MoreHorizontal, FileSpreadsheet, ArrowRight, Pin, History, Upload, FileDown, ShieldCheck, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CATEGORY_LABELS, CATEGORY_COLORS, type PriceListCategory } from '@/lib/priceListConstants';
import { exportCatalog } from '@/lib/catalogExcel';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { assessCycle, loadPricelistCycle, CYCLE_STATUS_CLASS, CYCLE_STATUS_LABEL,
  type PricelistCycleSettings, DEFAULT_CYCLE } from '@/lib/pricelistCycle';
import { computeDimensionRisks, passesCatalogGate, DIMENSION_LABEL,
  type RiskCriterion, type SupplierCert, type SupplierDoc } from '@/lib/riskCriteria';
import { CatalogAccessDialog } from './CatalogAccessDialog';

const CATEGORY_ICONS: Record<string, any> = {
  raw_material: Boxes,
  packaging:    Package2,
  service:      Wrench,
  other:        MoreHorizontal,
};

interface CatalogRow {
  id:          string;
  title:       string;
  category:    PriceListCategory;
  status:      string;
  valid_until: string | null;
  notes:       string | null;
  itemCount:   number;
  nominatedCount: number;
  myLastSubmissionAt?: string | null;   // supplier-only
  accessRiskRules: Record<string, number>;
}

export default function PriceListPage() {
  const { roles, profile, tenant } = useAuth();
  const { toast } = useToast();
  const isSupplier   = roles.includes('supplier');
  const mySupplierId = profile?.supplier_id ?? null;

  const [catalogs, setCatalogs] = useState<CatalogRow[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [exporting, setExporting] = useState(false);
  const [cycle, setCycle] = useState<PricelistCycleSettings>(DEFAULT_CYCLE);
  const [accessEditFor, setAccessEditFor] = useState<CatalogRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handleExport = async () => {
    setExporting(true);
    try {
      const count = await exportCatalog();
      toast({ title: '✓ Export สำเร็จ', description: `ส่งออก ${count} รายการเป็นไฟล์ Excel` });
    } catch (err: any) {
      toast({ title: 'Export ไม่สำเร็จ', description: err.message, variant: 'destructive' });
    }
    setExporting(false);
  };

  useEffect(() => { loadPricelistCycle().then(setCycle); }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: lists } = await supabase
        .from('price_lists')
        .select('id, title, category, status, valid_until, notes, access_risk_rules, price_list_items(id, is_nominated)')
        .order('category');

      let mySubmissionsByCatalog: Record<string, string> = {};
      if (isSupplier && mySupplierId && lists?.length) {
        const allItemIds = lists.flatMap((l: any) => (l.price_list_items || []).map((i: any) => i.id));
        if (allItemIds.length > 0) {
          const { data: offers } = await supabase
            .from('price_list_item_suppliers')
            .select('price_list_item_id, updated_at')
            .eq('supplier_id', mySupplierId)
            .in('price_list_item_id', allItemIds);
          // Build item→catalog map
          const itemToCatalog: Record<string, string> = {};
          lists.forEach((l: any) => (l.price_list_items || []).forEach((i: any) => { itemToCatalog[i.id] = l.id; }));
          (offers || []).forEach((o: any) => {
            const cat = itemToCatalog[o.price_list_item_id];
            if (!cat) return;
            const ts = o.updated_at;
            if (!mySubmissionsByCatalog[cat] || ts > mySubmissionsByCatalog[cat]) {
              mySubmissionsByCatalog[cat] = ts;
            }
          });
        }
      }

      let rows: CatalogRow[] = (lists || []).map((l: any) => ({
        id:        l.id,
        title:     l.title,
        category:  l.category,
        status:    l.status,
        valid_until: l.valid_until,
        notes:     l.notes,
        itemCount: l.price_list_items?.length ?? 0,
        nominatedCount: (l.price_list_items || []).filter((i: any) => i.is_nominated).length,
        myLastSubmissionAt: mySubmissionsByCatalog[l.id] || null,
        accessRiskRules: (l.access_risk_rules as Record<string, number>) || {},
      }));

      // Supplier gating: hide catalogs whose risk thresholds the supplier fails.
      let hidden = 0;
      if (isSupplier && mySupplierId) {
        const hasRules = rows.some(r => Object.keys(r.accessRiskRules).length > 0);
        if (hasRules) {
          const [critRes, certRes, docRes] = await Promise.all([
            supabase.from('risk_criteria').select('*').eq('active', true),
            supabase.from('supplier_certificates').select('certificate_type, expiry_date').eq('supplier_id', mySupplierId),
            supabase.from('supplier_documents').select('document_type, document_name').eq('supplier_id', mySupplierId),
          ]);
          const criteria = (critRes.data as RiskCriterion[]) || [];
          const certs = (certRes.data as SupplierCert[]) || [];
          const docs = (docRes.data as SupplierDoc[]) || [];
          rows = rows.filter(r => {
            if (Object.keys(r.accessRiskRules).length === 0) return true;
            const dims = computeDimensionRisks(criteria, certs, docs, r.category as any);
            const effective: Record<string, number | null> = {};
            for (const [dim, res] of Object.entries(dims)) effective[dim] = res.score;
            const { passes } = passesCatalogGate(r.accessRiskRules, effective);
            if (!passes) hidden++;
            return passes;
          });
        }
      }

      setHiddenCount(hidden);
      setCatalogs(rows);
      setLoading(false);
    })();
  }, [isSupplier, mySupplierId, reloadKey]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Master Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Catalog กลางของ {tenant?.name ?? 'องค์กร'} — แยกตามหมวดสินค้า ใช้สำหรับสร้าง Checklist เพื่อขอใบเสนอราคา
          </p>
        </div>
        {!isSupplier && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              <FileDown className="h-4 w-4 mr-2" />
              {exporting ? 'กำลังส่งออก...' : 'Export Excel'}
            </Button>
            <Link to="/price-lists/import">
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                นำเข้า Excel
              </Button>
            </Link>
            <Link to="/price-lists/quotation-history">
              <Button variant="outline">
                <History className="h-4 w-4 mr-2" />
                ประวัติใบเสนอราคา
              </Button>
            </Link>
          </div>
        )}
      </div>

      {isSupplier && hiddenCount > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="p-4 flex items-start gap-3">
            <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-800">มี Catalog {hiddenCount} รายการที่ยังไม่เปิดให้เข้าถึง</p>
              <p className="text-amber-700 text-xs mt-0.5">
                Catalog เหล่านี้กำหนดเกณฑ์ความเสี่ยงขั้นต่ำ — กรุณาอัปโหลดเอกสาร/ใบรับรองที่จำเป็น (เช่น HACCP, GMP, ISO) เพื่อปลดล็อกการเข้าถึง
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">กำลังโหลด...</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {catalogs.map(cat => {
            const Icon = CATEGORY_ICONS[cat.category] || MoreHorizontal;
            const colorClass = CATEGORY_COLORS[cat.category] || '';
            const myStatus = isSupplier ? assessCycle(cat.myLastSubmissionAt || null, cycle.update_cycle_days) : null;
            return (
              <Card key={cat.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-3 rounded-lg ${colorClass}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg leading-tight">{cat.title}</h3>
                        <Badge variant="outline" className={`${colorClass} text-xs mt-1`}>
                          {CATEGORY_LABELS[cat.category]}
                        </Badge>
                        {cat.notes && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{cat.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {myStatus && (
                    <div className="mt-3 pt-3 border-t">
                      <Badge variant="outline" className={`text-xs ${CYCLE_STATUS_CLASS[myStatus.status]}`}>
                        Pricelist สถานะ: {CYCLE_STATUS_LABEL[myStatus.status]}
                        {myStatus.lastAt && ` · ${myStatus.lastAt.toLocaleDateString('th-TH')}`}
                      </Badge>
                      {myStatus.status === 'overdue' && (
                        <p className="text-xs text-red-600 mt-1">
                          เกินรอบ {Math.abs(myStatus.daysRemaining ?? 0)} วัน — กรุณาส่ง pricelist ใหม่
                        </p>
                      )}
                      {myStatus.status === 'due_soon' && (
                        <p className="text-xs text-amber-700 mt-1">
                          ใกล้ครบรอบ — เหลือ {myStatus.daysRemaining} วัน
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t">
                    <div>
                      <div className="text-2xl font-bold">{cat.itemCount}</div>
                      <div className="text-xs text-muted-foreground">รายการในเล่ม</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-amber-700 flex items-center gap-1">
                        <Pin className="h-4 w-4" />
                        {cat.nominatedCount}
                      </div>
                      <div className="text-xs text-muted-foreground">Nominated</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold">
                        {cat.valid_until ? new Date(cat.valid_until).toLocaleDateString('th-TH') : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">ใช้ได้ถึง</div>
                    </div>
                  </div>

                  {!isSupplier && Object.keys(cat.accessRiskRules).length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
                      <span className="text-xs text-muted-foreground">เกณฑ์เข้าถึง:</span>
                      {Object.entries(cat.accessRiskRules).map(([dim, max]) => (
                        <Badge key={dim} variant="outline" className="text-[10px]">
                          {DIMENSION_LABEL[dim] || dim} ≤ {max}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <Button asChild className="flex-1">
                      <Link to={`/price-lists/${cat.id}`}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        เปิด Catalog
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                    {!isSupplier && (
                      <Button variant="outline" size="icon" title="ตั้งเกณฑ์การเข้าถึง" onClick={() => setAccessEditFor(cat)}>
                        <ShieldCheck className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CatalogAccessDialog
        catalog={accessEditFor}
        onClose={() => setAccessEditFor(null)}
        onSaved={() => { setAccessEditFor(null); setReloadKey(k => k + 1); }}
      />
    </div>
  );
}
