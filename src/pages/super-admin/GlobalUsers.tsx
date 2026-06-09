import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  roles: string[];
}

export default function GlobalUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, tenant_id, tenants(name)')
        .order('created_at', { ascending: false });

      if (profiles) {
        const withRoles = await Promise.all(
          profiles.map(async (p: any) => {
            const { data: roles } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', p.id);
            return {
              id: p.id,
              email: p.email,
              full_name: p.full_name,
              tenant_id: p.tenant_id,
              tenant_name: (p.tenants as any)?.name ?? null,
              roles: roles?.map((r: any) => r.role) ?? [],
            };
          }),
        );
        setUsers(withRoles);
      }
      setLoading(false);
    };
    fetchUsers();
  }, []);

  const filtered = users.filter(
    (u) =>
      !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.tenant_name?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Users</h1>
        <p className="text-muted-foreground text-sm mt-1">View users across all tenants</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, email, or tenant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Email</th>
                  <th className="text-left p-3 font-medium">Tenant</th>
                  <th className="text-left p-3 font-medium">Roles</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-accent/50">
                    <td className="p-3">{u.full_name || '-'}</td>
                    <td className="p-3 text-muted-foreground">{u.email}</td>
                    <td className="p-3">
                      {u.tenant_name ? (
                        <Badge variant="outline">{u.tenant_name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No tenant</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        {u.roles.map((r) => (
                          <Badge
                            key={r}
                            variant={r === 'super_admin' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
