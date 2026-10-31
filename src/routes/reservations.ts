// src/routes/reservations.ts
//
// RESERVATIONS (agreed with the user 2026-10-31, mockup approved; database:
// sql/2026-10-31_reservations.sql). The staff book tables for customers:
//
//   GET  /api/reservations?date=YYYY-MM-DD   one day: the bookings + the tables (timeline)
//   GET  /api/reservations/month?month=      bookings per day (the calendar)
//   GET  /api/reservations/availability      free tables per half hour (New booking window)
//   GET  /api/reservations/lookup?phone=     known customer? (name fills in by itself)
//   GET  /api/reservations/search?q=         find a booking by name or phone, any day
//   POST /api/reservations                   new booking
//   PUT  /api/reservations/:id               change a booking
//   POST /api/reservations/:id/status        Seat (arrived) / No-show / Cancel / back to booked
//   PUT  /api/reservations/settings          hold time + "Reserved" minutes (managers)
//
// Rules:
//   - all times are the RESTAURANT's time (restaurants.timezone), not the PC's
//   - a booking holds its table from its start for the hold time (1 hour by default)
//   - two active bookings (booked / arrived) can never overlap on the same table: checked
//     here, and refused by the database itself as well (reservations_no_overlap)
//   - the table is optional: it can be chosen when the guest arrives (Seat)
//   - nothing is automatic: "late" is only shown; the staff decide the no-show
//   - not part of offline mode (offline = POS sales only)

import { FastifyInstance } from 'fastify';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { getRestaurantId } from '../lib/tenant.js';
import { reservationSettings } from '../lib/reservations.js';
import { roomManager } from '../lib/roomManager.js';

const STATUSES = ['booked', 'arrived', 'no_show', 'cancelled'] as const;
type Status = (typeof STATUSES)[number];

// Which status can follow which (Seat, No-show, Cancel, and "undo" back to booked).
const ALLOWED_FROM: Record<Status, Status[]> = {
  arrived: ['booked', 'no_show'], // a guest marked no-show who finally comes
  no_show: ['booked'],
  cancelled: ['booked', 'no_show'],
  booked: ['arrived', 'no_show', 'cancelled'], // undo
};

