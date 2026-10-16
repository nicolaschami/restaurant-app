// src/routes/auth.ts
import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users,restaurants } from '../db/schema.js';




export default async function authRoutes(fastify: FastifyInstance) {

  // REGISTER ROUTE (create a new staff user)
  // Only a logged-in user can call this: the global login guard in app.ts checks the
  // token before we get here, and fills request.user from it.
  // TODO (roles step #6): allow only admins/managers to create users.
fastify.post('/api/auth/register', async (request, reply) => {
  const body = (request.body as any) || {};
  const { name, password, roleId } = body;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!name || !email || !password) {
    return reply.status(400).send({ error: 'Name, email, and password are required.' });
  }
  if (String(password).length < 6) {
    return reply.status(400).send({ error: 'Password must be at least 6 characters.' });
  }

  // The new user always joins the SAME restaurant as the person creating it.
  // We take it from the login token, never from the request body — otherwise
  // anyone could add users to another restaurant.
  const { restaurantId } = request.user;
  if (!restaurantId) {
    return reply.status(403).send({ error: 'Your account is not assigned to a restaurant.' });
  }

  // One account per email (login looks users up by email).
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    return reply.status(409).send({ error: 'A user with this email already exists.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // Role: use the given roleId, or 1 by default.
  const userRoleId = roleId ? Number(roleId) : 1;

  const [newUser] = await db
    .insert(users)
    .values({
      restaurantId,
      name,
      email,
      passwordHash: hashedPassword,
      role: userRoleId,
    })
    .returning();

  const { passwordHash, ...userWithoutPassword } = newUser;

  return reply.status(201).send({ user: userWithoutPassword });
});

  // LOGIN ROUTE
 fastify.post('/api/auth/login', async (request, reply) => {
  const { password, ...rest } = (request.body as { email?: string; password?: string }) || {};
  // Same format as register stores it, so "Admin@Restaurant.com " still matches.
  const email = rest.email?.trim().toLowerCase();

  // 1. Validate request body
  if (!email || !password) {
    return reply.status(400).send({ error: 'Email and password are required.' });
  }

  // 2. Fetch user from DB
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    return reply.status(401).send({ error: 'Invalid email or password.' });
  }

  // 3. Verify password
  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    return reply.status(401).send({ error: 'Invalid email or password.' });
  }

  // 4. Fetch restaurant details
 // 4. Fetch restaurant details
let restaurantName = 'Tasty Bistro';

try {
  if (user.restaurantId) {
    const restaurant = await db.query.restaurants.findFirst({
      where: eq(restaurants.id, user.restaurantId),
    });
    if (restaurant?.name) {
      restaurantName = restaurant.name;
    }
  }
} catch (dbErr) {
  console.error('Error fetching restaurant:', dbErr);
}

// 5. Generate JWT token
const token = fastify.jwt.sign({
  id: user.id,
  email: user.email,
  role: user.role,
  restaurantId: user.restaurantId,
  restaurantName,
} as any);

// 6. Return token + updated user info
return reply.send({
  token,
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    restaurantId: user.restaurantId,
    restaurantName, // 👈 Explicitly included here
  },
});
});
}