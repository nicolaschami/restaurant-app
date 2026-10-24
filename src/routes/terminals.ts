// src/routes/terminals.ts
//
// POS TERMINALS — PIN-only login (agreed with the user 2026-10-26).
//
// How it works:
//   1. ONCE per PC: the owner or a manager logs in (email + password) and registers
//      the PC ("This PC is a POS terminal"). The server creates a long secret KEY,
//      stores only its hash (with the restaurant), and gives the key to the PC, which
//      keeps it. The key is like a house key: the restaurant number alone would be
//      like a house number — anyone can write it; the key proves the PC belongs.
//   2. EVERY login after that: the PC sends { terminal key, PIN }. The server finds
//      the restaurant FROM THE KEY, then the active user with that PIN INSIDE that
//      restaurant (a PIN is unique per restaurant). So the same PIN can exist in
//      another restaurant without any mix-up.
//   3. Safety: a PIN works only with a registered key; 5 wrong PINs → the terminal
//      waits 1 minute; the owner can remove a terminal (it then asks for email again).
//
// Routes
//   POST   /api/terminals                  { name } → { key } (shown once) — manager / owner
//   GET    /api/terminals                  the restaurant's terminals — manager / owner
//   DELETE /api/terminals/:id              remove one — manager / owner
//   POST   /api/auth/terminal-check        { key } → the restaurant's name (public)
//   POST   /api/auth/terminal-login        { key, pin } → a login (public)

import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { restaurants, users } from '../db/schema.js';
import { getRestaurantId } from '../lib/tenant.js';

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
const MAX_TRIES = 5;
const LOCK_SECONDS = 60;

// The terminal of a key (null if unknown / removed).
async function terminalOf(key: unknown) {
  const k = String(key ?? '');
  if (!k.startsWith('term_') || k.length < 30) return null;
  const [t] = (await db.execute(sql`
    SELECT t.id, t.restaurant_id AS "restaurantId", t.name, t.failed_attempts AS "failedAttempts",
           t.locked_until AS "lockedUntil", r.name AS "restaurantName", r.logo_url AS "logoUrl",
           r.receipt_header AS "welcome"
    FROM pos_terminals t JOIN restaurants r ON r.id = t.restaurant_id
    WHERE t.key_hash = ${hashKey(k)}
  `)) as any[];
  return t ?? null;
}

export default async function terminalRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------- register / list / remove
  fastify.post('/api/terminals', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const name = String((request.body as any)?.name || 'POS terminal').trim().slice(0, 60) || 'POS terminal';
    const key = `term_${randomBytes(24).toString('hex')}`; // given to the PC once, never stored
    const [row] = (await db.execute(sql`
      INSERT INTO pos_terminals (restaurant_id, name, key_hash, created_by)
      VALUES (${restaurantId}, ${name}, ${hashKey(key)}, (SELECT id FROM users WHERE id = ${request.user?.id ?? null}))
      RETURNING id
    `)) as any[];
    const r = await db.query.restaurants.findFirst({ where: eq(restaurants.id, restaurantId) });
    return reply.status(201).send({ id: row.id, name, key, restaurantName: r?.name ?? '' });
  });

  fastify.get('/api/terminals', async (request) => {
    const restaurantId = getRestaurantId(request);
    const rows = await db.execute(sql`
      SELECT t.id, t.name, t.created_at AS "createdAt", t.last_used_at AS "lastUsedAt",
             COALESCE(u.full_name, '') AS "createdBy"
      FROM pos_terminals t LEFT JOIN users u ON u.id = t.created_by
      WHERE t.restaurant_id = ${restaurantId}
      ORDER BY t.id
    `);
    return { terminals: rows };
  });

  fastify.delete('/api/terminals/:id', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const id = Number((request.params as any).id);
    const rows = (await db.execute(sql`DELETE FROM pos_terminals WHERE id = ${id} AND restaurant_id = ${restaurantId} RETURNING id`)) as any[];
    if (!rows.length) return reply.status(404).send({ error: 'Terminal not found.' });
    return { ok: true };
  });

  // ---------------------------------------------------------------- the PIN pad (public)
  // Is this PC still a terminal, and of which restaurant? (shown on the PIN pad)
  fastify.post('/api/auth/terminal-check', async (request, reply) => {
    const t = await terminalOf((request.body as any)?.key);
    if (!t) return reply.status(404).send({ error: 'This PC is no longer a POS terminal.' });
    // welcome line on the PIN pad = the first line of the receipt header (Restaurant Info)
    const welcome = String(t.welcome || '').split(String.fromCharCode(10)).map((l: string) => l.trim()).find(Boolean) || '';
    return { restaurantName: t.restaurantName, terminalName: t.name, logoUrl: t.logoUrl || '', welcome };
  });

  fastify.post('/api/auth/terminal-login', async (request, reply) => {
    const body = (request.body || {}) as { key?: unknown; pin?: unknown };
    const t = await terminalOf(body.key);
    if (!t) return reply.status(404).send({ error: 'This PC is no longer a POS terminal. Log in with email.' });

    // waiting after too many wrong PINs
    if (t.lockedUntil && new Date(t.lockedUntil).getTime() > Date.now()) {
      const s = Math.ceil((new Date(t.lockedUntil).getTime() - Date.now()) / 1000);
      return reply.status(429).send({ error: `Too many wrong PINs. Wait ${s} seconds.` });
    }

    const pin = String(body.pin ?? '');
    if (!/^\d{4}$/.test(pin)) return reply.status(400).send({ error: 'Enter the 4-digit PIN.' });

    // the user with this PIN, INSIDE the terminal's restaurant
    const staff = await db.select().from(users).where(and(eq(users.restaurantId, t.restaurantId), eq(users.isActive, true)));
    let found: (typeof staff)[number] | null = null;
    for (const u of staff) {
      if (u.pinHash && (await bcrypt.compare(pin, u.pinHash))) {
        found = u;
        break;
      }
    }

    if (!found) {
      const tries = Number(t.failedAttempts) + 1;
      if (tries >= MAX_TRIES) {
        await db.execute(sql`UPDATE pos_terminals SET failed_attempts = 0, locked_until = now() + make_interval(secs => ${LOCK_SECONDS}) WHERE id = ${t.id}`);
        return reply.status(429).send({ error: `Too many wrong PINs. Wait ${LOCK_SECONDS} seconds.` });
      }
      await db.execute(sql`UPDATE pos_terminals SET failed_attempts = ${tries} WHERE id = ${t.id}`);
      return reply.status(401).send({ error: `Wrong PIN (${MAX_TRIES - tries} tries left).` });
    }

    await db.execute(sql`UPDATE pos_terminals SET failed_attempts = 0, locked_until = NULL, last_used_at = now() WHERE id = ${t.id}`);
    const token = fastify.jwt.sign({
      id: found.id,
      email: found.email,
      role: found.role,
      restaurantId: found.restaurantId,
      restaurantName: t.restaurantName,
    } as any);
    return {
      token,
      user: {
        id: found.id,
        name: found.name,
        email: found.email,
        role: found.role,
        isPlatformAdmin: Boolean(found.isPlatformAdmin),
        restaurantId: found.restaurantId,
        restaurantName: t.restaurantName,
      },
    };
  });
}
