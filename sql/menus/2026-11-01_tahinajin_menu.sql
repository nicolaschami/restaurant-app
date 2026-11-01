-- 2026-11-01: THE MENU OF "TAHIN W 3AJIN" (asked by the user), from the restaurant's PDF
-- menu (9 pages, prices in LBP). Creates the categories, the menu items, their sizes
-- (pizzas, Lahme Shakaf) and 2 modifier groups (wings sauce, stuffed crust).
--
-- Prices: LBP ÷ 90,000 = USD, rounded to cents (300,000 LBP → 3.33). The same price for
-- Dine-In, Takeaway, Delivery and Waiter (change them later in Products → Menu Items).
-- The receipt printer cannot print Arabic: the Arabic page ("Bil Fakhar") gets Latin
-- names, with the Arabic name kept in the description.
--
-- Run it for ONE restaurant, chosen by its login code (the part after @ in admin@code):
--   psql -U res_app -d res_pos -v code=tahinajin -f sql/menus/2026-11-01_tahinajin_menu.sql
-- Safe to run again: a category, item or modifier group that already exists (same name)
-- is left as it is — nothing is created twice. All or nothing (one transaction).

\set ON_ERROR_STOP 1
-- the file is UTF-8 (Arabic names): psql on a Windows server would otherwise read it
-- as WIN1252 and stop ("byte sequence 0x81 … has no equivalent in UTF8")
\encoding UTF8
BEGIN;

SELECT set_config('menu.code', :'code', true);

-- the menu, as in the PDF: category, item, kitchen/receipt name, description,
-- price in LBP — or 2 sizes (size1 / size2 with their LBP prices) — and a modifier group
CREATE TEMP TABLE menu_src (
  cat text, cat_pos int, pos int, name text, short_name text, descr text,
  lbp numeric, size1 text, lbp1 numeric, size2 text, lbp2 numeric, modifier text
) ON COMMIT DROP;

