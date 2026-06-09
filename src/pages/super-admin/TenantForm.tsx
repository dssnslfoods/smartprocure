import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Save } from 'lucide-react';
import { MODULE_KEYS, type ModuleKey } from '@/contexts/AuthContext';
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

export default function TenantForm() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>([...MODULE_KEYS]);
  const [saving, setSaving] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    // Auto-generate slug from name
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim(),
    );
  };

  const toggleModule = (key: ModuleKey) => {
    setSelectedModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('create_tenant', {
        _name: name.trim(),
        _slug: slug.trim(),
        _modules: selectedModules,
      });

      if (error) throw error;

      toast({
        title: 'Tenant created',
        description: `${name} has been created successfully.`,
      });
      navigate(`/super-admin/tenants/${data}`);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create tenant',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/super-admin/tenants')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <h1 className="text-2xl font-bold">Create Tenant</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">General Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Company Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. ABC Foods Co., Ltd."
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug *</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. abc-foods"
                required
                pattern="[a-z0-9\-]+"
                title="Only lowercase letters, numbers, and hyphens"
              />
              <p className="text-xs text-muted-foreground">
                Used in registration links: /register/supplier?tenant={slug || '...'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Enabled Modules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {MODULE_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={selectedModules.includes(key)}
                    onCheckedChange={() => toggleModule(key)}
                  />
                  <span className="text-sm">{MODULE_LABELS[key]}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={() => navigate('/super-admin/tenants')}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Creating...' : 'Create Tenant'}
          </Button>
        </div>
      </form>
    </div>
  );
}
