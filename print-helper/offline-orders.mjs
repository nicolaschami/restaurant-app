// print-helper/offline-orders.mjs
//
// RES LOCAL — offline POS, step 3b (agreed with the user 2026-10-29): ORDERS WITHOUT INTERNET.
// Used by the gateway (gateway.mjs) ONLY while the VPS can't be reached. It answers the
// POS order calls the same way the server does, so the POS screen works as usual:
//
//   POST   /api/orders          new order → number OFF-0001, OFF-0002 … (one counter,
//                               never reset); its id is 1 000 000 000 + n, so it can never
//                               be confused with a real order id of the VPS
//   PUT    /api/orders/:id      change an offline order, OR an order opened online before
//                               the cut (table 5 opened at 13:50, dessert added offline)
//   GET    /api/orders/:id      the order as it is now on this PC
//   GET    /api/orders/active   the open orders: the list copied online + the changes made here
//   GET    /api/tables          a table with an open order (here or on the VPS) is "occupied"
//   DELETE /api/orders/:id      only an OFF order never sent to the VPS (a VPS order: refused)
//
// Totals and tax: the SAME rule as the server (src/lib/orderTotals.ts), from the copy of
// the restaurant settings and menu: each line uses its dish's own rate (country_tax) or
// the restaurant rate; prices with or without tax included; delivery fee without tax.
//
// Every action is ALSO written down in offline_ops, exactly as the POS sent it, with a
// unique id. When the internet is back (step 4) RES Local REPLAYS them to the VPS, in
// order, so the real server logic applies (kitchen lines, stock, journal) — and the
// unique id makes sure an action sent twice is saved once.
//
// Step 3c (2026-10-29): PAYING, PRINTING and PIN LOGIN offline
//   POST /api/orders/:id/pay     cash (change computed, less than the total refused) or a
//                                card; the order closes and its table is free again
//   POST /api/printing/receipt   the receipt on the receipt printer (+ the drawer for cash)
//   POST /api/printing/drawer    opens the cash drawer
//   kitchen tickets              printed after each offline save (NEW / ADD-ON / CANCEL)
//   POST /api/auth/pin-login     "Switch user" and the POS terminal PIN pad: the PIN is
//   POST /api/auth/terminal-login  checked against the copy (bcrypt hash), and the answer is
//                                that user's REAL login, kept the last time they logged in
//                                with their PIN on this PC while online. RES Local cannot
//                                make a login itself (the secret stays on the VPS), and a
//                                made-up one would log the cashier out when the internet
//                                is back. So: each cashier logs in once online on this PC.

import { randomUUID } from 'node:crypto';
import { compareSync } from './vendor/bcryptjs.mjs';
import { buildReceipt, kitchenJobs, kitchenSnapshot, ticketText } from './offline-print.mjs';
import { EscPos, formatMoney } from './escpos.mjs';

export const LOCAL_BASE = 1_000_000_000; // local id / ticket number = LOCAL_BASE + n  →  OFF-000n

const cents = (n) => Math.round(n * 100) / 100;
const money = (n) => cents(Number(n) || 0).toFixed(2);

