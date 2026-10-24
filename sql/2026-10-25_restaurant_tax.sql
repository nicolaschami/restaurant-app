-- 2026-10-25: tax and currency from the restaurant settings (agreed with the user):
--   - tax_rate: the restaurant's rate in % (e.g. 11.00); a menu item may have its own
--     rate in menu_items.country_tax (NULL = use the restaurant rate);
--   - tax_name: printed on the receipt ("VAT", "TVA", "Sales tax"...);
--   - prices_include_tax: false = tax added on top of the menu prices,
--     true = menu prices already include the tax.
--   - orders keep their own subtotal / tax / delivery fee (reports split them).
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS tax_name varchar(30) NOT NULL DEFAULT 'VAT';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS prices_include_tax boolean NOT NULL DEFAULT false;

-- menu item rate: empty = restaurant rate. Until now the field was never used
-- (0 everywhere), so 0 becomes "empty".
ALTER TABLE menu_items ALTER COLUMN country_tax DROP DEFAULT;
ALTER TABLE menu_items ALTER COLUMN country_tax DROP NOT NULL;
UPDATE menu_items SET country_tax = NULL WHERE country_tax = 0;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_amount numeric(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount numeric(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2);

-- Keep what the POS did until now (10% added on top) for the existing restaurants;
-- each restaurant changes it in Settings → Restaurant Info → Financial.
UPDATE restaurants SET tax_rate = 10 WHERE tax_rate = 0;
