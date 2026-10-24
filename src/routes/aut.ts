// src/routes/auth.ts
//
// Login (users & roles, 2026-10-26):
//   POST /api/auth/login      { email, password } → token + the user (name, role…)
//   POST /api/auth/pin-login  { pin }  — "Switch user" on the POS: a 4-digit PIN of a
//                              user of the SAME restaurant as the current login
//   GET  /api/auth/me         who is logged in (name, role, platform admin)
// A deactivated user cannot log in. Users are created on the Users screen
// (routes/users.ts) — /api/auth/register is kept for older screens, owner only.
// The token carries id, restaurant and role; the server re-reads the role and the
// "active" status from the database on every request (lib/roles.ts).

import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, restaurants } from '../db/schema.js';
import { ROLES, currentUser } from '../lib/roles.js';

type UserRow = typeof users.$inferSelect;

export default async function authRoutes(fastify: FastifyInstance) {
  // The token + the user's details sent back after a login.
  async function loginAnswer(user: UserRow) {
    const restaurant = user.restaurantId
      ? await db.query.restaurants.findFirst({ where: eq(restaurants.id, user.restaurantId) })
      : null;
    const restaurantName = restaurant?.name || 'My Restaurant';
    const token = fastify.jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId,
      restaurantName,
    } as any);
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isPlatformAdmin: Boolean(user.isPlatformAdmin),
        restaurantId: user.restaurantId,
        restaurantName,
      },
    };
  }

  // ---- email + password
  fastify.post('/api/auth/login', async (request, reply) => {
    const { password, ...rest } = (request.body as { email?: string; password?: string }) || {};
    // Same format as stored, so "Admin@Restaurant.com " still matches.
    const email = rest.email?.trim().toLowerCase();
    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required.' });
    }

    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.status(401).send({ error: 'Invalid email or password.' });
    }
    if (user.isActive === false) {
      return reply.status(403).send({ error: 'This account is deactivated. Ask the restaurant owner.' });
    }
    return reply.send(await loginAnswer(user));
  });

  // ---- 4-digit PIN ("Switch user" on the POS). The current login says which
  // restaurant; the PIN picks the user among that restaurant's active users.
  fastify.post('/api/auth/pin-login', async (request, reply) => {
    const pin = String((request.body as any)?.pin ?? '');
    if (!/^\d{4}$/.test(pin)) return reply.status(400).send({ error: 'Enter the 4-digit PIN.' });
    const restaurantId = request.user?.restaurantId;
    if (!restaurantId) return reply.status(403).send({ error: 'Not linked to a restaurant.' });

    const staff = await db
      .select()
      .from(users)
      .where(and(eq(users.restaurantId, restaurantId), eq(users.isActive, true)));
    for (const u of staff) {
      if (u.pinHash && (await bcrypt.compare(pin, u.pinHash))) {
        return reply.send(await loginAnswer(u));
      }
    }
    return reply.status(401).send({ error: 'Wrong PIN.' });
  });

  // ---- who is logged in
  fastify.get('/api/auth/me', async (request, reply) => {
    const me = await currentUser(request.user.id);
    if (!me) return reply.status(401).send({ error: 'Unauthorized' });
    const u = await db.query.users.findFirst({ where: eq(users.id, request.user.id) });
    return {
      id: request.user.id,
      name: me.name,
      email: u?.email,
      role: me.role,
      isPlatformAdmin: me.isPlatformAdmin,
      restaurantId: me.restaurantId,
      hasPin: Boolean(u?.pinHash),
    };
  });

  // ---- create a user (older screens) — owner only (see lib/roles.ts)
  fastify.post('/api/auth/register', async (request, reply) => {
    const body = (request.body as any) || {};
    const name = String(body.name || '').trim();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = String(body.password || '');
    const role = ROLES.includes(body.role) ? body.role : 'cashier';
    if (!name || !email || !password) return reply.status(400).send({ error: 'Name, email, and password are required.' });
    if (password.length < 6) return reply.status(400).send({ error: 'Password must be at least 6 characters.' });

    // The new user always joins the SAME restaurant as the person creating it.
    const { restaurantId } = request.user;
    if (!restaurantId) return reply.status(403).send({ error: 'Your account is not assigned to a restaurant.' });
    if (await db.query.users.findFirst({ where: eq(users.email, email) })) {
      return reply.status(409).send({ error: 'A user with this email already exists.' });
    }
    const [newUser] = await db
      .insert(users)
      .values({ restaurantId, name, email, passwordHash: await bcrypt.hash(password, 10), role })
      .returning();
    const { passwordHash, pinHash, ...safe } = newUser;
    return reply.status(201).send({ user: safe });
  });
}
