// src/routes/users.ts
//
// Settings → Users (owner only — see lib/roles.ts), users & roles 2026-10-26:
//   GET   /api/users          the restaurant's users (+ its loginCode)
//   POST  /api/users          { name, username (or email), password, role, pin? }
//   PATCH /api/users/:id      { name?, username?, role?, isActive?, password?, pin? }  (pin '' = remove)
// Login codes (2026-10-28): a restaurant with a login code ("capri") has logins
// "username@capri". The owner types only "sara"; the SERVER adds "@capri" from the
// owner's own restaurant, never from the browser. A restaurant without a code
// (older ones) keeps email logins.
// Safety rules:
//   - always within the owner's OWN restaurant;
//   - you cannot change your own role or deactivate yourself (no locking yourself out);
//   - a restaurant always keeps at least one active owner;
//   - a PIN is 4 digits and unique in the restaurant (stored as a hash).
//
// Platform (platform owner only):
//   GET    /api/platform/restaurants       (+ orders count, locked = holds a platform owner)
//   PUT    /api/platform/restaurants/:id   { name?, phone?, country?, currency?, timezone?, loginCode? }
//   POST   /api/platform/restaurants/:id/reset-owner-password  → a new password, shown once
//   DELETE /api/platform/restaurants/:id   { confirm }  → the restaurant and all its data
//   POST /api/platform/restaurants  { restaurant: { name, loginCode, phone, country?, currency?, timezone? },
//                                     owner: { name, username?, password } }   (username default "admin")
//   → creates the restaurant and its owner account in one step; the owner then creates
//     the restaurant's users (agreed with the user: no invite link).

import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { restaurants, users } from '../db/schema.js';
import { getRestaurantId } from '../lib/tenant.js';
import { ROLES, forgetUser, type Role } from '../lib/roles.js';

const cleanEmail = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
// "sara", "rami.k", "cashier-2": lowercase, no spaces, no "@"
const isUsername = (v: string) => /^[a-z0-9][a-z0-9._-]{0,29}$/.test(v);
// "capri", "tahin": the same rule as the database (sql/2026-10-28_login_codes.sql)
const isLoginCode = (v: string) => /^[a-z0-9]{2,20}$/.test(v);
const USERNAME_HELP = 'Enter a username: letters, numbers, . - _ (no spaces).';

// The restaurant's login code, or null (older restaurant: email logins).
async function loginCodeOf(restaurantId: number): Promise<string | null> {
  const [r] = (await db.execute(sql`SELECT login_code FROM restaurants WHERE id = ${restaurantId}`)) as any[];
  return r?.login_code ?? null;
}

// Is this login used by ANOTHER user (any restaurant)?
async function loginTaken(login: string, exceptUserId?: number) {
  const u = await db.query.users.findFirst({ where: eq(users.email, login) });
  return Boolean(u && u.id !== exceptUserId);
}

// Public shape of a user (never the password or PIN hash).
const publicUser = (u: typeof users.$inferSelect) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: u.isActive !== false,
  hasPin: Boolean(u.pinHash),
  createdAt: u.createdAt,
});

// Is this 4-digit PIN already used by another active user of the restaurant?
async function pinTaken(restaurantId: number, pin: string, exceptUserId?: number) {
  const staff = await db
    .select({ id: users.id, pinHash: users.pinHash })
    .from(users)
    .where(and(eq(users.restaurantId, restaurantId), eq(users.isActive, true)));
  for (const u of staff) {
    if (u.id !== exceptUserId && u.pinHash && (await bcrypt.compare(pin, u.pinHash))) return true;
  }
  return false;
}

