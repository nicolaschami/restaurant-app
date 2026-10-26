import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { suppliers } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getRestaurantId } from '../lib/tenant.js';
import { JournalError, syncOpeningEntry } from '../lib/journal.js';

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

        // The supplier and its opening-balance journal entry are saved together.
        const newSupplier = await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(suppliers)
            .values({
              ...body,
              restaurantId: tenantId,
              creditLimit: body.creditLimit ? String(body.creditLimit) : '0.00',
              openingBalance: body.openingBalance ? String(body.openingBalance) : '0.00',
            })
            .returning();
          await syncOpeningEntry(
            tx,
            Number(restaurantId),
            { id: row.supplierId, name: row.supplierName, code: row.supplierCode, openingBalance: row.openingBalance },
            request.user?.id
          );
          return row;
        });

        return reply.status(201).send(newSupplier);
      } catch (error: any) {
        if (error instanceof JournalError) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
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

        // The supplier and its opening-balance entry change together. Once the supplier
        // has purchases or payments, a different opening balance is refused (409).
        const updatedSupplier = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(suppliers)
            .set(updateData)
            .where(
              and(
                eq(suppliers.supplierId, id),
                eq(suppliers.restaurantId, String(restaurantId))
              )
            )
            .returning();
          if (!row) return null;
          await syncOpeningEntry(
            tx,
            Number(restaurantId),
            { id: row.supplierId, name: row.supplierName, code: row.supplierCode, openingBalance: row.openingBalance },
            request.user?.id
          );
          return row;
        });

        if (!updatedSupplier) {
          return reply.status(404).send({ error: 'Supplier not found.' });
        }

        return reply.status(200).send(updatedSupplier);
      } catch (error) {
        if (error instanceof JournalError) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
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

    const restaurantId = getRestaurantId(request);

    try {
      // Only a supplier of the user's own restaurant can be deleted.
      // Its opening-balance entry goes with it; any other journal line (purchase,
      // payment) blocks the delete below (23503).
      const deletedItem = await db.transaction(async (tx) => {
        await tx.execute(sql`
          DELETE FROM journal_entries
          WHERE restaurant_id = ${restaurantId} AND source_type = 'OPENING' AND source_id = ${itemId}
        `);
        const [row] = await tx
          .delete(suppliers)
          .where(and(eq(suppliers.supplierId, itemId), eq(suppliers.restaurantId, String(restaurantId))))
          .returning();
        return row;
      });

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