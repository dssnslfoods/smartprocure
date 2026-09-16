import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from '@/i18n';
import { useReview, useKpiSnapshot, useUpdateReview } from '../../hooks/useReviews';
import { SupplierInfoTab } from './SupplierInfoTab';
import { PerformanceTab } from './PerformanceTab';
import { ScoringTab } from './ScoringTab';
import { KnockoutTab } from './KnockoutTab';
import { OutcomeTab } from './OutcomeTab';
import { AttachmentsTab } from './AttachmentsTab';
import { SignoffTab } from './SignoffTab';
import type { KpiData } from '../../types';

interface Props {
  reviewId: string;
  onNavigate: (reviewId: string) => void;
}

export function ReviewFormTabs({ reviewId, onNavigate }: Props) {
  const { t } = useTranslation();
  const { data: review, isLoading } = useReview(reviewId);
  const { data: kpiSnapshot } = useKpiSnapshot(reviewId);
  const updateReview = useUpdateReview();
  const [activeTab, setActiveTab] = useState('info');

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!review) return <div className="p-8 text-center">Review not found</div>;

  const locked = review.locked || review.status === 'APPROVED';
  const kpiData = (kpiSnapshot?.data ?? null) as KpiData | null;

  const handleRiskAdjust = (adjusted: boolean, reason: string, newLevel: string) => {
    updateReview.mutate({
      id: review.id,
      risk_adjusted: adjusted,
      risk_adjustment_reason: reason || null,
      new_risk_level: newLevel || null,
    });
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid grid-cols-7 w-full">
        <TabsTrigger value="info">{t('spr.tabs.supplierInfo')}</TabsTrigger>
        <TabsTrigger value="kpi">{t('spr.tabs.performance')}</TabsTrigger>
        <TabsTrigger value="scoring">{t('spr.tabs.scoring')}</TabsTrigger>
        <TabsTrigger value="knockouts">{t('spr.tabs.knockouts')}</TabsTrigger>
        <TabsTrigger value="outcome">{t('spr.tabs.outcome')}</TabsTrigger>
        <TabsTrigger value="attachments">{t('spr.tabs.attachments')}</TabsTrigger>
        <TabsTrigger value="signoff">{t('spr.tabs.signoff')}</TabsTrigger>
      </TabsList>

      <div className="mt-4">
        <TabsContent value="info">
          <SupplierInfoTab review={review} kpiData={kpiData} />
        </TabsContent>
        <TabsContent value="kpi">
          <PerformanceTab reviewId={review.id} kpiData={kpiData} locked={locked} onKpiUpdate={() => {}} />
        </TabsContent>
        <TabsContent value="scoring">
          <ScoringTab reviewId={review.id} supplierCategory={review.supplier_category ?? 'rm_primary_pk'} locked={locked} />
        </TabsContent>
        <TabsContent value="knockouts">
          <KnockoutTab reviewId={review.id} locked={locked} />
        </TabsContent>
        <TabsContent value="outcome">
          <OutcomeTab review={review} locked={locked} onRiskAdjust={handleRiskAdjust} />
        </TabsContent>
        <TabsContent value="attachments">
          <AttachmentsTab reviewId={review.id} locked={locked} />
        </TabsContent>
        <TabsContent value="signoff">
          <SignoffTab review={review} onNavigate={onNavigate} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
