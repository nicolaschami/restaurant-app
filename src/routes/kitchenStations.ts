import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { kitchenStations } from '../db/schema.js';

export default async function kitchenStationRoutes(fastify: FastifyInstance) {
  // CREATE KITCHEN STATION
  fastify.post('/api/kitchen-stations', async (request, reply) => {
    const body = request.body as { restaurantId: number; name: string };

    if (!body?.restaurantId || !body?.name) {
      return reply.status(400).send({ error: 'restaurantId and name are required.' });
    }

    const [newStation] = await db
      .insert(kitchenStations)
      .values({
        restaurantId: body.restaurantId,
        name: body.name,
      })
      .returning();

    return reply.status(201).send({ station: newStation });
  });

  // GET ALL KITCHEN STATIONS
  fastify.get('/api/kitchen-stations', async (request, reply) => {
    const { restaurantId } = request.query as { restaurantId?: string };

    const result = await db
      .select()
      .from(kitchenStations)
      .where(restaurantId ? eq(kitchenStations.restaurantId, parseInt(restaurantId)) : undefined);

    return reply.send({ kitchenStations: result });
  });
}