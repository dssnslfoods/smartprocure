import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Calculator, Trophy, AlertTriangle, CheckCircle, Send } from 'lucide-react';
import RiskBadge from '@/components/RiskBadge';
import { scoreQuotations } from '@/lib/scoring';
import type { ScoredQuotation } from '@/lib/scoring';
import { computeRfqBidRisk, type BidRiskResult } from '@/lib/bidRisk';
import { DIMENSION_LABEL } from '@/lib/riskCriteria';
import { ScoreInfo } from '@/components/ScoreFormulaTooltip';
import { loadScoringWeights, DEFAULT_SCORING_WEIGHTS } from '@/lib/scoringWeights';
import type { RiskLevel, ScoringWeights } from '@/types/procurement';

export default function RFQBidComparison() {
  const { id } = useParams<{ id: string }>();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [rfq, setRfq] = useState<any>(null);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, any>>({});
  const [scored, setScored] = useState<ScoredQuotation[]>([]);
  const [bidRisk, setBidRisk] = useState<BidRiskResult | null>(null);
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_SCORING_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sentToFQ, setSentToFQ] = useState<Set<string>>(new Set());
  const [sendingFQ, setSendingFQ] = useState<string | null>(null);

  const canManage = hasRole('admin') || hasRole('procurement_officer');

  useEffect(() => {
    const fetch = async () => {
      if (!id) return;
      const [rfqRes, qRes] = await Promise.all([
        supabase.from('rfqs').select('*').eq('id', id).single(),
        supabase.from('quotations')
          .select('*, suppliers(id, company_name, risk_level)')
          .eq('rfq_id', id)
          .order('created_at'),
      ]);
      if (rfqRes.data) setRfq(rfqRes.data);
      if (qRes.data) {
        setQuotations(qRes.data);
        const sm: Record<string, any> = {};
        qRes.data.forEach((q: any) => { if (q.suppliers) sm[q.supplier_id] = q.suppliers; });
        setSuppliers(sm);
        // BRC criteria-based risk for this RFQ's catalog categories.
        const [risk, w] = await Promise.all([
          computeRfqBidRisk(id, qRes.data.map((q: any) => q.supplier_id)),
          loadScoringWeights(),
        ]);
        setBidRisk(risk);
        setWeights(w);
        const override = risk.hasCriteria
          ? Object.fromEntries(Object.entries(risk.bySupplier).map(([sid, r]) => [sid, r.riskScore]))
          : undefined;
        const result = scoreQuotations(qRes.data, sm, w, override);
        setScored(result);
        const hasScores = qRes.data.some((q: any) => q.final_score != null);
        setSaved(hasScores);
      }
      setLoading(false);
    };
    fetch();
  }, [id]);

  // Check which quotations already sent to Final Quotation
  useEffect(() => {
    if (!id) return;
    const checkExisting = async () => {
      const { data } = await supabase
        .from('final_quotations')
        .select('quotation_id')
        .eq('rfq_id', id)
        .not('quotation_id', 'is', null);
      if (data) {
        setSentToFQ(new Set(data.map((d: any) => d.quotation_id)));
      }
    };
    checkExisting();
  }, [id]);

  const handleSendToFinalQuotation = async (q: any) => {
    if (!id || !user) return;
    setSendingFQ(q.id);
    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from('final_quotations')
        .select('id')
        .eq('rfq_id', id)
        .eq('quotation_id', q.id)
        .maybeSingle();

      if (existing) {
        toast({ title: 'มีอยู่แล้ว', description: 'ใบเสนอราคานี้ถูกส่งไป Final Quotation แล้ว', variant: 'destructive' });
        setSentToFQ(prev => new Set(prev).add(q.id));
        setSendingFQ(null);
        return;
      }

      const effectivePrice = (q.price ?? q.total_amount ?? 0) - (q.discount ?? 0);

      const { error } = await supabase.from('final_quotations').insert({
        rfq_id: id,
        supplier_id: q.supplier_id,
        quotation_id: q.id,
        total_amount: effectivePrice || q.total_amount,
        currency: q.currency || 'THB',
        payment_terms: q.payment_term || q.payment_terms || '',
        delivery_terms: q.delivery_terms || (q.lead_time_days ? `${q.lead_time_days} days` : ''),
        notes: `จาก RFQ ${rfq?.rfq_number || ''} — ${rfq?.title || ''} | Score: ${q.final_score ?? '—'}`,
        status: 'pending',
        created_by: user.id,
      });

      if (error) throw error;

      setSentToFQ(prev => new Set(prev).add(q.id));
      toast({
        title: 'ส่งไป Final Quotation แล้ว',
        description: `${suppliers[q.supplier_id]?.company_name} — สามารถไปเลือกและจัดการต่อได้ที่เมนู "ใบเสนอราคาสุดท้าย"`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSendingFQ(null);
  };

  const handleRunEvaluation = async () => {
    if (!id || !user) return;
    setSaving(true);

    for (const s of scored) {
      await supabase.from('quotations').update({
        commercial_score: s.commercial_score,
        technical_score: s.technical_score,
        risk_score: s.risk_score,
        final_score: s.final_score,
        rank: s.rank,
        evaluation_status: 'under_review',
        updated_at: new Date().toISOString(),
      }).eq('id', s.quotation_id);
    }

    const evalRows = scored.map(s => ({
      rfq_id: id,
      quotation_id: s.quotation_id,
      supplier_id: s.supplier_id,
      commercial_weight: weights.commercial,
      technical_weight: weights.technical,
      risk_weight: weights.risk,
      price_score: s.price_score,
      lead_time_score: s.lead_time_score,
      payment_term_score: s.payment_term_score,
      commercial_score: s.commercial_score,
      technical_score: s.technical_score,
      risk_score: s.risk_score,
      final_score: s.final_score,
      rank: s.rank,
      is_recommended_winner: s.is_recommended_winner,
      warnings: s.warnings,
      evaluated_by: user.id,
      evaluated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }));

    await supabase.from('rfq_evaluations').insert(evalRows);

    await supabase.from('rfqs').update({
      workflow_status: 'under_evaluation',
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    await supabase.rpc('write_audit_log', {
      _entity_type: 'rfq',
      _entity_id: id,
      _action: 'evaluation_scores_calculated',
      _new_values: { quotation_count: scored.length },
    }).maybeSingle();

    setSaving(false);
    setSaved(true);
    toast({ title: 'Evaluation complete', description: `Scores saved for ${scored.length} quotation(s).` });
  };

  const handleRecommendWinner = () => {
    navigate(`/rfq/${id}/award-approval`);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  if (!rfq) return <div className="text-center py-16 text-muted-foreground">RFQ not found</div>;

  const winner = scored.find(s => s.is_recommended_winner);
  const winnerSupplier = winner ? suppliers[winner.supplier_id] : null;
  const globalWarnings = scored.flatMap(s => s.warnings.filter(w => w.includes('Lowest price')));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/rfq/${id}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Bid Comparison</h1>
          <p className="text-sm text-muted-foreground">{rfq.rfq_number} · {rfq.title}</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRunEvaluation} disabled={saving || quotations.length === 0}>
              <Calculator className="w-4 h-4 mr-2" />
              {saving ? 'Calculating...' : 'Run Evaluation'}
            </Button>
            {saved && (
              <Button onClick={handleRecommendWinner}>
                <Trophy className="w-4 h-4 mr-2" />
                Recommend Winner
              </Button>
            )}
          </div>
        )}
      </div>

      {globalWarnings.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-orange-200 bg-orange-50">
          <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-orange-800">Best Value Warning</p>
            {globalWarnings.map((w, i) => (
              <p key={i} className="text-sm text-orange-700 mt-0.5">{w}</p>
            ))}
          </div>
        </div>
      )}

      {winner && winnerSupplier && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Trophy className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Recommended Winner</p>
              <p className="text-lg font-bold text-emerald-800">{winnerSupplier.company_name}</p>
              <p className="text-sm text-emerald-700">
                Final Score: <span className="font-bold">{winner.final_score}</span> · Rank #1
                {winner.warnings.length > 0 && <span className="ml-2 text-orange-600">⚠ Has warnings</span>}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle className="w-3.5 h-3.5" />
        Scoring formula: Commercial {weights.commercial}% + Technical {weights.technical}% + Risk {weights.risk}%
      </div>

      {quotations.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No quotations submitted yet for this RFQ.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground min-w-[160px]">Supplier</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Price</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Discount</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Net Price</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Lead Time</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Payment</th>
                <th className="text-center p-3 font-medium text-muted-foreground">Risk</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Spec %</th>
                <th className="text-right p-3 font-medium text-muted-foreground bg-blue-50 whitespace-nowrap">Commercial<ScoreInfo k="commercial" weights={weights} /></th>
                <th className="text-right p-3 font-medium text-muted-foreground bg-purple-50 whitespace-nowrap">Technical<ScoreInfo k="technical" weights={weights} /></th>
                <th className="text-right p-3 font-medium text-muted-foreground bg-orange-50 whitespace-nowrap">Risk Score<ScoreInfo k="risk" weights={weights} /></th>
                <th className="text-right p-3 font-medium text-muted-foreground bg-emerald-50 whitespace-nowrap">Final Score<ScoreInfo k="final" weights={weights} /></th>
                <th className="text-center p-3 font-medium text-muted-foreground">Rank</th>
                {canManage && <th className="text-center p-3 font-medium text-muted-foreground">Action</th>}
              </tr>
            </thead>
            <tbody>
              {scored.map(s => {
                const q = quotations.find(q => q.id === s.quotation_id);
                if (!q) return null;
                const sup = suppliers[s.supplier_id];
                const isWinner = s.is_recommended_winner;
                const hasWarn = s.warnings.length > 0;

                return (
                  <tr
                    key={s.quotation_id}
                    className={`border-b transition-colors ${
                      isWinner && !hasWarn
                        ? 'bg-emerald-50/60 hover:bg-emerald-50'
                        : isWinner && hasWarn
                        ? 'bg-orange-50/60 hover:bg-orange-50'
                        : 'hover:bg-muted/30'
                    }`}
                  >
                    <td className="p-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          {isWinner && <Trophy className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                          <span className="font-medium">{sup?.company_name || '—'}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{q.quotation_no || q.id.slice(0, 8)}</p>
                        {hasWarn && (
                          <div className="mt-1 space-y-0.5">
                            {s.warnings.map((w, i) => (
                              <p key={i} className="text-xs text-orange-600 flex items-start gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{w}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {q.price != null ? (q.price as number).toLocaleString() : (q.total_amount as number)?.toLocaleString() || '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {q.discount ? (q.discount as number).toLocaleString() : '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium">
                      {s.effective_price > 0 ? s.effective_price.toLocaleString() : '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {q.lead_time_days ? `${q.lead_time_days}d` : '—'}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs max-w-[100px] truncate">
                      {q.payment_term || q.payment_terms || '—'}
                    </td>
                    <td className="p-3 text-center">
                      {(() => {
                        const r = bidRisk?.bySupplier[s.supplier_id];
                        if (bidRisk?.hasCriteria && r) {
                          const failing = Object.values(r.dims)
                            .filter(d => d.score != null && (d.mandatoryUnmet || (d.score as number) >= 6))
                            .map(d => `${DIMENSION_LABEL[d.dimension] || d.dimension}: ${d.score}/10`);
                          return (
                            <div className="flex flex-col items-center gap-0.5" title={failing.length ? `จุดเสี่ยง — ${failing.join(' · ')}` : 'ผ่านเกณฑ์ความเสี่ยงทุกด้าน'}>
                              <RiskBadge level={r.level} />
                              {r.assessed && <span className="text-[10px] text-muted-foreground">BRC {r.risk10.toFixed(1)}/10</span>}
                            </div>
                          );
                        }
                        return <RiskBadge level={sup?.risk_level as RiskLevel} />;
                      })()}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {q.spec_compliance_score != null ? `${q.spec_compliance_score}%` : '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium bg-blue-50/50">
                      <ScoreCell value={s.commercial_score} />
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium bg-purple-50/50">
                      <ScoreCell value={s.technical_score} />
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium bg-orange-50/50">
                      <ScoreCell value={s.risk_score} />
                    </td>
                    <td className="p-3 text-right tabular-nums font-bold text-base bg-emerald-50/50">
                      <ScoreCell value={s.final_score} highlight />
                    </td>
                    <td className="p-3 text-center">
                      <RankBadge rank={s.rank} />
                    </td>
                    {canManage && (
                      <td className="p-3 text-center">
                        {sentToFQ.has(q.id) ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle className="w-3.5 h-3.5" /> ส่งแล้ว
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={sendingFQ === q.id}
                            onClick={() => handleSendToFinalQuotation(q)}
                            className="text-xs"
                          >
                            <Send className="w-3.5 h-3.5 mr-1" />
                            {sendingFQ === q.id ? 'กำลังส่ง...' : 'ส่ง Final'}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Scoring Methodology</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p><strong>Commercial ({weights.commercial}%)</strong> = Price 60% + Lead Time 30% + Payment Term 10%</p>
          <p><strong>Technical ({weights.technical}%)</strong> = Specification Compliance Score</p>
          {bidRisk?.hasCriteria ? (
            <p><strong>Risk ({weights.risk}%)</strong> = คะแนนจากเกณฑ์ความเสี่ยง (BRC) ของหมวด catalog ที่ดึง item มา
              {bidRisk.categories.length > 0 && <span className="text-xs"> — หมวด: {bidRisk.categories.join(', ')}</span>}
              {' '}(คะแนน 10/10 = เสี่ยงสูงสุด → risk score 0)</p>
          ) : (
            <p><strong>Risk ({weights.risk}%)</strong> = Low 100 · Medium 75 · High 50 · Critical 0 <span className="text-xs">(ยังไม่มีเกณฑ์ความเสี่ยงในหมวดนี้ — ใช้ระดับความเสี่ยงรวมของ supplier)</span></p>
          )}
          <p><strong>Final Score</strong> = Commercial × {(weights.commercial / 100).toFixed(2)} + Technical × {(weights.technical / 100).toFixed(2)} + Risk × {(weights.risk / 100).toFixed(2)}</p>
          <p className="text-xs mt-2">Lower price → higher price score (min price ÷ candidate price × 100)</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreCell({ value, highlight = false }: { value: number; highlight?: boolean }) {
  const color =
    value >= 80 ? 'text-emerald-700' :
    value >= 60 ? 'text-blue-700'    :
    value >= 40 ? 'text-yellow-700'  :
                  'text-red-700';
  return <span className={`${color} ${highlight ? 'text-lg' : ''}`}>{value}</span>;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 text-white text-xs font-bold">#1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-400 text-white text-xs font-bold">#2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-white text-xs font-bold">#3</span>;
  return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs font-bold">#{rank}</span>;
}
