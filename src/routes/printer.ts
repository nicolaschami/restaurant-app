// src/routes/printer.ts
//
// GET /api/printers → the printer names of THIS restaurant, as reported by its print
// helper(s) (2026-10-26). Used by the category screen ("Assigned Printer" = where the
// category's kitchen tickets print).
// Before, it asked Windows on the SERVER for its printers — that only worked while the
// server ran on the restaurant's PC; in the cloud the printers are on the helper's PC.

import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { getRestaurantId } from '../lib/tenant.js';

export default async function printerRoutes(fastify: FastifyInstance) {
  fastify.get('/api/printers', async (request) => {
    const restaurantId = getRestaurantId(request);
    const rows = (await db.execute(sql`
      SELECT printers FROM print_agents WHERE restaurant_id = ${restaurantId}
    `)) as any[];
    const names = new Set<string>();
    for (const r of rows) for (const p of Array.isArray(r.printers) ? r.printers : []) if (p) names.add(String(p));
    return { printers: [...names].sort() };
  });
}
