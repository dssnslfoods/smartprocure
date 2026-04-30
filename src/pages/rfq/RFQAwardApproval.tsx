import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, CheckCircle2, XCircle, Clock, Trophy, AlertTriangle, RefreshCw } from 'lucide-react';
import RiskBadge from '@/components/RiskBadge';
import { checkSupplierEligibility } from '@/lib/eligibility';
import type { ApprovalLevel, ApprovalDecision, RiskLevel } from '@/types/procurement';

interface ApprovalRow {
  id: string;
  approval_level: ApprovalLevel;
  approver_role: string | null;
  approver_id: string | null;
  approval_status: ApprovalDecision;
  approval_comment: string | null;
  level_order: number;
  required: boolean;
  approved_at: string | null;
  profiles?: { full_name: string | null; email: string | null };
}

const LEVEL_LABELS: Record<ApprovalLevel, string> = {
  buyer:               'Buyer Recommendation',
  procurement_manager: 'Procurement Manager',
  qa:                  'QA Approval',
  finance:             'Finance Approval',
  director:            'Director Approval',
};

const LEVEL_ORDER: ApprovalLevel[] = ['buyer', 'procurement_manager', 'qa', 'finance', 'director'];

function buildApprovalChain(
  supplier: any,
  quotation: any,
  financeThreshold: number,
): { level: ApprovalLevel; order: number; required: boolean }[] {
  const needsQa =
    supplier?.risk_level === 'high' ||
    supplier?.risk_level === 'critical' ||
    supplier?.supplier_type === 'nominated' ||
    (supplier?.certificate_expiry_date && new Date(supplier.certificate_expiry_date) < new Date());

  const amount = quotation?.final_amount ?? quotation?.total_amount ?? 0;
  const needsFinance = amount > financeThreshold;

  return [
    { level: 'buyer',               order: 1, required: true },
    { level: 'procurement_manager', order: 2, required: true },
    { level: 'qa',                  order: 3, required: !!needsQa },
    { level: 'finance',             order: 4, required: !!needsFinance },
    { level: 'director',            order: 5, required: true },
  ].filter(l => l.required);
}

