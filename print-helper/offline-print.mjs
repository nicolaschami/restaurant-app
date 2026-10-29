// print-helper/offline-print.mjs
//
// RES LOCAL — offline POS, step 3c (2026-10-29): the RECEIPT and the KITCHEN TICKETS
// printed by RES Local itself when there is no internet. The printers are on the
// restaurant's network (or USB), so they still work without internet.
// The papers are the SAME as the server's (src/routes/printing.ts buildReceipt and
// src/lib/kitchenTickets.ts); keep them in step. The data comes from RES Local's copy.
// The user's choice (2026-10-28): the offline receipt looks like a normal receipt —
// only its number is OFF-0007.
//
// Kitchen tickets — "before / after" photos of the order, like the server:
//   more than before → NEW ORDER (first time) or ADD-ON;  less → *** CANCEL ***
//   each dish goes to its category's printer, else the restaurant's default kitchen
//   printer; one ticket per printer, titled with the category name.

import { EscPos, LINE_WIDTH, formatMoney } from './escpos.mjs';

const OFFLINE_BASE = 1_000_000_000;
export const ticketText = (no) => (Number(no) >= OFFLINE_BASE ? `OFF-${String(Number(no) - OFFLINE_BASE).padStart(4, '0')}` : `#${no ?? ''}`);

