// src/lib/reservations.ts
//
// Reservations (agreed with the user 2026-10-31, see sql/2026-10-31_reservations.sql).
// Shared helpers for the Reservations screen (routes/reservations.ts) and the table
// lists (routes/tables.ts, the POS table picker):
//   - a booking HOLDS its table from starts_at to ends_at (start + hold time, 1 hour)
//   - a table shows "Reserved" from (start − reserve-before, 15 min) until the guest is
//     seated, the booking is cancelled / no-show, or its hour is over
//   - "late" = still "booked" after its start time; the staff decide the no-show

import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

// A time zone that PostgreSQL and JavaScript both understand (bad value → UTC).
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

// The restaurant's time zone and its 2 reservation settings.
export async function reservationSettings(restaurantId: number) {
  const [r] = (await db.execute(sql`
    SELECT timezone, reservation_hold_minutes AS "holdMinutes",
           reservation_reserve_before_minutes AS "reserveBeforeMinutes"
    FROM restaurants WHERE id = ${restaurantId}
  `)) as any[];
  return {
    tz: safeTimeZone(r?.timezone),
    holdMinutes: Number(r?.holdMinutes ?? 60),
    reserveBeforeMinutes: Number(r?.reserveBeforeMinutes ?? 15),
  };
}

export interface TableBooking {
  id: number;
  guestName: string;
  partySize: number;
  time: string; // "21:30", restaurant time
  reservedNow: boolean; // inside the "Reserved" window (15 min before → end)
  lateMinutes: number; // > 0 when the guest is late
}

// For each table: its NEXT active booking (still "booked", not over yet, within the
// next 18 hours). Used to show "🕘 21:30 Nicolas ×4" on the table cards and to turn a
// table "Reserved" 15 min before. Never throws: the table lists must always work.
export async function nextBookingPerTable(restaurantId: number): Promise<Map<number, TableBooking>> {
  const map = new Map<number, TableBooking>();
  try {
    const { tz, reserveBeforeMinutes } = await reservationSettings(restaurantId);
    const rows = (await db.execute(sql`
      SELECT DISTINCT ON (r.table_id)
             r.table_id AS "tableId", r.id, r.guest_name AS "guestName", r.party_size AS "partySize",
             to_char(r.starts_at AT TIME ZONE ${tz}, 'HH24:MI') AS time,
             (now() >= r.starts_at - make_interval(mins => ${reserveBeforeMinutes})) AS "reservedNow",
             GREATEST(0, floor(extract(epoch FROM now() - r.starts_at) / 60))::int AS "lateMinutes"
      FROM reservations r
      WHERE r.restaurant_id = ${restaurantId} AND r.table_id IS NOT NULL AND r.status = 'booked'
        AND r.ends_at > now() AND r.starts_at < now() + interval '18 hours'
      ORDER BY r.table_id, r.starts_at
    `)) as any[];
    for (const r of rows) {
      map.set(Number(r.tableId), {
        id: r.id,
        guestName: r.guestName,
        partySize: r.partySize,
        time: r.time,
        reservedNow: Boolean(r.reservedNow),
        lateMinutes: Number(r.lateMinutes) || 0,
      });
    }
  } catch (err) {
    console.error('reservations: next booking per table failed', err);
  }
  return map;
}
