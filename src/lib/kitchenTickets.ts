// src/lib/kitchenTickets.ts
//
// KITCHEN TICKETS (agreed with the user 2026-10-26).
//
// How it works — "before / after" photos of the order:
//   1. Just BEFORE an order is saved we take a photo of its dishes (snapshot):
//      each dish (+ size + options) with its quantity. A brand-new order has an empty photo.
//   2. Just AFTER the save we take a second photo.
//   3. The difference is what the kitchen must hear about:
//        more than before  → printed as NEW ORDER (first time) or ADD-ON
//        less than before  → printed as *** CANCEL *** (dish removed or reduced)
//   4. Each dish goes to the printer of its CATEGORY ("Assigned Printer" on the category
//      screen — as the project was designed from the start); a category without a printer
//      goes to the restaurant's DEFAULT kitchen printer (Settings → Printers). If neither
//      is set, kitchen printing is simply off for that dish.
//   5. One ticket per printer (dishes of two categories on the same printer come out on
//      one paper), titled with the category name, then a paper cut.
// Cancelled rows (kds_status 'CANCELLED') are never counted.

import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { EscPos, LINE_WIDTH } from './escpos.js';
import { sendPrintJob } from './printAgents.js';

// One dish line of the photo (same dish + size + options = one line).
interface KitchenLine {
  name: string;
  size: string;
  options: string[];
  qty: number;
  category: string;
  printer: string; // the category's printer ('' = use the default)
}
export type KitchenSnapshot = Map<string, KitchenLine>;

