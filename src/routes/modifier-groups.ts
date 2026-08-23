import { FastifyInstance } from 'fastify';
import { eq, and, notInArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { modifierGroups, modifierOptions } from '../db/schema.js';

export async function modifierGroupRoutes(fastify: FastifyInstance) {

  // GET ALL GROUPS WITH OPTIONS
  fastify.get('/api/modifier-groups', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { restaurantId } = request.user;

    if (!restaurantId) {
      return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
    }

    const groups = await db.query.modifierGroups.findMany({
      where: eq(modifierGroups.restaurantId, restaurantId),
      with: { options: true },
    });

    return reply.send({ modifierGroups: groups });
  });

  // CREATE MODIFIER GROUP WITH OPTIONS
  fastify.post('/api/modifier-groups', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { restaurantId } = request.user;
    const body = request.body as any;

    if (!restaurantId) {
      return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
    }

    if (!body?.name?.trim()) {
      return reply.status(400).send({ error: 'Group name is required.' });
    }

    // 1. Create Modifier Group
   const [newGroup] = await db
  .insert(modifierGroups)
  .values({
    restaurantId: restaurantId!, // Add '!' to assert it exists
    name: body.name.trim(),
    minSelection: body.minSelection ?? 0,
    maxSelection: body.maxSelection ?? 1,
    isRequired: Boolean(body.isRequired),
  })
  .returning();

    // 2. Insert Options if provided
    if (Array.isArray(body.options) && body.options.length > 0) {
      const optionsToInsert = body.options.map((opt: any) => ({
        modifierGroupId: newGroup.id,
        name: opt.name.trim(),
        priceAdjustment: String(opt.price ?? opt.priceAdjustment ?? '0.00'),
      }));

      await db.insert(modifierOptions).values(optionsToInsert);
    }

    // Return created group with inserted options
    const fullGroup = await db.query.modifierGroups.findFirst({
      where: eq(modifierGroups.id, newGroup.id),
      with: { options: true },
    });

    return reply.status(201).send({ modifierGroup: fullGroup });
  });

  // UPDATE MODIFIER GROUP AND SYNC OPTIONS
  fastify.put('/api/modifier-groups/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const groupId = parseInt(id, 10);
    const { restaurantId } = request.user;
    const body = request.body as any;

    if (isNaN(groupId)) return reply.status(400).send({ error: 'Invalid group ID.' });

    if (!restaurantId) {
      return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
    }

    const group = await db.query.modifierGroups.findFirst({
      where: and(
        eq(modifierGroups.id, groupId),
        eq(modifierGroups.restaurantId, restaurantId)
      ),
    });

    if (!group) return reply.status(404).send({ error: 'Modifier group not found.' });

    // 1. Update Group Details
    const [updatedGroup] = await db
      .update(modifierGroups)
      .set({
        name: body.name !== undefined ? body.name.trim() : group.name,
        minSelection: body.minSelection ?? group.minSelection,
        maxSelection: body.maxSelection ?? group.maxSelection,
        isRequired: body.isRequired !== undefined ? Boolean(body.isRequired) : group.isRequired,
      })
      .where(
        and(
          eq(modifierGroups.id, groupId),
          eq(modifierGroups.restaurantId, restaurantId)
        )
      )
      .returning();

    // 2. Sync Nested Options if provided
    if (Array.isArray(body.options)) {
      const incomingIds: number[] = [];

      for (const opt of body.options) {
        if (opt.id) {
          // Update existing option
          incomingIds.push(opt.id);
          await db
            .update(modifierOptions)
            .set({
              name: opt.name.trim(),
              priceAdjustment: String(opt.price ?? opt.priceAdjustment ?? '0.00'),
            })
            .where(
              and(
                eq(modifierOptions.id, opt.id),
                eq(modifierOptions.modifierGroupId, groupId)
              )
            );
        } else {
          // Create new option
          const [inserted] = await db
            .insert(modifierOptions)
            .values({
              modifierGroupId: groupId,
              name: opt.name.trim(),
              priceAdjustment: String(opt.price ?? opt.priceAdjustment ?? '0.00'),
            })
            .returning();
          incomingIds.push(inserted.id);
        }
      }

      // Remove options that were deleted in the UI
      if (incomingIds.length > 0) {
        await db
          .delete(modifierOptions)
          .where(
            and(
              eq(modifierOptions.modifierGroupId, groupId),
              notInArray(modifierOptions.id, incomingIds)
            )
          );
      } else {
        await db
          .delete(modifierOptions)
          .where(eq(modifierOptions.modifierGroupId, groupId));
      }
    }

    // Return updated group with synced options
    const fullGroup = await db.query.modifierGroups.findFirst({
      where: eq(modifierGroups.id, groupId),
      with: { options: true },
    });

    return reply.send({ modifierGroup: fullGroup });
  });

  // DELETE MODIFIER GROUP
  fastify.delete('/api/modifier-groups/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const groupId = parseInt(id, 10);
    const { restaurantId } = request.user;

    if (isNaN(groupId)) return reply.status(400).send({ error: 'Invalid group ID.' });

    if (!restaurantId) {
      return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
    }

    const group = await db.query.modifierGroups.findFirst({
      where: and(
        eq(modifierGroups.id, groupId),
        eq(modifierGroups.restaurantId, restaurantId)
      ),
    });

    if (!group) return reply.status(404).send({ error: 'Modifier group not found.' });

    await db
      .delete(modifierGroups)
      .where(
        and(
          eq(modifierGroups.id, groupId),
          eq(modifierGroups.restaurantId, restaurantId)
        )
      );

    return reply.send({ message: 'Modifier group deleted successfully.' });
  });
}