export default function RFQAwardApproval() {
  const { id } = useParams<{ id: string }>();
  const { user, hasRole, roles } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [rfq, setRfq] = useState<any>(null);
  const [recommendedQuotation, setRecommendedQuotation] = useState<any>(null);
  const [supplier, setSupplier] = useState<any>(null);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [financeThreshold, setFinanceThreshold] = useState(50000);
  const [loading, setLoading] = useState(true);
  const [initiating, setInitiating] = useState(false);
  const [commenting, setCommenting] = useState<Record<string, string>>({});
  const [acting, setActing] = useState(false);

  const canManage = hasRole('admin') || hasRole('procurement_officer');

  const fetchAll = async () => {
    if (!id) return;

    const [rfqRes, settingsRes] = await Promise.all([
      supabase.from('rfqs').select('*').eq('id', id).single(),
      supabase.from('system_settings').select('value').eq('key', 'procurement_config').maybeSingle(),
    ]);

    if (rfqRes.data) setRfq(rfqRes.data);
    if (settingsRes.data?.value) {
      const threshold = (settingsRes.data.value as any)?.finance_approval_threshold ?? 50000;
      setFinanceThreshold(threshold);
    }

    const [evalRes, approvalRes] = await Promise.all([
      supabase.from('rfq_evaluations')
        .select('*, quotations(*, suppliers(*))')
        .eq('rfq_id', id)
        .eq('is_recommended_winner', true)
        .order('evaluated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('award_approvals')
        .select('*, profiles:approver_id(full_name, email)')
        .eq('rfq_id', id)
        .order('level_order'),
    ]);

    if (evalRes.data) {
      const q = evalRes.data.quotations as any;
      setRecommendedQuotation(q);
      setSupplier(q?.suppliers);
    } else {
      const qRes = await supabase.from('quotations')
        .select('*, suppliers(*)')
        .eq('rfq_id', id)
        .eq('rank', 1)
        .maybeSingle();
      if (qRes.data) {
        setRecommendedQuotation(qRes.data);
        setSupplier((qRes.data as any).suppliers);
      }
    }

    if (approvalRes.data) setApprovals(approvalRes.data as ApprovalRow[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [id]);

  const handleInitiate = async () => {
    if (!id || !user || !recommendedQuotation || !supplier) return;
    setInitiating(true);

    const chain = buildApprovalChain(supplier, recommendedQuotation, financeThreshold);
    const rows = chain.map(c => ({
      rfq_id: id,
      recommended_supplier_id: supplier.id,
      quotation_id: recommendedQuotation.id,
      approval_level: c.level,
      approver_role: null,
      approver_id: null,
      approval_status: c.level === 'buyer' ? 'approved' : 'pending',
      approval_comment: c.level === 'buyer' ? 'Buyer submitted recommendation.' : null,
      level_order: c.order,
      required: c.required,
      approved_at: c.level === 'buyer' ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('award_approvals').insert(rows);

    if (!error) {
      await supabase.from('rfqs').update({
        workflow_status: 'pending_approval',
        updated_at: new Date().toISOString(),
      }).eq('id', id);

      await supabase.rpc('write_audit_log', {
        _entity_type: 'rfq',
        _entity_id: id,
        _action: 'award_approval_initiated',
        _new_values: { supplier_id: supplier.id, quotation_id: recommendedQuotation.id },
      }).maybeSingle();

      toast({ title: 'Approval workflow initiated', description: `${rows.length} approval level(s) created.` });
      fetchAll();
    } else {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setInitiating(false);
  };

  const handleDecision = async (approval: ApprovalRow, decision: 'approved' | 'rejected') => {
    setActing(true);
    const comment = commenting[approval.id] || '';

    const { error } = await supabase.from('award_approvals').update({
      approval_status: decision,
      approver_id: user?.id,
      approval_comment: comment || null,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', approval.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setActing(false);
      return;
    }

    await supabase.rpc('write_audit_log', {
      _entity_type: 'award_approval',
      _entity_id: approval.id,
      _action: `approval_${decision}`,
      _new_values: { level: approval.approval_level, comment },
    }).maybeSingle();

    if (decision === 'rejected') {
      await supabase.from('rfqs').update({
        workflow_status: 'under_evaluation',
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      toast({ title: 'Approval rejected', description: 'RFQ returned to evaluation stage.' });
      setActing(false);
      fetchAll();
      return;
    }

    const { data: allApprovals } = await supabase
      .from('award_approvals')
      .select('approval_level, approval_status, required, level_order')
      .eq('rfq_id', id!);

    const allApproved = (allApprovals || [])
      .filter(a => a.required)
      .every(a => a.approval_status === 'approved' || a.approval_level === approval.approval_level);

    if (allApproved) {
      await confirmAward();
    } else {
      toast({ title: 'Approved', description: `Level "${LEVEL_LABELS[approval.approval_level]}" approved.` });
    }

    setActing(false);
    fetchAll();
  };

  const confirmAward = async () => {
    if (!id || !recommendedQuotation || !supplier) return;

    const awardNo = 'AWD-' + Date.now().toString().slice(-6);
    const { error } = await supabase.from('awards').insert({
      rfq_id: id,
      supplier_id: supplier.id,
      winning_quotation_id: recommendedQuotation.id,
      award_no: awardNo,
      award_reason: 'Best value: highest final score after commercial, technical, and risk evaluation.',
      final_amount: recommendedQuotation.total_amount ?? recommendedQuotation.price,
      amount: recommendedQuotation.total_amount ?? recommendedQuotation.price,
      status: 'approved',
      award_lifecycle_status: 'awarded',
      awarded_at: new Date().toISOString(),
      awarded_by: user?.id,
      recommendation: `Awarded to ${supplier.company_name} via Best Value scoring.`,
      ready_for_po: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) { toast({ title: 'Error creating award', description: error.message, variant: 'destructive' }); return; }

    await Promise.all([
      supabase.from('quotations').update({ evaluation_status: 'awarded', updated_at: new Date().toISOString() }).eq('id', recommendedQuotation.id),
      supabase.from('quotations').update({ evaluation_status: 'not_awarded', updated_at: new Date().toISOString() }).eq('rfq_id', id).neq('id', recommendedQuotation.id),
      supabase.from('rfqs').update({ status: 'awarded' as any, workflow_status: 'awarded', updated_at: new Date().toISOString() }).eq('id', id),
    ]);

    await supabase.rpc('write_audit_log', {
      _entity_type: 'award',
      _entity_id: id,
      _action: 'award_confirmed',
      _new_values: { award_no: awardNo, supplier_id: supplier.id },
    }).maybeSingle();

    toast({ title: '🎉 Award Confirmed!', description: `${awardNo} issued to ${supplier.company_name}.` });
    navigate('/awards');
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  if (!rfq) return <div className="text-center py-16 text-muted-foreground">RFQ not found</div>;

  const eligibility = supplier ? checkSupplierEligibility(supplier) : null;
  const isInitiated = approvals.length > 0;
  const allApproved = isInitiated && approvals.filter(a => a.required).every(a => a.approval_status === 'approved');
  const isRejected = approvals.some(a => a.approval_status === 'rejected');
  const currentPendingLevel = approvals.find(a => a.approval_status === 'pending');

  const canActOnLevel = (a: ApprovalRow) => {
    if (a.approval_status !== 'pending') return false;
    if (!currentPendingLevel || currentPendingLevel.id !== a.id) return false;
    return hasRole('admin') || hasRole('approver') || hasRole('procurement_officer');
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link to={`/rfq/${id}/comparison`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Award Approval</h1>
          <p className="text-sm text-muted-foreground">{rfq.rfq_number} · {rfq.title}</p>
        </div>
      </div>

      {!recommendedQuotation ? (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
            <p className="text-sm text-orange-800">No recommended winner found. Run evaluation on the Bid Comparison page first.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Trophy className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Recommended Winner</p>
              <p className="text-lg font-bold">{supplier?.company_name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <RiskBadge level={supplier?.risk_level as RiskLevel} />
                <span className="text-sm text-muted-foreground">
                  Final Score: <strong>{recommendedQuotation.final_score ?? '—'}</strong>
                  {' · '}Amount: <strong>{recommendedQuotation.currency || ''} {((recommendedQuotation.total_amount ?? recommendedQuotation.price) as number)?.toLocaleString() || '—'}</strong>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {eligibility && eligibility.reasons.length > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-orange-200 bg-orange-50">
          <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-orange-800">Eligibility Warnings</p>
            {eligibility.reasons.map((r, i) => <p key={i} className="text-xs text-orange-700">{r}</p>)}
          </div>
        </div>
      )}

      {!isInitiated && recommendedQuotation && canManage && (
        <Button onClick={handleInitiate} disabled={initiating}>
          {initiating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Trophy className="w-4 h-4 mr-2" />}
          {initiating ? 'Initiating...' : 'Initiate Approval Workflow'}
        </Button>
      )}

      {isInitiated && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Approval Chain
              {allApproved && <span className="text-xs font-normal text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">Fully Approved</span>}
              {isRejected && <span className="text-xs font-normal text-red-600 bg-red-500/10 px-2 py-0.5 rounded-full">Rejected</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-0">
              {approvals.map((a, idx) => {
                const isLast = idx === approvals.length - 1;
                const statusIcon =
                  a.approval_status === 'approved' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> :
                  a.approval_status === 'rejected' ? <XCircle className="w-5 h-5 text-red-600" /> :
                  a.approval_status === 'skipped'  ? <CheckCircle2 className="w-5 h-5 text-muted-foreground" /> :
                  <Clock className="w-5 h-5 text-muted-foreground" />;

                const rowBg =
                  a.approval_status === 'approved' ? 'border-emerald-200 bg-emerald-50/30' :
                  a.approval_status === 'rejected' ? 'border-red-200 bg-red-50/30' :
                  a.approval_status === 'pending' && canActOnLevel(a) ? 'border-blue-200 bg-blue-50/30' :
                  'border-muted bg-muted/10';

                return (
                  <div key={a.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="mt-4">{statusIcon}</div>
                      {!isLast && <div className="w-0.5 h-full bg-border mt-1" />}
                    </div>
                    <div className={`flex-1 mb-3 p-4 rounded-lg border ${rowBg}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{LEVEL_LABELS[a.approval_level]}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {a.approval_status === 'approved' && a.approved_at
                              ? `Approved ${new Date(a.approved_at).toLocaleString()}`
                              : a.approval_status === 'rejected' && a.approved_at
                              ? `Rejected ${new Date(a.approved_at).toLocaleString()}`
                              : a.approval_status === 'pending'
                              ? 'Awaiting approval'
                              : a.approval_status}
                          </p>
                          {a.approval_comment && (
                            <p className="text-xs mt-1 italic text-muted-foreground">"{a.approval_comment}"</p>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          a.approval_status === 'approved' ? 'bg-emerald-500/10 text-emerald-700' :
                          a.approval_status === 'rejected' ? 'bg-red-500/10 text-red-700' :
                          a.approval_status === 'pending'  ? 'bg-yellow-500/10 text-yellow-700' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {a.approval_status}
                        </span>
                      </div>

                      {canActOnLevel(a) && (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            placeholder="Comment (optional)..."
                            rows={2}
                            className="text-xs"
                            value={commenting[a.id] || ''}
                            onChange={e => setCommenting(p => ({ ...p, [a.id]: e.target.value }))}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" disabled={acting} onClick={() => handleDecision(a, 'approved')}
                              className="bg-emerald-600 hover:bg-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="destructive" disabled={acting} onClick={() => handleDecision(a, 'rejected')}>
                              <XCircle className="w-3.5 h-3.5 mr-1" />Reject
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {allApproved && (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-emerald-800">All approvals complete</p>
              <p className="text-sm text-emerald-700">Award can now be confirmed and issued.</p>
            </div>
            {canManage && (
              <Button className="bg-emerald-600 hover:bg-emerald-700 shrink-0" onClick={confirmAward}>
                <Trophy className="w-4 h-4 mr-2" />Confirm Award
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
