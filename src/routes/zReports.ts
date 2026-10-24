// src/routes/zReports.ts
//
// Z report = closing of a business day (step B, rules agreed 2026-10-24):
//   - A day runs from one Z to the next, not by calendar date: the "current day"
//     is every payment made after the previous Z was closed (a late night after
//     midnight stays in the same day).
//   - One cash drawer per restaurant.
//   - Cash check: expected cash = opening cash + cash sales; the cashier types the
//     cash counted in the drawer; difference = counted − expected (+ over, − short).
//   - Opening cash (2026-10-25): the cash put in the drawer before selling. Set on
//     the Z page or confirmed in the POS at the start of the day (drawer_openings);
//     if nobody sets it, it is the cash LEFT in the drawer at the previous Z.
//   - At closing the owner may take cash out (bank / owner): cash left in the
//     drawer = counted − taken out, and it becomes the next day's opening cash.
//   - When a Z is closed, all its numbers are copied into it (totals) and never
//     change again; the next payments belong to the next day.
//
// GET  /api/z-reports/current  → the current day so far (= X report, changes nothing)
// GET  /api/z-reports/opening-status → for the POS: is today's opening cash confirmed?
// POST /api/z-reports/opening-cash   → set today's opening cash: { amount }
// POST /api/z-reports/close    → close the day: { countedCash, cashTaken, notes? }
// GET  /api/z-reports          → the list of past Z
// GET  /api/z-reports/:id      → one Z (to see / reprint it)

import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { getRestaurantId } from '../lib/tenant.js';
import { openOrders, restaurantTimeZone, salesSnapshot } from '../lib/salesSnapshot.js';

class ZError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

