// src/routes/localCopy.ts
//
// OFFLINE POS, step 1 (agreed with the user 2026-10-28): "RES Local" = the print
// helper on the cashier PC, which also keeps a COPY of what the POS needs, in SQLite,
// so the restaurant keeps selling when the internet is down (sometimes for hours).
// This route gives that copy. The VPS stays the boss: RES Local only reads it.
//
//   GET /api/local/snapshot     header  x-helper-key: rph_…   (the print helper's key)
//                               header  if-none-match: <version>   (optional)
//   → 200 { version, generatedAt, data: { restaurant, categories, menuItems, … } }
//   → 304 when the copy RES Local already has is still the current one
//
// No user login here: the helper proves who it is with its key (only its hash is
// stored, like /agent). So this path is in PUBLIC_API_ROUTES (app.ts) and checked below.
//
// What is copied (one restaurant only — the helper's):
//   - restaurant settings (name, currency, tax, receipt texts, printers)
//   - categories, menu items (no cost price), modifier groups / options / links
//   - tables, kitchen stations
//   - active users: id, name, role and the PIN hash — offline login is PIN ONLY
//     (passwords never leave the VPS)
//   - the OPEN orders with their items, so a table opened online can be continued offline
// "version" = a fingerprint (sha256) of all that: it changes when anything changes.

import { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

// Everything RES Local keeps for one restaurant.
async function buildSnapshot(restaurantId: number) {
  const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as any[];

  const [restaurant] = await rows(sql`
    SELECT id, name, phone, email, address_line1, address_line2, city, country, currency, timezone,
           tax_rate, tax_name, prices_include_tax, tax_number, receipt_header, receipt_footer,
           receipt_printer, drawer_printer, kitchen_printer, logo_url, login_code
    FROM restaurants WHERE id = ${restaurantId}
  `);
  const categories = await rows(sql`
    SELECT id, name, position, printername FROM categories WHERE restaurant_id = ${restaurantId} ORDER BY position, id
  `);
  const menuItems = await rows(sql`
    SELECT id, category_id, station_id, menu_name, invoice_name, kitchen_name,
           price_dine_in, price_takeaway, price_delivery, price_waiter, description, images,
           is_available, position, country_tax, has_variants, variant_prices
    FROM menu_items WHERE restaurant_id = ${restaurantId} ORDER BY position, id
  `);
  const modifierGroups = await rows(sql`
    SELECT id, name, min_selection, max_selection, is_required FROM modifier_groups WHERE restaurant_id = ${restaurantId} ORDER BY id
  `);
  const modifierOptions = await rows(sql`
    SELECT o.id, o.modifier_group_id, o.name, o.price_adjustment
    FROM modifier_options o JOIN modifier_groups g ON g.id = o.modifier_group_id
    WHERE g.restaurant_id = ${restaurantId} ORDER BY o.id
  `);
  const menuItemModifiers = await rows(sql`
    SELECT l.menu_item_id, l.modifier_group_id, l.sort_order
    FROM menu_item_modifiers l JOIN menu_items m ON m.id = l.menu_item_id
    WHERE m.restaurant_id = ${restaurantId} ORDER BY l.menu_item_id, l.sort_order
  `);
  const tables = await rows(sql`
    SELECT id, label, capacity, zone, status, current_order_id, notes
    FROM restaurant_tables WHERE restaurant_id = ${restaurantId} ORDER BY id
  `);
  const kitchenStations = await rows(sql`
    SELECT id, name, description FROM kitchen_stations WHERE restaurant_id = ${restaurantId} ORDER BY id
  `);
  // PIN ONLY offline: the PIN hash (bcrypt), never the password hash.
  const users = await rows(sql`
    SELECT id, full_name AS name, role, pin_hash FROM users
    WHERE restaurant_id = ${restaurantId} AND is_active = true AND pin_hash IS NOT NULL ORDER BY id
  `);
  const openOrders = await rows(sql`
    SELECT id, table_id, status, order_type, customer_name, customer_phone, delivery_address, ticket_no,
           notes, subtotal_amount, tax_amount, delivery_fee, total_amount, server_id, cashier_id, created_at, updated_at
    FROM orders WHERE restaurant_id = ${restaurantId} AND status <> 'CLOSED' ORDER BY id
  `);
  const openOrderItems = await rows(sql`
    SELECT i.id, i.order_id, i.menu_item_id, i.quantity, i.unit_price, i.subtotal, i.modifiers, i.variant_size,
           i.parent_item_id, i.kds_status, i.quantity_fired
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.restaurant_id = ${restaurantId} AND o.status <> 'CLOSED' ORDER BY i.id
  `);

  const data = {
    restaurant, categories, menuItems, modifierGroups, modifierOptions, menuItemModifiers,
    tables, kitchenStations, users, openOrders, openOrderItems,
  };
  const version = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
  return { version, data };
}

export default async function localCopyRoutes(fastify: FastifyInstance) {
  fastify.get('/api/local/snapshot', async (request, reply) => {
    const key = String(request.headers['x-helper-key'] || '');
    if (!key.startsWith('rph_')) return reply.status(401).send({ error: 'Helper key missing.' });
    const [agent] = (await db.execute(sql`
      SELECT id, restaurant_id AS "restaurantId" FROM print_agents WHERE key_hash = ${hashKey(key)}
    `)) as any[];
    if (!agent) return reply.status(401).send({ error: 'Unknown helper key.' });

    try {
      const snap = await buildSnapshot(Number(agent.restaurantId));
      // same version as RES Local already has → nothing to send
      if (request.headers['if-none-match'] === snap.version) return reply.status(304).send();
      return reply.header('etag', snap.version).send({ version: snap.version, generatedAt: new Date().toISOString(), data: snap.data });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The copy could not be prepared.' });
    }
  });
}
