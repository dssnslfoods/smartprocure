import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Search, Building2, Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  roles: string[];
}

interface TenantOption {
  id: string;
  name: string;
  is_active: boolean;
}

export default function GlobalUsers() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  // user_id -> set of tenant_ids they have access to
  const [accessMap, setAccessMap] = useState<Record<string, Set<string>>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Manage-tenants dialog state
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editSelection, setEditSelection] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [profilesRes, tenantsRes, accessRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, full_name, tenant_id, tenants(name)')
        .order('created_at', { ascending: false }),
      supabase.from('tenants').select('id, name, is_active').order('name'),
      supabase.from('user_tenant_access').select('user_id, tenant_id'),
    ]);

    if (tenantsRes.data) setTenants(tenantsRes.data as TenantOption[]);

    const map: Record<string, Set<string>> = {};
    accessRes.data?.forEach((a: any) => {
      (map[a.user_id] ??= new Set()).add(a.tenant_id);
    });
    setAccessMap(map);

    if (profilesRes.data) {
      const withRoles = await Promise.all(
        profilesRes.data.map(async (p: any) => {
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
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openManage = (u: UserRow) => {
    setEditUser(u);
    setEditSelection(new Set(accessMap[u.id] ?? []));
  };

  const toggleTenant = (tenantId: string) => {
    setEditSelection((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  };

  const saveAccess = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      const current = accessMap[editUser.id] ?? new Set<string>();
      const target = editSelection;
      const toAdd = [...target].filter((t) => !current.has(t));
      const toRemove = [...current].filter((t) => !target.has(t));

      const { data: { user } } = await supabase.auth.getUser();

      if (toAdd.length > 0) {
        const { error } = await supabase.from('user_tenant_access').insert(
          toAdd.map((tenant_id) => ({
            user_id: editUser.id,
            tenant_id,
            granted_by: user?.id,
          })),
        );
        if (error) throw error;
      }

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('user_tenant_access')
          .delete()
          .eq('user_id', editUser.id)
          .in('tenant_id', toRemove);
        if (error) throw error;
      }

      // Role sync: a user managing ≥1 tenant must hold the 'admin' role;
      // a user managing 0 tenants is no longer a tenant admin.
      const hasAdminRole = editUser.roles.includes('admin');
      if (target.size > 0 && !hasAdminRole) {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: editUser.id, role: 'admin' });
        if (error) throw error;
      } else if (target.size === 0 && hasAdminRole) {
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', editUser.id)
          .eq('role', 'admin');
        if (error) throw error;
      }

      // Keep profiles.tenant_id consistent with access:
      //   0 tenants  -> null (no home)
      //   1 tenant   -> that tenant (logs straight in)
      //   >1 tenants -> null (forces the tenant picker on next login)
      let newHome: string | null;
      if (target.size === 1) {
        newHome = [...target][0];
      } else {
        newHome = null;
      }
      if (newHome !== (editUser.tenant_id ?? null)) {
        const { error } = await supabase
          .from('profiles')
          .update({ tenant_id: newHome })
          .eq('id', editUser.id);
        if (error) throw error;
      }

      toast({
        title: target.size > 0 ? 'Admin access updated' : 'Admin access removed',
        description: target.size > 0
          ? `${editUser.full_name || editUser.email} is now admin of ${target.size} tenant${target.size === 1 ? '' : 's'}.`
          : `${editUser.full_name || editUser.email} is no longer a tenant admin.`,
      });
      setEditUser(null);
      await fetchAll();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const filtered = users.filter(
    (u) =>
      !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.tenant_name?.toLowerCase().includes(search.toLowerCase()),
  );

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Users</h1>
        <p className="text-muted-foreground text-sm mt-1">
          View users across all tenants. Assign which tenants each admin manages.
        </p>
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
                  <th className="text-left p-3 font-medium">Tenant Access</th>
                  <th className="text-left p-3 font-medium">Roles</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const access = accessMap[u.id];
                  const isAdmin = u.roles.includes('admin');
                  const isSuperAdmin = u.roles.includes('super_admin');
                  return (
                    <tr key={u.id} className="border-b hover:bg-accent/50">
                      <td className="p-3">{u.full_name || '-'}</td>
                      <td className="p-3 text-muted-foreground">{u.email}</td>
                      <td className="p-3">
                        {access && access.size > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {[...access].map((tid) => (
                              <Badge key={tid} variant="outline" className="text-xs">
                                {tenantName(tid)}
                              </Badge>
                            ))}
                          </div>
                        ) : u.tenant_name ? (
                          <Badge variant="outline" className="text-xs">{u.tenant_name}</Badge>
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
                      <td className="p-3 text-right">
                        {!isSuperAdmin ? (
                          <Button variant="outline" size="sm" onClick={() => openManage(u)}>
                            <Building2 className="w-3.5 h-3.5 mr-1.5" />
                            {isAdmin ? 'Manage Tenants' : 'Assign as Admin'}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Manage Tenants Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Tenant Admin</DialogTitle>
            <DialogDescription>
              {editUser && (
                <>
                  Select which tenants <span className="font-medium">{editUser.full_name || editUser.email}</span> will
                  administer. Selecting at least one grants the <span className="font-medium">admin</span> role; clearing all
                  removes it. Admins with multiple tenants choose one when they log in.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 max-h-80 overflow-y-auto py-2">
            {tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No tenants available.</p>
            ) : (
              tenants.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-3 p-2.5 rounded-md hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={editSelection.has(t.id)}
                    onCheckedChange={() => toggleTenant(t.id)}
                  />
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1">{t.name}</span>
                  {!t.is_active && (
                    <Badge variant="secondary" className="text-xs">Inactive</Badge>
                  )}
                </label>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveAccess} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save ({editSelection.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
