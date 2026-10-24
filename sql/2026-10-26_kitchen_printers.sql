-- 2026-10-26: kitchen tickets (agreed with the user): each dish prints on its CATEGORY's
-- printer (categories.printername, as designed from the start); a category without a
-- printer goes to the restaurant's DEFAULT kitchen printer below.
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS kitchen_printer varchar(120);
-- (a first draft routed by kitchen station; its column is removed)
ALTER TABLE kitchen_stations DROP COLUMN IF EXISTS printer;
