-- 2026-10-26: users & roles (agreed with the user):
--   role: 'owner'   = restaurant admin (everything, incl. Users, Restaurant Info, printers)
--         'manager' = menu, purchases, stock, tables, reports (+ everything a cashier does)
--         'cashier' = POS, orders, payments, printing, opening cash, Z closing, kitchen
--   is_platform_admin: the platform owner (creates restaurants and their owner account).
--   pin_code: a 4-digit PIN for "Switch user" on the POS — stored as a bcrypt HASH.
-- The old numeric role_id stays (unused) so nothing breaks.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'cashier';
DO $$ BEGIN
  ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'manager', 'cashier'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- Existing accounts keep their level: role_id 1 ("Admin") → manager, others → cashier;
-- the user's own account becomes the owner of Tasty Bistro and the platform owner.
UPDATE public.users SET role = CASE WHEN role_id = 1 THEN 'manager' ELSE 'cashier' END WHERE role = 'cashier';
UPDATE public.users SET role = 'owner', is_platform_admin = true WHERE email = 'admin@restaurant.com';

-- pin_code (varchar 10) is too short for a bcrypt hash: the PIN hash has its own column.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pin_hash varchar(72);
