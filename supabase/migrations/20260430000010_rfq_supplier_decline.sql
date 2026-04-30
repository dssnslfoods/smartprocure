-- Allow suppliers to formally decline to quote on an RFQ.
-- Captures decision time + reason so procurement can see why.

ALTER TABLE public.rfq_suppliers
  ADD COLUMN IF NOT EXISTS declined_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_reason TEXT;

COMMENT ON COLUMN public.rfq_suppliers.declined_at IS
  'When the supplier explicitly opted out of quoting on this RFQ.';
COMMENT ON COLUMN public.rfq_suppliers.declined_reason IS
  'Free-text reason from supplier explaining why they cannot quote.';
