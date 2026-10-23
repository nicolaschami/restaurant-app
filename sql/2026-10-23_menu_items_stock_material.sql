-- 2026-10-23: "Countable" menu items (e.g. a Pepsi can) have no ingredients:
-- each sale takes 1 of ONE linked raw material out of stock.
-- is_inventory_tracked (the "Countable" box) already exists; this adds the link.
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS stock_material_id integer REFERENCES raw_materials(id) ON DELETE SET NULL;
