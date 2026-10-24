// src/lib/orderTotals.ts
//
// The totals of an order, computed by the SERVER from the restaurant's tax settings
// (agreed 2026-10-25), so the amount paid never depends on a number from the screen:
//   - subtotal = the order lines (menu prices × quantity, options included);
//   - each line uses its menu item's own tax rate (menu_items.country_tax), or the
//     restaurant rate (restaurants.tax_rate) when the item has none;
//   - restaurants.prices_include_tax:
//       false (tax added on top): tax = line × rate / 100;   total = subtotal + tax + delivery
//       true  (prices include it): tax = line × rate / (100 + rate); total = subtotal + delivery
//   - the delivery fee has no tax and is kept apart.
// Money is rounded to cents once, on the order (not per line).

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { menuItems, restaurants } from '../db/schema.js';

export interface OrderTotals {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  taxRate: number; // the restaurant rate (for information)
  pricesIncludeTax: boolean;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export async function computeOrderTotals(
  exec: any,
  restaurantId: number,
  lines: Array<{ menuItemId: number; amount: number }>,
  deliveryFee: number
): Promise<OrderTotals> {
  const runner = exec ?? db;
  const [r] = await runner
    .select({ taxRate: restaurants.tax_rate, included: restaurants.prices_include_tax })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId));
  const restaurantRate = Number(r?.taxRate ?? 0);
  const included = Boolean(r?.included);

  // Own rate of each menu item (null = restaurant rate).
  const ids = [...new Set(lines.map((l) => Number(l.menuItemId)).filter(Number.isFinite))];
  const own = new Map<number, number | null>();
  if (ids.length) {
    const rows = await runner
      .select({ id: menuItems.id, rate: menuItems.countryTax })
      .from(menuItems)
      .where(and(inArray(menuItems.id, ids), eq(menuItems.restaurantId, restaurantId)));
    rows.forEach((row: any) => own.set(row.id, row.rate === null || row.rate === undefined ? null : Number(row.rate)));
  }

  let subtotal = 0;
  let tax = 0;
  for (const l of lines) {
    const amount = Number(l.amount) || 0;
    const rate = own.get(Number(l.menuItemId)) ?? restaurantRate;
    subtotal += amount;
    tax += included ? (amount * rate) / (100 + rate) : (amount * rate) / 100;
  }
  const fee = Math.max(0, Number(deliveryFee) || 0);
  subtotal = cents(subtotal);
  tax = cents(tax);
  const total = cents(included ? subtotal + fee : subtotal + tax + fee);
  return { subtotal, tax, deliveryFee: cents(fee), total, taxRate: restaurantRate, pricesIncludeTax: included };
}
