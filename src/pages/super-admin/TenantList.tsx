import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Building, Users, ExternalLink } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  user_count?: number;
}

export default function TenantList() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTenants = async () => {
      const { data } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        // Get user counts per tenant
        const withCounts = await Promise.all(
          data.map(async (t) => {
            const { count } = await supabase
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', t.id);
            return { ...t, user_count: count ?? 0 };
          }),
        );
        setTenants(withCounts);
      }
      setLoading(false);
    };
    fetchTenants();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage companies and their module access</p>
        </div>
        <Link to="/super-admin/tenants/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" /> Create Tenant
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tenants.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No tenants yet. Create your first tenant to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tenants.map((t) => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center justify-between py-4 px-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{t.name}</h3>
                    <p className="text-xs text-muted-foreground">slug: {t.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span>{t.user_count} users</span>
                  </div>
                  <Badge variant={t.is_active ? 'default' : 'secondary'}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Link to={`/super-admin/tenants/${t.id}`}>
                    <Button variant="outline" size="sm">
                      <ExternalLink className="w-4 h-4 mr-1" /> Manage
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
