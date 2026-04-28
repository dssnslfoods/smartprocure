// ============================================================
// Seed NSL Foods demo data into Supabase from Excel-derived JSON.
// Prerequisite: run supabase/migrations/20260428120000_nsl_abcxyz_demo.sql
// in Supabase SQL Editor first (adds ABC-XYZ columns + wipes transactions).
//
// Run: node scripts/seed_nsl_demo.mjs /tmp/nsl_seed.json
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const SUPABASE_URL = 'https://gqhtejfkcezaymrwlgry.supabase.co';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxaHRlamZrY2V6YXltcndsZ3J5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQwMDY4MywiZXhwIjoyMDkwOTc2NjgzfQ.f4hnwJ8mwyaFrk9_sYomhR8qW62DWAH0rbX_JKiWbh0';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEED_PATH = process.argv[2] || '/tmp/nsl_seed.json';
const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertChunked(table, rows, size = 500) {
  let total = 0;
  for (const part of chunk(rows, size)) {
    const { error } = await supabase.from(table).insert(part);
    if (error) {
      console.error(`Insert into ${table} failed:`, error.message);
      console.error('Sample row:', JSON.stringify(part[0]).slice(0, 400));
      throw error;
    }
    total += part.length;
    process.stdout.write(`  ${table}: ${total}/${rows.length}\r`);
  }
  console.log(`  ${table}: ${total}/${rows.length} ✓`);
}

async function main() {
  console.log(`Loading seed: ${seed.suppliers.length} suppliers, ${seed.items.length} items`);

  // ---------- 1. Insert suppliers ----------
  const supplierRows = seed.suppliers.map((s, idx) => ({
    company_name: s.card_name,
    status: 'approved',
    tier: s.tier,
    is_preferred: !!s.is_preferred,
    notes: `ABC-XYZ Demo | Items: ${s.n_items} | Spend: ${num(s.total_value)?.toLocaleString('th-TH')} THB`,
    abc_class: num(s.max_abc),
    xyz_class: num(s.min_xyz),
    seasonality_score: num(s.max_seasonality),
    priority_score: num(s.max_priority),
    risk_label: s.risk_label,
    total_spend: num(s.total_value),
    num_items: num(s.n_items),
    country: 'Thailand',
  }));

  console.log('\nInserting suppliers...');
  await insertChunked('suppliers', supplierRows, 200);

  // ---------- 2. Build supplier_id lookup by company_name ----------
  const { data: dbSuppliers, error: lookupErr } = await supabase
    .from('suppliers')
    .select('id, company_name, total_spend, priority_score, risk_label')
    .order('total_spend', { ascending: false, nullsFirst: false });
  if (lookupErr) throw lookupErr;
  const supIdByName = new Map(dbSuppliers.map((s) => [s.company_name, s.id]));
  console.log(`Loaded ${dbSuppliers.length} supplier IDs`);

  // ---------- 3. Insert price_lists (1 per supplier) ----------
  const today = new Date().toISOString().slice(0, 10);
  const validUntil = '2026-12-31';
  const priceListRows = dbSuppliers.map((s) => ({
    supplier_id: s.id,
    title: `${s.company_name} — Price List 2025-2026`,
    version: 1,
    status: 'active',
    valid_from: '2025-01-01',
    valid_until: validUntil,
    payment_terms: 'Net 30',
    notes: 'Generated from NSL Foods 2025 procurement data (ABC-XYZ classification)',
  }));
  console.log('\nInserting price lists...');
  await insertChunked('price_lists', priceListRows, 200);

  // ---------- 4. Build price_list_id lookup ----------
  const { data: dbPriceLists, error: plErr } = await supabase
    .from('price_lists')
    .select('id, supplier_id');
  if (plErr) throw plErr;
  const plBySupId = new Map(dbPriceLists.map((p) => [p.supplier_id, p.id]));
  console.log(`Loaded ${dbPriceLists.length} price list IDs`);

  // ---------- 5. Insert price_list_items ----------
  const itemRows = [];
  let skipped = 0;
  for (const it of seed.items) {
    const supId = supIdByName.get(it.card_name);
    if (!supId) { skipped++; continue; }
    const plId = plBySupId.get(supId);
    if (!plId) { skipped++; continue; }
    itemRows.push({
      price_list_id: plId,
      item_name: it.description || it.item_code,
      description: it.description || null,
      unit: 'unit',
      unit_price: num(it.avg_trans_value) ?? 0,
      item_code: it.item_code,
      group_name: it.group_name || null,
      abc_class: num(it.abc),
      xyz_class: num(it.xyz_score),
      seasonality_score: num(it.seasonality_score),
      priority_score: num(it.priority),
      risk_label: it.risk_label || null,
      total_quantity: num(it.total_qty),
      total_trans_value: num(it.total_trans_value),
      avg_quantity: num(it.avg_qty),
      avg_trans_value: num(it.avg_trans_value),
      num_suppliers: num(it.num_suppliers),
    });
  }
  console.log(`\nInserting price_list_items... (skipped ${skipped} unmatched)`);
  await insertChunked('price_list_items', itemRows, 500);

  // ---------- 6. Insert supplier_score_summary ----------
  const summaryRows = dbSuppliers.map((s) => {
    const p = s.priority_score ?? 1;
    const overall = Math.max(1, Math.min(100, Math.round(((10 - p) / 9) * 100)));
    const reliability = Math.max(1, Math.min(100, overall + 5));
    const commercial = Math.max(1, Math.min(100, overall - 5));
    const service = Math.max(1, Math.min(100, overall));
    const esg = Math.max(1, Math.min(100, overall - 10));
    const flag = p >= 7 ? 'high' : p >= 4 ? 'medium' : 'low';
    const rec =
      p >= 7
        ? 'Strategic critical supplier — diversify, build long-term partnership'
        : p >= 4
        ? 'Bottleneck risk — qualify alternate suppliers'
        : 'Routine — leverage competitive sourcing';
    return {
      supplier_id: s.id,
      service_score: service,
      esg_score: esg,
      commercial_score: commercial,
      reliability_score: reliability,
      overall_score: overall,
      risk_flag: flag,
      recommendation: rec,
    };
  });
  console.log('\nInserting supplier_score_summary...');
  await insertChunked('supplier_score_summary', summaryRows, 200);

  // ---------- 7. Insert supplier_esg_profiles (default low/pending) ----------
  const esgRows = dbSuppliers.map((s) => ({
    supplier_id: s.id,
    esg_score: 0,
    compliance_status: 'pending',
    risk_level: (s.risk_label === 'ความเสี่ยงมาก') ? 'high'
              : (s.risk_label === 'ความเสี่ยงปานกลาง') ? 'medium' : 'low',
  }));
  console.log('\nInserting supplier_esg_profiles...');
  await insertChunked('supplier_esg_profiles', esgRows, 200);

  console.log('\n✅ Seed complete.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
