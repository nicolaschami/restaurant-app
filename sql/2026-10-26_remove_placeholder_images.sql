-- 2026-10-26: an old version saved "https://placehold.co/...No+Image" as the picture of
-- dishes without a photo. It depends on an outside website and shows a broken image
-- when that site does not load. Removing it lets the screens show their own fallback
-- (an icon in Menu Items, the first letter in the POS). Real pictures are kept.
-- Safe to run again.
UPDATE menu_items
SET images = COALESCE(
  (SELECT jsonb_agg(e) FROM jsonb_array_elements(images) AS e WHERE e::text NOT LIKE '%placehold.co%'),
  '[]'::jsonb)
WHERE images::text LIKE '%placehold.co%';
