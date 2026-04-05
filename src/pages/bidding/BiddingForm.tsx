import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

export default function BiddingForm() {
  const navigate = useNavigate();
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    rfq_id: '',
    start_time: '',
    end_time: '',
    max_rounds: 3,
  });

  useEffect(() => {
    supabase.from('rfqs').select('id, title, rfq_number').eq('status', 'published').then(({ data }) => {
      if (data) setRfqs(data);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.start_time || !form.end_time) {
      toast.error('Please fill required fields');
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('bidding_events').insert({
      title: form.title,
      description: form.description || null,
      rfq_id: form.rfq_id || null,
      start_time: form.start_time,
      end_time: form.end_time,
      max_rounds: form.max_rounds,
      current_round: 1,
      status: 'scheduled',
      created_by: user?.id,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Bidding event created');
      navigate('/bidding');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/bidding')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create Bidding Event</h1>
          <p className="text-sm text-muted-foreground">Set up a reverse auction</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Rice Supply Q3 Auction" />
              </div>
              <div className="space-y-2">
                <Label>Linked RFQ</Label>
                <Select value={form.rfq_id} onValueChange={(v) => setForm({ ...form, rfq_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Optional — link to RFQ" /></SelectTrigger>
                  <SelectContent>
                    {rfqs.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.rfq_number} — {r.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start Time *</Label>
                <Input type="datetime-local" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Time *</Label>
                <Input type="datetime-local" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Max Rounds</Label>
                <Input type="number" min={1} max={20} value={form.max_rounds} onChange={(e) => setForm({ ...form, max_rounds: parseInt(e.target.value) || 1 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Auction rules, requirements, etc." rows={3} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Event'}</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/bidding')}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
