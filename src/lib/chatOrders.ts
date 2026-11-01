// src/lib/chatOrders.ts
//
// Chat orders (v2, step 3 — 2026-11-01): helpers shared by the customer's page
// (routes/publicChat.ts) and the cashier's Accept / Reject (routes/chatOrders.ts).

import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

// What the customer and the cashier see: W-1042 (1000 + the row id).
export const chatRef = (id: number) => `W-${1000 + Number(id)}`;

export const digitsOf = (phone: string | null | undefined) => String(phone ?? '').replace(/\D/g, '');

// The restaurant's customer with this phone (same rule as Reservations: digits only).
export async function findCustomerByPhone(exec: any, restaurantId: number, phone: string | null) {
  const digits = digitsOf(phone);
  if (digits.length < 6) return null;
  const [c] = (await (exec ?? db).execute(sql`
    SELECT id, name, address FROM customers
    WHERE restaurant_id = ${restaurantId} AND regexp_replace(phone, '[^0-9]', '', 'g') = ${digits}
    ORDER BY id LIMIT 1
  `)) as any[];
  return c ? { id: Number(c.id), name: String(c.name), address: c.address as string | null } : null;
}

// First chat order of this phone → the customer is added (decided 2026-11-01).
// A known customer gets the new delivery address when it changed.
export async function linkChatCustomer(exec: any, restaurantId: number, name: string, phone: string, address: string | null) {
  const found = await findCustomerByPhone(exec, restaurantId, phone);
  if (found) {
    if (address && address !== found.address) {
      await exec.execute(sql`UPDATE customers SET address = ${address}, updated_at = now() WHERE id = ${found.id}`);
    }
    return found.id;
  }
  const [n] = (await exec.execute(sql`
    INSERT INTO customers (restaurant_id, name, phone, address, notes)
    VALUES (${restaurantId}, ${name}, ${phone}, ${address}, 'Added from a chat order')
    RETURNING id
  `)) as any[];
  return Number(n.id);
}

// How many orders this phone already made here (shown to the cashier: "5 orders before").
export async function previousOrders(restaurantId: number, phone: string) {
  const digits = digitsOf(phone);
  if (digits.length < 6) return 0;
  const [r] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM orders
    WHERE restaurant_id = ${restaurantId}
      AND regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') = ${digits}
  `)) as any[];
  return Number(r?.n ?? 0);
}