export default async function userRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------- Users (owner)
  fastify.get('/api/users', async (request) => {
    const restaurantId = getRestaurantId(request);
    const rows = await db.select().from(users).where(eq(users.restaurantId, restaurantId)).orderBy(users.name);
    return { users: rows.map(publicUser), loginCode: await loginCodeOf(restaurantId) };
  });

  fastify.post('/api/users', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const b = (request.body || {}) as any;
    const name = String(b.name || '').trim();
    const password = String(b.password || '');
    const role: Role = ROLES.includes(b.role) ? b.role : 'cashier';
    const pin = b.pin === undefined || b.pin === null ? '' : String(b.pin);

    if (!name) return reply.status(400).send({ error: 'Enter the name.' });
    // The login: "sara" + "@capri" (the owner's restaurant), or an email (no code).
    const code = await loginCodeOf(restaurantId);
    let email: string;
    if (code) {
      const username = cleanEmail(b.username);
      if (!isUsername(username)) return reply.status(400).send({ error: USERNAME_HELP });
      email = `${username}@${code}`;
    } else {
      email = cleanEmail(b.email);
      if (!isEmail(email)) return reply.status(400).send({ error: 'Enter a valid email.' });
    }
    if (password.length < 6) return reply.status(400).send({ error: 'The password needs at least 6 characters.' });
    if (pin && !/^\d{4}$/.test(pin)) return reply.status(400).send({ error: 'The PIN must be 4 digits.' });
    if (await loginTaken(email)) {
      return reply.status(409).send({ error: `${email} already exists. Choose another ${code ? 'username' : 'email'}.` });
    }
    if (pin && (await pinTaken(restaurantId, pin))) {
      return reply.status(409).send({ error: 'This PIN is already used by another user. Choose another one.' });
    }
    const [u] = await db
      .insert(users)
      .values({
        restaurantId,
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role,
        isActive: true,
        pinHash: pin ? await bcrypt.hash(pin, 10) : null,
      })
      .returning();
    return reply.status(201).send({ user: publicUser(u) });
  });

  fastify.patch('/api/users/:id', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const id = Number((request.params as any).id);
    const meId = Number(request.user.id);
    const b = (request.body || {}) as any;

    const target = await db.query.users.findFirst({ where: and(eq(users.id, id), eq(users.restaurantId, restaurantId)) });
    if (!target) return reply.status(404).send({ error: 'User not found.' });

    const set: Record<string, any> = {};
    if (b.name !== undefined) {
      const name = String(b.name).trim();
      if (!name) return reply.status(400).send({ error: 'Enter the name.' });
      set.name = name;
    }
    // rename the login: "sara" → "sara.h"; "@capri" stays (only with a login code)
    if (b.username !== undefined) {
      const code = await loginCodeOf(restaurantId);
      if (!code) return reply.status(400).send({ error: 'This restaurant logs in with emails.' });
      const username = cleanEmail(b.username);
      if (!isUsername(username)) return reply.status(400).send({ error: USERNAME_HELP });
      const login = `${username}@${code}`;
      if (login !== target.email) {
        if (await loginTaken(login, id)) return reply.status(409).send({ error: `${login} already exists. Choose another username.` });
        set.email = login;
      }
    }
    if (b.role !== undefined) {
      if (!ROLES.includes(b.role)) return reply.status(400).send({ error: 'Unknown role.' });
      if (id === meId && b.role !== target.role) return reply.status(400).send({ error: 'You cannot change your own role.' });
      set.role = b.role;
    }
    if (b.isActive !== undefined) {
      if (id === meId && b.isActive === false) return reply.status(400).send({ error: 'You cannot deactivate yourself.' });
      set.isActive = Boolean(b.isActive);
    }
    // never leave the restaurant without an active owner
    const losesOwner = target.role === 'owner' && ((set.role && set.role !== 'owner') || set.isActive === false);
    if (losesOwner) {
      const [{ n }] = (await db.execute(sql`
        SELECT COUNT(*)::int AS n FROM users
        WHERE restaurant_id = ${restaurantId} AND role = 'owner' AND is_active = true AND id <> ${id}
      `)) as any[];
      if (!n) return reply.status(400).send({ error: 'The restaurant must keep at least one active owner.' });
    }
    if (b.password !== undefined && b.password !== '') {
      if (String(b.password).length < 6) return reply.status(400).send({ error: 'The password needs at least 6 characters.' });
      set.passwordHash = await bcrypt.hash(String(b.password), 10);
    }
    if (b.pin !== undefined) {
      const pin = String(b.pin ?? '');
      if (pin === '') set.pinHash = null;
      else {
        if (!/^\d{4}$/.test(pin)) return reply.status(400).send({ error: 'The PIN must be 4 digits.' });
        if (await pinTaken(restaurantId, pin, id)) {
          return reply.status(409).send({ error: 'This PIN is already used by another user. Choose another one.' });
        }
        set.pinHash = await bcrypt.hash(pin, 10);
      }
    }
    if (!Object.keys(set).length) return reply.status(400).send({ error: 'Nothing to change.' });

    const [u] = await db.update(users).set(set).where(eq(users.id, id)).returning();
    forgetUser(id); // the new role / status applies at once
    return { user: publicUser(u) };
  });

  // ---------------------------------------------------------------- Platform (platform owner)
  fastify.get('/api/platform/restaurants', async () => {
    const rows = await db.execute(sql`
      SELECT r.id, r.name, r.login_code AS "loginCode", r.phone, r.country, r.currency, r.timezone, r.created_at AS "createdAt",
             (SELECT COUNT(*) FROM users u WHERE u.restaurant_id = r.id)::int AS "users",
             (SELECT u.email FROM users u WHERE u.restaurant_id = r.id AND u.role = 'owner' ORDER BY u.id LIMIT 1) AS "ownerEmail",
             (SELECT COUNT(*) FROM orders o WHERE o.restaurant_id = r.id)::int AS "orders",
             -- a restaurant with a platform owner account (yours) can never be deleted
             EXISTS (SELECT 1 FROM users u WHERE u.restaurant_id = r.id AND u.is_platform_admin) AS "locked"
      FROM restaurants r
      ORDER BY r.id
    `);
    return { restaurants: rows };
  });

  // EDIT a restaurant (2026-10-31, the user's request: fix a mistake without deleting it).
  //   PUT /api/platform/restaurants/:id   { name?, phone?, country?, currency?, timezone?, loginCode? }
  // Changing the login code renames EVERY login of the restaurant: sara@old → sara@new (the
  // staff must be told). A restaurant without a code (older, email logins) can get one: its
  // existing email logins stay as they are, new users get username@code.
  fastify.put('/api/platform/restaurants/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) return reply.status(400).send({ error: 'Invalid restaurant.' });
    const b = (request.body || {}) as any;
    const [r] = (await db.execute(sql`SELECT id, name, phone, login_code AS "loginCode" FROM restaurants WHERE id = ${id}`)) as any[];
    if (!r) return reply.status(404).send({ error: 'Restaurant not found.' });

    const name = b.name === undefined ? r.name : String(b.name).trim().slice(0, 255);
    const phone = b.phone === undefined ? r.phone : String(b.phone).trim().slice(0, 50);
    if (!name) return reply.status(400).send({ error: 'Enter the restaurant name.' });
    if (!phone) return reply.status(400).send({ error: 'Enter the restaurant phone.' });
    const newCode = b.loginCode === undefined ? r.loginCode : cleanEmail(b.loginCode) || null;
    if (newCode !== r.loginCode) {
      if (!newCode) return reply.status(400).send({ error: 'A login code cannot be removed, only changed.' });
      if (!isLoginCode(newCode)) return reply.status(400).send({ error: 'The login code: 2 to 20 letters or numbers, no spaces (e.g. capri).' });
      const [used] = (await db.execute(sql`SELECT 1 FROM restaurants WHERE login_code = ${newCode} AND id <> ${id}`)) as any[];
      if (used) return reply.status(409).send({ error: `The login code "${newCode}" is already used by another restaurant.` });
    }
    const currency = /^[A-Za-z]{3}$/.test(String(b.currency || '')) ? String(b.currency).toUpperCase() : null;
    const timezone = b.timezone ? String(b.timezone).slice(0, 50) : null;

    let renamed: any[] = [];
    try {
    renamed = await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE restaurants SET
          name = ${name}, phone = ${phone},
          country = ${b.country === undefined ? sql`country` : b.country ? String(b.country).slice(0, 100) : null},
          currency = COALESCE(${currency}, currency),
          timezone = COALESCE(${timezone}, timezone),
          login_code = ${newCode},
          updated_at = now()
        WHERE id = ${id}
      `);
      if (!r.loginCode || newCode === r.loginCode) return [] as any[];
      // every login of the restaurant follows the new code: sara@old → sara@new
      // (a login with the new code already taken anywhere stops the whole change)
      const rows = (await tx.execute(sql`
        UPDATE users SET email = left(email, length(email) - length(${'@' + r.loginCode})) || ${'@' + newCode}
        WHERE restaurant_id = ${id} AND right(email, length(${'@' + r.loginCode})) = ${'@' + r.loginCode}
        RETURNING id
      `)) as any[];
      return rows;
    });
    } catch (err: any) {
      if ((err?.code ?? err?.cause?.code) === '23505') {
        return reply.status(409).send({ error: 'A login with the new code already exists: nothing was changed.' });
      }
      request.log.error(err);
      return reply.status(500).send({ error: 'The restaurant could not be saved. Nothing was changed.' });
    }
    for (const u of renamed) forgetUser(Number(u.id));
    return { ok: true, loginCode: newCode, loginsRenamed: renamed.length };
  });

  // The OWNER's password, reset by the platform owner (the owner forgot it): a new starting
  // password, shown ONCE (like when the restaurant is created). The owner changes it.
  //   POST /api/platform/restaurants/:id/reset-owner-password
  fastify.post('/api/platform/restaurants/:id/reset-owner-password', async (request, reply) => {
    const id = Number((request.params as any).id);
    const [owner] = (await db.execute(sql`
      SELECT id, email FROM users WHERE restaurant_id = ${id} AND role = 'owner' AND is_platform_admin = false ORDER BY id LIMIT 1
    `)) as any[];
    if (!owner) return reply.status(404).send({ error: 'This restaurant has no owner account.' });
    const password = `Res-${randomBytes(4).toString('hex')}`;
    await db.update(users).set({ passwordHash: await bcrypt.hash(password, 10), isActive: true }).where(eq(users.id, owner.id));
    forgetUser(Number(owner.id));
    return { username: owner.email, password };
  });

  // DELETE a restaurant and EVERYTHING in it (2026-10-31, the user's request; platform owner
  // only — lib/roles.ts). The database function delete_restaurant does it in one transaction
  // and refuses a restaurant holding a platform owner (sql/2026-10-31_delete_restaurant.sql).
  // Safety: the caller must type back the restaurant's login code (or its name when it has no
  // code), so a wrong click can never delete the wrong restaurant.
  //   DELETE /api/platform/restaurants/:id   { confirm: "capri" }
  fastify.delete('/api/platform/restaurants/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) return reply.status(400).send({ error: 'Invalid restaurant.' });
    const [r] = (await db.execute(sql`SELECT id, name, login_code AS "loginCode" FROM restaurants WHERE id = ${id}`)) as any[];
    if (!r) return reply.status(404).send({ error: 'Restaurant not found.' });
    if (id === Number(request.user?.restaurantId)) return reply.status(409).send({ error: 'This is your own restaurant: it cannot be deleted.' });
    const expected = String(r.loginCode || r.name).trim().toLowerCase();
    const typed = String((request.body as any)?.confirm ?? '').trim().toLowerCase();
    if (typed !== expected) {
      return reply.status(400).send({ error: `To confirm, type exactly: ${r.loginCode || r.name}` });
    }
    try {
      const [res] = (await db.execute(sql`SELECT delete_restaurant(${id}) AS deleted`)) as any[];
      request.log.warn({ restaurantId: id, by: request.user?.id, deleted: res?.deleted }, 'Restaurant deleted');
      return { deleted: res?.deleted ?? { restaurant: r.name } };
    } catch (err: any) {
      const msg = String(err?.cause?.message || err?.message || '');
      if (/platform owner/i.test(msg)) return reply.status(409).send({ error: 'This restaurant holds a platform owner account: it cannot be deleted.' });
      request.log.error(err);
      return reply.status(500).send({ error: 'The restaurant could not be deleted. Nothing was changed.' });
    }
  });

  fastify.post('/api/platform/restaurants', async (request, reply) => {
    const b = (request.body || {}) as any;
    const r = b.restaurant || {};
    const o = b.owner || {};
    const name = String(r.name || '').trim();
    const phone = String(r.phone || '').trim();
    const loginCode = cleanEmail(r.loginCode);
    const ownerName = String(o.name || '').trim();
    const ownerUsername = cleanEmail(o.username) || 'admin';
    const ownerPassword = String(o.password || '');
    if (!name) return reply.status(400).send({ error: 'Enter the restaurant name.' });
    if (!isLoginCode(loginCode)) return reply.status(400).send({ error: 'Enter the login code: 2 to 20 letters or numbers, no spaces (e.g. capri).' });
    if (!phone) return reply.status(400).send({ error: 'Enter the restaurant phone.' });
    if (!ownerName) return reply.status(400).send({ error: "Enter the owner's name." });
    if (!isUsername(ownerUsername)) return reply.status(400).send({ error: USERNAME_HELP });
    if (ownerPassword.length < 6) return reply.status(400).send({ error: 'The password needs at least 6 characters.' });
    const [codeUsed] = (await db.execute(sql`SELECT 1 FROM restaurants WHERE login_code = ${loginCode}`)) as any[];
    if (codeUsed) return reply.status(409).send({ error: `The login code "${loginCode}" is already used by another restaurant.` });
    const ownerEmail = `${ownerUsername}@${loginCode}`; // the owner's login: admin@capri
    if (await loginTaken(ownerEmail)) {
      return reply.status(409).send({ error: `${ownerEmail} already exists.` });
    }
    const currency = /^[A-Za-z]{3}$/.test(String(r.currency || '')) ? String(r.currency).toUpperCase() : 'USD';

    const result = await db.transaction(async (tx) => {
      const [rest] = await tx
        .insert(restaurants)
        .values({
          name,
          phone,
          country: r.country ? String(r.country).slice(0, 100) : null,
          currency,
          timezone: r.timezone ? String(r.timezone).slice(0, 50) : 'UTC',
        } as any)
        .returning();
      await tx.execute(sql`UPDATE restaurants SET login_code = ${loginCode} WHERE id = ${rest.id}`);
      const [owner] = await tx
        .insert(users)
        .values({
          restaurantId: rest.id,
          name: ownerName,
          email: ownerEmail,
          passwordHash: await bcrypt.hash(ownerPassword, 10),
          role: 'owner',
          isActive: true,
        })
        .returning();
      return { rest, owner };
    });
    return reply.status(201).send({
      restaurant: { id: result.rest.id, name: result.rest.name, loginCode },
      owner: publicUser(result.owner),
    });
  });

  void ne; // (kept for later filters)
}
