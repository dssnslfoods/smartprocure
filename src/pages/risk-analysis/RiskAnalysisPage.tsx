import SupplierRiskMatrix from '@/pages/reports/SupplierRiskMatrix';

export default function RiskAnalysisPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Supplier Risk Analysis</h1>
        <p className="text-sm text-muted-foreground">
          ABC-XYZ 9×9 Sub-Tier Matrix · P-Score = 0.65·ABC + 0.35·XYZ · วิเคราะห์ความเสี่ยงคู่ค้าเชิงลึก
        </p>
      </div>
      <SupplierRiskMatrix />
    </div>
  );
}
