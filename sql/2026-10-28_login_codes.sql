-- 2026-10-28: LOGIN CODES (asked by the user). Each restaurant gets a short code
-- ("capri", "tahin") and its users log in as  username@code  (admin@capri, sara@capri)
-- instead of an email. The platform owner types the code once, when creating the
-- restaurant; it cannot be changed later (every login of the restaurant ends with it).
--   - The login is still kept in users.email (already unique): "sara@capri".
--   - Older restaurants have no code (NULL): their users keep logging in with an email.
-- Safe to run again.

BEGIN;

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS login_code varchar(20);

DO $$
BEGIN
  -- short, lowercase letters and digits only: "capri", "tahin"
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restaurants_login_code_check') THEN
    ALTER TABLE restaurants ADD CONSTRAINT restaurants_login_code_check CHECK (login_code ~ '^[a-z0-9]{2,20}$');
  END IF;
END $$;

-- two restaurants can never have the same code
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_login_code ON restaurants (login_code) WHERE login_code IS NOT NULL;

COMMIT;
