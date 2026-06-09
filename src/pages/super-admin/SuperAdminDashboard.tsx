import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building, Users, Shield, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Stats {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  totalSuppliers: number;
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats>({ totalTenants: 0, activeTenants: 0, totalUsers: 0, totalSuppliers: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [tenantsRes, usersRes, suppliersRes] = await Promise.all([
        supabase.from('tenants').select('id, is_active'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('suppliers').select('id', { count: 'exact', head: true }),
      ]);

      const tenants = tenantsRes.data ?? [];
      setStats({
        totalTenants: tenants.length,
        activeTenants: tenants.filter((t) => t.is_active).length,
        totalUsers: usersRes.count ?? 0,
        totalSuppliers: suppliersRes.count ?? 0,
      });
      setLoading(false);
    };
    fetchStats();
  }, []);

  const cards = [
    { title: 'Total Tenants',    value: stats.totalTenants,   icon: Building, color: 'text-blue-600' },
    { title: 'Active Tenants',   value: stats.activeTenants,  icon: Activity, color: 'text-green-600' },
    { title: 'Total Users',      value: stats.totalUsers,     icon: Users,    color: 'text-purple-600' },
    { title: 'Total Suppliers',  value: stats.totalSuppliers, icon: Shield,   color: 'text-orange-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Overview of all tenants and system status</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {loading ? <span className="animate-pulse">--</span> : c.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
