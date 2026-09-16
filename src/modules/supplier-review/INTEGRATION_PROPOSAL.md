# SPR Module — Future Integration Proposal

> Design document only. No code changes. Describes how the isolated SPR module
> could be wired into existing and planned public-schema tables when
> the team is ready to accept cross-schema dependencies.

## 1. Current Isolation Architecture

The SPR module lives entirely in the `spr` PostgreSQL schema.
It reads existing data through 8 plpgsql **read functions** (`spr.fn_read_*`)
that query `public` tables without creating DDL dependencies (no views, no FKs).
All writes go to `spr`-owned tables.

## 2. Proposed Integration Points

### 2.1 Goods Receipt → KPI auto-collection
- **Source**: `public.goods_receipts` (Epic 5 — not yet built)
- **Integration**: `spr.fn_collect_review_kpis` would query goods receipt
  data to auto-populate `lots_received`, `lots_rejected`, `reject_rate`,
  and `on_time_delivery_pct` in the KPI snapshot.
- **Migration**: Add a new read function `spr.fn_read_goods_receipts()`
  returning receipt data for a given supplier + period.

### 2.2 Complaints Module → NCR/CAPA counts
- **Source**: `public.complaints` / `public.capa_records` (Epic 6 — not yet built)
- **Integration**: Auto-populate `complaints_count`, `capa_issued`,
  `capa_closed`, `capa_overdue` from a structured complaints/CAPA table.
- **Migration**: New read function `spr.fn_read_complaints()`.

### 2.3 BSAQ Questionnaire → Questionnaire age check
- **Source**: `public.bsaq_responses` (Epic 3 — partially built)
- **Integration**: The knockout rule `QUESTIONNAIRE_3YR` currently relies on
  `kpi_data.questionnaire_issue_date` entered manually. With BSAQ data
  available, auto-set this date from the latest completed questionnaire.
- **Migration**: New read function `spr.fn_read_bsaq_latest()`.

### 2.4 Traceability Module → Traceability overdue check
- **Source**: `public.traceability_exercises` (Epic 8 — not yet built)
- **Integration**: Auto-populate `traceability_last_date` and
  `traceability_overdue` from the most recent traceability exercise.
- **Migration**: New read function `spr.fn_read_traceability()`.

### 2.5 ASL Sync → Approved Supplier List
- **Source**: `public.suppliers.status` / `public.suppliers.risk_level`
- **Direction**: SPR → public. After review approval, update the supplier's
  status and risk level in the public table.
- **Caution**: This is the first **write** integration into `public`.
  Requires careful review. Could use a trigger on
  `spr.supplier_review_status` that calls an RPC, or an async event.
- **Alternative**: Keep `spr.supplier_review_status` as the authoritative
  review status and add a dashboard widget that shows divergence between
  public.suppliers.status and spr status.

### 2.6 Notification Merge
- **Current**: SPR has its own `spr.notifications` table.
- **Proposed**: When the team agrees, insert into `public.notifications`
  instead (or in addition), so SPR alerts appear in the main notification bell.
- **Migration**: Modify `spr.fn_send_review_notifications()` to dual-write.

### 2.7 Document Management
- **Source**: `public.supplier_documents` (existing)
- **Integration**: Link review attachments to the supplier's document
  timeline. The `spr.supplier_review_attachment` table stores `file_path`
  in Supabase Storage; a read function could also pull from
  `public.supplier_documents` for the review period.

## 3. pg_cron Scheduling

The following cron functions are defined but scheduling commands are
commented out (they require Supabase dashboard or `pg_cron` extension):

| Function | Schedule | Purpose |
|---|---|---|
| `spr.fn_generate_due_reviews()` | Daily 02:00 UTC | Create DRAFT reviews 60 days before due |
| `spr.fn_send_review_notifications()` | Daily 08:00 UTC | Send 30/7/overdue day notifications |
| `spr.fn_collect_review_kpis()` | Called per-review | Collect KPI data from public tables |

To enable:
```sql
SELECT cron.schedule('spr_generate_due_reviews', '0 2 * * *',
  $$SELECT spr.fn_generate_due_reviews()$$);
SELECT cron.schedule('spr_send_notifications', '0 8 * * *',
  $$SELECT spr.fn_send_review_notifications()$$);
```

## 4. Storage Bucket

The module uses a `supplier-review` Storage bucket for attachments.
Create it via Supabase Dashboard → Storage → New Bucket → `supplier-review`
with RLS policies matching the review's tenant_id.

## 5. Exposed Schemas

For the Supabase PostgREST API to serve `spr` schema tables:
Dashboard → Settings → API → Exposed Schemas → add `spr`.

## 6. Migration Path

1. **Phase A** (current): Fully isolated, manual KPI entry, no public writes.
2. **Phase B**: Add read functions for goods receipt, complaints, BSAQ,
   traceability as those modules are built. SPR auto-collects but still
   no public writes.
3. **Phase C**: ASL sync — write review outcomes back to `public.suppliers`.
   Requires team alignment on source-of-truth for supplier status.
4. **Phase D**: Notification merge, document linkage, full audit trail
   integration with the main system.

Each phase can be a single migration file added to `supabase/migrations/`.
The rollback script (`20260916000007_spr_rollback.sql`) handles complete
removal at any phase via `DROP SCHEMA spr CASCADE`.
