// src/lib/chatBooking.ts
//
// Chat orders (v2) — TABLE BOOKINGS in the chat (2026-11-01).
// The AI only collects date, time and number of people; RES decides whether it is
// possible, with the same rules as the Reservations screen:
//   - inside the restaurant's opening hours (restaurants.opening_hours), not in the past
//   - a free table that fits: the smallest one (the "best" table of the booking window),
//     free during the hold time (1 hour by default)
// If not possible, RES tells the AI the nearest free times to offer the customer.

import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { reservationSettings } from './reservations.js';

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type OpeningHours = Partial<Record<Weekday, [string, string] | null>> | null;

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const weekdayOf = (date: string) => WEEKDAYS[new Date(date + 'T12:00:00Z').getUTCDay()];

// Opening hours as saved, checked (anything wrong → treated as "not set").
export function readOpeningHours(v: unknown): OpeningHours {
  if (!v || typeof v !== 'object') return null;
  const out: Partial<Record<Weekday, [string, string] | null>> = {};
  for (const d of WEEKDAYS) {
    const r = (v as any)[d];
    out[d] = Array.isArray(r) && isTime(r[0]) && isTime(r[1]) ? [r[0], r[1]] : null;
  }
  return out;
}

// Is a booking that STARTS at `time` inside the hours of that day?
// The last booking can start 30 minutes before closing; after-midnight closing works.
function insideHours(hours: OpeningHours, date: string, time: string): boolean {
  if (!hours) return true; // not set yet: any time
  const range = hours[weekdayOf(date)];
  if (!range) return false; // closed that day
  const [open, close] = range.map(minutes);
  const t = minutes(time);
  if (close > open) return t >= open && t <= close - 30;
  return t >= open || t <= close - 30; // closes after midnight
}

export function hoursText(hours: OpeningHours): string {
  if (!hours) return 'Opening hours: not set (any time is fine).';
  const names: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const order: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return 'Opening hours: ' + order.map((d) => `${names[d]} ${hours[d] ? `${hours[d]![0]}–${hours[d]![1]}` : 'closed'}`).join(', ') + '.';
}

export interface BookingContext {
  tz: string;
  holdMinutes: number;
  hours: OpeningHours;
  today: string; // restaurant date, YYYY-MM-DD
  nowTime: string; // restaurant time, HH:MM
  weekday: string; // e.g. "Sunday"
}

export async function bookingContext(restaurantId: number): Promise<BookingContext> {
  const settings = await reservationSettings(restaurantId);
  const [r] = (await db.execute(sql`
    SELECT opening_hours,
           to_char(now() AT TIME ZONE ${settings.tz}, 'YYYY-MM-DD') AS today,
           to_char(now() AT TIME ZONE ${settings.tz}, 'HH24:MI') AS "nowTime",
           trim(to_char(now() AT TIME ZONE ${settings.tz}, 'Day')) AS weekday
    FROM restaurants WHERE id = ${restaurantId}
  `)) as any[];
  return {
    tz: settings.tz,
    holdMinutes: settings.holdMinutes,
    hours: readOpeningHours(r?.opening_hours),
    today: r.today,
    nowTime: r.nowTime,
    weekday: r.weekday,
  };
}

export interface BookingDraft {
  date: string | null;
  time: string | null;
  people: number | null;
  note: string | null;
}

export interface BookingCard {
  date: string | null;
  time: string | null;
  people: number | null;
  note: string | null;
  tableId: number | null;
  tableLabel: string | null;
  ok: boolean; // date, time and people known, inside the hours, a free table found
  problems: string[]; // for the AI (what to ask, which times to offer)
}

// The best free table (smallest that fits) for a booking starting at date + time.
async function bestTable(restaurantId: number, ctx: BookingContext, date: string, time: string, people: number) {
  const rows = (await db.execute(sql`
    WITH start AS (SELECT ((${date}::date + ${time}::time) AT TIME ZONE ${ctx.tz}) AS s)
    SELECT t.id::int AS id, t.label
    FROM restaurant_tables t, start
    WHERE t.restaurant_id = ${restaurantId}
      AND (t.capacity IS NULL OR t.capacity = 0 OR t.capacity >= ${people})
      AND NOT EXISTS (
        SELECT 1 FROM reservations r
        WHERE r.restaurant_id = ${restaurantId} AND r.table_id = t.id AND r.status IN ('booked', 'arrived')
          AND tstzrange(r.starts_at, r.ends_at) && tstzrange(start.s, start.s + make_interval(mins => ${ctx.holdMinutes}))
      )
    ORDER BY COALESCE(NULLIF(t.capacity, 0), 999), t.label
    LIMIT 1
  `)) as any[];
  return rows[0] ? { id: Number(rows[0].id), label: String(rows[0].label) } : null;
}

// Is the time still to come (restaurant clock)?
const notPast = (ctx: BookingContext, date: string, time: string) => date > ctx.today || (date === ctx.today && time > ctx.nowTime);

export async function checkBooking(restaurantId: number, ctx: BookingContext, d: BookingDraft): Promise<BookingCard> {
  const card: BookingCard = {
    date: isDate(d.date) ? d.date : null,
    time: isTime(d.time) ? d.time : null,
    people: Number.isInteger(d.people) && Number(d.people) >= 1 && Number(d.people) <= 200 ? Number(d.people) : null,
    note: d.note ? String(d.note).slice(0, 200) : null,
    tableId: null,
    tableLabel: null,
    ok: false,
    problems: [],
  };
  if (!card.date || !card.time || !card.people) return card; // still collecting: the AI asks

  const { date, time, people } = card;
  const maxDate = new Date(Date.parse(ctx.today + 'T12:00:00Z') + 60 * 86400000).toISOString().slice(0, 10);
  if (!notPast(ctx, date, time)) {
    card.problems.push(`${date} ${time} is in the past — ask for another time.`);
    return card;
  }
  if (date > maxDate) {
    card.problems.push('Bookings are possible up to 60 days ahead only.');
    return card;
  }
  if (!insideHours(ctx.hours, date, time)) {
    const range = ctx.hours?.[weekdayOf(date)];
    card.problems.push(
      range ? `${time} is outside the opening hours of that day (${range[0]}–${range[1]}, last booking 30 min before closing).` : `The restaurant is closed on ${date}.`
    );
    return card;
  }

  const table = await bestTable(restaurantId, ctx, date, time, people);
  if (table) {
    card.tableId = table.id;
    card.tableLabel = table.label;
    card.ok = true;
    return card;
  }

  // no table: the nearest free half hours of that day (inside the hours, still to come)
  const offers: string[] = [];
  const base = minutes(time);
  for (let step = 1; step <= 12 && offers.length < 4; step++) {
    for (const m of [base - step * 30, base + step * 30]) {
      if (m < 0 || m >= 24 * 60 || offers.length >= 4) continue;
      const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      if (!notPast(ctx, date, t) || !insideHours(ctx.hours, date, t)) continue;
      if (await bestTable(restaurantId, ctx, date, t, people)) offers.push(t);
    }
  }
  offers.sort();
  card.problems.push(
    `No free table for ${people} on ${date} at ${time}.` + (offers.length ? ` Free times that day: ${offers.join(', ')} — offer them as buttons.` : ' No free time that day — suggest another day.')
  );
  return card;
}
