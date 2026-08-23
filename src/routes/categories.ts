import { FastifyInstance } from 'fastify';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { categories, menuItems } from '../db/schema.js';

export default async function categoryRoutes(fastify: FastifyInstance) {

  // 1. CREATE CATEGORY (Protected)
  fastify.post(
    '/api/categories',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { name, printerName } = request.body as { name: string; printerName?: string };

      // Validate name
      if (!name?.trim()) {
        return reply.status(400).send({ error: 'Category name is required.' });
      }

      const { id: userId, restaurantId } = request.user;
      if (!restaurantId) {
        return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
      }

      // Check duplicates
      const existingCategory = await db.query.categories.findFirst({
        where: and(
          eq(categories.restaurantId, restaurantId),
          eq(categories.name, name.trim())
        ),
      });

      if (existingCategory) {
        return reply.status(409).send({ error: 'A category with this name already exists for this restaurant.' });
      }

      // Insert category
      const [newCategory] = await db
  .insert(categories)
  .values({
    restaurantId,
    name: name.trim(),
    printername: printerName?.trim() || null, // 👈 Change printerName: to printername:
    createdById: userId,
    updatedById: userId,
  })
  .returning();

      return reply.status(201).send({ category: newCategory });
    }
  );

  // 2. GET ALL CATEGORIES PER RESTAURANT
  fastify.get(
    '/api/categories',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { restaurantId } = request.user;

      if (!restaurantId) {
        return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
      }

      const categoryList = await db
        .select()
        .from(categories)
        .where(eq(categories.restaurantId, restaurantId))
        .orderBy(asc(categories.position));

      return reply.send({ categories: categoryList });
    }
  );

  // 3. GET SINGLE CATEGORY
  fastify.get(
    '/api/categories/:id',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const categoryId = parseInt(id, 10);
      const { restaurantId } = request.user;

      if (isNaN(categoryId)) {
        return reply.status(400).send({ error: 'Invalid category ID.' });
      }

      if (!restaurantId) {
        return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
      }

      const category = await db.query.categories.findFirst({
        where: and(
          eq(categories.id, categoryId),
          eq(categories.restaurantId, restaurantId)
        ),
      });

      if (!category) {
        return reply.status(404).send({ error: 'Category not found.' });
      }

      return reply.send({ category });
    }
  );

  // 4. GET ITEMS INSIDE A CATEGORY
  fastify.get(
    '/api/categories/:categoryId/items',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { categoryId: paramId } = request.params as { categoryId: string };
      const categoryId = parseInt(paramId, 10);
      const { restaurantId } = request.user;

      if (isNaN(categoryId)) {
        return reply.status(400).send({ error: 'Invalid category ID.' });
      }

      if (!restaurantId) {
        return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
      }

      const items = await db
        .select()
        .from(menuItems)
        .where(
          and(
            eq(menuItems.categoryId, categoryId),
            eq(menuItems.restaurantId, restaurantId)
          )
        );

      return reply.send({ categoryId, items });
    }
  );

  // 5. UPDATE CATEGORY (PUT)
 // 5. UPDATE CATEGORY (PUT /api/categories/:id)
fastify.put(
  '/api/categories/:id',
  { onRequest: [fastify.authenticate] },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; printerName?: string };
    const categoryId = parseInt(id, 10);
    const { restaurantId, id: userId } = request.user;

    if (isNaN(categoryId)) {
      return reply.status(400).send({ error: 'Invalid category ID.' });
    }

    if (!restaurantId) {
      return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
    }

    // 1. Fetch the existing category first
    const existingCategory = await db.query.categories.findFirst({
      where: and(
        eq(categories.id, categoryId),
        eq(categories.restaurantId, restaurantId)
      ),
    });

    if (!existingCategory) {
      return reply.status(404).send({ error: 'Category not found.' });
    }

    // 2. Determine fields to update
    const newName = body?.name !== undefined ? body.name.trim() : existingCategory.name;
    const newPrinter = body?.printerName !== undefined ? (body.printerName.trim() || null) : existingCategory.printername;

    // Ensure name isn't accidentally cleared/empty
    if (!newName) {
      return reply.status(400).send({ error: 'Category name cannot be empty.' });
    }

    // 3. Check duplicate name ONLY if the name is actually changing
    if (body?.name !== undefined && newName !== existingCategory.name) {
      const duplicateCategory = await db.query.categories.findFirst({
        where: and(
          eq(categories.restaurantId, restaurantId),
          eq(categories.name, newName)
        ),
      });

      if (duplicateCategory && duplicateCategory.id !== categoryId) {
        return reply.status(409).send({ error: 'A category with this name already exists.' });
      }
    }

    // 4. Perform partial update
    const [updatedCategory] = await db
      .update(categories)
      .set({
        name: newName,
        printername: newPrinter,
        updatedById: userId,
      })
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.restaurantId, restaurantId)
        )
      )
      .returning();

    return reply.send({ category: updatedCategory });
  }
);

  // 6. DELETE CATEGORY
  fastify.delete(
    '/api/categories/:id',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const categoryId = parseInt(id, 10);
      const { restaurantId } = request.user;

      if (isNaN(categoryId)) {
        return reply.status(400).send({ error: 'Invalid category ID.' });
      }

      if (!restaurantId) {
        return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
      }

      const category = await db.query.categories.findFirst({
        where: and(
          eq(categories.id, categoryId),
          eq(categories.restaurantId, restaurantId)
        ),
      });

      if (!category) {
        return reply.status(404).send({ error: 'Category not found.' });
      }

      const linkedItems = await db.query.menuItems.findFirst({
        where: and(
          eq(menuItems.categoryId, categoryId),
          eq(menuItems.restaurantId, restaurantId)
        ),
      });

      if (linkedItems) {
        return reply.status(400).send({
          error: 'Cannot delete category because it contains active menu items. Please reassign or delete the items first.',
        });
      }

      await db
        .delete(categories)
        .where(
          and(
            eq(categories.id, categoryId),
            eq(categories.restaurantId, restaurantId)
          )
        );

      return reply.send({ message: 'Category deleted successfully.' });
    }
  );

  // 7. REORDER CATEGORIES
  fastify.put(
    '/api/categories/reorder',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { restaurantId } = request.user;
      const body = request.body as { categoryIds?: number[] };

      if (!restaurantId) {
        return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
      }

      if (!body?.categoryIds || !Array.isArray(body.categoryIds) || body.categoryIds.length === 0) {
        return reply.status(400).send({ error: 'categoryIds must be a non-empty array of numbers.' });
      }

      const { categoryIds } = body;

      await db.transaction(async (tx) => {
        for (let index = 0; index < categoryIds.length; index++) {
          const categoryId = categoryIds[index];
          const newPosition = index + 1;

          await tx
            .update(categories)
            .set({ position: newPosition })
            .where(
              and(
                eq(categories.id, categoryId),
                eq(categories.restaurantId, restaurantId)
              )
            );
        }
      });

      return reply.send({ message: 'Category display positions updated successfully.' });
    }
  );
}