INSERT INTO menu_src (cat, cat_pos, pos, name, short_name, descr, lbp, size1, lbp1, size2, lbp2, modifier) VALUES
-- 1. Bil Fakhar (بالفخار — clay pot)
('Bil Fakhar', 1,  1, 'Bayd',                  NULL, 'بيض',                     300000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1,  2, 'Bayd + Jebne',          NULL, 'بيض مع جبنة',             380000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1,  3, 'Bayd + Awarma',         NULL, 'بيض مع أورما',            500000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1,  4, 'Bayd + Sujuk',          NULL, 'بيض مع سجق',              500000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1,  5, 'Bayd + Lahme Mafroume', NULL, 'بيض مع لحمة مفرومة',      500000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1,  6, 'Bayd + Kafta',          NULL, 'بيض مع كفتة',             520000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1,  7, 'Bayd + Hot Dog',        NULL, 'بيض مع هوت دوغ',          450000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1,  8, 'Sujuk',                 'Sujuk Fakhar',    'سجق',        600000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1,  9, 'Makanek',               'Makanek Fakhar',  'مقانق',      600000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1, 10, 'Halloum',               NULL, 'حلوم',                    350000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1, 11, 'Sanasel',               NULL, 'سناسل',                   900000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1, 12, 'Lahme Shakaf (Ghanam)', NULL, 'لحمة شقف (غنم)',          NULL, '2 persons', 1340000, '4 persons', 2680000, NULL),
('Bil Fakhar', 1, 13, 'Jebne Mshakale',        NULL, 'جبنة مشكلة',              550000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1, 14, 'Labne Mdaabale',        NULL, 'لبنة مدعبلة',             250000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1, 15, 'Mexican Chicken',       NULL, 'مكسيكان تشيكن',           900000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1, 16, 'Sea Food',              NULL, 'سي فود',                  1200000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1, 17, 'Zaytoun (Olives)',      NULL, 'زيتون',                   100000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1, 18, 'Makdous',               NULL, 'مكدوس',                   180000, NULL, NULL, NULL, NULL, NULL),
('Bil Fakhar', 1, 19, 'Sahn Khodra Mshakal',   NULL, 'صحن خضار مشكل',           100000, NULL, NULL, NULL, NULL, NULL),
-- 2. Fries & Sides
('Fries & Sides', 2, 1, 'Small Fries',  NULL, NULL, 250000, NULL, NULL, NULL, NULL, NULL),
('Fries & Sides', 2, 2, 'Large Fries',  NULL, NULL, 450000, NULL, NULL, NULL, NULL, NULL),
('Fries & Sides', 2, 3, 'Small Wedges', NULL, NULL, 350000, NULL, NULL, NULL, NULL, NULL),
('Fries & Sides', 2, 4, 'Large Wedges', NULL, NULL, 550000, NULL, NULL, NULL, NULL, NULL),
-- 3. Appetizers
('Appetizers', 3, 1, 'Mozzarella Sticks (6 pcs)', 'Mozzarella Sticks', '6 pieces',  450000, NULL, NULL, NULL, NULL, NULL),
('Appetizers', 3, 2, 'Onion Rings (10 pcs)',      'Onion Rings',       '10 pieces', 450000, NULL, NULL, NULL, NULL, NULL),
-- 4. Wings (the sauce is chosen on the POS)
('Wings', 4, 1, '15 Pieces Wings', 'Wings 15 pcs', 'Sauce: BBQ, Buffalo, Sweet Chili or Honey Mustard', 740000, NULL, NULL, NULL, NULL, 'Wings Sauce'),
-- 5. Hot Platters
('Hot Platters', 5, 1, 'Loaded Chicken',         NULL, 'Crispy chicken, Fries, BBQ sauce, Mayo, Special sauce & Ketchup, Crunchy Chips.', 580000, NULL, NULL, NULL, NULL, NULL),
('Hot Platters', 5, 2, 'Plate Nuggets',          NULL, 'Fries, Coleslaw salad, Pickles & Garlic Sauce.', 630000, NULL, NULL, NULL, NULL, NULL),
('Hot Platters', 5, 3, 'Plate Crispy',           NULL, 'Fries, Coleslaw salad, Pickles & Garlic Sauce.', 890000, NULL, NULL, NULL, NULL, NULL),
('Hot Platters', 5, 4, 'Plate Tawook',           NULL, 'Fries, Coleslaw salad, Pickles & Garlic Sauce.', 890000, NULL, NULL, NULL, NULL, NULL),
('Hot Platters', 5, 5, 'Grilled Chicken Breast', NULL, 'Caesar Salad, Grilled Potatoes, Garlic Sauce & Pickles.', 980000, NULL, NULL, NULL, NULL, NULL),
('Hot Platters', 5, 6, 'Plate T7IN W 3AJIN',     NULL, '3 juicy chicken thighs, 4 crispy chicken wings, served with a fresh Caesar salad.', 1200000, NULL, NULL, NULL, NULL, NULL),
('Hot Platters', 5, 7, 'Chicken Pasta Plate',    NULL, 'Special sauce, mozzarella & Parmesan cheese, fresh vegetables, & crispy potato wedges.', 1400000, NULL, NULL, NULL, NULL, NULL),
-- 6. Salads
('Salads', 6, 1, 'Caesar Salad',         NULL, NULL, 440000, NULL, NULL, NULL, NULL, NULL),
('Salads', 6, 2, 'Chicken Caesar Salad', NULL, NULL, 580000, NULL, NULL, NULL, NULL, NULL),
('Salads', 6, 3, 'Crab Salad',           NULL, NULL, 580000, NULL, NULL, NULL, NULL, NULL),
('Salads', 6, 4, 'Fattoush',             NULL, NULL, 500000, NULL, NULL, NULL, NULL, NULL),
('Salads', 6, 5, 'Tuna Pasta Salad',     NULL, NULL, 600000, NULL, NULL, NULL, NULL, NULL),
-- 7. Sandwiches
('Sandwiches', 7,  1, 'Tawook Sandwich',          NULL, NULL, 500000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7,  2, 'Crispy Sandwich',          NULL, NULL, 500000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7,  3, 'Sujuk Sandwich',           NULL, NULL, 550000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7,  4, 'French Fries Sandwich',    NULL, NULL, 280000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7,  5, 'Sanesel Sandwich',         NULL, NULL, 650000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7,  6, 'Makanek Sandwich',         NULL, NULL, 550000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7,  7, 'Fajita Sandwich',          NULL, NULL, 680000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7,  8, 'Hot Dog Sandwich',         NULL, NULL, 650000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7,  9, 'Hot Dog Baguette',         NULL, NULL, 550000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7, 10, 'Chicken BBQ Sandwich',     NULL, NULL, 680000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7, 11, 'Steak Sandwich',           NULL, NULL, 780000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7, 12, 'Submarine',                NULL, NULL, 550000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7, 13, 'Youjin',                   NULL, NULL, 680000, NULL, NULL, NULL, NULL, NULL),
('Sandwiches', 7, 14, 'Mexican Chicken Sandwich', NULL, NULL, 750000, NULL, NULL, NULL, NULL, NULL),
-- 8. Pizza (Medium / Family; stuffed crust is an extra, already included in the Special 4 Flavors)
('Pizza', 8, 1, 'Fajita / BBQ Pizza',           NULL, 'You can mix Fajita and BBQ', NULL, 'Medium', 1100000, 'Family', 1900000, 'Stuffed Crust'),
('Pizza', 8, 2, 'Lebanese Pizza',               NULL, NULL,                          NULL, 'Medium',  700000, 'Family', 1400000, 'Stuffed Crust'),
('Pizza', 8, 3, 'Half Lebanese Half Sejouk',    NULL, 'Family size only',            NULL, 'Family', 1600000, NULL, NULL,           'Stuffed Crust'),
('Pizza', 8, 4, 'Half Lebanese Half Pepperoni', NULL, NULL,                          NULL, 'Medium',  900000, 'Family', 1600000, 'Stuffed Crust'),
('Pizza', 8, 5, 'Pepperoni / Sejouk Pizza',     NULL, NULL,                          NULL, 'Medium', 1000000, 'Family', 1700000, 'Stuffed Crust'),
('Pizza', 8, 6, 'Alfredo Pizza',                NULL, NULL,                          NULL, 'Medium', 1000000, 'Family', 2000000, 'Stuffed Crust'),
('Pizza', 8, 7, 'Special Pizza 4 Flavors',      NULL, 'Stuffed crust with cheese',   NULL, 'Medium', 1200000, 'Family', 2300000, NULL),
('Pizza', 8, 8, 'SeaFood Pizza',                NULL, NULL,                          NULL, 'Medium', 1400000, 'Family', 2800000, 'Stuffed Crust'),
-- 9. Manakich
('Manakich', 9,  1, 'Zaatar',                   NULL, NULL,  80000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9,  2, 'Zaatar + Khodra',          NULL, NULL, 100000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9,  3, 'Zaatar + Jebne',           NULL, NULL, 250000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9,  4, 'Jebne',                    NULL, NULL, 240000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9,  5, 'Jebne + Jambon',           NULL, NULL, 280000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9,  6, 'Jebne + Khodra',           NULL, NULL, 280000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9,  7, 'Jebne + Pesto',            NULL, NULL, 300000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9,  8, 'Jebne + Jambon + Khedra',  NULL, NULL, 350000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9,  9, 'Jebne + Sejouk',           NULL, NULL, 480000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 10, 'Jebne + Pepperoni',        NULL, NULL, 480000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 11, 'Jebne + 7ar',              NULL, NULL, 280000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 12, 'Kafta + Jebne',            NULL, NULL, 500000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 13, 'Lahm Baajin',              NULL, NULL, 280000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 14, 'Ejet Bed',                 NULL, NULL, 200000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 15, 'Ejet Bed + Jebne',         NULL, NULL, 250000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 16, 'Chanklich',                NULL, NULL, 250000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 17, 'Kechek',                   NULL, NULL, 250000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 18, 'Labne + Khedra',           NULL, NULL, 250000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 19, 'Lahme + Jebne',            NULL, NULL, 340000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 20, 'Jebne w Zaatar Manfoukha', NULL, NULL, 380000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 21, 'T7in w 3ajine Jebne',      NULL, NULL, 400000, NULL, NULL, NULL, NULL, NULL),
('Manakich', 9, 22, 'Labneh w Makdous',         NULL, NULL, 350000, NULL, NULL, NULL, NULL, NULL),
-- 10. Soirée (same names as some manakich: the receipt / kitchen name says "Soirée")
('Soirée', 10,  1, 'Zaatar',                        'Soiree Zaatar',             NULL,  180000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10,  2, 'Jebne',                         'Soiree Jebne',              NULL,  360000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10,  3, 'Lahme',                         'Soiree Lahme',              NULL,  420000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10,  4, 'Pizza',                         'Soiree Pizza',              NULL,  420000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10,  5, 'Hotdog',                        'Soiree Hotdog',             NULL,  420000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10,  6, 'Hotdog + Jebne',                'Soiree Hotdog + Jebne',     NULL,  450000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10,  7, 'Ftayer Jebne',                  'Soiree Ftayer Jebne',       NULL,  450000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10,  8, 'Ftayer Sele2',                  'Soiree Ftayer Sele2',       NULL,  390000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10,  9, 'Kebbe',                         'Soiree Kebbe',              NULL,  860000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10, 10, 'R2a2at',                        'Soiree R2a2at',             NULL,  770000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10, 11, 'Tawouk',                        'Soiree Tawouk',             NULL,  790000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10, 12, 'Fahita',                        'Soiree Fahita',             NULL,  800000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10, 13, 'Kechek',                        'Soiree Kechek',             NULL,  350000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10, 14, 'Chanklich',                     'Soiree Chanklich',          NULL,  350000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10, 15, 'Labneh',                        'Soiree Labneh',             NULL,  300000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10, 16, 'Jebne + Pepperoni or Soujouk',  'Soiree Jebne + Pepp/Souj',  NULL,  480000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10, 17, 'Samosa Chicken',                'Soiree Samosa Chicken',     NULL,  750000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10, 18, 'Sanbousik',                     'Soiree Sanbousik',          NULL,  850000, NULL, NULL, NULL, NULL, NULL),
('Soirée', 10, 19, 'Mini Burgers',                  'Soiree Mini Burgers',       NULL, 1800000, NULL, NULL, NULL, NULL, NULL),
-- 11. Kaeek
('Kaeek', 11,  1, 'Kaake Jebne',             NULL, NULL, 240000, NULL, NULL, NULL, NULL, NULL),
('Kaeek', 11,  2, 'Kaake Jebne + Jambon',    NULL, NULL, 260000, NULL, NULL, NULL, NULL, NULL),
('Kaeek', 11,  3, 'Kaake Jebne + Sejouk',    NULL, NULL, 380000, NULL, NULL, NULL, NULL, NULL),
('Kaeek', 11,  4, 'Kaake Jebne + Pepperoni', NULL, NULL, 380000, NULL, NULL, NULL, NULL, NULL),
('Kaeek', 11,  5, 'Kaake Jebne + Khedra',    NULL, NULL, 260000, NULL, NULL, NULL, NULL, NULL),
('Kaeek', 11,  6, 'Kaake T7in w 3ajin',      NULL, NULL, 320000, NULL, NULL, NULL, NULL, NULL),
('Kaeek', 11,  7, 'Kaake Pizza',             NULL, NULL, 380000, NULL, NULL, NULL, NULL, NULL),
('Kaeek', 11,  8, 'Kaake Fahita',            NULL, NULL, 600000, NULL, NULL, NULL, NULL, NULL),
('Kaeek', 11,  9, 'Kaake Burger',            NULL, NULL, 700000, NULL, NULL, NULL, NULL, NULL),
('Kaeek', 11, 10, 'Kaake Submarine',         NULL, NULL, 500000, NULL, NULL, NULL, NULL, NULL),
('Kaeek', 11, 11, 'Kaake Tablie',            NULL, 'Labneh, Makdous, Olives, Fresh Vegetables & Cheese.', 650000, NULL, NULL, NULL, NULL, NULL);

