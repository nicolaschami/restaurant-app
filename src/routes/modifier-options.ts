import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { modifierGroups, modifierOptions } from '../db/schema.js';

export async function modifierOptionRoutes(fastify: FastifyInstance) {
// this contains three routes : 1. ADD OPTION TO A GROUP    /  // 2. UPDATE AN OPTION  / // 3. DELETE AN OPTION


  // 1. ADD OPTION TO A GROUP
  fastify.post('/api/modifier-options', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { restaurantId } = request.user;
    const body = request.body as any;

    if (!restaurantId) {
      return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
    }

    if (!body?.modifierGroupId || !body?.name?.trim()) {
      return reply.status(400).send({ error: 'modifierGroupId and name are required.' });
    }

    const modifierGroupId = parseInt(body.modifierGroupId, 10);
    if (isNaN(modifierGroupId)) {
      return reply.status(400).send({ error: 'Invalid modifierGroupId.' });
    }

    // Verify the target group exists AND belongs to this user's restaurant
    const group = await db.query.modifierGroups.findFirst({
      where: and(
        eq(modifierGroups.id, modifierGroupId),
        eq(modifierGroups.restaurantId, restaurantId)
      ),
    });

    if (!group) {
      return reply.status(404).send({ error: 'Modifier group not found or access denied.' });
    }

    const [newOption] = await db
      .insert(modifierOptions)
      .values({
        modifierGroupId,
        name: body.name.trim(),
        priceAdjustment: String(body.priceAdjustment ?? '0.00'),
      })
      .returning();

    return reply.status(201).send({ modifierOption: newOption });
  });

  // 2. UPDATE AN OPTION
  fastify.put('/api/modifier-options/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const optionId = parseInt(id, 10);
    const { restaurantId } = request.user;
    const body = request.body as any;

    if (isNaN(optionId)) {
      return reply.status(400).send({ error: 'Invalid option ID.' });
    }

    if (!restaurantId) {
      return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
    }

    // Fetch option with its parent group to verify ownership
    const option = await db.query.modifierOptions.findFirst({
      where: eq(modifierOptions.id, optionId),
      with: { group: true },
    });

    if (!option || option.group?.restaurantId !== restaurantId) {
      return reply.status(404).send({ error: 'Modifier option not found or access denied.' });
    }

    const [updatedOption] = await db
      .update(modifierOptions)
      .set({
        name: body.name !== undefined ? body.name.trim() : option.name,
        priceAdjustment: body.priceAdjustment !== undefined ? String(body.priceAdjustment) : option.priceAdjustment,
      })
      .where(eq(modifierOptions.id, optionId))
      .returning();

    return reply.send({ modifierOption: updatedOption });
  });

  // 3. DELETE AN OPTION
  fastify.delete('/api/modifier-options/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const optionId = parseInt(id, 10);
    const { restaurantId } = request.user;

    if (isNaN(optionId)) {
      return reply.status(400).send({ error: 'Invalid option ID.' });
    }

    if (!restaurantId) {
      return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
    }

    // Verify ownership via group relation
    const option = await db.query.modifierOptions.findFirst({
      where: eq(modifierOptions.id, optionId),
      with: { group: true },
    });

    if (!option || option.group?.restaurantId !== restaurantId) {
      return reply.status(404).send({ error: 'Modifier option not found or access denied.' });
    }

    await db.delete(modifierOptions).where(eq(modifierOptions.id, optionId));

    return reply.send({ message: 'Modifier option deleted successfully.' });
  });
}