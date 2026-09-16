import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from '@/i18n';
import { useReview, useKpiSnapshot, useUpdateReview, useScores, useReviewKnockouts, useAttachments, useCriteria } from '../../hooks/useReviews';
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

type TabStatus = 'none' | 'complete' | 'issue';

function TabIndicator({ status }: { status: TabStatus }) {
  if (status === 'complete') return <span className="ml-1 text-green-600 text-xs">✓</span>;
  if (status === 'issue') return <span className="ml-1 text-amber-600 text-xs">!</span>;
  return null;
}

export function ReviewFormTabs({ reviewId, onNavigate }: Props) {
  const { t } = useTranslation();
  const { data: review, isLoading } = useReview(reviewId);
  const { data: kpiSnapshot } = useKpiSnapshot(reviewId);
  const { data: scores = [] } = useScores(reviewId);
  const { data: knockouts = [] } = useReviewKnockouts(reviewId);
  const { data: attachments = [] } = useAttachments(reviewId);
  const updateReview = useUpdateReview();
  const [activeTab, setActiveTab] = useState('info');

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!review) return <div className="p-8 text-center">Review not found</div>;

  const locked = review.locked || review.status === 'APPROVED';
  const kpiData = (kpiSnapshot?.data ?? null) as KpiData | null;

  const tabStatuses: Record<string, TabStatus> = useMemo(() => {
    const hasKpi = !!kpiSnapshot;
    const hasScores = scores.length > 0;
    const hasKnockouts = knockouts.length > 0;
    const knockoutFailed = knockouts.some((k: any) => k.result === 'FAIL');
    const hasAttachments = attachments.length > 0;
    const isSubmitted = review.status === 'SUBMITTED' || review.status === 'APPROVED';

    return {
      info: 'complete',
      kpi: hasKpi ? 'complete' : 'none',
      scoring: hasScores ? 'complete' : (review.status !== 'DRAFT' ? 'issue' : 'none'),
      knockouts: hasKnockouts ? (knockoutFailed ? 'issue' : 'complete') : 'none',
      outcome: review.final_score != null ? 'complete' : 'none',
      attachments: hasAttachments ? 'complete' : 'none',
      signoff: isSubmitted ? 'complete' : 'none',
    };
  }, [kpiSnapshot, scores, knockouts, attachments, review]);

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
        <TabsTrigger value="info">{t('spr.tabs.supplierInfo')}<TabIndicator status={tabStatuses.info} /></TabsTrigger>
        <TabsTrigger value="kpi">{t('spr.tabs.performance')}<TabIndicator status={tabStatuses.kpi} /></TabsTrigger>
        <TabsTrigger value="scoring">{t('spr.tabs.scoring')}<TabIndicator status={tabStatuses.scoring} /></TabsTrigger>
        <TabsTrigger value="knockouts">{t('spr.tabs.knockouts')}<TabIndicator status={tabStatuses.knockouts} /></TabsTrigger>
        <TabsTrigger value="outcome">{t('spr.tabs.outcome')}<TabIndicator status={tabStatuses.outcome} /></TabsTrigger>
        <TabsTrigger value="attachments">{t('spr.tabs.attachments')}<TabIndicator status={tabStatuses.attachments} /></TabsTrigger>
        <TabsTrigger value="signoff">{t('spr.tabs.signoff')}<TabIndicator status={tabStatuses.signoff} /></TabsTrigger>
      </TabsList>

      <div className="mt-4">
        <TabsContent value="info">
          <SupplierInfoTab review={review} kpiData={kpiData} />
        </TabsContent>
        <TabsContent value="kpi">
          <PerformanceTab
            reviewId={review.id}
            kpiData={kpiData}
            locked={locked}
            reviewDate={review.period_end}
            supplierCategory={review.supplier_category}
            onKpiUpdate={() => {}}
          />
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
