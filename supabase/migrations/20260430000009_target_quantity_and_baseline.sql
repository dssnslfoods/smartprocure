-- ============================================================
-- Procurement-driven price reference workflow
-- ------------------------------------------------------------
-- 1) target_quantity: procurement specifies the quantity at which
--    they want a unit price quoted (e.g. "ราคาต่อ กก. ที่ปริมาณ 500 kg")
-- 2) Baseline (ราคากลาง) is computed in client from offers:
--      open items     → AVG(unit_price) across all suppliers
--      nominated item → unit_price of the nominated supplier only
-- ============================================================

ALTER TABLE public.price_list_items
  ADD COLUMN IF NOT EXISTS target_quantity NUMERIC(15,2);

COMMENT ON COLUMN public.price_list_items.target_quantity IS
  'Quantity that procurement asks suppliers to quote a unit price against.';

-- Seed reasonable target quantities for demo: ~5x the MOQ if present, else 100.
UPDATE public.price_list_items
SET target_quantity = COALESCE(moq * 5, 100)
WHERE target_quantity IS NULL;
