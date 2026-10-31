// client/src/pages/Reservations.tsx
//
// RESERVATIONS screen (agreed with the user 2026-10-31, mockup approved).
//   - one-line header: day picker, Timeline / List, search, counters, + New booking
//   - Timeline: one row per table, the hours across; a booking = a bar of its hold time
//     (1 hour). Click an empty spot = new booking there. Drag a gold bar = move it.
//   - Next arrivals (right): Seat / Call / No-show. "Seat" opens the POS on the table.
//   - New / change booking window: phone first (a known customer fills the name), time
//     chips with the number of free tables, the table (optional, ★ best fit), note chips.
// All times are the RESTAURANT's time (the server sends them ready). Nothing is
// automatic: "late" is only shown, the staff decide the no-show. Not part of offline mode.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, LayoutList, Pencil, Phone, Plus, Search, Settings2, Undo2, X, GanttChart } from 'lucide-react';
import { api, wsUrl } from '../api';
import { toast } from '../components/Toaster';
import { askConfirm } from '../components/ConfirmHost';
import { hasRole } from '../lib/session';

// ── types (as the server sends them, src/routes/reservations.ts) ─────────────────
type Status = 'booked' | 'arrived' | 'no_show' | 'cancelled';
export interface Reservation {
  id: number;
  guestName: string;
  phone: string | null;
  partySize: number;
  date: string; // YYYY-MM-DD (restaurant time)
  time: string; // HH:MM
  endTime: string;
  durationMinutes: number;
  startMs: number;
  endMs: number;
  tableId: number | null;
  tableLabel: string | null;
  tableCapacity: number | null;
  noteTags: string[];
  note: string | null;
  status: Status;
  orderId: number | null;
  customerId: number | null;
  pastVisits: number;
}
interface DayTable { id: number; label: string; capacity: number | null; zone: string | null; status: string }
interface DayData {
  date: string;
  today: string;
  nowTime: string;
  nowMs: number;
  settings: { holdMinutes: number; reserveBeforeMinutes: number };
  tables: DayTable[];
  reservations: Reservation[];
}
interface Slot { time: string; past: boolean; free: number }
interface AvTable { id: number; label: string; capacity: number | null; zone: string | null; free: boolean; fits: boolean; best: boolean }

// What "Seat" hands to the POS: open a dine-in order on this table.
export interface SeatRequest { reservationId: number; tableId: number; tableLabel: string; guestName: string; partySize: number }

// ── small helpers ─────────────────────────────────────────────────────────────
const NOTE_CHIPS = ['🎂 Birthday', 'Window', 'Terrace', '👶 Baby chair', '♿ Access', '⭐ VIP'];
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const dayLabel = (date: string) =>
  new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const errText = (err: any, fallback: string) => err?.response?.data?.error || err?.response?.data?.message || fallback;
const lateMinutes = (r: Reservation, day: DayData | null) =>
  day && r.status === 'booked' && day.date === day.today ? Math.max(0, Math.floor((day.nowMs - r.startMs) / 60000)) : 0;

// colours of the mockup (green #131c18 / gold #c9a24b)
const C = {
  bg: 'bg-[#0e1512]',
  panel: 'bg-[#131c18] border border-[#24332c]',
  panel2: 'bg-[#18241f] border border-[#24332c]',
  btn: 'rounded-md border border-[#24332c] bg-[#18241f] px-2.5 py-1 text-xs text-[#e8efe9] hover:border-[#c9a24b]/60 disabled:opacity-40',
  btnOn: 'rounded-md border border-[#c9a24b] bg-[#18241f] px-2.5 py-1 text-xs text-[#c9a24b]',
  gold: 'rounded-md border border-[#c9a24b] bg-[#c9a24b] px-3 py-1 text-xs font-semibold text-[#1a140a] hover:bg-[#e2c57a] disabled:opacity-50',
  seat: 'rounded-md border border-[#3fb27f] bg-[#3fb27f] px-2.5 py-1 text-xs font-semibold text-[#06140d] hover:brightness-110',
  input: 'w-full rounded-md border border-[#24332c] bg-[#18241f] px-2.5 py-1.5 text-sm text-[#e8efe9] outline-none placeholder:text-[#5f736a] focus:border-[#c9a24b]',
  label: 'mb-1 block text-[10.5px] uppercase tracking-wider text-[#8fa39a]',
};
const BAR: Record<string, string> = {
  booked: 'border border-[#c9a24b] bg-[#c9a24b]/15 text-[#e2c57a]',
  late: 'border border-[#e08a3c] bg-[#e08a3c]/20 text-[#ffd3ad]',
  arrived: 'border border-[#3fb27f] bg-[#3fb27f]/20 text-[#bfeedb]',
  no_show: 'border border-dashed border-[#556b61] bg-[#1b2420] text-[#6f8379] line-through',
};

