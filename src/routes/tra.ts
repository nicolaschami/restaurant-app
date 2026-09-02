import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { restaurantTables } from '../db/schema';
import { eq, and } from 'drizzle-orm';

interface TableBody {
  label: string;
  capacity?: number;
  zone?: string;
  status?: 'free' | 'occupied';
  currentOrderId?: number | null;
}

export default async function tableRoutes(fastify: FastifyInstance) {

  // ==========================================
  // 1. GET ALL TABLES FOR A RESTAURANT
  // GET /api/tables
  // ==========================================
 // GET /api/tables
fastify.get('/api/tables', async (request, reply) => {
    try {
      const rawTables = await db.select().from(restaurantTables);

      const formattedTables = rawTables.map((t) => ({
        id: t.id,
        number: t.label,       // Maps to frontend table UI
        label: t.label,
        section: t.zone,       // Maps to frontend section UI
        zone: t.zone,
        capacity: t.capacity,
        notes: t.notes ?? '',  // <-- INCLUDED IN GET RESPONSE
        status: t.status,
        restaurantId: t.restaurantId,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));

      return reply.send({ tables: formattedTables });
    } catch (err: any) {
      console.error('❌ Error fetching tables:', err);
      return reply.status(500).send({ error: 'Failed to fetch tables.' });
    }
  });

  // ==========================================
  // 2. CREATE A NEW TABLE
  // POST /api/tables
  // ==========================================
fastify.post('/api/tables', async (request, reply) => {
  const body = request.body as {
    number?: string;
    label?: string;
    capacity?: number | string;
    section?: string;
    zone?: string;
    notes?: string;
    status?: string;
    restaurantId?: number | string;
  };

  const tableLabel = body.number || body.label;

  if (!tableLabel || !tableLabel.trim()) {
    return reply.status(400).send({ error: 'Table label is required.' });
  }

  // Restrict status to the exact union expected by your schema ('free' | 'occupied')
  let dbStatus: 'free' | 'occupied' = 'free';
  const incomingStatus = body.status?.toLowerCase();
  if (incomingStatus === 'occupied') {
    dbStatus = 'occupied';
  }

  const notesText = body.notes ? String(body.notes).trim() : null;

  try {
    const [newTable] = await db
      .insert(restaurantTables)
      .values({
        restaurantId: Number(body.restaurantId ?? 1), // Schema expects a string
        label: tableLabel.trim(),
        capacity: body.capacity ? Number(body.capacity) : null,
        zone: body.section || body.zone || null,
        notes: notesText,
        status: dbStatus, // Matches 'free' | 'occupied'
      })
      .returning();

    return reply.status(201).send({
      table: {
        ...newTable,
        number: newTable.label,
        section: newTable.zone,
      },
    });
  } catch (err: any) {
    console.error('❌ Error creating table:', err);
    return reply.status(500).send({ error: err.message || 'Error creating table' });
  }
});
  // ==========================================
  // 3. UPDATE AN EXISTING TABLE
  // PUT /api/tables/:id
  // ==========================================
fastify.put(
  '/api/tables/:id',
  { onRequest: [fastify.authenticate] },
  async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const tableId = parseInt(id, 10);
 
      if (isNaN(tableId)) {
        return reply.status(400).send({ error: 'Invalid table ID.' });
      }
 
      const body = request.body as {
        number?: string;
        label?: string;
        capacity?: number | string;
        section?: string;
        zone?: string;
        notes?: string;
        status?: string;
      };
 
      const tableLabel = body.number || body.label;
      if (!tableLabel || !String(tableLabel).trim()) {
        return reply.status(400).send({ error: 'Table label is required.' });
      }
 
      // Same status normalization as your create route.
      const statusMap: Record<string, 'free' | 'occupied' | 'reserved'> = {
        free: 'free',
        available: 'free',
        occupied: 'occupied',
        reserved: 'reserved',
      };
      const dbStatus = body.status
        ? statusMap[body.status.toLowerCase()] ?? 'free'
        : undefined;
 
      const { restaurantId } = request.user;
      if (!restaurantId) {
        return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
      }
 
      const updateValues: Record<string, any> = {
        label: String(tableLabel).trim(),
        capacity: body.capacity !== undefined && body.capacity !== null && body.capacity !== ''
          ? Number(body.capacity)
          : null,
        zone: body.section || body.zone || null,
        notes: body.notes ? String(body.notes).trim() : null,
        updatedAt: new Date(),
      };
      if (dbStatus) updateValues.status = dbStatus;
 
      const [updatedTable] = await db
        .update(restaurantTables)
        .set(updateValues)
        .where(
          and(
            eq(restaurantTables.id, tableId),
            eq(restaurantTables.restaurantId, Number(restaurantId))
          )
        )
        .returning();
 
      if (!updatedTable) {
        return reply.status(404).send({ error: 'Table not found.' });
      }
 
      return reply.status(200).send({
        table: {
          ...updatedTable,
          number: updatedTable.label,
          section: updatedTable.zone,
        },
      });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ error: err.message || 'Failed to update table.' });
    }
  }
);

  // ==========================================
  // 4. DELETE AN EXISTING TABLE
  // DELETE /api/tables/:id
  // ==========================================
  fastify.delete(
    '/api/tables/:id',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tableId = parseInt(id, 10);

      if (isNaN(tableId)) {
        return reply.status(400).send({ error: 'Invalid ID format.' });
      }

      const { restaurantId } = request.user;
      if (!restaurantId) {
        return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
      }

      try {
        const [deletedItem] = await db
          .delete(restaurantTables)
          .where(
            and(
              eq(restaurantTables.id, tableId),
              eq(restaurantTables.restaurantId, Number(restaurantId))
            )
          )
          .returning();

        if (!deletedItem) {
          return reply.status(404).send({ error: 'Table not found.' });
        }

        return reply.send({
          message: 'Table deleted successfully.',
          deletedItemId: tableId,
        });
      } catch (error: any) {
        if (error?.code === '23503') {
          return reply.status(409).send({
            error: 'Cannot delete table because it is linked to an active order.',
          });
        }

        request.log.error(error);
        return reply.status(500).send({ error: 'Internal server error.' });
      }
    }
  );
}