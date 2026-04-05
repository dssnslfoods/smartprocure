import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowLeft, Play, Square, SkipForward, Trophy, Clock, Users, TrendingDown } from 'lucide-react';

const statusColor: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  closed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
};

export default function BiddingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidForm, setBidForm] = useState({ supplier_id: '', bid_amount: '' });
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const fetchData = useCallback(async () => {
    const [evRes, bidRes, supRes] = await Promise.all([
      supabase.from('bidding_events').select('*, rfqs(title, rfq_number)').eq('id', id!).single(),
      supabase.from('bid_entries').select('*, suppliers(company_name)').eq('bidding_event_id', id!).order('bid_amount', { ascending: true }),
      supabase.from('suppliers').select('id, company_name').eq('status', 'approved'),
    ]);
    if (evRes.data) setEvent(evRes.data);
    if (bidRes.data) setBids(bidRes.data);
    if (supRes.data) setSuppliers(supRes.data);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time subscription for bids
  useEffect(() => {
    const channel = supabase
      .channel(`bids-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bid_entries', filter: `bidding_event_id=eq.${id}` }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  // Countdown timer
  useEffect(() => {
    if (!event || event.status !== 'active') return;
    const interval = setInterval(() => {
      const end = new Date(event.end_time).getTime();
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft('Ended');
        clearInterval(interval);
        // Auto-close
        supabase.from('bidding_events').update({ status: 'closed' }).eq('id', id!).then(() => fetchData());
      } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${h}h ${m}m ${s}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [event, id, fetchData]);

  const updateStatus = async (status: string) => {
    const { error } = await supabase.from('bidding_events').update({ status: status as any, updated_at: new Date().toISOString() }).eq('id', id!);
    if (error) toast.error(error.message);
    else { toast.success(`Event ${status}`); fetchData(); }
  };

  const advanceRound = async () => {
    if (!event) return;
    const next = (event.current_round || 1) + 1;
    if (next > (event.max_rounds || 99)) {
      toast.error('Maximum rounds reached');
      return;
    }
    const { error } = await supabase.from('bidding_events').update({ current_round: next, updated_at: new Date().toISOString() }).eq('id', id!);
    if (error) toast.error(error.message);
    else { toast.success(`Advanced to round ${next}`); fetchData(); }
  };

  const submitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bidForm.supplier_id || !bidForm.bid_amount) { toast.error('Select supplier and enter amount'); return; }
    setSubmitting(true);
    const { error } = await supabase.from('bid_entries').insert({
      bidding_event_id: id,
      supplier_id: bidForm.supplier_id,
      round_number: event?.current_round || 1,
      bid_amount: parseFloat(bidForm.bid_amount),
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success('Bid submitted'); setBidForm({ supplier_id: '', bid_amount: '' }); fetchData(); }
  };

  // Ranking per round
  const currentRound = event?.current_round || 1;
  const roundBids = bids.filter((b) => b.round_number === currentRound);
  const bestBidBySupplier = new Map<string, any>();
  roundBids.forEach((b) => {
    const existing = bestBidBySupplier.get(b.supplier_id);
    if (!existing || b.bid_amount < existing.bid_amount) bestBidBySupplier.set(b.supplier_id, b);
  });
  const ranked = Array.from(bestBidBySupplier.values()).sort((a, b) => a.bid_amount - b.bid_amount);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (!event) return <div className="p-8 text-center text-muted-foreground">Event not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/bidding')}><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <p className="text-sm text-muted-foreground">
              {event.rfqs ? `${event.rfqs.rfq_number} — ${event.rfqs.title}` : 'No linked RFQ'}
            </p>
          </div>
        </div>
        <Badge className={statusColor[event.status] || ''}>{event.status}</Badge>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Time Left</p>
              <p className="font-bold text-sm">{event.status === 'active' ? timeLeft || 'Calculating...' : '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Round</p>
              <p className="font-bold text-sm">{currentRound} / {event.max_rounds || '∞'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingDown className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Lowest Bid</p>
              <p className="font-bold text-sm">{ranked.length > 0 ? `$${ranked[0].bid_amount.toLocaleString()}` : '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Trophy className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Total Bids</p>
              <p className="font-bold text-sm">{bids.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action buttons */}
      {event.status !== 'closed' && event.status !== 'cancelled' && (
        <div className="flex gap-2">
          {event.status === 'scheduled' && (
            <Button onClick={() => updateStatus('active')} className="gap-2"><Play className="w-4 h-4" /> Start Auction</Button>
          )}
          {event.status === 'active' && (
            <>
              <Button onClick={advanceRound} variant="outline" className="gap-2"><SkipForward className="w-4 h-4" /> Next Round</Button>
              <Button onClick={() => updateStatus('closed')} variant="destructive" className="gap-2"><Square className="w-4 h-4" /> Close Auction</Button>
            </>
          )}
        </div>
      )}

      <Tabs defaultValue="ranking">
        <TabsList>
          <TabsTrigger value="ranking">Live Ranking</TabsTrigger>
          <TabsTrigger value="submit">Submit Bid</TabsTrigger>
          <TabsTrigger value="history">All Bids</TabsTrigger>
        </TabsList>

        {/* Ranking Tab */}
        <TabsContent value="ranking">
          <Card>
            <CardHeader><CardTitle className="text-base">Round {currentRound} — Ranking</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground w-16">Rank</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Bid Amount</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No bids yet for this round</td></tr>
                  ) : (
                    ranked.map((b, i) => (
                      <tr key={b.id} className={`border-b ${i === 0 ? 'bg-green-50 dark:bg-green-950/20' : 'hover:bg-muted/30'}`}>
                        <td className="p-3 font-bold">{i === 0 ? <span className="text-green-600">🏆 1</span> : i + 1}</td>
                        <td className="p-3 font-medium">{b.suppliers?.company_name || '—'}</td>
                        <td className="p-3 text-right font-mono font-semibold">${b.bid_amount.toLocaleString()}</td>
                        <td className="p-3 text-muted-foreground text-xs">{new Date(b.submitted_at).toLocaleTimeString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Submit Bid Tab */}
        <TabsContent value="submit">
          <Card>
            <CardHeader><CardTitle className="text-base">Submit a Bid</CardTitle></CardHeader>
            <CardContent>
              {event.status !== 'active' ? (
                <p className="text-muted-foreground text-sm">Bids can only be submitted while the auction is active.</p>
              ) : (
                <form onSubmit={submitBid} className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label>Supplier *</Label>
                    <Select value={bidForm.supplier_id} onValueChange={(v) => setBidForm({ ...bidForm, supplier_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Bid Amount (USD) *</Label>
                    <Input type="number" step="0.01" min="0" value={bidForm.bid_amount} onChange={(e) => setBidForm({ ...bidForm, bid_amount: e.target.value })} placeholder="Enter bid amount" />
                  </div>
                  <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Bid'}</Button>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle className="text-base">All Bids History</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Round</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No bids submitted</td></tr>
                  ) : (
                    bids.map((b) => (
                      <tr key={b.id} className="border-b hover:bg-muted/30">
                        <td className="p-3"><Badge variant="outline">R{b.round_number}</Badge></td>
                        <td className="p-3 font-medium">{b.suppliers?.company_name || '—'}</td>
                        <td className="p-3 text-right font-mono">${b.bid_amount.toLocaleString()}</td>
                        <td className="p-3 text-muted-foreground text-xs">{new Date(b.submitted_at).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
