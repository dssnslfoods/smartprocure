import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';

const statusColor: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  closed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
};

export default function BiddingPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    supabase.from('bidding_events').select('*, rfqs(title)').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setEvents(data);
      setLoading(false);
    });
  }, []);

  const filtered = events.filter(e => {
    const matchesSearch = e.title?.toLowerCase().includes(search.toLowerCase()) ||
      e.rfqs?.title?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pagination = usePagination(filtered, { pageSize: 20 });
  const statuses = [...new Set(events.map(e => e.status).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">e-Bidding</h1>
          <p className="text-sm text-muted-foreground">Reverse auction events</p>
        </div>
        <Button onClick={() => navigate('/bidding/new')} className="gap-2"><Plus className="w-4 h-4" /> New Auction</Button>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search bidding events..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">Event</th>
                <th className="text-left p-3 font-medium text-muted-foreground">RFQ</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Start</th>
                <th className="text-left p-3 font-medium text-muted-foreground">End</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Round</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : pagination.paginatedItems.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No bidding events found</td></tr>
              ) : (
                pagination.paginatedItems.map((e) => (
                  <tr key={e.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/bidding/${e.id}`)}>
                    <td className="p-3 font-medium text-primary hover:underline">{e.title || 'Untitled'}</td>
                    <td className="p-3 text-muted-foreground">{e.rfqs?.title || '—'}</td>
                    <td className="p-3 text-muted-foreground">{e.start_time ? new Date(e.start_time).toLocaleString() : '—'}</td>
                    <td className="p-3 text-muted-foreground">{e.end_time ? new Date(e.end_time).toLocaleString() : '—'}</td>
                    <td className="p-3">{e.current_round || 1} / {e.max_rounds || '∞'}</td>
                    <td className="p-3"><Badge className={statusColor[e.status] || ''} variant="secondary">{e.status}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <PaginationControls {...pagination} />
        </CardContent>
      </Card>
    </div>
  );
}