// What happened per ticket — returned to the POS (a toast shows the failures).
export interface KitchenResult {
  station: string; // the ticket's title (category name, or KITCHEN)
  printer: string;
  kind: 'NEW' | 'ADD-ON' | 'CANCEL';
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------- 1. the photo
export async function kitchenSnapshot(orderId: number): Promise<KitchenSnapshot> {
  const rows = (await db.execute(sql`
    SELECT i.menu_item_id AS "menuItemId",
           COALESCE(NULLIF(mi.kitchen_name, ''), mi.menu_name, mi.invoice_name, 'Item') AS name,
           COALESCE(i.variant_size, '') AS size,
           COALESCE(i.modifiers::jsonb, '[]'::jsonb) AS modifiers,
           SUM(i.quantity)::float AS qty,
           COALESCE(c.name, '') AS category,
           COALESCE(c.printername, '') AS printer
    FROM order_items i
    LEFT JOIN menu_items mi ON mi.id = i.menu_item_id
    LEFT JOIN categories c ON c.id = mi.category_id
    WHERE i.order_id = ${orderId} AND COALESCE(i.kds_status::text, '') <> 'CANCELLED'
    GROUP BY i.menu_item_id, mi.kitchen_name, mi.menu_name, mi.invoice_name, i.variant_size,
             COALESCE(i.modifiers::jsonb, '[]'::jsonb), c.name, c.printername
  `)) as any[];

  const snap: KitchenSnapshot = new Map();
  for (const r of rows) {
    const mods = Array.isArray(r.modifiers) ? r.modifiers : [];
    const options = mods.map((m: any) => String(m?.optionName ?? m?.name ?? '')).filter(Boolean);
    // the key: dish + size + options (sorted, so the order of the options does not matter)
    const key = `${r.menuItemId}|${r.size}|${[...options].sort().join(',')}`;
    const prev = snap.get(key);
    if (prev) prev.qty += Number(r.qty) || 0;
    else
      snap.set(key, {
        name: r.name,
        size: r.size,
        options,
        qty: Number(r.qty) || 0,
        category: r.category,
        printer: r.printer,
      });
  }
  return snap;
}

// ---------------------------------------------------------------- 2. compare + print
// The ticket header: ticket #, table, customer, notes, who sent it, and the default
// kitchen printer. Read separately so a DELETED order can still print its CANCEL
// (the header is read before the delete).
export async function kitchenHeader(restaurantId: number, orderId: number, byUserId?: number | null) {
  const [o] = (await db.execute(sql`
    SELECT o.ticket_no AS "ticketNo", o.order_type AS type, COALESCE(o.customer_name, '') AS customer,
           COALESCE(o.notes, '') AS notes, COALESCE(rt.label, '') AS "table",
           COALESCE(r.kitchen_printer, '') AS "defaultPrinter",
           to_char(now() AT TIME ZONE COALESCE(r.timezone, 'UTC'), 'DD/MM HH24:MI') AS "when",
           COALESCE((SELECT u.full_name FROM users u WHERE u.id = ${byUserId ?? null}), '') AS waiter
    FROM orders o
    JOIN restaurants r ON r.id = o.restaurant_id
    LEFT JOIN restaurant_tables rt ON rt.id = o.table_id
    WHERE o.id = ${orderId} AND o.restaurant_id = ${restaurantId}
  `)) as any[];
  return o ?? null;
}

export async function printKitchenTickets(
  restaurantId: number,
  orderId: number,
  before: KitchenSnapshot,
  after: KitchenSnapshot,
  byUserId?: number | null,
  header?: any // already read (deleted order); otherwise read here
): Promise<KitchenResult[]> {
  // the differences
  const added: KitchenLine[] = [];
  const removed: KitchenLine[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(key);
    const a = after.get(key);
    const diff = (a?.qty ?? 0) - (b?.qty ?? 0);
    if (diff > 0) added.push({ ...(a as KitchenLine), qty: diff });
    if (diff < 0) removed.push({ ...(b as KitchenLine), qty: -diff });
  }
  if (!added.length && !removed.length) return [];

  const o = header ?? (await kitchenHeader(restaurantId, orderId, byUserId));
  if (!o) return [];

  // group: printer + kind → one ticket
  const firstTime = before.size === 0;
  const groups = new Map<string, { printer: string; kind: KitchenResult['kind']; lines: KitchenLine[] }>();
  const put = (l: KitchenLine, kind: KitchenResult['kind']) => {
    const printer = l.printer || o.defaultPrinter;
    if (!printer) return; // no kitchen printer set → kitchen printing is off for this dish
    const k = `${printer}|${kind}`;
    if (!groups.has(k)) groups.set(k, { printer, kind, lines: [] });
    groups.get(k)!.lines.push(l);
  };
  // cancels first, so the cook reads them before the new dishes
  removed.forEach((l) => put(l, 'CANCEL'));
  added.forEach((l) => put(l, firstTime ? 'NEW' : 'ADD-ON'));

  const jobs = [...groups.values()].map(async (g): Promise<KitchenResult> => {
    // title: the category when all dishes are from one category, else KITCHEN
    const cats = [...new Set(g.lines.map((l) => l.category).filter(Boolean))];
    const title = cats.length === 1 ? cats[0] : 'KITCHEN';
    const p = buildTicket(o, title, g.kind, g.lines);
    const res = await sendPrintJob(restaurantId, g.printer, p.toBase64());
    return { station: title, printer: g.printer, kind: g.kind, ok: res.ok, error: res.error };
  });
  return Promise.all(jobs);
}

// ---------------------------------------------------------------- 3. the paper
export function buildTicket(o: any, title: string, kind: KitchenResult['kind'], lines: KitchenLine[]) {
  const p = new EscPos();
  const where =
    o.type === 'Dine-In' ? `TABLE ${o.table || '-'}` : o.type === 'Delivery' ? 'DELIVERY' : 'TAKEAWAY';

  p.align('center').big(true).bold(true).line(title.toUpperCase());
  p.line(kind === 'CANCEL' ? '*** CANCEL ***' : kind === 'ADD-ON' ? 'ADD-ON' : 'NEW ORDER');
  p.big(false).bold(false).align('left').divider('=');
  p.bold(true).row(`#${o.ticketNo ?? ''}  ${where}`, o.when).bold(false);
  if (o.customer) p.line(`Customer: ${o.customer}`);
  if (o.waiter) p.line(`By: ${o.waiter}`);
  p.divider();

  for (const l of lines) {
    // big quantity + dish so the cook reads it from a distance
    p.big(true).bold(true).wrap(`${kind === 'CANCEL' ? '-' : ''}${l.qty} x ${l.name}`, LINE_WIDTH / 2).big(false).bold(false);
    if (l.size) p.line(`   Size: ${l.size}`);
    for (const opt of l.options) p.line(`   + ${opt}`);
    p.line();
  }

  if (o.notes && kind !== 'CANCEL') {
    p.divider();
    p.bold(true).line('NOTE:').bold(false).wrap(o.notes);
  }
  p.divider('=');
  return p.cut();
}
