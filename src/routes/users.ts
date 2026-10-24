// src/routes/users.ts
//
// Settings → Users (owner only — see lib/roles.ts), users & roles 2026-10-26:
//   GET   /api/users          the restaurant's users
//   POST  /api/users          { name, email, password, role, pin? }
//   PATCH /api/users/:id      { name?, role?, isActive?, password?, pin? }  (pin '' = remove)
// Safety rules:
//   - always within the owner's OWN restaurant;
//   - you cannot change your own role or deactivate yourself (no locking yourself out);
//   - a restaurant always keeps at least one active owner;
//   - a PIN is 4 digits and unique in the restaurant (stored as a hash).
//
// Platform (platform owner only):
//   GET  /api/platform/restaurants
//   POST /api/platform/restaurants  { restaurant: { name, phone, country?, currency?, timezone? },
//                                     owner: { name, email, password } }
//   → creates the restaurant and its owner account in one step; the owner then creates
//     the restaurant's users (agreed with the user: no invite link).

import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { restaurants, users } from '../db/schema.js';
import { getRestaurantId } from '../lib/tenant.js';
import { ROLES, forgetUser, type Role } from '../lib/roles.js';

const cleanEmail = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

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
    return { users: rows.map(publicUser) };
  });

  fastify.post('/api/users', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const b = (request.body || {}) as any;
    const name = String(b.name || '').trim();
    const email = cleanEmail(b.email);
    const password = String(b.password || '');
    const role: Role = ROLES.includes(b.role) ? b.role : 'cashier';
    const pin = b.pin === undefined || b.pin === null ? '' : String(b.pin);

    if (!name) return reply.status(400).send({ error: 'Enter the name.' });
    if (!isEmail(email)) return reply.status(400).send({ error: 'Enter a valid email.' });
    if (password.length < 6) return reply.status(400).send({ error: 'The password needs at least 6 characters.' });
    if (pin && !/^\d{4}$/.test(pin)) return reply.status(400).send({ error: 'The PIN must be 4 digits.' });
    if (await db.query.users.findFirst({ where: eq(users.email, email) })) {
      return reply.status(409).send({ error: 'A user with this email already exists.' });
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
      SELECT r.id, r.name, r.phone, r.country, r.currency, r.created_at AS "createdAt",
             (SELECT COUNT(*) FROM users u WHERE u.restaurant_id = r.id)::int AS "users",
             (SELECT u.email FROM users u WHERE u.restaurant_id = r.id AND u.role = 'owner' ORDER BY u.id LIMIT 1) AS "ownerEmail"
      FROM restaurants r
      ORDER BY r.id
    `);
    return { restaurants: rows };
  });

  fastify.post('/api/platform/restaurants', async (request, reply) => {
    const b = (request.body || {}) as any;
    const r = b.restaurant || {};
    const o = b.owner || {};
    const name = String(r.name || '').trim();
    const phone = String(r.phone || '').trim();
    const ownerName = String(o.name || '').trim();
    const ownerEmail = cleanEmail(o.email);
    const ownerPassword = String(o.password || '');
    if (!name) return reply.status(400).send({ error: 'Enter the restaurant name.' });
    if (!phone) return reply.status(400).send({ error: 'Enter the restaurant phone.' });
    if (!ownerName) return reply.status(400).send({ error: "Enter the owner's name." });
    if (!isEmail(ownerEmail)) return reply.status(400).send({ error: "Enter the owner's email." });
    if (ownerPassword.length < 6) return reply.status(400).send({ error: 'The password needs at least 6 characters.' });
    if (await db.query.users.findFirst({ where: eq(users.email, ownerEmail) })) {
      return reply.status(409).send({ error: 'A user with this email already exists.' });
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
      restaurant: { id: result.rest.id, name: result.rest.name },
      owner: publicUser(result.owner),
    });
  });

  void ne; // (kept for later filters)
}
