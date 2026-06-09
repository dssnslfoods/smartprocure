import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Save, Building, Users, Grid3X3 } from 'lucide-react';
import { MODULE_KEYS, type ModuleKey, type AppRole } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: 'Dashboard',
  supplier_portal: 'Supplier Portal',
  suppliers: 'Suppliers',
  vendor_risk: 'Vendor Risk',
  price_lists: 'Price Lists',
  rfq: 'RFQ',
  e_bidding: 'E-Bidding',
  final_quotations: 'Final Quotations',
  awards: 'Awards',
  reports: 'Reports',
  admin_settings: 'Admin Settings',
  supplier_approvals: 'Supplier Approvals',
};

const CONFIGURABLE_ROLES: AppRole[] = ['admin', 'procurement_officer', 'approver', 'executive', 'supplier'];

interface TenantData {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  logo_url: string | null;
  settings: any;
}

interface TenantUser {
  id: string;
  email: string;
  full_name: string | null;
  roles: string[];
}

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set());
  const [roleModules, setRoleModules] = useState<Record<string, Set<string>>>({});
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;

    const [tenantRes, modulesRes, roleModulesRes, usersRes] = await Promise.all([
      supabase.from('tenants').select('*').eq('id', id).single(),
      supabase.from('tenant_modules').select('module_key, is_enabled').eq('tenant_id', id),
      supabase.from('tenant_role_modules').select('role, module_key').eq('tenant_id', id),
      supabase.from('profiles').select('id, email, full_name').eq('tenant_id', id),
    ]);

    if (tenantRes.data) setTenant(tenantRes.data);

    const enabled = new Set<string>();
    modulesRes.data?.forEach((m: any) => {
      if (m.is_enabled) enabled.add(m.module_key);
    });
    setEnabledModules(enabled);

    const rm: Record<string, Set<string>> = {};
    CONFIGURABLE_ROLES.forEach((r) => (rm[r] = new Set()));
    roleModulesRes.data?.forEach((rm2: any) => {
      if (!rm[rm2.role]) rm[rm2.role] = new Set();
      rm[rm2.role].add(rm2.module_key);
    });
    setRoleModules(rm);

    // Fetch roles for each user
    if (usersRes.data) {
      const withRoles = await Promise.all(
        usersRes.data.map(async (u: any) => {
          const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', u.id);
          return { ...u, roles: roles?.map((r: any) => r.role) ?? [] };
        }),
      );
      setUsers(withRoles);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save modules
  const saveModules = async () => {
    if (!id) return;
    setSaving(true);
    try {
      // Upsert all modules
      const upserts = MODULE_KEYS.map((key) => ({
        tenant_id: id,
        module_key: key,
        is_enabled: enabledModules.has(key),
      }));

      // Delete and re-insert (simpler than complex upsert)
      await supabase.from('tenant_modules').delete().eq('tenant_id', id);
      await supabase.from('tenant_modules').insert(upserts);

      // Clean up role_modules for disabled modules
      const disabledKeys = MODULE_KEYS.filter((k) => !enabledModules.has(k));
      if (disabledKeys.length > 0) {
        await supabase
          .from('tenant_role_modules')
          .delete()
          .eq('tenant_id', id)
          .in('module_key', disabledKeys);

        // Also update local state
        const updated = { ...roleModules };
        for (const role of CONFIGURABLE_ROLES) {
          disabledKeys.forEach((k) => updated[role]?.delete(k));
        }
        setRoleModules(updated);
      }

      toast({ title: 'Modules saved', description: 'Module configuration updated.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  // Save role→module mappings
  const saveRoleModules = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await supabase.from('tenant_role_modules').delete().eq('tenant_id', id);
      const inserts: { tenant_id: string; role: string; module_key: string }[] = [];
      for (const [role, modules] of Object.entries(roleModules)) {
        for (const mod of modules) {
          if (enabledModules.has(mod)) {
            inserts.push({ tenant_id: id, role, module_key: mod });
          }
        }
      }
      if (inserts.length > 0) {
        await supabase.from('tenant_role_modules').insert(inserts);
      }

      toast({ title: 'Role access saved', description: 'Role-module mappings updated.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const toggleModule = (key: string) => {
    setEnabledModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleRoleModule = (role: string, mod: string) => {
    setRoleModules((prev) => {
      const next = { ...prev };
      const s = new Set(next[role] ?? []);
      if (s.has(mod)) s.delete(mod);
      else s.add(mod);
      next[role] = s;
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tenant) {
    return <div className="py-12 text-center text-muted-foreground">Tenant not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/super-admin/tenants')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {tenant.name}
            <Badge variant={tenant.is_active ? 'default' : 'secondary'}>
              {tenant.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">slug: {tenant.slug}</p>
        </div>
      </div>

      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules" className="gap-1">
            <Grid3X3 className="w-4 h-4" /> Modules
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1">
            <Building className="w-4 h-4" /> Role Access
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1">
            <Users className="w-4 h-4" /> Users ({users.length})
          </TabsTrigger>
        </TabsList>

        {/* Modules Tab */}
        <TabsContent value="modules">
          <Card>
            <CardHeader>
              <CardTitle>Enabled Modules</CardTitle>
              <CardDescription>Choose which modules this tenant can access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {MODULE_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={enabledModules.has(key)}
                      onCheckedChange={() => toggleModule(key)}
                    />
                    <span className="text-sm">{MODULE_LABELS[key]}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={saveModules} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Modules'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Role Access Tab */}
        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Role-Module Access Matrix</CardTitle>
              <CardDescription>
                Define which roles can see which modules in this tenant. Only enabled modules can be assigned.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Module</th>
                      {CONFIGURABLE_ROLES.map((role) => (
                        <th key={role} className="text-center py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">
                          {role.replace('_', ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULE_KEYS.map((mod) => {
                      const disabled = !enabledModules.has(mod);
                      return (
                        <tr key={mod} className={`border-b ${disabled ? 'opacity-40' : ''}`}>
                          <td className="py-2 pr-4">{MODULE_LABELS[mod]}</td>
                          {CONFIGURABLE_ROLES.map((role) => (
                            <td key={role} className="text-center py-2 px-2">
                              <Checkbox
                                checked={roleModules[role]?.has(mod) ?? false}
                                onCheckedChange={() => toggleRoleModule(role, mod)}
                                disabled={disabled}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={saveRoleModules} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Role Access'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Users in this Tenant</CardTitle>
              <CardDescription>All users assigned to {tenant.name}</CardDescription>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4">No users in this tenant yet.</p>
              ) : (
                <div className="space-y-2">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent"
                    >
                      <div>
                        <p className="font-medium text-sm">{u.full_name || u.email}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <div className="flex gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} variant="outline" className="text-xs">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
