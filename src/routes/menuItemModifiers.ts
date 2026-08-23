import { FastifyInstance } from 'fastify';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { menuItems, modifierGroups, menuItemModifiers } from '../db/schema.js';

export async function menuItemModifierRoutes(fastify: FastifyInstance) {

  // 1. GET ALL MODIFIER GROUPS FOR A SPECIFIC MENU ITEM
  fastify.get('/api/menu-items/:id/modifiers', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const menuItemId = parseInt(id, 10);
    const { restaurantId } = request.user;

    if (isNaN(menuItemId)) return reply.status(400).send({ error: 'Invalid menu item ID.' });

    // Verify ownership of the menu item
    const item = await db.query.menuItems.findFirst({
      where: and(
        eq(menuItems.id, menuItemId),
        eq(menuItems.restaurantId, restaurantId!)
      ),
    });

    if (!item) return reply.status(404).send({ error: 'Menu item not found.' });

    // Fetch assigned modifier groups with their nested options
    const assigned = await db.query.menuItemModifiers.findMany({
      where: eq(menuItemModifiers.menuItemId, menuItemId),
      orderBy: (table, { asc }) => [asc(table.sortOrder)],
    });

    const groupIds = assigned.map((a) => a.modifierGroupId);

    if (groupIds.length === 0) {
      return reply.send({ modifierGroups: [] });
    }

    const groups = await db.query.modifierGroups.findMany({
      where: inArray(modifierGroups.id, groupIds),
      with: { options: true },
    });

    return reply.send({ modifierGroups: groups });
  });

  // 2. ASSIGN / SYNC MODIFIER GROUPS TO A MENU ITEM
  fastify.put('/api/menu-items/:id/modifiers', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const menuItemId = parseInt(id, 10);
    const { restaurantId } = request.user;
    const body = request.body as { modifierGroupIds: number[] };

    if (isNaN(menuItemId)) return reply.status(400).send({ error: 'Invalid menu item ID.' });

    if (!Array.isArray(body?.modifierGroupIds)) {
      return reply.status(400).send({ error: 'modifierGroupIds must be an array of numbers.' });
    }

    // Verify ownership of the menu item
    const item = await db.query.menuItems.findFirst({
      where: and(
        eq(menuItems.id, menuItemId),
        eq(menuItems.restaurantId, restaurantId!)
      ),
    });

    if (!item) return reply.status(404).send({ error: 'Menu item not found or access denied.' });

    // Clear existing associations
    await db.delete(menuItemModifiers).where(eq(menuItemModifiers.menuItemId, menuItemId));

    // Insert new associations if provided
    if (body.modifierGroupIds.length > 0) {
      const recordsToInsert = body.modifierGroupIds.map((groupId, index) => ({
        menuItemId,
        modifierGroupId: groupId,
        sortOrder: index,
      }));

      await db.insert(menuItemModifiers).values(recordsToInsert);
    }

    return reply.send({ message: 'Menu item modifiers updated successfully.' });
  });
}