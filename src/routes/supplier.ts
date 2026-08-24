import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { suppliers } from '../db/schema';
import { eq, and } from 'drizzle-orm';

interface SupplierBody {
  supplierCode?: string;
  supplierName: string;
  contactPerson?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  currencyCode?: string;
  paymentTerms?: string;
  creditLimit?: number;
  openingBalance?: number;
  notes?: string;
  isActive?: boolean;
}

export default async function supplierRoutes(fastify: FastifyInstance) {

  // ==========================================
  // 1. GET ALL SUPPLIERS FOR A RESTAURANT
  // GET /api/suppliers
  // ==========================================
  
  fastify.get(
    '/api/suppliers',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { restaurantId } = request.user;
        if (!restaurantId) {
          return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
        }

        const data = await db
          .select()
          .from(suppliers)
          .where(eq(suppliers.restaurantId, String(restaurantId)));

        return reply.status(200).send(data);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Failed to fetch suppliers.' });
      }
    }
  );

  // ==========================================
  // 2. CREATE A NEW SUPPLIER
  // POST /api/suppliers
  // ==========================================
  fastify.post(
    '/api/suppliers',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const body = request.body as SupplierBody;

        if (!body.supplierName?.trim()) {
          return reply.status(400).send({ error: 'Supplier name is required.' });
        }

const { restaurantId } = request.user as { restaurantId: string | number };
const tenantId = String(restaurantId);
        if (!restaurantId) {
          return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
        }

        const [newSupplier] = await db
          .insert(suppliers)
          .values({
            ...body,
            restaurantId: tenantId,
            creditLimit: body.creditLimit ? String(body.creditLimit) : '0.00',
            openingBalance: body.openingBalance ? String(body.openingBalance) : '0.00',
          })
          .returning();

        return reply.status(201).send(newSupplier);
      } catch (error: any) {
        fastify.log.error(error);

        if (error.code === '23505') {
          return reply.status(409).send({
            error: 'A supplier with this code already exists for your restaurant.',
          });
        }

        return reply.status(500).send({ error: 'Failed to create supplier.' });
      }
    }
  );

  // ==========================================
  // 3. UPDATE AN EXISTING SUPPLIER
  // PUT /api/suppliers/:supplierId
  // ==========================================
  fastify.put(
    '/api/suppliers/:supplierId',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { supplierId } = request.params as { supplierId: string };
        const id = parseInt(supplierId, 10);

        if (isNaN(id)) {
          return reply.status(400).send({ error: 'Invalid supplier ID.' });
        }

        const body = request.body as SupplierBody;
        if (body.supplierName !== undefined && !body.supplierName?.trim()) {
          return reply.status(400).send({ error: 'Supplier name cannot be empty.' });
        }

        const { restaurantId } = request.user;
        if (!restaurantId) {
          return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
        }

        const updateData: Record<string, any> = {
          ...body,
          updatedDate: new Date(),
        };

        if (body.creditLimit !== undefined) updateData.creditLimit = String(body.creditLimit);
        if (body.openingBalance !== undefined) updateData.openingBalance = String(body.openingBalance);

        const [updatedSupplier] = await db
          .update(suppliers)
          .set(updateData)
          .where(
            and(
              eq(suppliers.supplierId, id),
              eq(suppliers.restaurantId, String(restaurantId))
            )
          )
          .returning();

        if (!updatedSupplier) {
          return reply.status(404).send({ error: 'Supplier not found.' });
        }

        return reply.status(200).send(updatedSupplier);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Failed to update supplier.' });
      }
    }
  );


  // ==========================================
  // 3. DELETE AN EXISTING SUPPLIER
  // DELETE /api/suppliers/:supplierId
  // ==========================================
 fastify.delete('/api/suppliers/:id', 
  { onRequest: [fastify.authenticate] },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const itemId = parseInt(id, 10);

    if (isNaN(itemId)) {
      return reply.status(400).send({ error: 'Invalid ID format.' });
    }

    try {
      const [deletedItem] = await db
        .delete(suppliers)
        .where(eq(suppliers.supplierId, itemId))
        .returning();

      if (!deletedItem) {
        return reply.status(404).send({ error: 'Supplier not found.' });
      }

      return reply.send({
        message: 'Supplier deleted successfully.',
        deletedItemId: itemId,
      });
    } catch (error: any) {
      // Foreign key constraint violation (PostgreSQL code 23503)
      if (error?.code === '23503') {
        return reply.status(409).send({ 
          error: 'Cannot delete supplier because it is linked to active inventory or purchase orders.' 
        });
      }

      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error.' });
    }
  }
);


}