import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { customers } from '../db/schema';
import { eq, and, or, ilike } from 'drizzle-orm';

interface CustomerBody {
  name: string;
  phone: string;
  address?: string;
  email?:string;
  notes?: string;
}

export default async function customerRoutes(fastify: FastifyInstance) {

  // ==========================================
  // 1. GET / SEARCH CUSTOMERS FOR A RESTAURANT
  // GET /api/customers?search=
  // ==========================================
  fastify.get(
    '/api/customers',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { restaurantId } = request.user;
        if (!restaurantId) {
          return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
        }

        const { search } = request.query as { search?: string };

        let queryConditions = eq(customers.restaurantId, String(restaurantId));

        if (search?.trim()) {
          const searchTerm = `%${search.trim()}%`;
          const data = await db
            .select()
            .from(customers)
            .where(
              and(
                eq(customers.restaurantId, String(restaurantId)),
                or(
                  ilike(customers.phone, searchTerm),
                  ilike(customers.name, searchTerm)
                )
              )
            );
          return reply.status(200).send(data);
        }

        const data = await db
          .select()
          .from(customers)
          .where(queryConditions);

        return reply.status(200).send(data);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Failed to fetch customers.' });
      }
    }
  );

  // ==========================================
  // 2. CREATE A NEW CUSTOMER
  // POST /api/customers
  // ==========================================
  fastify.post(
    '/api/customers',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const body = request.body as CustomerBody;

        if (!body.name?.trim() || !body.phone?.trim()) {
          return reply.status(400).send({ error: 'Customer name and phone number are required.' });
        }

        const { restaurantId } = request.user as { restaurantId: string | number };
        const tenantId = String(restaurantId);

        if (!restaurantId) {
          return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
        }

        const [newCustomer] = await db
          .insert(customers)
          .values({
            name: body.name.trim(),
            phone: body.phone.trim(),
            address: body.address?.trim() ?? null,
            notes: body.notes?.trim() ?? null,
            email:body.email?.trim() ?? null,
            restaurantId: tenantId,
          })
          .returning();

        return reply.status(201).send(newCustomer);
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Failed to create customer.' });
      }
    }
  );

  // ==========================================
  // 3. UPDATE AN EXISTING CUSTOMER
  // PUT /api/customers/:id
  // ==========================================
  fastify.put(
    '/api/customers/:id',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const customerId = parseInt(id, 10);

        if (isNaN(customerId)) {
          return reply.status(400).send({ error: 'Invalid customer ID.' });
        }

        const body = request.body as CustomerBody;

        if (body.name !== undefined && !body.name?.trim()) {
          return reply.status(400).send({ error: 'Customer name cannot be empty.' });
        }
        if (body.phone !== undefined && !body.phone?.trim()) {
          return reply.status(400).send({ error: 'Phone number cannot be empty.' });
        }

        const { restaurantId } = request.user;
        if (!restaurantId) {
          return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
        }

        const updateData: Record<string, any> = {
          ...body,
          updatedAt: new Date(),
        };

        const [updatedCustomer] = await db
          .update(customers)
          .set(updateData)
          .where(
            and(
              eq(customers.id, customerId),
              eq(customers.restaurantId, String(restaurantId))
            )
          )
          .returning();

        if (!updatedCustomer) {
          return reply.status(404).send({ error: 'Customer not found.' });
        }

        return reply.status(200).send(updatedCustomer);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Failed to update customer.' });
      }
    }
  );

  // ==========================================
  // 4. DELETE AN EXISTING CUSTOMER
  // DELETE /api/customers/:id
  // ==========================================
  fastify.delete(
    '/api/customers/:id',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const customerId = parseInt(id, 10);

      if (isNaN(customerId)) {
        return reply.status(400).send({ error: 'Invalid ID format.' });
      }

      const { restaurantId } = request.user;
      if (!restaurantId) {
        return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
      }

      try {
        const [deletedItem] = await db
          .delete(customers)
          .where(
            and(
              eq(customers.id, customerId),
              eq(customers.restaurantId, String(restaurantId))
            )
          )
          .returning();

        if (!deletedItem) {
          return reply.status(404).send({ error: 'Customer not found.' });
        }

        return reply.send({
          message: 'Customer deleted successfully.',
          deletedItemId: customerId,
        });
      } catch (error: any) {
        if (error?.code === '23503') {
          return reply.status(409).send({
            error: 'Cannot delete customer because they are linked to order histories.',
          });
        }

        request.log.error(error);
        return reply.status(500).send({ error: 'Internal server error.' });
      }
    }
  );
}