// ═════════════════════════════════════════════════════════════════════════════
export default function Reservations({ onSeat }: { onSeat?: (s: SeatRequest) => void }) {
  const [date, setDate] = useState<string | null>(null); // null = today (the server's)
  const [day, setDay] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'timeline' | 'list'>('timeline');
  const [form, setForm] = useState<FormState | null>(null); // the booking window
  const [seatFor, setSeatFor] = useState<Reservation | null>(null); // "pick a table to seat"
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/reservations', { params: date ? { date } : {} });
      setDay(res.data);
    } catch (err) {
      toast.error(errText(err, 'Could not load the reservations.'));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Live: another screen booked / seated → reload. And every 30 s for the "now" line
  // and the "late" badges.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const connect = () => {
      socket = new WebSocket(wsUrl(`/ws?token=${encodeURIComponent(localStorage.getItem('token') || '')}`));
      socket.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data)?.event;
          if (ev === 'RESERVATIONS_UPDATED' || ev === 'ORDER_UPDATED') loadRef.current();
        } catch { /* ignore */ }
      };
      socket.onclose = () => {
        if (!closed) retry = setTimeout(connect, 5000);
      };
    };
    connect();
    const tick = setInterval(() => loadRef.current(), 30_000);
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      clearInterval(tick);
      socket?.close();
    };
  }, []);

  const shownDate = day?.date ?? date ?? '';
  const isToday = !!day && day.date === day.today;
  const active = (day?.reservations ?? []).filter((r) => r.status !== 'cancelled');
  const stats = {
    bookings: active.filter((r) => r.status !== 'no_show').length,
    guests: active.filter((r) => r.status !== 'no_show').reduce((s, r) => s + r.partySize, 0),
    arrived: active.filter((r) => r.status === 'arrived').length,
    late: active.filter((r) => lateMinutes(r, day) > 0).length,
  };

  // ── actions ─────────────────────────────────────────────────────────────────
  const setStatus = async (r: Reservation, status: Status, tableId?: number) => {
    try {
      const res = await api.post(`/reservations/${r.id}/status`, { status, ...(tableId ? { tableId } : {}) });
      await load();
      return res.data.reservation as Reservation;
    } catch (err) {
      toast.error(errText(err, 'Could not change the booking.'));
      return null;
    }
  };

  // Seat: the table must not have an open order; no table yet → choose one first.
  const seat = async (r: Reservation, tableId?: number) => {
    const tid = tableId ?? r.tableId;
    if (!tid) return setSeatFor(r);
    const t = day?.tables.find((x) => x.id === tid);
    if (t?.status === 'occupied') {
      toast.error(`Table ${t.label} still has an open order. Choose another table.`);
      return setSeatFor(r);
    }
    const saved = await setStatus(r, 'arrived', tid);
    if (!saved) return;
    setSeatFor(null);
    setForm(null);
    // the POS opens and says it itself; without a POS hand-over, say it here
    if (!onSeat) toast.success(`${r.guestName} seated at ${saved.tableLabel}`);
    if (onSeat && saved.tableId) {
      onSeat({ reservationId: saved.id, tableId: saved.tableId, tableLabel: saved.tableLabel || '', guestName: saved.guestName, partySize: saved.partySize });
    }
  };

  const noShow = async (r: Reservation) => {
    if (!(await askConfirm({ title: 'No-show', message: `Mark ${r.guestName} (${r.time}, ×${r.partySize}) as no-show? The table is free again.`, confirmLabel: 'No-show' }))) return;
    if (await setStatus(r, 'no_show')) {
      setForm(null);
      toast.success('Marked as no-show');
    }
  };
  const cancel = async (r: Reservation) => {
    if (!(await askConfirm({ title: 'Cancel booking', message: `Cancel the booking of ${r.guestName} (${r.time}, ×${r.partySize})?`, confirmLabel: 'Cancel booking' }))) return;
    if (await setStatus(r, 'cancelled')) {
      setForm(null);
      toast.success('Booking cancelled');
    }
  };
  const restore = async (r: Reservation) => {
    if (await setStatus(r, 'booked')) {
      setForm(null);
      toast.success('Booking restored');
    }
  };

  // drag a bar to another table / time (booked only)
  const move = async (r: Reservation, tableId: number | null, startMin: number) => {
    const time = hhmm(Math.round(startMin / 15) * 15);
    if (time === r.time && tableId === r.tableId) return;
    try {
      await api.put(`/reservations/${r.id}`, {
        guestName: r.guestName, phone: r.phone, partySize: r.partySize, date: r.date, time, tableId, noteTags: r.noteTags, note: r.note,
      });
      toast.success(`${r.guestName} → ${time}${tableId ? ' · ' + (day?.tables.find((t) => t.id === tableId)?.label ?? '') : ' · no table'}`);
      load();
    } catch (err) {
      toast.error(errText(err, 'Could not move the booking.'));
      load();
    }
  };

  const openNew = (preset?: Partial<FormState>) =>
    setForm({ ...emptyForm(shownDate || day?.today || ''), ...preset });
  const openEdit = (r: Reservation) =>
    setForm({ id: r.id, status: r.status, guestName: r.guestName, phone: r.phone || '', partySize: r.partySize, date: r.date, time: r.time, tableId: r.tableId, noteTags: r.noteTags, note: r.note || '', original: r });

  return (
    <div className={`${C.bg} min-h-full p-3 text-[13px] text-[#e8efe9]`}>
      {/* one-line header */}
      <div className={`${C.panel} flex flex-wrap items-center gap-2 rounded-lg px-3 py-2`}>
        <h1 className="mr-1 flex items-center gap-1.5 text-base font-semibold">
          <CalendarClock className="h-4 w-4 text-[#c9a24b]" /> Reservations
        </h1>
        <div className="flex items-center gap-1">
          <button className={C.btn} onClick={() => day && setDate(addDays(day.date, -1))} title="Previous day"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <button className={isToday ? C.btnOn : C.btn} onClick={() => setDate(null)} title="Back to today">
            {isToday ? 'Today · ' : ''}{shownDate ? dayLabel(shownDate) : '…'}
          </button>
          <button className={C.btn} onClick={() => day && setDate(addDays(day.date, 1))} title="Next day"><ChevronRight className="h-3.5 w-3.5" /></button>
          {/* any day: our own calendar, with the bookings of each day */}
          {day && (
            <DayCalendar value={shownDate} today={day.today} onChange={(d) => setDate(d)} className={C.btn} title="Choose a day">
              <CalendarDays className="h-3.5 w-3.5" />
            </DayCalendar>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button className={view === 'timeline' ? C.btnOn : C.btn} onClick={() => setView('timeline')}><GanttChart className="mr-1 inline h-3.5 w-3.5" />Timeline</button>
          <button className={view === 'list' ? C.btnOn : C.btn} onClick={() => setView('list')}><LayoutList className="mr-1 inline h-3.5 w-3.5" />List</button>
        </div>
        <SearchBox onPick={(r) => { setDate(r.date); openEdit(r); }} />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Stat n={stats.bookings} label="bookings" />
          <Stat n={stats.guests} label="guests" />
          <Stat n={stats.arrived} label="arrived" color="text-[#3fb27f]" />
          {isToday && <Stat n={stats.late} label="late" color="text-[#e08a3c]" />}
          {hasRole('manager') && (
            <button className={C.btn} onClick={() => setShowSettings(true)} title="Reservation settings"><Settings2 className="h-3.5 w-3.5" /></button>
          )}
          <button className={C.gold} onClick={() => openNew()}><Plus className="mr-0.5 inline h-3.5 w-3.5" />New booking</button>
        </div>
      </div>

      {loading && !day ? (
        <div className="p-10 text-center text-[#8fa39a]">Loading…</div>
      ) : !day ? null : (
        <div className="mt-2.5 grid items-start gap-2.5 lg:grid-cols-[1fr_290px]">
          {view === 'timeline' ? (
            <Timeline day={day} onEmpty={(tableId, min) => openNew({ tableId, time: hhmm(Math.floor(min / 30) * 30), date: day.date })} onOpen={openEdit} onMove={move} />
          ) : (
            <DayList day={day} onOpen={openEdit} />
          )}
          <Arrivals day={day} isToday={isToday} onOpen={openEdit} onSeat={seat} onNoShow={noShow} onCancel={cancel} />
        </div>
      )}

      {form && day && (
        <BookingModal
          form={form}
          day={day}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }}
          onSeat={seat}
          onNoShow={noShow}
          onCancel={cancel}
          onRestore={restore}
        />
      )}
      {seatFor && day && <SeatPicker r={seatFor} day={day} onClose={() => setSeatFor(null)} onPick={(tid) => seat(seatFor, tid)} />}
      {showSettings && day && <SettingsModal settings={day.settings} onClose={() => setShowSettings(false)} onSaved={() => { setShowSettings(false); load(); }} />}
    </div>
  );
}