const toCents = (v: unknown) => Math.round(Number(v) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

// Payments of the current day: after the previous Z (or all of them before the first Z).
const sinceLastZ = (openedAt: string | null, upTo?: string) =>
  sql`${openedAt ? sql`p.created_at > ${openedAt}::timestamptz` : sql`true`}
      ${upTo ? sql`AND p.created_at <= ${upTo}::timestamptz` : sql``}`;

// The last Z of a restaurant (null if none yet).
async function lastZ(restaurantId: number, exec: { execute: (q: any) => Promise<any> } = db) {
  const [z] = (await exec.execute(sql`
    SELECT id, z_number AS "zNumber", closed_at::text AS "closedAt", opening_float::float AS "openingFloat",
           cash_left::float AS "cashLeft"
    FROM z_reports
    WHERE restaurant_id = ${restaurantId}
    ORDER BY z_number DESC
    LIMIT 1
  `)) as any[];
  return z ?? null;
}

// A local date-time text for the screen: "2026-10-24 23:50".
const localText = (column: any, tz: string) => sql`to_char(${column} AT TIME ZONE ${tz}, 'YYYY-MM-DD HH24:MI')`;

// The opening cash of the current day:
//   - 'set'    : someone set it after the previous Z (the latest one counts);
//   - 'last-z' : nobody set it yet → the cash left in the drawer at the previous Z;
//   - 'none'   : no Z yet and nothing set → 0.
async function openingCash(
  restaurantId: number,
  last: { closedAt: string; cashLeft: number } | null,
  tz: string,
  exec: { execute: (q: any) => Promise<any> } = db
): Promise<{ amount: number; source: 'set' | 'last-z' | 'none'; setAt: string | null; setBy: string | null }> {
  const [row] = (await exec.execute(sql`
    SELECT d.amount::float AS amount, ${localText(sql`d.created_at`, tz)} AS "setAt",
           COALESCE(u.full_name, u.email, '') AS "setBy"
    FROM drawer_openings d
    LEFT JOIN public.users u ON u.id = d.created_by
    WHERE d.restaurant_id = ${restaurantId}
      ${last ? sql`AND d.created_at > ${last.closedAt}::timestamptz` : sql``}
    ORDER BY d.created_at DESC, d.id DESC
    LIMIT 1
  `)) as any[];
  if (row) return { amount: row.amount, source: 'set', setAt: row.setAt, setBy: row.setBy || null };
  if (last) return { amount: last.cashLeft ?? 0, source: 'last-z', setAt: null, setBy: null };
  return { amount: 0, source: 'none', setAt: null, setBy: null };
}

export default async function zReportRoutes(fastify: FastifyInstance) {
  // The current day so far (X report). Changes nothing.
  fastify.get('/api/z-reports/current', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    try {
      const tz = await restaurantTimeZone(restaurantId);
      const last = await lastZ(restaurantId);
      const snapshot = await salesSnapshot(restaurantId, tz, sinceLastZ(last?.closedAt ?? null));
      const open = await openOrders(restaurantId);
      const opening = await openingCash(restaurantId, last, tz);
      const [{ first }] = (await db.execute(sql`
        SELECT ${localText(sql`MIN(p.created_at)`, tz)} AS first
        FROM order_payments p WHERE p.restaurant_id = ${restaurantId} AND ${sinceLastZ(last?.closedAt ?? null)}
      `)) as any[];
      return reply.send({
        timeZone: tz,
        lastZ: last,
        // when the current day started: the previous Z's closing, or the first sale
        openedAtText: last
          ? ((await db.execute(sql`SELECT ${localText(sql`${last.closedAt}::timestamptz`, tz)} AS t`)) as any[])[0].t
          : first,
        nextNumber: (last?.zNumber ?? 0) + 1,
        openingCash: opening,
        suggestedFloat: opening.amount,
        ...snapshot,
        open,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The current day could not be loaded.' });
    }
  });

  // For the POS, at the start of the day: is today's opening cash confirmed?
  // (needsConfirm = nobody set it since the previous Z.)
  fastify.get('/api/z-reports/opening-status', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    try {
      const tz = await restaurantTimeZone(restaurantId);
      const last = await lastZ(restaurantId);
      const opening = await openingCash(restaurantId, last, tz);
      return reply.send({
        needsConfirm: opening.source !== 'set',
        amount: opening.amount,
        source: opening.source,
        lastZNumber: last?.zNumber ?? null,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The opening cash could not be loaded.' });
    }
  });

  // Set (or correct) the opening cash of the current day.
  fastify.post('/api/z-reports/opening-cash', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const body = (request.body || {}) as { amount?: unknown };
    const cents = toCents(body.amount);
    if (body.amount === undefined || body.amount === '' || !Number.isFinite(cents) || cents < 0) {
      return reply.status(400).send({ error: 'Enter the cash put in the drawer (0 if it is empty).' });
    }
    try {
      await db.execute(sql`
        INSERT INTO drawer_openings (restaurant_id, amount, created_by)
        VALUES (${restaurantId}, ${fromCents(cents)}, (SELECT id FROM users WHERE id = ${request.user?.id ?? null}))
      `);
      return reply.status(201).send({ amount: cents / 100 });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The opening cash could not be saved.' });
    }
  });

  // Close the day.
  fastify.post('/api/z-reports/close', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const body = (request.body || {}) as { countedCash?: unknown; cashTaken?: unknown; notes?: unknown };
    const countedCents = toCents(body.countedCash);
    const takenCents = toCents(body.cashTaken ?? 0);
    if (body.countedCash === undefined || body.countedCash === '' || !Number.isFinite(countedCents) || countedCents < 0) {
      return reply.status(400).send({ error: 'Count the cash in the drawer and enter the amount.' });
    }
    if (!Number.isFinite(takenCents) || takenCents < 0) {
      return reply.status(400).send({ error: 'Enter the cash taken out of the drawer (0 if none).' });
    }
    if (takenCents > countedCents) {
      return reply.status(400).send({
        error: `You cannot take out $${fromCents(takenCents)}: only $${fromCents(countedCents)} was counted in the drawer.`,
      });
    }
    const leftCents = countedCents - takenCents;
    const notes = body.notes ? String(body.notes).slice(0, 500) : null;

    try {
      const tz = await restaurantTimeZone(restaurantId);
      const z = await db.transaction(async (tx) => {
        // One closing at a time per restaurant: a second click / terminal waits here,
        // then sees the first Z and closes an (empty) next day instead of a duplicate.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('z-report'), ${restaurantId})`);
        const last = await lastZ(restaurantId, tx);
        const [{ now }] = (await tx.execute(sql`SELECT now()::text AS now`)) as any[];

        const snapshot = await salesSnapshot(restaurantId, tz, sinceLastZ(last?.closedAt ?? null, now), tx);
        const open = await openOrders(restaurantId, tx);
        // The opening cash is the one of the day (set at the start, or left at the last Z).
        const floatCents = toCents((await openingCash(restaurantId, last, tz, tx)).amount);

        const cashSalesCents = toCents(snapshot.summary.cashTotal);
        const expectedCents = floatCents + cashSalesCents;
        const differenceCents = countedCents - expectedCents;

        const [row] = (await tx.execute(sql`
          INSERT INTO z_reports
            (restaurant_id, z_number, opened_at, closed_at, opening_float, cash_sales, expected_cash,
             counted_cash, difference, net_sales, tickets, totals, notes, closed_by, cash_taken, cash_left)
          VALUES
            (${restaurantId}, ${(last?.zNumber ?? 0) + 1},
             -- day start: the previous Z's closing; for the very first Z, the first sale
             ${last?.closedAt
               ? sql`${last.closedAt}::timestamptz`
               : sql`(SELECT MIN(created_at) FROM order_payments WHERE restaurant_id = ${restaurantId} AND created_at <= ${now}::timestamptz)`},
             ${now}::timestamptz,
             ${fromCents(floatCents)}, ${fromCents(cashSalesCents)}, ${fromCents(expectedCents)},
             ${fromCents(countedCents)}, ${fromCents(differenceCents)}, ${snapshot.summary.totalPaid.toFixed(2)},
             ${snapshot.summary.tickets}, ${JSON.stringify({ ...snapshot, openAtClose: open, timeZone: tz })}::jsonb,
             ${notes}, (SELECT id FROM users WHERE id = ${request.user?.id ?? null}),
             ${fromCents(takenCents)}, ${fromCents(leftCents)})
          RETURNING id
        `)) as any[];
        return row;
      });
      return reply.status(201).send({ id: z.id });
    } catch (err: any) {
      if (err instanceof ZError) return reply.status(err.statusCode).send({ error: err.message });
      request.log.error(err);
      return reply.status(500).send({ error: 'The day could not be closed. Please try again.' });
    }
  });

  // The list of past Z, latest first.
  // Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD: only the Z CLOSED on those days
  // (restaurant time zone) — used by Reports → Closed Days.
  fastify.get('/api/z-reports', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const q = request.query as { from?: string; to?: string };
    const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
    const from = isDate(q.from) ? q.from! : null;
    const to = isDate(q.to) ? q.to! : null;
    if (from && to && from > to) return reply.status(400).send({ error: 'The "from" date must be before the "to" date.' });
    try {
      const tz = await restaurantTimeZone(restaurantId);
      const closedDay = sql`(z.closed_at AT TIME ZONE ${tz})::date`;
      const list = await db.execute(sql`
        SELECT z.id, z.z_number AS "zNumber",
               ${localText(sql`z.opened_at`, tz)} AS "openedAt", ${localText(sql`z.closed_at`, tz)} AS "closedAt",
               z.net_sales::float AS "netSales", z.tickets,
               z.opening_float::float AS "openingFloat", z.cash_sales::float AS "cashSales",
               z.expected_cash::float AS "expectedCash", z.counted_cash::float AS "countedCash",
               z.difference::float AS difference,
               z.cash_taken::float AS "cashTaken", z.cash_left::float AS "cashLeft",
               COALESCE(u.full_name, u.email, '') AS "closedBy"
        FROM z_reports z
        LEFT JOIN public.users u ON u.id = z.closed_by
        WHERE z.restaurant_id = ${restaurantId}
          ${from ? sql`AND ${closedDay} >= ${from}::date` : sql``}
          ${to ? sql`AND ${closedDay} <= ${to}::date` : sql``}
        ORDER BY z.z_number DESC
      `);
      return reply.send({ zReports: list });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The Z reports could not be loaded.' });
    }
  });

  // One Z with its frozen totals.
  fastify.get('/api/z-reports/:id', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) return reply.status(400).send({ error: 'Invalid Z report.' });
    try {
      const tz = await restaurantTimeZone(restaurantId);
      const [z] = (await db.execute(sql`
        SELECT z.id, z.z_number AS "zNumber",
               ${localText(sql`z.opened_at`, tz)} AS "openedAt", ${localText(sql`z.closed_at`, tz)} AS "closedAt",
               z.net_sales::float AS "netSales", z.tickets,
               z.opening_float::float AS "openingFloat", z.cash_sales::float AS "cashSales",
               z.expected_cash::float AS "expectedCash", z.counted_cash::float AS "countedCash",
               z.difference::float AS difference, z.notes, z.totals,
               z.cash_taken::float AS "cashTaken", z.cash_left::float AS "cashLeft",
               COALESCE(u.full_name, u.email, '') AS "closedBy"
        FROM z_reports z
        LEFT JOIN public.users u ON u.id = z.closed_by
        WHERE z.id = ${id} AND z.restaurant_id = ${restaurantId}
      `)) as any[];
      if (!z) return reply.status(404).send({ error: 'Z report not found.' });
      return reply.send({ zReport: z });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The Z report could not be loaded.' });
    }
  });
}