DO $$
DECLARE
  rid int;
  n_cat int := 0; n_item int := 0; n_mod int := 0;
  r record;
  cid int; mid int; gid int;
  usd numeric; v jsonb;
BEGIN
  SELECT id INTO rid FROM restaurants WHERE login_code = lower(current_setting('menu.code'));
  IF rid IS NULL THEN
    RAISE EXCEPTION 'No restaurant with the login code "%". Check it with: SELECT id, name, login_code FROM restaurants;', current_setting('menu.code');
  END IF;

  -- the 2 modifier groups (prices already in USD)
  IF NOT EXISTS (SELECT 1 FROM modifier_groups WHERE restaurant_id = rid AND name = 'Wings Sauce') THEN
    INSERT INTO modifier_groups (restaurant_id, name, min_selection, max_selection, is_required)
    VALUES (rid, 'Wings Sauce', 1, 1, true) RETURNING id INTO gid;
    INSERT INTO modifier_options (modifier_group_id, name, price_adjustment)
    VALUES (gid, 'BBQ', 0), (gid, 'Buffalo', 0), (gid, 'Sweet Chili', 0), (gid, 'Honey Mustard', 0);
    n_mod := n_mod + 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM modifier_groups WHERE restaurant_id = rid AND name = 'Stuffed Crust') THEN
    INSERT INTO modifier_groups (restaurant_id, name, min_selection, max_selection, is_required)
    VALUES (rid, 'Stuffed Crust', 0, 1, false) RETURNING id INTO gid;
    INSERT INTO modifier_options (modifier_group_id, name, price_adjustment)
    VALUES (gid, 'Stuffed crust - Medium', 3), (gid, 'Stuffed crust - Family', 6);
    n_mod := n_mod + 1;
  END IF;

  FOR r IN SELECT * FROM menu_src ORDER BY cat_pos, pos LOOP
    -- the category (created once)
    SELECT id INTO cid FROM categories WHERE restaurant_id = rid AND name = r.cat;
    IF cid IS NULL THEN
      INSERT INTO categories (restaurant_id, name, position) VALUES (rid, r.cat, r.cat_pos) RETURNING id INTO cid;
      n_cat := n_cat + 1;
    END IF;

    -- the item (skipped if this category already has one with that name)
    CONTINUE WHEN EXISTS (SELECT 1 FROM menu_items WHERE restaurant_id = rid AND category_id = cid AND menu_name = r.name);

    IF r.size1 IS NULL THEN
      usd := round(r.lbp / 90000.0, 2);
      v := '[]'::jsonb;
    ELSE
      -- sizes: the item's own price = the smallest size (shown on the dish card)
      usd := round(r.lbp1 / 90000.0, 2);
      v := jsonb_build_array(jsonb_build_object('size', r.size1, 'dineIn', round(r.lbp1 / 90000.0, 2), 'takeaway', round(r.lbp1 / 90000.0, 2),
                                                'delivery', round(r.lbp1 / 90000.0, 2), 'waiter', round(r.lbp1 / 90000.0, 2)));
      IF r.size2 IS NOT NULL THEN
        v := v || jsonb_build_array(jsonb_build_object('size', r.size2, 'dineIn', round(r.lbp2 / 90000.0, 2), 'takeaway', round(r.lbp2 / 90000.0, 2),
                                                       'delivery', round(r.lbp2 / 90000.0, 2), 'waiter', round(r.lbp2 / 90000.0, 2)));
      END IF;
    END IF;

    INSERT INTO menu_items (restaurant_id, category_id, menu_name, invoice_name, kitchen_name,
                            price_dine_in, price_takeaway, price_delivery, price_waiter, cost_price,
                            description, images, is_available, position, has_variants, variant_prices)
    VALUES (rid, cid, r.name, COALESCE(r.short_name, r.name), COALESCE(r.short_name, r.name),
            usd, usd, usd, usd, 0,
            r.descr, '[]'::jsonb, true, r.pos, r.size1 IS NOT NULL, v)
    RETURNING id INTO mid;
    n_item := n_item + 1;

    IF r.modifier IS NOT NULL THEN
      INSERT INTO menu_item_modifiers (menu_item_id, modifier_group_id, sort_order)
      SELECT mid, g.id, 0 FROM modifier_groups g WHERE g.restaurant_id = rid AND g.name = r.modifier
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RAISE NOTICE 'Menu done for restaurant %: % categories, % items, % modifier groups created.', rid, n_cat, n_item, n_mod;
END $$;

COMMIT;
