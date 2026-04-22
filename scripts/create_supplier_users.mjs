// ============================================================
// Create auth users for all suppliers without a login account
// Run: node scripts/create_supplier_users.mjs
// ============================================================
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gqhtejfkcezaymrwlgry.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxaHRlamZrY2V6YXltcndsZ3J5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQwMDY4MywiZXhwIjoyMDkwOTc2NjgzfQ.f4hnwJ8mwyaFrk9_sYomhR8qW62DWAH0rbX_JKiWbh0';
const DEFAULT_PASSWORD = 'Supplier@1234';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Get all suppliers without a login user
  const { data: suppliers, error } = await supabase
    .from('suppliers')
    .select('id, company_name, email, status')
    .is('created_by', null)
    .not('email', 'is', null)
    .order('created_at', { ascending: true });

  if (error) { console.error('Failed to fetch suppliers:', error.message); process.exit(1); }
  if (!suppliers.length) { console.log('No suppliers without users found.'); return; }

  console.log(`Found ${suppliers.length} suppliers to process:\n`);

  const results = [];

  for (const s of suppliers) {
    process.stdout.write(`  ${s.company_name} (${s.email}) ... `);

    // 2. Create auth user via Admin API
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: s.email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: s.company_name },
    });

    if (authErr) {
      console.log(`SKIP — ${authErr.message}`);
      results.push({ company: s.company_name, email: s.email, status: 'skipped', reason: authErr.message });
      continue;
    }

    const userId = authData.user.id;

    // 3. Assign supplier role
    await supabase.from('user_roles').insert({ user_id: userId, role: 'supplier' });

    // 4. Update profile
    await supabase.from('profiles').upsert({
      id: userId,
      email: s.email,
      full_name: s.company_name,
      is_active: s.status === 'approved',
      supplier_id: s.id,
    });

    // 5. Link supplier → user
    await supabase.from('suppliers').update({ created_by: userId }).eq('id', s.id);

    console.log(`OK (uid: ${userId})`);
    results.push({ company: s.company_name, email: s.email, status: 'created', userId });
  }

  console.log('\n========== Summary ==========');
  const created  = results.filter(r => r.status === 'created');
  const skipped  = results.filter(r => r.status === 'skipped');
  console.log(`Created : ${created.length}`);
  console.log(`Skipped : ${skipped.length}`);

  if (created.length) {
    console.log('\n--- Login credentials ---');
    console.log(`Password (all): ${DEFAULT_PASSWORD}\n`);
    created.forEach(r => console.log(`  ${r.email}`));
  }
  if (skipped.length) {
    console.log('\n--- Skipped ---');
    skipped.forEach(r => console.log(`  ${r.email} — ${r.reason}`));
  }
}

main();
