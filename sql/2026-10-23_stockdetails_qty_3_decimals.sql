-- 2026-10-23: stock document quantities with 3 decimals (like raw_materials.current_stock).
-- POS sales take recipe quantities out of stock (e.g. 0.025 kg per dish);
-- with 2 decimals they would be rounded. Widening only: no existing value changes.
ALTER TABLE stockdetails ALTER COLUMN qty TYPE numeric(12,3);
