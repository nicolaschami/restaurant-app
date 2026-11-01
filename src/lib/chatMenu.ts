// src/lib/chatMenu.ts
//
// Chat orders (v2, started 2026-11-01): the menu that RES gives to the AI, and the
// check that turns the AI's DRAFT into a real, priced order card.
//
// The rule agreed with the owner: the AI understands the customer and writes a draft
// with menu NUMBERS only (item id, size, option ids). RES checks every line against
// the database and sets every price itself — the AI never decides a price, so a
// customer cannot talk it into a discount.

import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { computeOrderTotals } from './orderTotals.js';

export type ChatOrderType = 'delivery' | 'pickup';

interface VariantPrice {
  size: string;
  dineIn?: number | string;
  takeaway?: number | string;
  delivery?: number | string;
}

interface ChatGroup {
  id: number;
  name: string;
  min: number;
  max: number;
  required: boolean;
  options: { id: number; name: string; price: number }[];
}

interface ChatItem {
  id: number;
  name: string;
  description: string | null;
  category: string;
  takeaway: number;
  delivery: number;
  sizes: VariantPrice[] | null; // null = one price only
  groupIds: number[];
}

export interface ChatMenu {
  restaurantId: number;
  restaurantName: string;
  currency: string;
  text: string; // the menu as the AI reads it (same text every turn → cached)
  items: Map<number, ChatItem>;
  groups: Map<number, ChatGroup>;
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
const money = (n: number) => `$${n.toFixed(2)}`;

// The restaurant's chat link uses its login code (res.app/tahinajin → "tahinajin").
export async function findChatRestaurant(code: string) {
  const [r] = (await db.execute(sql`
    SELECT id, name, COALESCE(currency, 'USD') AS currency
    FROM restaurants
    WHERE login_code = ${code.trim().toLowerCase()} AND is_active = true
  `)) as any[];
  return r ? { id: Number(r.id), name: String(r.name), currency: String(r.currency) } : null;
}

export async function loadChatMenu(restaurantId: number, restaurantName: string, currency: string): Promise<ChatMenu> {
  const itemRows = (await db.execute(sql`
    SELECT m.id, m.menu_name, m.description, m.price_takeaway, m.price_delivery,
           m.has_variants, m.variant_prices, COALESCE(c.name, 'Other') AS category
    FROM menu_items m
    LEFT JOIN categories c ON c.id = m.category_id
    WHERE m.restaurant_id = ${restaurantId} AND COALESCE(m.is_available, true) = true
    ORDER BY c.position NULLS LAST, c.id, m.position, m.id
  `)) as any[];

  const groupRows = (await db.execute(sql`
    SELECT g.id, g.name, COALESCE(g.min_selection, 0) AS min, COALESCE(g.max_selection, 1) AS max,
           g.is_required, o.id AS option_id, o.name AS option_name, o.price_adjustment
    FROM modifier_groups g
    LEFT JOIN modifier_options o ON o.modifier_group_id = g.id
    WHERE g.restaurant_id = ${restaurantId}
    ORDER BY g.id, o.id
  `)) as any[];

  const linkRows = (await db.execute(sql`
    SELECT mim.menu_item_id, mim.modifier_group_id
    FROM menu_item_modifiers mim
    JOIN menu_items m ON m.id = mim.menu_item_id
    WHERE m.restaurant_id = ${restaurantId}
    ORDER BY mim.menu_item_id, mim.sort_order
  `)) as any[];

  const groups = new Map<number, ChatGroup>();
  for (const g of groupRows) {
    const id = Number(g.id);
    if (!groups.has(id)) {
      groups.set(id, { id, name: g.name, min: Number(g.min), max: Number(g.max), required: Boolean(g.is_required), options: [] });
    }
    if (g.option_id) groups.get(id)!.options.push({ id: Number(g.option_id), name: g.option_name, price: num(g.price_adjustment) });
  }

  const groupsOf = new Map<number, number[]>();
  for (const l of linkRows) {
    const list = groupsOf.get(Number(l.menu_item_id)) ?? [];
    list.push(Number(l.modifier_group_id));
    groupsOf.set(Number(l.menu_item_id), list);
  }

  const items = new Map<number, ChatItem>();
  for (const r of itemRows) {
    const sizes = r.has_variants && Array.isArray(r.variant_prices) && r.variant_prices.length ? (r.variant_prices as VariantPrice[]) : null;
    items.set(Number(r.id), {
      id: Number(r.id),
      name: r.menu_name,
      description: r.description || null,
      category: r.category,
      takeaway: num(r.price_takeaway),
      delivery: num(r.price_delivery),
      sizes,
      groupIds: groupsOf.get(Number(r.id)) ?? [],
    });
  }

  // The text the AI reads. One line per dish: "#id name (description) — price".
  // "pickup/delivery" are shown apart only when they differ.
  const priceText = (t: number, d: number) => (t === d ? money(t) : `pickup ${money(t)} / delivery ${money(d)}`);
  const lines: string[] = [];
  let lastCategory = '';
  for (const it of items.values()) {
    if (it.category !== lastCategory) {
      lines.push('', `## ${it.category}`);
      lastCategory = it.category;
    }
    const desc = it.description ? ` (${it.description})` : '';
    const price = it.sizes
      ? 'sizes: ' + it.sizes.map((s) => `"${s.size}" ${priceText(num(s.takeaway), num(s.delivery))}`).join(', ')
      : priceText(it.takeaway, it.delivery);
    const opts = it.groupIds.length ? ` · options: ${it.groupIds.map((g) => `G${g}`).join(', ')}` : '';
    lines.push(`#${it.id} ${it.name}${desc} — ${price}${opts}`);
  }
  if (groups.size) {
    lines.push('', '## Option groups');
    for (const g of groups.values()) {
      const rule = g.required ? `required, choose ${Math.max(1, g.min)}${g.max > 1 ? `-${g.max}` : ''}` : `optional, up to ${g.max}`;
      const opts = g.options.map((o) => `O${o.id} ${o.name}${o.price ? ` +${money(o.price)}` : ''}`).join(', ');
      lines.push(`G${g.id} ${g.name} (${rule}): ${opts}`);
    }
  }

  return { restaurantId, restaurantName, currency, text: lines.join('\n').trim(), items, groups };
}

// ---------- the AI's draft → RES's priced card ----------

export interface DraftLine {
  itemId: number;
  qty: number;
  size: string | null;
  optionIds: number[];
  note: string | null;
}

export interface CardLine {
  itemId: number;
  name: string;
  qty: number;
  size: string | null;
  options: { id: number; name: string; price: number }[];
  note: string | null;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderCard {
  orderType: ChatOrderType | null;
  lines: CardLine[];
  subtotal: number;
  tax: number;
  total: number;
  problems: string[]; // what RES refused (unknown dish, missing sauce…) — sent back to the AI
}

export async function priceDraft(menu: ChatMenu, orderType: ChatOrderType | null, draft: DraftLine[]): Promise<OrderCard> {
  const problems: string[] = [];
  const lines: CardLine[] = [];
  const type = orderType ?? 'pickup'; // prices shown before the customer chose (pickup = takeaway)

  for (const d of draft) {
    const item = menu.items.get(Number(d.itemId));
    if (!item) {
      problems.push(`#${d.itemId} is not on the menu (or not available today).`);
      continue;
    }
    const qty = Math.min(50, Math.max(1, Math.round(Number(d.qty) || 1)));

    // size: required when the dish has sizes
    let base = type === 'delivery' ? item.delivery : item.takeaway;
    let size: string | null = null;
    if (item.sizes) {
      const s = item.sizes.find((v) => v.size.toLowerCase() === String(d.size ?? '').trim().toLowerCase());
      if (!s) {
        problems.push(`#${item.id} ${item.name}: the size is missing — ask the customer (${item.sizes.map((v) => v.size).join(' or ')}).`);
        continue;
      }
      size = s.size;
      base = num(type === 'delivery' ? s.delivery : s.takeaway);
    }

    // options: only from the dish's own groups, and each group's rules respected
    const options: CardLine['options'] = [];
    let missingRequired = false;
    for (const gid of item.groupIds) {
      const g = menu.groups.get(gid);
      if (!g) continue;
      const chosen = g.options.filter((o) => (d.optionIds ?? []).includes(o.id)).slice(0, Math.max(1, g.max));
      if (g.required && chosen.length < Math.max(1, g.min)) {
        problems.push(`#${item.id} ${item.name}: "${g.name}" must be chosen — ask the customer (${g.options.map((o) => o.name).join(', ')}).`);
        missingRequired = true;
      }
      options.push(...chosen);
    }
    if (missingRequired) continue;
    const foreign = (d.optionIds ?? []).filter((id) => !options.some((o) => o.id === id));
    if (foreign.length) problems.push(`#${item.id} ${item.name}: options ${foreign.map((id) => 'O' + id).join(', ')} do not belong to this dish and were removed.`);

    const unitPrice = base + options.reduce((s, o) => s + o.price, 0);
    const note = d.note ? String(d.note).slice(0, 120) : null;
    lines.push({ itemId: item.id, name: item.name, qty, size, options, note, unitPrice, lineTotal: unitPrice * qty });
  }

  // tax and total: the same rule as the POS (restaurant tax settings)
  const totals = await computeOrderTotals(
    null,
    menu.restaurantId,
    lines.map((l) => ({ menuItemId: l.itemId, amount: l.lineTotal })),
    0 // no delivery zones/fees yet (decided 2026-11-01)
  );
  return { orderType, lines, subtotal: totals.subtotal, tax: totals.tax, total: totals.total, problems };
}
