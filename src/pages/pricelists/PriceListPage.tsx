import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export default function PriceListPage() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { hasRole } = useAuth();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('price_lists').select('*, suppliers(company_name)').order('created_at', { ascending: false });
      if (data) setItems(data);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = items.filter((i) =>
    i.suppliers?.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    i.title?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Price Lists</h1>
          <p className="text-sm text-muted-foreground">Supplier pricing submissions</p>
        </div>
        {(hasRole('supplier') || hasRole('admin')) && (
          <Button><Plus className="w-4 h-4 mr-2" />Submit Price List</Button>
        )}
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Valid Until</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No price lists found</td></tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{item.title}</td>
                    <td className="p-3 text-muted-foreground">{item.suppliers?.company_name || '—'}</td>
                    <td className="p-3 text-muted-foreground">{item.valid_until ? new Date(item.valid_until).toLocaleDateString() : '—'}</td>
                    <td className="p-3"><Badge variant="secondary">{item.status}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
