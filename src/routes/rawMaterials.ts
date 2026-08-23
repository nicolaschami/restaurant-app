import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { rawMaterials } from '../db/schema';
import { eq, desc,asc,and } from 'drizzle-orm';

export default async function rawMaterialsRoutes(fastify: FastifyInstance) {

  // GET ALL RAW MATERIALS
  fastify.get(
    '/api/raw-materials',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { restaurantId } = request.user;

        if (!restaurantId) {
          return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
        }

        const rawlist = await db
          .select()
          .from(rawMaterials)
          .where(eq(rawMaterials.restaurantId, restaurantId)) // 👈 Scoped to restaurant
          .orderBy(asc(rawMaterials.createdAt));

        return reply.send({ rawMaterials: rawlist });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Failed to fetch raw materials' });
      }
    }
  );

  

  // CREATE RAW MATERIAL
  fastify.post(
    '/api/raw-materials',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { restaurantId } = request.user;
        if (!restaurantId) {
          return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
        }

        const body = request.body as any;

        const [newItem] = await db.insert(rawMaterials).values({
          restaurantId,
          code: body.code || null,
          barCode: body.barCode || null,
          name: body.name,
          categoryId: body.categoryId ? Number(body.categoryId) : null,
          supplierId: body.supplierId ? Number(body.supplierId) : null,
          brand: body.brand || null,
          unit: body.unit || 'kg',
          costPrice: body.costPrice ? String(body.costPrice) : '0.0000',
          lastPurchasePrice: body.lastPurchasePrice ? String(body.lastPurchasePrice) : null,
          currencyCode: body.currencyCode || 'USD',
          currentStock: body.currentStock ? String(body.currentStock) : '0.000',
          minQty: body.minQty ? String(body.minQty) : '0.000',
          maxQty: body.maxQty ? String(body.maxQty) : '0.000',
          hasTva: Boolean(body.hasTva),
          warehouse: body.warehouse || null,
          notes: body.notes || null,
        }).returning();

        return reply.status(201).send(newItem);
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Failed to create raw material', message: error.message });
      }
    }
  );

  // 2. UPDATE RAW MATERIAL (PUT)
  fastify.put(
    '/api/raw-materials/:id',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { restaurantId } = request.user;
        const { id } = request.params as { id: string };
        const body = request.body as any;

        const [updatedItem] = await db
          .update(rawMaterials)
          .set({
            code: body.code || null,
            barCode: body.barCode || null,
            name: body.name,
            categoryId: body.categoryId ? Number(body.categoryId) : null,
            supplierId: body.supplierId ? Number(body.supplierId) : null,
            brand: body.brand || null,
            unit: body.unit || 'kg',
            costPrice: body.costPrice ? String(body.costPrice) : '0.0000',
            lastPurchasePrice: body.lastPurchasePrice ? String(body.lastPurchasePrice) : null,
            currencyCode: body.currencyCode || 'USD',
            currentStock: body.currentStock ? String(body.currentStock) : '0.000',
            minQty: body.minQty ? String(body.minQty) : '0.000',
            maxQty: body.maxQty ? String(body.maxQty) : '0.000',
            hasTva: Boolean(body.hasTva),
            warehouse: body.warehouse || null,
            notes: body.notes || null,
          })
          .where(
  and(
    eq(rawMaterials.id, Number(id)),
    eq(rawMaterials.restaurantId, Number(restaurantId))
  )
).returning();

        if (!updatedItem) {
          return reply.status(404).send({ error: 'Item not found or unauthorized' });
        }

        return reply.send(updatedItem);
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Failed to update raw material', message: error.message });
      }
    }
  );

  // DELETE RAW MATERIAL
  fastify.delete(
    '/api/raw-materials/:id',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        await db.delete(rawMaterials).where(eq(rawMaterials.id, Number(id)));
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ error: 'Failed to delete raw material' });
      }
    }
  );
}