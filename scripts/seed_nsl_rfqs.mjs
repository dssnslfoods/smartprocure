// ============================================================
// Generate mock RFQs / quotations / bidding / awards centered on
// NSL's critical suppliers (priority >= 7). Demo data only.
// Run: node scripts/seed_nsl_rfqs.mjs
// ============================================================
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gqhtejfkcezaymrwlgry.supabase.co';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxaHRlamZrY2V6YXltcndsZ3J5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQwMDY4MywiZXhwIjoyMDkwOTc2NjgzfQ.f4hnwJ8mwyaFrk9_sYomhR8qW62DWAH0rbX_JKiWbh0';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Mulberry32 deterministic PRNG so re-runs produce the same demo data
let _seed = 42;
const rng = () => {
  let t = (_seed += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randBetween = (a, b) => a + rng() * (b - a);
const randInt = (a, b) => Math.floor(randBetween(a, b + 1));

const today = new Date();
const daysFromNow = (d) => new Date(today.getTime() + d * 86400000).toISOString();

async function main() {
  console.log('Loading critical suppliers (priority >= 7)...');
  const { data: critical, error: cErr } = await supabase
    .from('suppliers')
    .select('id, company_name, priority_score, total_spend')
    .gte('priority_score', 7)
    .order('total_spend', { ascending: false });
  if (cErr) throw cErr;
  console.log(`  ${critical.length} critical suppliers`);

  // also pull a pool of non-critical suppliers to invite as competition
  const { data: pool } = await supabase
    .from('suppliers')
    .select('id, company_name, priority_score')
    .lt('priority_score', 7)
    .order('total_spend', { ascending: false, nullsFirst: false })
    .limit(80);

  // Items for each critical supplier (highest-value)
  const supplierItems = new Map();
  for (const s of critical) {
    const { data: pls } = await supabase.from('price_lists').select('id').eq('supplier_id', s.id);
    const plIds = (pls || []).map((p) => p.id);
    if (plIds.length === 0) continue;
    const { data: items } = await supabase
      .from('price_list_items')
      .select('item_code, item_name, group_name, unit_price, avg_trans_value, total_trans_value, total_quantity, avg_quantity, num_suppliers, priority_score')
      .in('price_list_id', plIds)
      .order('total_trans_value', { ascending: false, nullsFirst: false })
      .limit(5);
    supplierItems.set(s.id, items || []);
  }

  // ---------- Plan RFQ statuses for 14 RFQs ----------
  // 3 awarded · 4 evaluation · 3 closed · 3 published · 1 draft
  const plan = [
    ...Array(3).fill('awarded'),
    ...Array(4).fill('evaluation'),
    ...Array(3).fill('closed'),
    ...Array(3).fill('published'),
    ...Array(1).fill('draft'),
  ];

  const usedSuppliers = new Set();
  const rfqsToCreate = [];

  // Pair each plan slot with a critical supplier (in spend order)
  const pickOrder = [...critical].slice(0, plan.length);
  for (let i = 0; i < plan.length && i < pickOrder.length; i++) {
    const lead = pickOrder[i];
    const items = supplierItems.get(lead.id) || [];
    if (items.length === 0) continue;
    const itemCount = Math.min(items.length, randInt(1, 3));
    const picked = items.slice(0, itemCount);

    rfqsToCreate.push({
      lead,
      items: picked,
      status: plan[i],
    });
    usedSuppliers.add(lead.id);
  }

  console.log(`Planning ${rfqsToCreate.length} RFQs.`);

  let rfqCount = 0, qCount = 0, fqCount = 0, awardCount = 0, bidCount = 0;
  let rfqSeq = 1;

  for (const r of rfqsToCreate) {
    const totalEstValue = r.items.reduce((sum, it) => sum + Number(it.avg_trans_value || it.unit_price || 0), 0);
    const groupHint = r.items[0].group_name || 'Material';
    const titleSubject = r.items.length === 1
      ? r.items[0].item_name.slice(0, 48)
      : `${r.items.length} items · ${groupHint.slice(0, 30)}`;

    // 1. Create RFQ
    const rfqNumber = `RFQ-2026-${String(rfqSeq++).padStart(4, '0')}`;
    const created = daysFromNow(-randInt(7, 90));
    const deadline = r.status === 'draft' ? null
      : r.status === 'published' ? daysFromNow(randInt(7, 21))
      : daysFromNow(-randInt(1, 14));
    const { data: rfq, error: rErr } = await supabase
      .from('rfqs')
      .insert({
        rfq_number: rfqNumber,
        title: `[${groupHint.replace('กลุ่มวัตถุดิบประเภท', '').replace('กลุ่มประเภทวัตถุดิบประเภท', '').slice(0, 30)}] ${titleSubject}`,
        description: `Sourcing for ${r.lead.company_name} category — covers ${r.items.length} item(s) from NSL Foods 2026 procurement plan.`,
        status: r.status,
        deadline,
        notes: `Estimated value: ฿${Math.round(totalEstValue).toLocaleString('th-TH')}`,
        created_at: created,
      })
      .select('id')
      .single();
    if (rErr) { console.error('RFQ insert error:', rErr.message); continue; }
    rfqCount++;

    // 2. Create rfq_items
    const rfqItemRows = r.items.map((it) => ({
      rfq_id: rfq.id,
      item_name: it.item_name,
      description: `Item code: ${it.item_code || ''} · Group: ${it.group_name || ''}`,
      quantity: Number(it.avg_quantity || 0) || 100,
      unit: 'unit',
      specifications: it.priority_score >= 7
        ? 'Critical supply — price + reliability + capacity weighted equally'
        : 'Standard sourcing — price-driven',
    }));
    const { data: rfqItems } = await supabase.from('rfq_items').insert(rfqItemRows).select('id, item_name');

    // 3. Decide invited suppliers — lead + 2-3 competitors (from pool of non-critical)
    const competitors = [];
    const compPool = [...pool].sort(() => rng() - 0.5);
    const compCount = randInt(2, 3);
    for (const c of compPool) {
      if (competitors.length >= compCount) break;
      if (c.id === r.lead.id || usedSuppliers.has(c.id + '-rfq-' + rfq.id)) continue;
      competitors.push(c);
    }
    const invited = [r.lead, ...competitors];
    await supabase.from('rfq_suppliers').insert(invited.map((s) => ({
      rfq_id: rfq.id,
      supplier_id: s.id,
      responded: r.status !== 'draft' && r.status !== 'published',
    })));

    // 4. Create quotations (skip for draft & published — those are pre-quote)
    if (['closed', 'evaluation', 'awarded'].includes(r.status)) {
      // Best price tends to be lower than baseline
      const quotations = [];
      for (const sup of invited) {
        const isLead = sup.id === r.lead.id;
        // Lead bids slightly higher (premium for criticality), competitors bid 5-15% lower
        const factor = isLead
          ? randBetween(0.98, 1.08)
          : randBetween(0.85, 1.02);
        let totalAmount = 0;
        const qItemRows = [];
        for (let i = 0; i < r.items.length; i++) {
          const baseline = Number(r.items[i].avg_trans_value || r.items[i].unit_price || 1000);
          const qty = Number(r.items[i].avg_quantity || 100) || 100;
          const unit_price = Math.max(1, Math.round((baseline / Math.max(1, qty)) * factor * 100) / 100);
          const total_price = Math.round(unit_price * qty * 100) / 100;
          totalAmount += total_price;
          qItemRows.push({
            rfq_item_id: rfqItems?.[i]?.id || null,
            item_name: r.items[i].item_name,
            quantity: qty,
            unit: 'unit',
            unit_price,
            total_price,
          });
        }
        quotations.push({ supplier_id: sup.id, total_amount: Math.round(totalAmount * 100) / 100, items: qItemRows, isLead });
      }

      for (const q of quotations) {
        const { data: quotRow, error: qErr } = await supabase
          .from('quotations')
          .insert({
            rfq_id: rfq.id,
            supplier_id: q.supplier_id,
            total_amount: q.total_amount,
            currency: 'THB',
            payment_terms: pick(['Net 30', 'Net 45', 'Net 60', '50% deposit / 50% on delivery']),
            delivery_terms: pick(['EXW', 'FOB', 'CIF', 'DDP']),
            validity_days: randInt(30, 90),
            submitted_at: daysFromNow(-randInt(1, 60)),
          })
          .select('id')
          .single();
        if (qErr) { console.error('quotation error:', qErr.message); continue; }
        qCount++;
        await supabase.from('quotation_items').insert(q.items.map((it) => ({ ...it, quotation_id: quotRow.id })));
      }

      // 5. final_quotations + awards for evaluation & awarded RFQs
      if (r.status === 'evaluation' || r.status === 'awarded') {
        // pick winner: lowest total amount among quotations
        const sorted = [...quotations].sort((a, b) => a.total_amount - b.total_amount);
        for (const q of quotations) {
          const isWinner = q === sorted[0];
          const { data: fq } = await supabase
            .from('final_quotations')
            .insert({
              rfq_id: rfq.id,
              supplier_id: q.supplier_id,
              total_amount: q.total_amount,
              currency: 'THB',
              payment_terms: 'Net 30',
              delivery_terms: 'CIF',
              status: r.status === 'awarded' ? (isWinner ? 'selected' : 'rejected') : 'pending',
              is_selected: r.status === 'awarded' && isWinner,
              ready_for_po: r.status === 'awarded' && isWinner,
              notes: isWinner ? 'Best price + acceptable lead time' : null,
            })
            .select('id')
            .single();
          fqCount++;
          if (r.status === 'awarded' && isWinner && fq) {
            await supabase.from('awards').insert({
              rfq_id: rfq.id,
              supplier_id: q.supplier_id,
              final_quotation_id: fq.id,
              amount: q.total_amount,
              status: 'approved',
              recommendation: q.isLead
                ? 'Award to incumbent — strategic relationship outweighs marginal price gap'
                : 'Award to alternative — better price, qualifies on capacity',
              decision_reason: 'Selected based on price, lead time, and supplier reliability score.',
              ready_for_po: true,
            });
            awardCount++;
          }
        }
      }
    }

    // 6. Random bidding event for ~25% of RFQs in published/closed status
    if ((r.status === 'closed' || r.status === 'published') && rng() < 0.45) {
      const start = daysFromNow(r.status === 'published' ? randInt(2, 14) : -randInt(2, 30));
      const end = new Date(new Date(start).getTime() + randInt(2, 10) * 86400000).toISOString();
      const { data: be } = await supabase
        .from('bidding_events')
        .insert({
          rfq_id: rfq.id,
          title: `Reverse Auction · ${rfqNumber}`,
          description: 'e-Bidding round for selected suppliers',
          status: r.status === 'published' ? 'scheduled' : 'closed',
          start_time: start,
          end_time: end,
          max_rounds: 3,
          current_round: r.status === 'published' ? 1 : 3,
        })
        .select('id')
        .single();
      bidCount++;
      // bid entries
      if (be && r.status === 'closed') {
        for (const sup of invited) {
          for (let round = 1; round <= 3; round++) {
            const baseline = totalEstValue * randBetween(0.85, 1.0) * Math.pow(0.97, round - 1);
            await supabase.from('bid_entries').insert({
              bidding_event_id: be.id,
              supplier_id: sup.id,
              round_number: round,
              bid_amount: Math.round(baseline * 100) / 100,
              notes: round === 3 ? 'Final round' : null,
            });
          }
        }
      }
    }

    process.stdout.write(`  RFQ ${rfqCount}/${rfqsToCreate.length}\r`);
  }

  console.log(`\n✅ Done.`);
  console.log(`  RFQs            ${rfqCount}`);
  console.log(`  Quotations      ${qCount}`);
  console.log(`  Final Quotations ${fqCount}`);
  console.log(`  Awards          ${awardCount}`);
  console.log(`  Bidding events  ${bidCount}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
