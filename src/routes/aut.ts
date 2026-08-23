// src/routes/auth.ts
import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users,restaurants } from '../db/schema.js';




export default async function authRoutes(fastify: FastifyInstance) {

  // REGISTER ROUTE
 
fastify.post('/api/auth/register', async (request, reply) => {
  const body = (request.body as any) || {};
  const { restaurantId, name, email, password, roleId } = body;

  if (!name || !email || !password) {
    return reply.status(400).send({ error: 'Name, email, and password are required.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // 1. Explicitly assign role (use passed roleId or fallback to 1)
  const userRoleId = roleId ? Number(roleId) : 1;

  const [newUser] = await db
    .insert(users)
    .values({
      restaurantId: restaurantId ? Number(restaurantId) : 1,
      name,
      email,
      passwordHash: hashedPassword,
      role: userRoleId, // 👈 Explicitly passing the value 1
    })
    .returning();

  const { passwordHash, ...userWithoutPassword } = newUser;

  return reply.status(201).send({ user: userWithoutPassword });
});

  // LOGIN ROUTE
 fastify.post('/api/auth/login', async (request, reply) => {
  const { email, password } = (request.body as { email?: string; password?: string }) || {};

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