import { FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { orders, orderItems, menuItems } from '../db/schema.js';

// Multi-restaurant ("multi-tenant") helpers.
//
// Many restaurants share the same cloud database, so EVERY query must be limited to
// the restaurant of the logged-in user. That restaurant comes from the login token
// (request.user, filled by the global login guard in app.ts) — never from the
// browser (?restaurantId=... or body.restaurantId), which anyone could change.
//
// These helpers THROW an error with an HTTP status; Fastify turns it into the
// response. So call them BEFORE any try/catch in a route, otherwise the catch
// would turn the 403/404 into a 500.

function httpError(statusCode: number, message: string) {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

// The logged-in user's restaurant id.
//   const restaurantId = getRestaurantId(request);
export function getRestaurantId(request: FastifyRequest): number {
  const restaurantId = request.user?.restaurantId;
  if (!restaurantId) {
    throw httpError(403, 'User is not assigned to a restaurant.');
  }
  return Number(restaurantId);
}

// "By ID" routes: make sure order #id belongs to the user's restaurant.
// Another restaurant's order is answered with 404 "not found" — we don't even
// reveal that it exists.
//   await assertOrderInRestaurant(orderId, restaurantId);
export async function assertOrderInRestaurant(orderId: number, restaurantId: number) {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  if (!row) throw httpError(404, 'Order not found.');
}

// Same for a menu item (product).
//   await assertMenuItemInRestaurant(itemId, restaurantId);
export async function assertMenuItemInRestaurant(itemId: number, restaurantId: number) {
  const [row] = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)))
    .limit(1);
  if (!row) throw httpError(404, 'Menu item not found.');
}

// Same for an order item: it belongs to the restaurant of its parent order.
//   await assertOrderItemInRestaurant(itemId, restaurantId);
export async function assertOrderItemInRestaurant(itemId: number, restaurantId: number) {
  const [row] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orderItems.id, itemId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  if (!row) throw httpError(404, 'Order item not found.');
}