// print(printer, base64) → { ok, error? }  (the print helper's own printing)
export function createOfflineOrders({ db, log, print }) {
  const meta = (k) => db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value ?? null;
  const setMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
  const copyRows = (kind) => db.prepare('SELECT data FROM copy WHERE kind = ?').all(kind).map((r) => JSON.parse(r.data));
  const cachedJson = (key) => {
    const row = db.prepare('SELECT body FROM api_cache WHERE key = ?').get(key);
    try {
      return row ? JSON.parse(Buffer.from(row.body).toString('utf8')) : null;
    } catch {
      return null;
    }
  };

  const getLocal = db.prepare('SELECT id, off_no, data, status FROM local_orders WHERE id = ?');
  const allLocal = db.prepare('SELECT id, off_no, data, status FROM local_orders');
  const saveLocal = db.prepare(`
    INSERT INTO local_orders (id, off_no, data, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET data = excluded.data, status = excluded.status, updated_at = excluded.updated_at`);
  const addOp = db.prepare(`
    INSERT INTO offline_ops (op_id, created_at, method, path, body, order_id, user_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting')`);
  const dropWaitingOps = db.prepare("DELETE FROM offline_ops WHERE order_id = ? AND status = 'waiting'");
  const waitingCount = db.prepare("SELECT COUNT(*) AS n FROM offline_ops WHERE status = 'waiting'");

  // ---------------------------------------------------------------- totals (= server rule)
  function totals(lines, orderType, deliveryFee) {
    const restaurant = copyRows('restaurant')[0] || {};
    const restaurantRate = Number(restaurant.tax_rate ?? 0);
    const included = Boolean(restaurant.prices_include_tax);
    const ownRate = new Map(copyRows('menuItems').map((m) => [Number(m.id), m.country_tax == null ? null : Number(m.country_tax)]));
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const amount = Number(l.amount) || 0;
      const rate = ownRate.get(Number(l.menuItemId)) ?? restaurantRate;
      subtotal += amount;
      tax += included ? (amount * rate) / (100 + rate) : (amount * rate) / 100;
    }
    const fee = String(orderType || '').toLowerCase().includes('deliver') ? Math.max(0, Number(deliveryFee) || 0) : 0;
    subtotal = cents(subtotal);
    tax = cents(tax);
    return { subtotal, tax, deliveryFee: cents(fee), total: cents(included ? subtotal + fee : subtotal + tax + fee) };
  }

  // The POS basket → order lines (as GET /orders/:id returns them).
  function buildItems(orderId, items) {
    const names = new Map(copyRows('menuItems').map((m) => [Number(m.id), m.menu_name]));
    return items.map((it, i) => {
      const qty = Number(it.quantity || 1);
      const lineTotal = it.lineTotal != null ? Number(it.lineTotal) : qty * (Number(it.unitPrice) || 0);
      const unitPrice = Number(it.unitPrice) > 0 ? Number(it.unitPrice) : qty ? lineTotal / qty : 0;
      return {
        id: orderId * 100 + i + 1, // a local line id (only used on this PC)
        orderId,
        menuItemId: Number(it.menuItemId),
        name: it.name ?? names.get(Number(it.menuItemId)) ?? 'Item',
        quantity: qty,
        unitPrice: money(unitPrice),
        subtotal: money(lineTotal),
        variantSize: it.variantSize ?? null,
        modifiers: Array.isArray(it.modifiers) ? it.modifiers : [],
        isComp: Boolean(it.isComp),
        compReason: it.compReason ?? null,
      };
    });
  }

  function applyTotals(order) {
    const t = totals(order.items.map((l) => ({ menuItemId: l.menuItemId, amount: Number(l.subtotal) })), order.orderType, order.deliveryFee);
    order.subtotalAmount = money(t.subtotal);
    order.taxAmount = money(t.tax);
    order.deliveryFee = money(t.deliveryFee);
    order.totalAmount = money(t.total);
    return order;
  }

  // An order of the VPS (opened online before the cut), as the POS reads it.
  function serverOrder(id) {
    const cached = cachedJson(`/api/orders/${id}`);
    if (cached?.order) return structuredClone(cached.order);
    const o = copyRows('openOrders').find((x) => Number(x.id) === id);
    if (!o) return null;
    const names = new Map(copyRows('menuItems').map((m) => [Number(m.id), m.menu_name]));
    return {
      id, restaurantId: Number(meta('restaurant_id')), tableId: o.table_id, status: o.status, orderType: o.order_type,
      customerName: o.customer_name, customerPhone: o.customer_phone, deliveryAddress: o.delivery_address,
      ticketNo: o.ticket_no, notes: o.notes, subtotalAmount: o.subtotal_amount, taxAmount: o.tax_amount,
      deliveryFee: o.delivery_fee, totalAmount: o.total_amount, createdAt: o.created_at,
      items: copyRows('openOrderItems')
        .filter((i) => Number(i.order_id) === id && i.kds_status !== 'CANCELLED')
        .map((i) => ({
          id: i.id, orderId: id, menuItemId: i.menu_item_id, name: names.get(Number(i.menu_item_id)) ?? 'Item',
          quantity: i.quantity, unitPrice: i.unit_price, subtotal: i.subtotal, variantSize: i.variant_size, modifiers: i.modifiers || [],
        })),
    };
  }

  // Write down one POS action for the replay (step 4).
  function record(method, path, rawBody, orderId, userId) {
    addOp.run(randomUUID(), new Date().toISOString(), method, path, rawBody, orderId, userId || null);
  }

  // ---------------------------------------------------------------- printing
  const restaurant = () => copyRows('restaurant')[0] || {};
  const tableLabel = (tableId) => (tableId ? copyRows('tables').find((t) => Number(t.id) === Number(tableId))?.label ?? String(tableId) : '');
  // who did it (for "By:" on the kitchen ticket)
  const userName = (userId) =>
    cachedJson(`/api/auth/me#user=${userId}`)?.name ?? copyRows('users').find((u) => String(u.id) === String(userId))?.name ?? '';

  async function printOn(printer, data) {
    try {
      return (await print(printer, data)) || { ok: false, error: 'No answer from the printer.' };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  }

  // Kitchen tickets for what changed between two versions of the order (like the server).
  async function sendKitchen(beforeItems, order, userId) {
    const ctx = { menuItems: copyRows('menuItems'), categories: copyRows('categories') };
    const r = restaurant();
    const header = {
      ticketNo: order.ticketNo, type: order.orderType, customer: order.customerName || '', notes: order.notes || '',
      table: tableLabel(order.tableId), defaultPrinter: r.kitchen_printer || '', timezone: r.timezone, waiter: userName(userId),
    };
    const jobs = kitchenJobs(kitchenSnapshot(beforeItems, ctx), kitchenSnapshot(order.items, ctx), header);
    const results = [];
    for (const j of jobs) {
      const res = await printOn(j.printer, j.data);
      log(`Offline kitchen ticket ${j.kind} (${j.title}) → ${j.printer}: ${res.ok ? 'printed' : 'FAILED ' + (res.error || '')}`);
      results.push({ station: j.title, printer: j.printer, kind: j.kind, ok: res.ok, error: res.error });
    }
    return results;
  }

  // The order as it is now on this PC (offline order, or a VPS order changed / seen here).
  function currentOrder(id) {
    const row = getLocal.get(id);
    if (row) return { row, order: JSON.parse(row.data) };
    const so = serverOrder(id);
    return so ? { row: null, order: so } : null;
  }

  // ---------------------------------------------------------------- PIN login offline
  const PIN_USERS = () => copyRows('users');
  const savedLogin = (userId) => cachedJson(`login#user=${userId}`);
  function pinLogin(pin) {
    if (!/^\d{4}$/.test(String(pin || ''))) return { status: 400, body: { error: 'Enter the 4-digit PIN.' } };
    const u = PIN_USERS().find((x) => x.pin_hash && compareSync(String(pin), x.pin_hash));
    if (!u) return { status: 401, body: { error: 'Wrong PIN.' } };
    const answer = savedLogin(u.id);
    // the saved login must still be valid (its "exp" time)
    let exp = 0;
    try {
      exp = Number(JSON.parse(Buffer.from(String(answer?.token || '').split('.')[1], 'base64url').toString('utf8')).exp || 0);
    } catch {
      /* no saved login */
    }
    if (!answer?.token || (exp && exp * 1000 < Date.now())) {
      return { status: 403, body: { error: `No internet: ${u.name} must log in once with the PIN on this PC while online, then the PIN works offline too.`, offline: true } };
    }
    log(`Offline PIN login: ${u.name}.`);
    return { status: 200, body: answer };
  }

  // The open orders right now: VPS orders (copy) + changes made here.
  function openOrders() {
    const local = new Map(allLocal.all().map((r) => [Number(r.id), { ...r, data: JSON.parse(r.data) }]));
    const list = (cachedJson('/api/orders/active')?.orders || []).filter((o) => {
      const l = local.get(Number(o.orderId));
      return !l || l.status === 'open';
    });
    for (const row of list) {
      const l = local.get(Number(row.orderId));
      if (l) Object.assign(row, { totalAmount: l.data.totalAmount, status: l.data.status, itemCount: l.data.items.reduce((s, i) => s + Number(i.quantity), 0) });
    }
    for (const l of local.values()) {
      if (l.status !== 'open' || list.some((o) => Number(o.orderId) === Number(l.id))) continue;
      const o = l.data;
      list.push({
        orderId: o.id, ticketNo: o.ticketNo, orderType: o.orderType, status: o.status, totalAmount: o.totalAmount,
        customerName: o.customerName, customerPhone: o.customerPhone, deliveryAddress: o.deliveryAddress,
        created_at: o.createdAt, itemCount: o.items.reduce((s, i) => s + Number(i.quantity), 0), offline: true,
      });
    }
    return list;
  }

  // ---------------------------------------------------------------- the calls
  // Returns { status, body } when it answers, or null (the gateway then uses its copies).
  async function handle(req, url, rawBody, userId) {
    const path = url.pathname;
    const method = req.method;
    let body = {};
    try {
      body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
    } catch {
      return { status: 400, body: { error: 'Invalid request.' } };
    }
    const now = new Date().toISOString();

    // ---- new order
    if (method === 'POST' && path === '/api/orders') {
      if (!Array.isArray(body.items) || !body.items.length) return { status: 400, body: { error: 'Order must contain at least one item.' } };
      // one counter, never reset: after this PC's last number AND the server's last one
      // (a reinstalled / replaced PC continues where the restaurant was)
      const n = Math.max(Number(meta('off_counter') || 0), Number(meta('server_last_off') || 0)) + 1;
      const id = LOCAL_BASE + n;
      const order = applyTotals({
        id, restaurantId: Number(meta('restaurant_id')), tableId: body.tableId ? Number(body.tableId) : null,
        status: body.orderStatus ?? 'open', orderType: body.orderType ?? 'Dine-In',
        customerName: body.customerName ?? null, customerPhone: body.customerPhone ?? null, deliveryAddress: body.customerAddress ?? null,
        ticketNo: id, notes: body.notes ?? null, deliveryFee: body.deliveryFee ?? 0, createdAt: now,
        offline: true, offNo: n, items: buildItems(id, body.items),
      });
      db.exec('BEGIN');
      try {
        setMeta.run('off_counter', String(n));
        saveLocal.run(id, n, JSON.stringify(order), 'open', now, now);
        record('POST', path, rawBody.toString('utf8'), id, userId);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      log(`Offline order OFF-${String(n).padStart(4, '0')} saved (${order.items.length} lines, total ${order.totalAmount}).`);
      // kitchen tickets: a new order — everything in it is new for the kitchen
      const kitchen = await sendKitchen([], order, userId);
      return { status: 201, body: { order, kitchen } };
    }

    const m = path.match(/^\/api\/orders\/(\d+)$/);
    const id = m ? Number(m[1]) : null;

    // ---- change an order
    if (method === 'PUT' && id) {
      const row = getLocal.get(id);
      const current = row ? (row.status === 'open' ? JSON.parse(row.data) : null) : serverOrder(id);
      if (!current) return { status: 404, body: { error: 'Order not found on this PC.' } };
      if (!Array.isArray(body.items)) return { status: 400, body: { error: 'Order items are missing.' } };
      const order = applyTotals({
        ...current,
        orderType: body.orderType ?? current.orderType,
        notes: body.notes ?? current.notes,
        deliveryAddress: body.customerAddress ?? current.deliveryAddress,
        customerName: body.customerName ?? current.customerName,
        customerPhone: body.customerPhone ?? current.customerPhone,
        status: body.orderStatus ?? current.status,
        tableId: body.tableId ? Number(body.tableId) : current.tableId,
        deliveryFee: body.deliveryFee ?? current.deliveryFee,
        items: buildItems(id, body.items),
      });
      db.exec('BEGIN');
      try {
        saveLocal.run(id, row?.off_no ?? null, JSON.stringify(order), 'open', row ? now : now, now);
        record('PUT', path, rawBody.toString('utf8'), id, userId);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      log(`Offline change saved on ${order.offNo ? `OFF-${String(order.offNo).padStart(4, '0')}` : `order #${order.ticketNo}`} (total ${order.totalAmount}).`);
      // kitchen tickets: only what changed (ADD-ON / CANCEL)
      const kitchen = await sendKitchen(current.items, order, userId);
      return { status: 200, body: { order, kitchen } };
    }

    // ---- pay (one method per order, like the server)
    const payMatch = path.match(/^\/api\/orders\/(\d+)\/pay$/);
    if (method === 'POST' && payMatch) {
      const orderId = Number(payMatch[1]);
      const found = currentOrder(orderId);
      if (!found) return { status: 404, body: { error: 'Order not found on this PC.' } };
      const { row, order } = found;
      const st = String(row?.status === 'closed' ? 'CLOSED' : order.status || '').toUpperCase();
      if (st === 'CLOSED') return { status: 409, body: { error: 'This order is already paid.' } };
      const payMethod = String(body.method || '').toUpperCase();
      if (!['CASH', 'VISA', 'MASTERCARD', 'DEBIT'].includes(payMethod)) {
        return { status: 400, body: { error: 'Choose a payment method: Cash, Visa, Mastercard or Debit.' } };
      }
      const currency = String(restaurant().currency || 'USD').toUpperCase();
      const mny = (c) => formatMoney(c / 100, currency);
      const dueCents = Math.round(Number(order.totalAmount) * 100);
      let receivedCents = dueCents;
      if (payMethod === 'CASH') {
        receivedCents = Math.round(Number(body.amountReceived) * 100);
        if (!Number.isFinite(receivedCents)) return { status: 400, body: { error: 'Enter the amount the customer gave.' } };
        if (receivedCents < dueCents) {
          return { status: 400, body: { error: `The customer gave ${mny(receivedCents)}, but the total is ${mny(dueCents)}. Still to pay: ${mny(dueCents - receivedCents)}.` } };
        }
      }
      const payment = {
        orderId, method: payMethod, amountDue: (dueCents / 100).toFixed(2), amountReceived: (receivedCents / 100).toFixed(2),
        changeGiven: ((receivedCents - dueCents) / 100).toFixed(2), currency, cashierId: userId ? Number(userId) : null, createdAt: now, offline: true,
      };
      const closed = { ...order, status: 'CLOSED', payment };
      db.exec('BEGIN');
      try {
        saveLocal.run(orderId, row?.off_no ?? null, JSON.stringify(closed), 'closed', now, now);
        record('POST', path, rawBody.toString('utf8'), orderId, userId);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      log(`Offline payment: ${ticketText(order.ticketNo)} paid by ${payMethod} (${payment.amountDue}).`);
      const change = Number(payment.changeGiven);
      return {
        status: 201,
        body: {
          payment, order: closed,
          message: payMethod === 'CASH'
            ? change > 0 ? `Paid by cash. Give back ${formatMoney(change, currency)}.` : 'Paid by cash. Exact amount, no change.'
            : `Paid by ${payMethod.charAt(0) + payMethod.slice(1).toLowerCase()}.`,
        },
      };
    }

    // ---- the receipt of an order (+ the drawer for a paid cash order)
    if (method === 'POST' && path === '/api/printing/receipt') {
      const found = currentOrder(Number(body.orderId));
      if (!found) return { status: 404, body: { error: 'Order not found on this PC.' } };
      const r = restaurant();
      const rec = buildReceipt({ restaurant: r, order: found.order, tableLabel: tableLabel(found.order.tableId), menuItems: copyRows('menuItems'), copy: Boolean(body.copy) });
      if (!rec.receiptPrinter) return { status: 400, body: { error: 'Choose the receipt printer in Settings → Printers.' } };
      const drawerOnReceipt = rec.paidCash && (!rec.drawerPrinter || rec.drawerPrinter === rec.receiptPrinter);
      if (drawerOnReceipt) rec.escpos.openDrawer();
      rec.escpos.cut();
      const res = await printOn(rec.receiptPrinter, rec.escpos.toBase64());
      log(`Offline receipt ${ticketText(found.order.ticketNo)} → ${rec.receiptPrinter}: ${res.ok ? 'printed' : 'FAILED ' + (res.error || '')}`);
      if (!res.ok) return { status: 502, body: { error: res.error || 'The receipt could not be printed.' } };
      let drawer = drawerOnReceipt ? { ok: true } : null;
      if (rec.paidCash && !drawerOnReceipt && rec.drawerPrinter) drawer = await printOn(rec.drawerPrinter, new EscPos().openDrawer().toBase64());
      return { status: 200, body: { ok: true, drawer } };
    }

    // ---- open the cash drawer
    if (method === 'POST' && path === '/api/printing/drawer') {
      const r = restaurant();
      const printer = r.drawer_printer || r.receipt_printer;
      if (!printer) return { status: 400, body: { error: 'Choose the drawer printer in Settings → Printers.' } };
      const res = await printOn(printer, new EscPos().openDrawer().toBase64());
      return res.ok ? { status: 200, body: { ok: true } } : { status: 502, body: { error: res.error } };
    }

    // ---- PIN login (Switch user / POS terminal PIN pad)
    if (method === 'POST' && (path === '/api/auth/pin-login' || path === '/api/auth/terminal-login')) return pinLogin(body.pin);
    // the PIN pad's restaurant name / logo: as the last time online (or from the copy)
    if (method === 'POST' && path === '/api/auth/terminal-check') {
      return { status: 200, body: cachedJson('terminal-check') || { restaurantName: restaurant().name || '', terminalName: 'POS', logoUrl: '', welcome: '' } };
    }

    // ---- read one order (only the ones changed here; the others come from the copies)
    if (method === 'GET' && id) {
      const row = getLocal.get(id);
      if (!row) return null;
      if (row.status !== 'open') return { status: 404, body: { error: 'Order not found.' } };
      return { status: 200, body: { order: JSON.parse(row.data) } };
    }

    // ---- delete: only an OFF order that never reached the VPS
    if (method === 'DELETE' && id) {
      const row = getLocal.get(id);
      if (!row || !row.off_no) return { status: 409, body: { error: 'No internet: an order already on the server cannot be deleted offline.', offline: true } };
      db.exec('BEGIN');
      try {
        saveLocal.run(id, row.off_no, row.data, 'deleted', now, now);
        dropWaitingOps.run(id); // never sent: nothing to replay for it
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      log(`Offline order OFF-${String(row.off_no).padStart(4, '0')} deleted (it was never sent).`);
      return { status: 200, body: { message: 'Order deleted.' } };
    }

    // ---- open orders list
    if (method === 'GET' && path === '/api/orders/active') return { status: 200, body: { orders: openOrders() } };

    // ---- tables: occupied while an open order is on them (here or on the VPS)
    if (method === 'GET' && path === '/api/tables') {
      const cached = cachedJson('/api/tables');
      if (!cached) return null;
      const local = new Map(allLocal.all().map((r) => [Number(r.id), { status: r.status, data: JSON.parse(r.data) }]));
      const busy = new Set();
      for (const o of copyRows('openOrders')) {
        const l = local.get(Number(o.id));
        const tableId = l ? (l.status === 'open' ? l.data.tableId : null) : o.table_id;
        if (tableId) busy.add(Number(tableId));
      }
      for (const l of local.values()) if (l.status === 'open' && l.data.tableId) busy.add(Number(l.data.tableId));
      const tables = (cached.tables || []).map((t) => ({
        ...t,
        status: busy.has(Number(t.id)) ? 'occupied' : t.status === 'occupied' ? 'free' : t.status,
      }));
      return { status: 200, body: { tables } };
    }

    return null;
  }

  // Has this order actions not sent yet? (then even online it stays on this PC until synced)
  const waitingFor = db.prepare("SELECT COUNT(*) AS n FROM offline_ops WHERE order_id = ? AND status = 'waiting'");
  const pending = (orderId) => waitingFor.get(Number(orderId)).n > 0;

  return { handle, pending, waiting: () => waitingCount.get().n };
}
