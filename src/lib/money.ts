// src/lib/money.ts
//
// Money in a restaurant's currency for the server's messages
// ("Paid by cash. Give back €3.00."). One currency per restaurant (Settings).

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { restaurants } from '../db/schema.js';

export async function restaurantCurrency(restaurantId: number): Promise<string> {
  const r = await db.query.restaurants.findFirst({ where: eq(restaurants.id, restaurantId) });
  return (r?.currency || 'USD').toUpperCase();
}

export function formatMoney(amount: number | string, currency: string): string {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