function Stat({ n, label, color = 'text-[#e8efe9]' }: { n: number; label: string; color?: string }) {
  return (
    <span className="rounded-md border border-[#24332c] bg-[#18241f] px-2 py-0.5 text-xs text-[#8fa39a]">
      <b className={`mr-1 text-sm ${color}`}>{n}</b>{label}
    </span>
  );
}

// ── search any day by name or phone ─────────────────────────────────────────────
function SearchBox({ onPick }: { onPick: (r: Reservation) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Reservation[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/reservations/search', { params: { q } });
        setResults(res.data.reservations || []);
        setOpen(true);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8fa39a]" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="name or phone…"
        className="w-36 rounded-md border border-[#24332c] bg-[#18241f] py-1 pl-7 pr-2 text-xs text-[#e8efe9] outline-none placeholder:text-[#5f736a] focus:border-[#c9a24b]"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 top-full z-30 mt-1 w-80 overflow-hidden rounded-md border border-[#24332c] bg-[#131c18] shadow-xl">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[#8fa39a]">No booking found.</div>
          ) : (
            results.map((r) => (
              <button key={r.id} onMouseDown={() => { onPick(r); setOpen(false); setQ(''); }} className="flex w-full items-center gap-2 border-b border-[#24332c] px-3 py-1.5 text-left text-xs hover:bg-[#18241f]">
                <span className="w-24 text-[#8fa39a]">{dayLabel(r.date)}</span>
                <b className="w-11 text-[#e2c57a]">{r.time}</b>
                <span className="flex-1 truncate">{r.guestName} ×{r.partySize}</span>
                <span className="text-[#8fa39a]">{r.status === 'booked' ? r.tableLabel ?? '—' : r.status.replace('_', '-')}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── the timeline: tables × hours ────────────────────────────────────────────────
function Timeline({ day, onEmpty, onOpen, onMove }: {
  day: DayData;
  onEmpty: (tableId: number | null, min: number) => void;
  onOpen: (r: Reservation) => void;
  onMove: (r: Reservation, tableId: number | null, startMin: number) => void;
}) {
  const shown = day.reservations.filter((r) => r.status !== 'cancelled');
  // from 10:00 (earlier if a booking starts earlier) to midnight
  const firstHour = Math.min(10, ...shown.map((r) => Math.floor(toMin(r.time) / 60)));
  const hours = 24 - firstHour;
  const span = hours * 60;
  const pct = (min: number) => ((min - firstHour * 60) / span) * 100;
  const isToday = day.date === day.today;
  const nowMin = toMin(day.nowTime);
  const drag = useRef<{ id: number; grabMin: number } | null>(null);
  // the hover card of a bar (follows the mouse)
  const [hover, setHover] = useState<{ r: Reservation; x: number; y: number } | null>(null);

  // Bigger bars (user's remark 2026-10-31): each hour is at least HOUR_PX wide; the
  // timeline scrolls sideways and opens on "now" (today) or on the first booking.
  const HOUR_PX = 92;
  const scroller = useRef<HTMLDivElement>(null);
  const firstStart = shown.length ? Math.min(...shown.map((r) => toMin(r.time))) : 18 * 60;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const focusMin = isToday ? nowMin - 90 : firstStart - 45;
    el.scrollLeft = Math.max(0, ((focusMin - firstHour * 60) / 60) * HOUR_PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.date]);

  const rows: { id: number | null; label: string; sub: string }[] = [
    ...day.tables.map((t) => ({ id: t.id, label: t.label, sub: `${t.capacity ?? '?'} seats${t.zone ? ' · ' + t.zone : ''}` })),
    { id: null, label: 'No table', sub: 'yet' },
  ];
  const minuteAt = (e: React.MouseEvent | React.DragEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return firstHour * 60 + ((e.clientX - box.left) / box.width) * span;
  };

  return (
    <div className={`${C.panel} min-w-0 rounded-lg p-2.5`}>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-[#8fa39a]">
        <div className="flex flex-wrap gap-3">
          <Legend cls="border border-[#c9a24b] bg-[#c9a24b]/40" text="Booked" />
          <Legend cls="bg-[#3fb27f]" text="Arrived" />
          {isToday && <Legend cls="bg-[#e08a3c]" text="Late" />}
          <Legend cls="border border-dashed border-[#556b61]" text="No-show" />
          <span className="text-[#c9a24b]">┆ click an empty spot = new booking · drag a gold bar = move it</span>
        </div>
        <span>{String(firstHour).padStart(2, '0')}:00 → 24:00</span>
      </div>

      <div ref={scroller} className="overflow-x-auto pb-1 [scrollbar-color:#2e4038_transparent]">
      <div style={{ minWidth: 92 + hours * HOUR_PX }}>
        <div className="grid grid-cols-[92px_1fr]">
          <div className="sticky left-0 z-20 bg-[#131c18]" />
          <div className="relative h-5 border-b border-[#24332c] text-[11px] text-[#8fa39a]">
            {Array.from({ length: hours }, (_, i) => (
              <span key={i} className="absolute top-0" style={{ left: `${(i / hours) * 100}%` }}>{firstHour + i}</span>
            ))}
            {isToday && nowMin >= firstHour * 60 && (
              <span className="absolute top-0 z-10 -translate-x-1/2 rounded bg-[#d9534f] px-1 text-[10px] text-white" style={{ left: `${pct(nowMin)}%` }}>{day.nowTime}</span>
            )}
          </div>

          {rows.map((row) => {
            const bars = shown.filter((r) => r.tableId === row.id);
            return (
              <React.Fragment key={row.id ?? 'none'}>
                <div className="sticky left-0 z-20 flex h-14 flex-col justify-center border-b border-r border-[#24332c] bg-[#131c18] pl-0.5">
                  <b className={`text-[14px] ${row.id === null ? 'text-[#c9a24b]' : ''}`}>{row.label}</b>
                  <span className="truncate text-[11px] text-[#8fa39a]">{row.sub}</span>
                </div>
                <div
                  className="relative h-14 cursor-cell border-b border-[#24332c]"
                  style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent calc(${100 / hours}% - 1px), #24332c calc(${100 / hours}% - 1px), #24332c ${100 / hours}%)` }}
                  onClick={(e) => onEmpty(row.id, minuteAt(e))}
                  onDragOver={(e) => drag.current && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const d = drag.current;
                    drag.current = null;
                    const r = d && day.reservations.find((x) => x.id === d.id);
                    if (r && d) onMove(r, row.id, minuteAt(e) - d.grabMin);
                  }}
                >
                  {isToday && nowMin >= firstHour * 60 && (
                    <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-[#d9534f]" style={{ left: `${pct(nowMin)}%` }} />
                  )}
                  {bars.map((r) => {
                    const start = toMin(r.time);
                    const left = pct(start);
                    const width = Math.min((r.durationMinutes / span) * 100, 100 - left);
                    const late = lateMinutes(r, day);
                    const kind = r.status === 'booked' ? (late > 0 ? 'late' : 'booked') : r.status;
                    const canDrag = r.status === 'booked';
                    return (
                      <div
                        key={r.id}
                        draggable={canDrag}
                        onDragStart={(e) => {
                          const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                          const at = firstHour * 60 + ((e.clientX - box.left) / box.width) * span;
                          drag.current = { id: r.id, grabMin: at - start };
                          e.dataTransfer.effectAllowed = 'move';
                          setHover(null);
                        }}
                        onClick={(e) => { e.stopPropagation(); onOpen(r); }}
                        onMouseMove={(e) => setHover({ r, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHover(null)}
                        className={`absolute top-1.5 flex h-11 flex-col justify-center overflow-hidden whitespace-nowrap rounded-lg px-2 shadow-sm transition hover:brightness-125 ${BAR[kind]} ${canDrag ? 'cursor-grab' : 'cursor-pointer'}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <b className="truncate text-[12.5px] leading-4">{r.guestName} ×{r.partySize}{r.noteTags.some((t) => t.includes('🎂')) ? ' 🎂' : ''}</b>
                        <span className="truncate text-[11px] leading-4 opacity-90">{r.time}{late > 0 ? ` · +${late} min` : ''}{r.status === 'arrived' ? ' · seated' : ''}</span>
                      </div>
                    );
                  })}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        {day.tables.length === 0 && (
          <p className="mt-2 text-xs text-[#e08a3c]">No tables yet: add them in Settings → Tables. Bookings can still be made without a table.</p>
        )}
      </div>
      </div>
      <p className="mt-1.5 text-[11px] text-[#8fa39a]">Each bar = {day.settings.holdMinutes} min (the time a booking holds its table).{isToday ? ' The red line is now.' : ''} Scroll sideways for the other hours.</p>
      {hover && <HoverCard r={hover.r} x={hover.x} y={hover.y} late={lateMinutes(hover.r, day)} />}
    </div>
  );
}

// ── the card shown when the mouse is on a booking bar ──────────────────────────
function HoverCard({ r, x, y, late }: { r: Reservation; x: number; y: number; late: number }) {
  const W = 260;
  const left = Math.min(x + 16, window.innerWidth - W - 8);
  const top = Math.min(y + 16, window.innerHeight - 210);
  const pill =
    r.status === 'arrived' ? { t: 'Seated', c: 'bg-[#3fb27f]/20 text-[#7fe0b3] border-[#3fb27f]/60' }
    : r.status === 'no_show' ? { t: 'No-show', c: 'bg-[#556b61]/20 text-[#9fb3a9] border-[#556b61]' }
    : late > 0 ? { t: `Late ${late} min`, c: 'bg-[#e08a3c]/20 text-[#ffc996] border-[#e08a3c]/70' }
    : { t: 'Booked', c: 'bg-[#c9a24b]/15 text-[#e2c57a] border-[#c9a24b]/70' };
  return (
    <div className="pointer-events-none fixed z-[70] overflow-hidden rounded-xl border border-[#c9a24b]/60 bg-[#131c18]/95 shadow-2xl shadow-black/60 backdrop-blur" style={{ left, top, width: W }}>
      <div className="h-1 bg-gradient-to-r from-[#c9a24b] via-[#e2c57a] to-[#c9a24b]" />
      <div className="space-y-1.5 p-3">
        <div className="flex items-center justify-between">
          <span className={`rounded-full border px-2 py-px text-[10.5px] font-semibold ${pill.c}`}>{pill.t}</span>
          <span className="text-[12px] font-semibold text-[#e2c57a]">{r.time} – {r.endTime}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <b className="truncate text-[15px] text-[#e8efe9]">{r.guestName}</b>
          <span className="shrink-0 rounded-md bg-[#22302a] px-1.5 text-[12px] font-semibold text-[#e8efe9]">×{r.partySize}</span>
        </div>
        <div className="space-y-0.5 text-[11.5px] text-[#a9bbb2]">
          <div>🪑 {r.tableLabel ? `${r.tableLabel}${r.tableCapacity ? ` · ${r.tableCapacity} seats` : ''}` : <span className="text-[#c9a24b]">no table yet</span>}</div>
          {r.phone && <div>📞 {r.phone}</div>}
          {r.pastVisits > 0 && <div>⭐ {ordinal(r.pastVisits + 1)} visit</div>}
        </div>
        {r.noteTags.length > 0 && (
          <div className="flex flex-wrap gap-1">{r.noteTags.map((t) => <Tag key={t}>{t}</Tag>)}</div>
        )}
        {r.note && <p className="rounded-md bg-[#18241f] px-2 py-1 text-[11.5px] italic text-[#cfe0d7]">“{r.note}”</p>}
        <p className="border-t border-[#24332c] pt-1.5 text-[10.5px] text-[#8fa39a]">Click to open{r.status === 'booked' ? ' · drag to move' : ''}</p>
      </div>
    </div>
  );
}

// ── our own calendar (dark, gold): one month, the bookings of each day ────────
// The browser's date box looked plain (user's remark 2026-10-31): this one shows a
// small gold number of bookings under each day. Weeks start on Monday.
function DayCalendar({ value, today, min, onChange, className, title, children }: {
  value: string;
  today: string;
  min?: string; // days before are greyed (a new booking cannot be in the past)
  onChange: (date: string) => void;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  const [counts, setCounts] = useState<Record<string, { bookings: number; guests: number }>>({});
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);

  // fixed under the button, so a window with a scroll cannot cut it
  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: Math.min(r.bottom + 6, window.innerHeight - 330), left: Math.max(8, Math.min(r.left, window.innerWidth - 300)) });
    setMonth(value.slice(0, 7));
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    api.get('/reservations/month', { params: { month } }).then((res) => setCounts(res.data.days || {})).catch(() => setCounts({}));
  }, [open, month]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away, true);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away, true);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const cells: (string | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  const shiftMonth = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const pick = (d: string) => {
    onChange(d);
    setOpen(false);
  };
  const monthName = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthTotal = Object.entries(counts).reduce((s, [, c]) => s + c.bookings, 0);

  return (
    <>
      <button ref={btn} type="button" className={className} title={title} onMouseDown={(e) => e.stopPropagation()} onClick={() => (open ? setOpen(false) : show())}>
        {children}
      </button>
      {open && (
        <div ref={box} onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-[80] w-[290px] overflow-hidden rounded-xl border border-[#c9a24b]/70 bg-[#131c18] text-[#e8efe9] shadow-2xl shadow-black/60"
          style={{ top: pos.top, left: pos.left }}>
          <div className="h-1 bg-gradient-to-r from-[#c9a24b] via-[#e2c57a] to-[#c9a24b]" />
          <div className="p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" className="rounded-md p-1 text-[#8fa39a] hover:bg-[#18241f] hover:text-[#e2c57a]" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></button>
              <div className="text-center">
                <div className="text-[14px] font-semibold">{monthName}</div>
                <div className="text-[10.5px] text-[#8fa39a]">{monthTotal ? `${monthTotal} booking${monthTotal > 1 ? 's' : ''} this month` : 'no bookings this month'}</div>
              </div>
              <button type="button" className="rounded-md p-1 text-[#8fa39a] hover:bg-[#18241f] hover:text-[#e2c57a]" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase tracking-wider text-[#5f736a]">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((d, i) => {
                if (!d) return <div key={'x' + i} />;
                const c = counts[d];
                const sel = d === value;
                const isToday = d === today;
                const off = !!min && d < min;
                const weekend = (i % 7) >= 5;
                return (
                  <button key={d} type="button" disabled={off} onClick={() => pick(d)}
                    title={c ? `${c.bookings} booking${c.bookings > 1 ? 's' : ''} · ${c.guests} guests` : undefined}
                    className={`relative flex h-[38px] flex-col items-center justify-center rounded-lg text-[13px] transition
                      ${sel ? 'bg-[#c9a24b] font-bold text-[#1a140a] shadow-md shadow-[#c9a24b]/30'
                        : isToday ? 'font-semibold text-[#e2c57a] ring-1 ring-inset ring-[#c9a24b]'
                        : off ? 'text-[#3d4d46]' : `${weekend ? 'text-[#cfe0d7]' : 'text-[#e8efe9]'} hover:bg-[#18241f]`}`}>
                    <span className="leading-4">{Number(d.slice(8))}</span>
                    {c && !off && (
                      <span className={`mt-0.5 rounded-full px-1 text-[9px] font-bold leading-[12px] ${sel ? 'bg-[#1a140a]/20 text-[#1a140a]' : 'bg-[#c9a24b]/20 text-[#e2c57a]'}`}>{c.bookings}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-1 border-t border-[#24332c] pt-2">
              {[['Today', today], ['Tomorrow', addDays(today, 1)], ['In a week', addDays(today, 7)]].map(([label, d]) => (
                <button key={label} type="button" disabled={!!min && d < min} onClick={() => pick(d)}
                  className="flex-1 rounded-md border border-[#24332c] bg-[#18241f] py-1 text-[11px] hover:border-[#c9a24b]/60 hover:text-[#e2c57a]">{label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const Legend = ({ cls, text }: { cls: string; text: string }) => (
  <span className="flex items-center gap-1"><i className={`inline-block h-2.5 w-2.5 rounded-[3px] ${cls}`} />{text}</span>
);

// ── list view of the day ──────────────────────────────────────────────────────
function DayList({ day, onOpen }: { day: DayData; onOpen: (r: Reservation) => void }) {
  const label: Record<Status, string> = { booked: 'Booked', arrived: 'Seated', no_show: 'No-show', cancelled: 'Cancelled' };
  return (
    <div className={`${C.panel} overflow-x-auto rounded-lg`}>
      {day.reservations.length === 0 ? (
        <div className="p-8 text-center text-[#8fa39a]">No bookings on {dayLabel(day.date)}.</div>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="text-[10.5px] uppercase tracking-wider text-[#8fa39a]">
            <tr className="border-b border-[#24332c]">
              <th className="px-3 py-2">Time</th><th>Guest</th><th>Phone</th><th>People</th><th>Table</th><th>Notes</th><th className="pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {day.reservations.map((r) => {
              const late = lateMinutes(r, day);
              return (
                <tr key={r.id} onClick={() => onOpen(r)} className={`cursor-pointer border-b border-[#24332c] hover:bg-[#18241f] ${r.status === 'cancelled' || r.status === 'no_show' ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-1.5 font-semibold text-[#e2c57a]">{r.time}</td>
                  <td>{r.guestName}</td>
                  <td className="text-[#8fa39a]">{r.phone || '—'}</td>
                  <td>×{r.partySize}</td>
                  <td>{r.tableLabel || <span className="text-[#c9a24b]">no table</span>}</td>
                  <td className="max-w-[220px] truncate text-[#8fa39a]">{[...r.noteTags, r.note].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="pr-3">{late > 0 ? <span className="text-[#e08a3c]">Late {late} min</span> : label[r.status]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── right side: next arrivals (today) / the day's bookings ─────────────────────
function Arrivals({ day, isToday, onOpen, onSeat, onNoShow, onCancel }: {
  day: DayData;
  isToday: boolean;
  onOpen: (r: Reservation) => void;
  onSeat: (r: Reservation) => void;
  onNoShow: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
}) {
  const list = day.reservations
    .filter((r) => r.status === 'booked' && (!isToday || r.endMs > day.nowMs))
    .sort((a, b) => a.startMs - b.startMs);
  return (
    <div className={`${C.panel} rounded-lg p-2.5`}>
      <h3 className="mb-2 flex justify-between text-[13px] font-semibold">
        {isToday ? 'Next arrivals' : 'Bookings'} <span className="font-normal text-[#8fa39a]">{isToday ? 'today' : dayLabel(day.date)}</span>
      </h3>
      {list.length === 0 && <p className="py-4 text-center text-xs text-[#8fa39a]">Nobody expected{isToday ? ' anymore today' : ''}.</p>}
      <div className="max-h-[calc(100vh-190px)] space-y-1.5 overflow-y-auto">
        {list.map((r) => {
          const late = lateMinutes(r, day);
          return (
            <div key={r.id} className={`rounded-lg border bg-[#18241f] p-2 ${late > 0 ? 'border-[#e08a3c]' : 'border-[#24332c]'}`}>
              <div className="flex items-center gap-2">
                <div className={`min-w-[44px] text-[15px] font-bold ${late > 0 ? 'text-[#e08a3c]' : 'text-[#e2c57a]'}`}>{r.time}</div>
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onOpen(r)}>
                  <b className="block truncate">{r.guestName}</b>
                  <span className="text-[11.5px] text-[#8fa39a]">
                    {r.phone ? `📞 ${r.phone} · ` : ''}{r.tableLabel ?? <span className="text-[#c9a24b]">no table</span>}
                  </span>
                </div>
                <div className="rounded-md border border-[#24332c] bg-[#131c18] px-1.5 py-0.5 font-semibold">×{r.partySize}</div>
              </div>
              {(late > 0 || r.pastVisits > 0 || r.noteTags.length > 0 || r.note) && (
                <div className="mb-1.5 mt-1.5 flex flex-wrap gap-1">
                  {late > 0 && <Tag late>⏰ Late {late} min</Tag>}
                  {r.pastVisits > 0 && <Tag>⭐ {ordinal(r.pastVisits + 1)} visit</Tag>}
                  {r.noteTags.map((t) => <Tag key={t}>{t}</Tag>)}
                  {r.note && <Tag>{r.note}</Tag>}
                </div>
              )}
              <div className="mt-1.5 flex gap-1">
                {isToday && <button className={C.seat} onClick={() => onSeat(r)}>Seat</button>}
                {r.phone && <a className={C.btn} href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} title="Call"><Phone className="inline h-3 w-3" /></a>}
                {isToday && late > 0 && <button className={C.btn} onClick={() => onNoShow(r)}>No-show</button>}
                <button className={C.btn} onClick={() => onOpen(r)} title="Change"><Pencil className="inline h-3 w-3" /></button>
                <button className={C.btn} onClick={() => onCancel(r)} title="Cancel the booking"><X className="inline h-3 w-3" /></button>
              </div>
            </div>
          );
        })}
      </div>
      {isToday && <p className="mt-2 text-[11px] text-[#8fa39a]">"Seat" → the POS opens an order on the table.</p>}
    </div>
  );
}

const Tag = ({ children, late }: { children: React.ReactNode; late?: boolean }) => (
  <span className={`rounded px-1.5 py-px text-[10.5px] ${late ? 'bg-[#e08a3c]/20 text-[#ffc996]' : 'bg-[#22302a] text-[#cfe0d7]'}`}>{children}</span>
);

// ── the booking window (new or change) ─────────────────────────────────────────
interface FormState {
  id?: number;
  status?: Status;
  guestName: string;
  phone: string;
  partySize: number;
  date: string;
  time: string;
  tableId: number | null;
  noteTags: string[];
  note: string;
  original?: Reservation;
}
const emptyForm = (date: string): FormState => ({ guestName: '', phone: '', partySize: 2, date, time: '', tableId: null, noteTags: [], note: '' });

function BookingModal({ form: initial, day, onClose, onSaved, onSeat, onNoShow, onCancel, onRestore }: {
  form: FormState;
  day: DayData;
  onClose: () => void;
  onSaved: () => void;
  onSeat: (r: Reservation) => void;
  onNoShow: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
  onRestore: (r: Reservation) => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [tables, setTables] = useState<AvTable[]>([]);
  const [hold, setHold] = useState(day.settings.holdMinutes);
  const [earlier, setEarlier] = useState(false);
  const [known, setKnown] = useState<{ name: string; visits: number; noShows: number; lastVisit: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoName = useRef<string | null>(null); // the name filled in by the phone lookup
  const set = (patch: Partial<FormState>) => setF((p) => ({ ...p, ...patch }));
  const readOnly = f.status === 'cancelled' || f.status === 'no_show';
  const r = f.original;

  // free tables for the date / people / time
  useEffect(() => {
    if (!f.date) return;
    let stop = false;
    api
      .get('/reservations/availability', { params: { date: f.date, people: f.partySize, ...(f.time ? { time: f.time } : {}), ...(f.id ? { excludeId: f.id } : {}) } })
      .then((res) => {
        if (stop) return;
        setSlots(res.data.slots || []);
        setTables(res.data.tables || []);
        setHold(res.data.holdMinutes ?? day.settings.holdMinutes);
      })
      .catch(() => {});
    return () => { stop = true; };
  }, [f.date, f.partySize, f.time, f.id, day.settings.holdMinutes]);

  // phone first: a known customer fills in the name
  useEffect(() => {
    const digits = f.phone.replace(/\D/g, '');
    if (digits.length < 6) return setKnown(null);
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/reservations/lookup', { params: { phone: f.phone } });
        if (!res.data.found) return setKnown(null);
        setKnown(res.data);
        setF((p) => (!p.guestName.trim() || p.guestName === autoName.current ? ((autoName.current = res.data.name), { ...p, guestName: res.data.name }) : p));
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [f.phone]);

  const isToday = f.date === day.today;
  const shownSlots = slots.filter((s) => (earlier || toMin(s.time) >= 10 * 60 || s.time === f.time) && (!isToday || !s.past || s.time === f.time));
  const chosenTable = tables.find((t) => t.id === f.tableId);

  const save = async () => {
    setError(null);
    if (!f.guestName.trim()) return setError('Type the guest name.');
    if (!f.time) return setError('Choose a time.');
    setSaving(true);
    try {
      const body = { guestName: f.guestName, phone: f.phone, partySize: f.partySize, date: f.date, time: f.time, tableId: f.tableId, noteTags: f.noteTags, note: f.note };
      if (f.id) await api.put(`/reservations/${f.id}`, body);
      else await api.post('/reservations', body);
      toast.success(f.id ? 'Booking changed' : `Booked: ${f.guestName} ×${f.partySize} · ${f.time}`);
      onSaved();
    } catch (err) {
      setError(errText(err, 'Could not save the booking.'));
    } finally {
      setSaving(false);
    }
  };

  const statusLine: Record<Status, string> = { booked: 'Booked', arrived: 'Seated', no_show: 'No-show', cancelled: 'Cancelled' };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:items-center" onMouseDown={onClose}>
      <div className="w-full max-w-[460px] rounded-xl border border-[#c9a24b] bg-[#131c18] p-3.5 text-[#e8efe9] shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">
            {f.id ? 'Booking' : '＋ New booking'}
            {f.status && <span className="ml-2 rounded bg-[#22302a] px-1.5 py-px text-[11px] font-normal text-[#cfe0d7]">{statusLine[f.status]}</span>}
          </h3>
          <button onClick={onClose} className="text-[#8fa39a] hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <fieldset disabled={readOnly} className="space-y-2.5">
          <div>
            <label className={C.label}>Phone</label>
            <input autoFocus={!f.id} className={`${C.input} ${known ? 'border-[#3fb27f]' : ''}`} value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="e.g. 71 555 444" inputMode="tel" />
            {known && (
              <div className="mt-0.5 text-[11px] text-[#3fb27f]">
                ✓ Known customer: {known.name}{known.visits ? ` · ${known.visits} visit${known.visits > 1 ? 's' : ''}` : ''}{known.lastVisit ? ` · last ${dayLabel(known.lastVisit)}` : ''}
                {known.noShows > 0 && <span className="text-[#e08a3c]"> · ⚠ {known.noShows} no-show{known.noShows > 1 ? 's' : ''}</span>}
              </div>
            )}
          </div>
          <div>
            <label className={C.label}>Name</label>
            <input className={C.input} value={f.guestName} onChange={(e) => set({ guestName: e.target.value })} placeholder="Guest name" maxLength={120} />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label className={C.label}>Date</label>
              <div className="flex flex-wrap items-center gap-1">
                <Chip on={f.date === day.today} onClick={() => set({ date: day.today })}>Today</Chip>
                <Chip on={f.date === addDays(day.today, 1)} onClick={() => set({ date: addDays(day.today, 1) })}>Tomorrow</Chip>
                {(() => {
                  const other = f.date !== day.today && f.date !== addDays(day.today, 1);
                  return (
                    <DayCalendar value={f.date} today={day.today} min={f.id ? undefined : day.today} onChange={(d) => set({ date: d })}
                      className={`rounded-md border px-2 py-0.5 text-xs ${other ? 'border-[#c9a24b] bg-[#c9a24b]/20 font-semibold text-[#e2c57a]' : 'border-[#24332c] bg-[#18241f] text-[#e8efe9] hover:border-[#c9a24b]/50'}`}>
                      <CalendarDays className="mr-1 inline h-3 w-3" />{other ? dayLabel(f.date) : 'Other day'}
                    </DayCalendar>
                  );
                })()}
              </div>
            </div>
            <div>
              <label className={C.label}>People</label>
              <div className="flex items-center gap-1.5">
                <button className={`${C.btn} w-8 font-bold`} onClick={() => set({ partySize: Math.max(1, f.partySize - 1) })}>−</button>
                <input className="w-10 bg-transparent text-center text-lg font-bold outline-none" value={f.partySize}
                  onChange={(e) => set({ partySize: Math.max(1, Math.min(200, Number(e.target.value.replace(/\D/g, '')) || 1)) })} inputMode="numeric" />
                <button className={`${C.btn} w-8 font-bold`} onClick={() => set({ partySize: Math.min(200, f.partySize + 1) })}>＋</button>
              </div>
            </div>
          </div>

          <div>
            <label className={C.label}>
              Time <span className="normal-case tracking-normal">(the small number = tables free for {f.partySize}; grey = none)</span>
            </label>
            <div className="flex max-h-[104px] flex-wrap gap-1 overflow-y-auto">
              {shownSlots.map((s) => (
                <Chip key={s.time} on={f.time === s.time} dim={s.free === 0} onClick={() => set({ time: s.time })}>
                  {s.time}<small className="ml-0.5 text-[#8fa39a]">{s.free}</small>
                </Chip>
              ))}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-[#8fa39a]">
              <span>Other time:</span>
              <input type="time" step={300} value={f.time} onChange={(e) => set({ time: e.target.value })} className="rounded-md border border-[#24332c] bg-[#18241f] px-1 text-xs [color-scheme:dark]" />
              {!earlier && <button className="text-[#c9a24b] hover:underline" onClick={() => setEarlier(true)}>show times before 10:00</button>}
            </div>
          </div>

          {/* always shown (the user missed it when it appeared only after the time) */}
          {(
            <div>
              <label className={C.label}>Table <span className="normal-case tracking-normal">(optional — can be chosen when the guest arrives)</span></label>
              {!f.time ? (
                <p className="rounded-md border border-dashed border-[#24332c] px-2 py-1.5 text-xs text-[#c9a24b]">↑ Choose a time first: the free tables then show here.</p>
              ) : tables.length === 0 ? (
                <p className="text-xs text-[#e08a3c]">No tables yet: add them in Settings → Tables.</p>
              ) : (
                <div className="grid grid-cols-4 gap-1 sm:grid-cols-5">
                  {tables.map((t) => {
                    const on = f.tableId === t.id;
                    return (
                      <button key={t.id} disabled={!t.free && !on} onClick={() => set({ tableId: on ? null : t.id })}
                        className={`rounded-md border p-1 text-center ${on ? 'border-[#c9a24b] bg-[#c9a24b]/20' : t.best ? 'border-[#c9a24b]/70 bg-[#c9a24b]/10' : 'border-[#24332c] bg-[#18241f]'} ${!t.free && !on ? 'opacity-30' : ''} ${!t.fits && t.free ? 'opacity-60' : ''}`}>
                        <b className="block text-[13px]">{t.label}</b>
                        <span className={`text-[10px] ${t.best ? 'text-[#e2c57a]' : 'text-[#8fa39a]'}`}>
                          {!t.free ? 'busy' : t.best ? '★ best fit' : !t.fits ? `only ${t.capacity}` : `${t.capacity ?? '?'} seats`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <label className={C.label}>Note</label>
            <div className="mb-1 flex flex-wrap gap-1">
              {NOTE_CHIPS.map((c) => (
                <Chip key={c} on={f.noteTags.includes(c)} onClick={() => set({ noteTags: f.noteTags.includes(c) ? f.noteTags.filter((x) => x !== c) : [...f.noteTags, c] })}>{c}</Chip>
              ))}
            </div>
            <input className={C.input} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. cake at 22:00" maxLength={500} />
          </div>
        </fieldset>

        {error && <p className="mt-2 rounded-md border border-[#d9534f]/50 bg-[#d9534f]/10 px-2 py-1 text-xs text-[#ffb3b0]">{error}</p>}
        {chosenTable && !chosenTable.fits && <p className="mt-2 text-[11px] text-[#e08a3c]">⚠ {chosenTable.label} has only {chosenTable.capacity} seats for {f.partySize} people.</p>}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#24332c] pt-2.5">
          <div className="text-xs text-[#8fa39a]">
            {f.time ? <><b className="text-[#e8efe9]">{dayLabel(f.date)} · {f.time} → {hhmm(toMin(f.time) + (r?.durationMinutes ?? hold))}</b> · {f.partySize} people · {chosenTable?.label ?? 'no table'}</> : 'Choose a time'}
          </div>
          <div className="flex flex-wrap gap-1">
            {r && r.status === 'booked' && r.date === day.today && <button className={C.seat} onClick={() => onSeat(r)}>Seat</button>}
            {r && r.status === 'booked' && <button className={C.btn} onClick={() => onNoShow(r)}>No-show</button>}
            {r && (r.status === 'booked' || r.status === 'no_show') && <button className={C.btn} onClick={() => onCancel(r)}>Cancel booking</button>}
            {r && (r.status === 'cancelled' || r.status === 'no_show' || r.status === 'arrived') && (
              <button className={C.btn} onClick={() => onRestore(r)} title={r.status === 'arrived' ? 'Not seated after all' : 'Put it back to booked'}><Undo2 className="mr-0.5 inline h-3 w-3" />{r.status === 'arrived' ? 'Unseat' : 'Restore'}</button>
            )}
            {!readOnly && <button className={C.gold} disabled={saving} onClick={save}>{saving ? 'Saving…' : f.id ? 'Save changes' : 'Save booking'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ on, dim, onClick, children }: { on?: boolean; dim?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-md border px-2 py-0.5 text-xs ${on ? 'border-[#c9a24b] bg-[#c9a24b]/20 font-semibold text-[#e2c57a]' : 'border-[#24332c] bg-[#18241f] text-[#e8efe9] hover:border-[#c9a24b]/50'} ${dim && !on ? 'opacity-40 line-through' : ''}`}>
      {children}
    </button>
  );
}

// ── "Seat": choose the table (booking without one, or its table is taken) ─────
function SeatPicker({ r, day, onClose, onPick }: { r: Reservation; day: DayData; onClose: () => void; onPick: (tableId: number) => void }) {
  const [tables, setTables] = useState<AvTable[] | null>(null);
  useEffect(() => {
    api.get('/reservations/availability', { params: { date: r.date, people: r.partySize, time: r.time, excludeId: r.id } })
      .then((res) => setTables(res.data.tables || []))
      .catch(() => setTables([]));
  }, [r]);
  const occupied = useMemo(() => new Set(day.tables.filter((t) => t.status === 'occupied').map((t) => t.id)), [day.tables]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3" onMouseDown={onClose}>
      <div className="w-full max-w-[420px] rounded-xl border border-[#3fb27f] bg-[#131c18] p-3.5 text-[#e8efe9]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">Seat {r.guestName} ×{r.partySize} — choose a table</h3>
          <button onClick={onClose} className="text-[#8fa39a] hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        {!tables ? <p className="text-xs text-[#8fa39a]">Loading…</p> : (
          <div className="grid grid-cols-4 gap-1.5">
            {tables.map((t) => {
              const busy = !t.free || occupied.has(t.id);
              return (
                <button key={t.id} disabled={busy} onClick={() => onPick(t.id)}
                  className={`rounded-md border p-1.5 text-center ${t.best && !busy ? 'border-[#3fb27f] bg-[#3fb27f]/15' : 'border-[#24332c] bg-[#18241f]'} ${busy ? 'opacity-30' : 'hover:border-[#3fb27f]'}`}>
                  <b className="block">{t.label}</b>
                  <span className="text-[10px] text-[#8fa39a]">{occupied.has(t.id) ? 'occupied' : !t.free ? 'booked' : t.best ? '★ best fit' : `${t.capacity ?? '?'} seats`}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── the 2 settings (managers) ──────────────────────────────────────────────────
function SettingsModal({ settings, onClose, onSaved }: { settings: DayData['settings']; onClose: () => void; onSaved: () => void }) {
  const [hold, setHold] = useState(settings.holdMinutes);
  const [before, setBefore] = useState(settings.reserveBeforeMinutes);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.put('/reservations/settings', { holdMinutes: hold, reserveBeforeMinutes: before });
      toast.success('Reservation settings saved');
      onSaved();
    } catch (err) {
      toast.error(errText(err, 'Could not save the settings.'));
    } finally {
      setSaving(false);
    }
  };
  const sel = 'w-full rounded-md border border-[#24332c] bg-[#18241f] px-2 py-1.5 text-sm text-[#e8efe9]';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onMouseDown={onClose}>
      <div className="w-full max-w-[360px] rounded-xl border border-[#c9a24b] bg-[#131c18] p-3.5 text-[#e8efe9]" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-[15px] font-semibold">Reservation settings</h3>
        <label className={C.label}>A booking holds its table for</label>
        <select className={sel} value={hold} onChange={(e) => setHold(Number(e.target.value))}>
          {[30, 45, 60, 90, 120, 150, 180, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? 's' : ''}`}</option>)}
        </select>
        <p className="mb-3 mt-1 text-[11px] text-[#8fa39a]">Applies to new bookings; existing ones keep their length.</p>
        <label className={C.label}>The table shows "Reserved"</label>
        <select className={sel} value={before} onChange={(e) => setBefore(Number(e.target.value))}>
          {[0, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m === 0 ? 'at the booking time' : `${m} min before`}</option>)}
        </select>
        <div className="mt-4 flex justify-end gap-1.5">
          <button className={C.btn} onClick={onClose}>Cancel</button>
          <button className={C.gold} disabled={saving} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