const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const digitsOf = (phone: unknown) => String(phone ?? '').replace(/\D/g, '');
// The note chips as a PostgreSQL text[] (sent as one JSON value: a JS array given to
// sql`` directly would be spread into several parameters).
const tagsSql = (tags: string[]) => sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(tags)}::jsonb))`;

// An error with an HTTP status, answered as { error } by the route.
function httpError(statusCode: number, message: string) {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}
function sendError(reply: any, err: any, what: string) {
  if (err?.statusCode) return reply.status(err.statusCode).send({ error: err.message });
  // the database's own double-booking guard (exclusion constraint)
  if (err?.code === '23P01') return reply.status(409).send({ error: 'This table is already booked at that time.' });
  console.error(`❌ reservations: ${what}`, err);
  return reply.status(500).send({ error: `Could not ${what}.` });
}

// Every screen of the restaurant reloads its bookings (Reservations screen, POS).
const announce = (restaurantId: number) =>
  roomManager.broadcastToRestaurant(String(restaurantId), 'RESERVATIONS_UPDATED', { at: Date.now() });

// The bookings with everything the screens show. `where` limits the rows.
async function selectReservations(tz: string, where: SQL, orderBy: SQL = sql`r.starts_at, r.id`, limit = 500) {
  const rows = (await db.execute(sql`
    SELECT r.id, r.guest_name AS "guestName", r.phone, r.party_size AS "partySize",
           to_char(r.starts_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
           to_char(r.starts_at AT TIME ZONE ${tz}, 'HH24:MI') AS time,
           to_char(r.ends_at AT TIME ZONE ${tz}, 'HH24:MI') AS "endTime",
           (extract(epoch FROM r.ends_at - r.starts_at) / 60)::int AS "durationMinutes",
           -- numbers as numbers (bigint columns would come back as text)
           (extract(epoch FROM r.starts_at) * 1000)::float8 AS "startMs",
           (extract(epoch FROM r.ends_at) * 1000)::float8 AS "endMs",
           r.table_id::int AS "tableId", t.label AS "tableLabel", t.capacity AS "tableCapacity",
           r.note_tags AS "noteTags", r.note, r.status, r.order_id::int AS "orderId",
           r.customer_id::int AS "customerId",
           -- earlier visits of the same phone (seated bookings) → "⭐ 7th visit"
           (SELECT COUNT(*) FROM reservations v
             WHERE v.restaurant_id = r.restaurant_id AND v.id <> r.id AND v.status = 'arrived'
               AND r.phone IS NOT NULL AND length(regexp_replace(r.phone, '[^0-9]', '', 'g')) >= 6
               AND regexp_replace(v.phone, '[^0-9]', '', 'g') = regexp_replace(r.phone, '[^0-9]', '', 'g')
               AND v.starts_at < r.starts_at)::int AS "pastVisits"
    FROM reservations r
    LEFT JOIN restaurant_tables t ON t.id = r.table_id
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `)) as any[];
  return rows.map((r) => ({ ...r, noteTags: Array.isArray(r.noteTags) ? r.noteTags : [] }));
}

// The restaurant's tables, in a natural order (T2 before T10).
async function restaurantTablesOf(restaurantId: number) {
  const rows = (await db.execute(sql`
    SELECT id::int AS id, label, capacity, zone, status::text AS status
    FROM restaurant_tables WHERE restaurant_id = ${restaurantId}
  `)) as any[];
  return rows.sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }));
}

// "Today" and "now" in the restaurant's time zone.
async function restaurantNow(tz: string) {
  const [n] = (await db.execute(sql`
    SELECT to_char(now() AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS today,
           to_char(now() AT TIME ZONE ${tz}, 'HH24:MI') AS "nowTime",
           (extract(epoch FROM now()) * 1000)::float8 AS "nowMs"
  `)) as any[];
  return n as { today: string; nowTime: string; nowMs: number };
}

// Start (restaurant time) → the real moment, and the end after `minutes`.
async function bookingRange(date: string, time: string, tz: string, minutes: number) {
  const [r] = (await db.execute(sql`
    SELECT ((${date}::date + ${time}::time) AT TIME ZONE ${tz}) AS s,
           ((${date}::date + ${time}::time) AT TIME ZONE ${tz}) + make_interval(mins => ${minutes}) AS e
  `)) as any[];
  // ISO text: the database driver does not accept Date objects as parameters here
  return { startsAt: new Date(r.s).toISOString(), endsAt: new Date(r.e).toISOString() };
}

// Inside a transaction: the table must be this restaurant's, and free from other active
// bookings between `startsAt` and `endsAt`. Locks the table row, so two cashiers booking
// the same table at the same moment are handled one after the other.
async function assertTableFree(tx: any, restaurantId: number, tableId: number, startsAt: string, endsAt: string, tz: string, excludeId: number | null) {
  const [t] = (await tx.execute(sql`
    SELECT id, label FROM restaurant_tables WHERE id = ${tableId} AND restaurant_id = ${restaurantId} FOR UPDATE
  `)) as any[];
  if (!t) throw httpError(404, 'Table not found.');
  const [clash] = (await tx.execute(sql`
    SELECT guest_name AS "guestName", to_char(starts_at AT TIME ZONE ${tz}, 'HH24:MI') AS time
    FROM reservations
    WHERE restaurant_id = ${restaurantId} AND table_id = ${tableId} AND status IN ('booked', 'arrived')
      AND id <> ${excludeId ?? 0}
      AND tstzrange(starts_at, ends_at) && tstzrange(${startsAt}::timestamptz, ${endsAt}::timestamptz)
    LIMIT 1
  `)) as any[];
  if (clash) throw httpError(409, `Table ${t.label} is already booked at ${clash.time} (${clash.guestName}).`);
}

// The booking form (new or changed booking), checked.
function readForm(body: any) {
  const guestName = String(body?.guestName ?? '').trim();
  if (!guestName) throw httpError(400, 'The guest name is required.');
  if (guestName.length > 120) throw httpError(400, 'The guest name is too long.');
  const phone = String(body?.phone ?? '').trim() || null;
  if (phone && phone.length > 50) throw httpError(400, 'The phone number is too long.');
  const partySize = Number(body?.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 200) throw httpError(400, 'Number of people: 1 to 200.');
  if (!isDate(body?.date)) throw httpError(400, 'Choose a valid date.');
  if (!isTime(body?.time)) throw httpError(400, 'Choose a valid time.');
  const tableId = body?.tableId == null || body?.tableId === '' ? null : Number(body.tableId);
  if (tableId !== null && (!Number.isInteger(tableId) || tableId <= 0)) throw httpError(400, 'Invalid table.');
  const noteTags = (Array.isArray(body?.noteTags) ? body.noteTags : [])
    .map((t: unknown) => String(t ?? '').trim())
    .filter((t: string) => t && t.length <= 30)
    .slice(0, 10);
  const note = String(body?.note ?? '').trim() || null;
  if (note && note.length > 500) throw httpError(400, 'The note is too long (500 characters max).');
  return { guestName, phone, partySize, date: body.date as string, time: body.time as string, tableId, noteTags, note };
}

// The customer with this phone (Customers list); created when new, so the name fills
// in by itself next time. Phones are compared by their digits only.
async function linkCustomer(tx: any, restaurantId: number, phone: string | null, name: string) {
  const digits = digitsOf(phone);
  if (digits.length < 6) return null;
  const [c] = (await tx.execute(sql`
    SELECT id FROM customers
    WHERE restaurant_id = ${restaurantId} AND regexp_replace(phone, '[^0-9]', '', 'g') = ${digits}
    ORDER BY id LIMIT 1
  `)) as any[];
  if (c) return Number(c.id);
  const [n] = (await tx.execute(sql`
    INSERT INTO customers (restaurant_id, name, phone, notes)
    VALUES (${restaurantId}, ${name}, ${phone}, 'Added from a reservation')
    RETURNING id
  `)) as any[];
  return Number(n.id);
}

export default async function reservationRoutes(fastify: FastifyInstance) {
  // ── one day: bookings + tables (the timeline) ──────────────────────────────────
  fastify.get('/api/reservations', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    try {
      const settings = await reservationSettings(restaurantId);
      const now = await restaurantNow(settings.tz);
      const q = request.query as { date?: string };
      const date = isDate(q.date) ? q.date : now.today;
      const reservations = await selectReservations(
        settings.tz,
        sql`r.restaurant_id = ${restaurantId}
            AND r.starts_at >= (${date}::date::timestamp AT TIME ZONE ${settings.tz})
            AND r.starts_at <  ((${date}::date + 1)::timestamp AT TIME ZONE ${settings.tz})`
      );
      return reply.send({
        date,
        today: now.today,
        nowTime: now.nowTime,
        nowMs: now.nowMs,
        timezone: settings.tz,
        settings: { holdMinutes: settings.holdMinutes, reserveBeforeMinutes: settings.reserveBeforeMinutes },
        tables: await restaurantTablesOf(restaurantId),
        reservations,
      });
    } catch (err) {
      return sendError(reply, err, 'load the reservations');
    }
  });

  // ── one month: bookings and guests per day (the calendar shows them on each day) ──
  // ?month=YYYY-MM → { days: { "2026-11-01": { bookings: 4, guests: 13 }, … } }
  fastify.get('/api/reservations/month', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const month = String((request.query as any)?.month ?? '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return reply.status(400).send({ error: 'Choose a valid month.' });
    try {
      const { tz } = await reservationSettings(restaurantId);
      const first = `${month}-01`;
      const rows = (await db.execute(sql`
        SELECT to_char(starts_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS bookings, SUM(party_size)::int AS guests
        FROM reservations
        WHERE restaurant_id = ${restaurantId} AND status IN ('booked', 'arrived')
          AND starts_at >= (${first}::date::timestamp AT TIME ZONE ${tz})
          AND starts_at <  ((${first}::date + interval '1 month')::timestamp AT TIME ZONE ${tz})
        GROUP BY 1
      `)) as any[];
      const days: Record<string, { bookings: number; guests: number }> = {};
      for (const r of rows) days[r.date] = { bookings: r.bookings, guests: r.guests };
      return reply.send({ month, days });
    } catch (err) {
      return sendError(reply, err, 'load the month');
    }
  });

  // ── free tables per half hour, for a number of people ─────────────────────────
  // ?date=YYYY-MM-DD&people=4[&time=21:30][&excludeId=12 (the booking being changed)]
  fastify.get('/api/reservations/availability', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const q = request.query as { date?: string; people?: string; time?: string; excludeId?: string };
    if (!isDate(q.date)) return reply.status(400).send({ error: 'Choose a valid date.' });
    const people = Math.max(1, Number(q.people) || 1);
    const excludeId = Number(q.excludeId) || 0;
    try {
      const settings = await reservationSettings(restaurantId);
      const holdMs = settings.holdMinutes * 60_000;
      const tables = await restaurantTablesOf(restaurantId);
      // a table with no capacity set accepts any group
      const fits = (t: any) => !t.capacity || Number(t.capacity) >= people;

      // the 48 half hours of the day, as real moments (right also on clock-change days)
      const slots = (await db.execute(sql`
        SELECT to_char(g, 'HH24:MI') AS time, (extract(epoch FROM g AT TIME ZONE ${settings.tz}) * 1000)::float8 AS ms
        FROM generate_series(${q.date}::date::timestamp, ${q.date}::date::timestamp + interval '23 hours 30 minutes', interval '30 minutes') g
      `)) as any[];
      // active bookings with a table, from that day (and the night after)
      const busy = (await db.execute(sql`
        SELECT table_id::int AS "tableId", (extract(epoch FROM starts_at) * 1000)::float8 AS s, (extract(epoch FROM ends_at) * 1000)::float8 AS e
        FROM reservations
        WHERE restaurant_id = ${restaurantId} AND table_id IS NOT NULL AND status IN ('booked', 'arrived') AND id <> ${excludeId}
          AND ends_at > (${q.date}::date::timestamp AT TIME ZONE ${settings.tz})
          AND starts_at < ((${q.date}::date + 2)::timestamp AT TIME ZONE ${settings.tz})
      `)) as any[];
      const isFree = (tableId: number, start: number) =>
        !busy.some((b) => b.tableId === tableId && b.s < start + holdMs && b.e > start);
      const now = Date.now();

      const result: any = {
        holdMinutes: settings.holdMinutes,
        slots: slots.map((s) => ({
          time: s.time,
          past: s.ms < now,
          free: tables.filter((t) => fits(t) && isFree(t.id, s.ms)).length,
        })),
      };

      // the tables for one chosen time: free or not, big enough or not, the best fit
      if (isTime(q.time)) {
        const { startsAt } = await bookingRange(q.date, q.time, settings.tz, settings.holdMinutes);
        const start = Date.parse(startsAt);
        const list = tables.map((t) => ({ id: t.id, label: t.label, capacity: t.capacity, zone: t.zone, free: isFree(t.id, start), fits: fits(t) }));
        // best fit = the smallest free table that is big enough (no capacity set → last)
        const best = list
          .filter((t) => t.free && t.fits)
          .sort((a, b) => (Number(a.capacity) || 999) - (Number(b.capacity) || 999))[0];
        result.tables = list.map((t) => ({ ...t, best: best?.id === t.id }));
      }
      return reply.send(result);
    } catch (err) {
      return sendError(reply, err, 'check the free tables');
    }
  });

  // ── known customer? (the New booking window, after typing the phone) ──────────
  fastify.get('/api/reservations/lookup', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const digits = digitsOf((request.query as any)?.phone);
    if (digits.length < 6) return reply.send({ found: false });
    try {
      const { tz } = await reservationSettings(restaurantId);
      const [c] = (await db.execute(sql`
        SELECT id, name FROM customers
        WHERE restaurant_id = ${restaurantId} AND regexp_replace(phone, '[^0-9]', '', 'g') = ${digits}
        ORDER BY id LIMIT 1
      `)) as any[];
      const [v] = (await db.execute(sql`
        SELECT COUNT(*) FILTER (WHERE status = 'arrived')::int AS visits,
               COUNT(*) FILTER (WHERE status = 'no_show')::int AS "noShows",
               to_char(MAX(starts_at) FILTER (WHERE status = 'arrived') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS "lastVisit",
               (array_agg(guest_name ORDER BY starts_at DESC))[1] AS "lastName"
        FROM reservations
        WHERE restaurant_id = ${restaurantId} AND regexp_replace(phone, '[^0-9]', '', 'g') = ${digits}
      `)) as any[];
      const name = c?.name || v?.lastName || null;
      if (!name) return reply.send({ found: false });
      return reply.send({
        found: true,
        customerId: c ? Number(c.id) : null,
        name,
        visits: v?.visits ?? 0,
        noShows: v?.noShows ?? 0,
        lastVisit: v?.lastVisit ?? null,
      });
    } catch (err) {
      return sendError(reply, err, 'look up the customer');
    }
  });

  // ── find a booking by name or phone, any day (closest to today first) ─────────
  fastify.get('/api/reservations/search', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const text = String((request.query as any)?.q ?? '').trim();
    if (text.length < 2) return reply.send({ reservations: [] });
    try {
      const { tz } = await reservationSettings(restaurantId);
      const digits = digitsOf(text);
      const reservations = await selectReservations(
        tz,
        sql`r.restaurant_id = ${restaurantId}
            AND (r.guest_name ILIKE ${'%' + text + '%'}
                 OR (${digits.length >= 3} AND regexp_replace(r.phone, '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'}))`,
        sql`abs(extract(epoch FROM r.starts_at - now())), r.id`,
        20
      );
      return reply.send({ reservations });
    } catch (err) {
      return sendError(reply, err, 'search the reservations');
    }
  });

  // ── the 2 settings (hold time, "Reserved" minutes before) — managers ───────────
  // (the role check is in lib/roles.ts: PUT /api/reservations/settings = manager)
  fastify.put('/api/reservations/settings', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const body = (request.body || {}) as { holdMinutes?: unknown; reserveBeforeMinutes?: unknown };
    const hold = Number(body.holdMinutes);
    const before = Number(body.reserveBeforeMinutes);
    if (!Number.isInteger(hold) || hold < 15 || hold > 480) return reply.status(400).send({ error: 'Hold time: 15 to 480 minutes.' });
    if (!Number.isInteger(before) || before < 0 || before > 240) return reply.status(400).send({ error: '"Reserved" before: 0 to 240 minutes.' });
    try {
      await db.execute(sql`
        UPDATE restaurants SET reservation_hold_minutes = ${hold}, reservation_reserve_before_minutes = ${before}, updated_at = now()
        WHERE id = ${restaurantId}
      `);
      announce(restaurantId);
      return reply.send({ ok: true, holdMinutes: hold, reserveBeforeMinutes: before });
    } catch (err) {
      return sendError(reply, err, 'save the settings');
    }
  });

  // ── new booking ────────────────────────────────────────────────────────────────
  fastify.post('/api/reservations', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    try {
      const f = readForm(request.body);
      const settings = await reservationSettings(restaurantId);
      const { startsAt, endsAt } = await bookingRange(f.date, f.time, settings.tz, settings.holdMinutes);
      const id = await db.transaction(async (tx) => {
        if (f.tableId) await assertTableFree(tx, restaurantId, f.tableId, startsAt, endsAt, settings.tz, null);
        const customerId = await linkCustomer(tx, restaurantId, f.phone, f.guestName);
        const [row] = (await tx.execute(sql`
          INSERT INTO reservations (restaurant_id, customer_id, guest_name, phone, party_size, starts_at, ends_at,
                                    table_id, note_tags, note, created_by)
          VALUES (${restaurantId}, ${customerId}, ${f.guestName}, ${f.phone}, ${f.partySize}, ${startsAt}::timestamptz, ${endsAt}::timestamptz,
                  ${f.tableId}, ${tagsSql(f.noteTags)}, ${f.note}, ${Number(request.user?.id) || null})
          RETURNING id
        `)) as any[];
        return Number(row.id);
      });
      announce(restaurantId);
      const [saved] = await selectReservations(settings.tz, sql`r.id = ${id}`);
      return reply.status(201).send({ reservation: saved });
    } catch (err) {
      return sendError(reply, err, 'save the booking');
    }
  });

  // ── change a booking (still booked or seated) ──────────────────────────────────
  fastify.put('/api/reservations/:id', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) return reply.status(400).send({ error: 'Invalid booking.' });
    try {
      const f = readForm(request.body);
      const settings = await reservationSettings(restaurantId);
      await db.transaction(async (tx) => {
        const [old] = (await tx.execute(sql`
          SELECT status, (extract(epoch FROM ends_at - starts_at) / 60)::int AS minutes
          FROM reservations WHERE id = ${id} AND restaurant_id = ${restaurantId} FOR UPDATE
        `)) as any[];
        if (!old) throw httpError(404, 'Booking not found.');
        if (!['booked', 'arrived'].includes(old.status)) throw httpError(409, 'A cancelled or no-show booking cannot be changed. Put it back to "booked" first.');
        // the booking keeps its length (the hold time it was made with)
        const { startsAt, endsAt } = await bookingRange(f.date, f.time, settings.tz, Number(old.minutes) || settings.holdMinutes);
        if (f.tableId) await assertTableFree(tx, restaurantId, f.tableId, startsAt, endsAt, settings.tz, id);
        const customerId = await linkCustomer(tx, restaurantId, f.phone, f.guestName);
        await tx.execute(sql`
          UPDATE reservations
          SET guest_name = ${f.guestName}, phone = ${f.phone}, customer_id = ${customerId}, party_size = ${f.partySize},
              starts_at = ${startsAt}::timestamptz, ends_at = ${endsAt}::timestamptz, table_id = ${f.tableId},
              note_tags = ${tagsSql(f.noteTags)}, note = ${f.note}, updated_at = now()
          WHERE id = ${id} AND restaurant_id = ${restaurantId}
        `);
      });
      announce(restaurantId);
      const [saved] = await selectReservations(settings.tz, sql`r.id = ${id}`);
      return reply.send({ reservation: saved });
    } catch (err) {
      return sendError(reply, err, 'change the booking');
    }
  });

  // ── Seat / No-show / Cancel / back to booked ──────────────────────────────────
  // body: { status: 'arrived' | 'no_show' | 'cancelled' | 'booked', tableId? }
  // Seat (arrived) needs a table: the booking's, or the one chosen now.
  fastify.post('/api/reservations/:id/status', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const id = Number((request.params as any).id);
    const body = (request.body || {}) as { status?: string; tableId?: unknown };
    const status = body.status as Status;
    if (!Number.isInteger(id) || id <= 0) return reply.status(400).send({ error: 'Invalid booking.' });
    if (!STATUSES.includes(status)) return reply.status(400).send({ error: 'Unknown status.' });
    try {
      const { tz } = await reservationSettings(restaurantId);
      await db.transaction(async (tx) => {
        const [old] = (await tx.execute(sql`
          SELECT status, table_id AS "tableId", starts_at AS s, ends_at AS e
          FROM reservations WHERE id = ${id} AND restaurant_id = ${restaurantId} FOR UPDATE
        `)) as any[];
        if (!old) throw httpError(404, 'Booking not found.');
        if (old.status === status) return; // already done (double click)
        if (!ALLOWED_FROM[status].includes(old.status)) {
          const say: Record<Status, string> = { booked: 'booked', arrived: 'seated', no_show: 'a no-show', cancelled: 'cancelled' };
          throw httpError(409, `This booking is ${say[old.status as Status]}: it cannot become ${say[status]}.`);
        }

        let tableId = old.tableId == null ? null : Number(old.tableId);
        if (body.tableId != null && body.tableId !== '') {
          tableId = Number(body.tableId);
          if (!Number.isInteger(tableId) || tableId <= 0) throw httpError(400, 'Invalid table.');
        }
        if (status === 'arrived' && !tableId) throw httpError(400, 'Choose a table to seat the guest.');
        // booked / arrived hold the table again: it must be free
        if ((status === 'arrived' || status === 'booked') && tableId) {
          await assertTableFree(tx, restaurantId, tableId, new Date(old.s).toISOString(), new Date(old.e).toISOString(), tz, id);
        }
        await tx.execute(sql`
          UPDATE reservations
          SET status = ${status}, table_id = ${tableId},
              status_at = ${status === 'booked' ? null : sql`now()`},
              order_id = ${status === 'arrived' ? sql`order_id` : null},
              updated_at = now()
          WHERE id = ${id} AND restaurant_id = ${restaurantId}
        `);
      });
      announce(restaurantId);
      const [saved] = await selectReservations(tz, sql`r.id = ${id}`);
      return reply.send({ reservation: saved });
    } catch (err) {
      return sendError(reply, err, 'change the booking status');
    }
  });
}