// "28/10/2026 15:30" (receipt) or "28/10 15:30" (kitchen) in the restaurant's time zone.
function when(timezone, date = new Date(), withYear = true) {
  const parts = {};
  try {
    for (const p of new Intl.DateTimeFormat('en-GB', { timeZone: timezone || 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)) parts[p.type] = p.value;
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
  return `${parts.day}/${parts.month}${withYear ? `/${parts.year}` : ''} ${parts.hour}:${parts.minute}`;
}

// ---------------------------------------------------------------- receipt
// order = the order as the POS reads it (with .payment once paid offline)
export function buildReceipt({ restaurant: r, order, tableLabel, menuItems, copy }) {
  const currency = String(r.currency || 'USD').toUpperCase();
  const m = (v) => formatMoney(Number(v) || 0, currency);
  const invoiceName = new Map(menuItems.map((x) => [Number(x.id), x.invoice_name || x.menu_name]));
  const lines = (order.items || []).filter((l) => l.kdsStatus !== 'CANCELLED');

  const itemsTotal = lines.reduce((s, l) => s + Number(l.subtotal || 0), 0);
  const subtotal = order.subtotalAmount != null ? Number(order.subtotalAmount) : itemsTotal;
  const fee = Number(order.deliveryFee || 0);
  const total = Number(order.totalAmount || 0);
  const tax = order.taxAmount != null ? Number(order.taxAmount) : Math.max(0, total - subtotal - fee);
  const rate = Number(r.tax_rate || 0);
  const taxLabel = `${r.tax_name || 'VAT'} ${Number.isInteger(rate) ? rate : rate.toFixed(2)}%${r.prices_include_tax ? ' incl.' : ''}`;
  const pay = order.payment;
  const paid = !copy && !!pay;

  const p = new EscPos();
  p.align('center').bold(true).big(true).line(r.name || 'Restaurant').big(false).bold(false);
  const address = [r.address_line1, r.address_line2, r.city].filter(Boolean).join(', ');
  if (address) p.wrap(address);
  if (r.phone) p.line(`Tel ${r.phone}`);
  if (r.tax_number) p.line(`${r.tax_name || 'VAT'} No. ${r.tax_number}`);
  if (r.receipt_header) p.wrap(r.receipt_header);
  if (!paid) p.bold(true).line('*** COPY - NOT PAID ***').bold(false);
  p.align('left').divider();
  p.bold(true).row(`Ticket ${ticketText(order.ticketNo ?? order.id)}`, when(r.timezone, pay ? new Date(pay.createdAt) : new Date())).bold(false);
  p.row(String(order.orderType || ''), tableLabel ? `Table ${tableLabel}` : String(order.customerName || ''));
  p.divider();
  for (const l of lines) {
    const name = invoiceName.get(Number(l.menuItemId)) || l.name || 'Item';
    p.row(`${Number(l.quantity)} x ${name}${l.variantSize ? ` (${l.variantSize})` : ''}`, Number(l.subtotal) === 0 ? 'COMP' : m(l.subtotal));
    for (const mod of Array.isArray(l.modifiers) ? l.modifiers : []) p.row(`   + ${mod?.optionName ?? ''}`, Number(mod?.price) > 0 ? m(mod.price) : '');
  }
  p.divider();
  p.row('Subtotal', m(subtotal));
  if (fee > 0) p.row('Delivery fee', m(fee));
  p.row(taxLabel, m(tax));
  p.bold(true).big(true).row('TOTAL', m(total), LINE_WIDTH / 2).big(false).bold(false);
  if (paid) {
    p.divider();
    const method = String(pay.method);
    p.row('Paid by', method.charAt(0) + method.slice(1).toLowerCase());
    if (method === 'CASH') {
      p.row('Received', m(pay.amountReceived));
      p.row('Change', m(pay.changeGiven));
    }
  }
  p.divider().align('center');
  p.wrap(r.receipt_footer || 'Thank you!');
  p.align('left');
  return { escpos: p, paidCash: paid && pay.method === 'CASH', receiptPrinter: r.receipt_printer, drawerPrinter: r.drawer_printer };
}

// ---------------------------------------------------------------- kitchen tickets
// The "photo" of an order's dishes: dish + size + options → quantity.
export function kitchenSnapshot(items, { menuItems, categories }) {
  const dish = new Map(menuItems.map((x) => [Number(x.id), x]));
  const cat = new Map(categories.map((c) => [Number(c.id), c]));
  const snap = new Map();
  for (const i of items || []) {
    if (i.kdsStatus === 'CANCELLED') continue;
    const mi = dish.get(Number(i.menuItemId)) || {};
    const c = cat.get(Number(mi.category_id)) || {};
    const options = (Array.isArray(i.modifiers) ? i.modifiers : []).map((x) => String(x?.optionName ?? x?.name ?? '')).filter(Boolean);
    const size = i.variantSize || '';
    const key = `${i.menuItemId}|${size}|${[...options].sort().join(',')}`;
    const prev = snap.get(key);
    if (prev) prev.qty += Number(i.quantity) || 0;
    else snap.set(key, { name: mi.kitchen_name || mi.menu_name || mi.invoice_name || i.name || 'Item', size, options, qty: Number(i.quantity) || 0, category: c.name || '', printer: c.printername || '' });
  }
  return snap;
}

// The papers to print for what changed: [{ printer, kind, title, data }]
export function kitchenJobs(before, after, header) {
  const added = [];
  const removed = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(key);
    const a = after.get(key);
    const diff = (a?.qty ?? 0) - (b?.qty ?? 0);
    if (diff > 0) added.push({ ...a, qty: diff });
    if (diff < 0) removed.push({ ...b, qty: -diff });
  }
  const firstTime = before.size === 0;
  const groups = new Map();
  const put = (l, kind) => {
    const printer = l.printer || header.defaultPrinter;
    if (!printer) return; // no kitchen printer set → kitchen printing is off for this dish
    const k = `${printer}|${kind}`;
    if (!groups.has(k)) groups.set(k, { printer, kind, lines: [] });
    groups.get(k).lines.push(l);
  };
  removed.forEach((l) => put(l, 'CANCEL')); // cancels first, so the cook reads them first
  added.forEach((l) => put(l, firstTime ? 'NEW' : 'ADD-ON'));
  return [...groups.values()].map((g) => {
    const cats = [...new Set(g.lines.map((l) => l.category).filter(Boolean))];
    const title = cats.length === 1 ? cats[0] : 'KITCHEN';
    return { printer: g.printer, kind: g.kind, title, data: buildTicket(header, title, g.kind, g.lines).toBase64() };
  });
}

function buildTicket(o, title, kind, lines) {
  const p = new EscPos();
  const where = o.type === 'Dine-In' ? `TABLE ${o.table || '-'}` : o.type === 'Delivery' ? 'DELIVERY' : 'TAKEAWAY';
  p.align('center').big(true).bold(true).line(String(title).toUpperCase());
  p.line(kind === 'CANCEL' ? '*** CANCEL ***' : kind === 'ADD-ON' ? 'ADD-ON' : 'NEW ORDER');
  p.big(false).bold(false).align('left').divider('=');
  p.bold(true).row(`${ticketText(o.ticketNo)}  ${where}`, when(o.timezone, new Date(), false)).bold(false);
  if (o.customer) p.line(`Customer: ${o.customer}`);
  if (o.waiter) p.line(`By: ${o.waiter}`);
  p.divider();
  for (const l of lines) {
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
