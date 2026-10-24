-- 2026-10-26 (cloud-ready): pictures and logos are stored as "/uploads/x.png" instead of
-- "http://127.0.0.1:3000/uploads/x.png", so they work on any machine (VPS, domain).
-- This turns the addresses saved before into the short form. Safe to run again.
UPDATE menu_items
SET images = regexp_replace(images::text, 'https?://[^/" ]+/uploads/', '/uploads/', 'g')::jsonb
WHERE images::text ~ 'https?://[^/" ]+/uploads/';

UPDATE restaurants
SET logo_url = regexp_replace(logo_url, '^https?://[^/" ]+/uploads/', '/uploads/')
WHERE logo_url ~ '^https?://[^/" ]+/uploads/';
