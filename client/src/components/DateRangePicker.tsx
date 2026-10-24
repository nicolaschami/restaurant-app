// client/src/components/DateRangePicker.tsx
//
// The period picker of all the reports (chosen by the user 2026-10-25):
// ONE gold button shows the period; clicking it opens a pop-up with
//   - quick periods on the left (Today, Yesterday, This week, … This year), and
//   - two months side by side: click the first day, then the last day; the days in
//     between light up (and follow the mouse before the second click).
// Quick periods apply at once; a hand-picked range applies with "Apply".
// Dates are YYYY-MM-DD texts (local days), shown as dd/mm/yyyy. Weeks start on Monday.

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s: string) => new Date(`${s}T00:00:00`);
const show = (s: string) => {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// Quick periods. Each returns [from, to].
export const RANGE_PRESETS: Array<{ label: string; range: () => [string, string] }> = [
  { label: 'Today', range: () => [toISO(new Date()), toISO(new Date())] },
  {
    label: 'Yesterday',
    range: () => {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return [toISO(y), toISO(y)];
    },
  },
  {
    label: 'This week',
    range: () => {
      const t = new Date();
      const monday = new Date(t);
      monday.setDate(t.getDate() - ((t.getDay() + 6) % 7));
      return [toISO(monday), toISO(t)];
    },
  },
  {
    label: 'Last 7 days',
    range: () => {
      const t = new Date();
      const s = new Date(t);
      s.setDate(t.getDate() - 6);
      return [toISO(s), toISO(t)];
    },
  },
  {
    label: 'This month',
    range: () => {
      const t = new Date();
      return [toISO(new Date(t.getFullYear(), t.getMonth(), 1)), toISO(t)];
    },
  },
  {
    label: 'Last month',
    range: () => {
      const t = new Date();
      return [toISO(new Date(t.getFullYear(), t.getMonth() - 1, 1)), toISO(new Date(t.getFullYear(), t.getMonth(), 0))];
    },
  },
  {
    label: 'Last 3 months',
    range: () => {
      const t = new Date();
      return [toISO(new Date(t.getFullYear(), t.getMonth() - 2, 1)), toISO(t)];
    },
  },
  {
    label: 'This year',
    range: () => {
      const t = new Date();
      return [toISO(new Date(t.getFullYear(), 0, 1)), toISO(t)];
    },
  },
];

const presetOf = (from: string, to: string) =>
  RANGE_PRESETS.find((p) => {
    const [f, t] = p.range();
    return f === from && t === to;
  })?.label ?? null;

// One month grid (Monday first). Empty cells before the 1st.
function monthDays(year: number, month: number): Array<string | null> {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  return [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => toISO(new Date(year, month, i + 1)))];
}

export default function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: [string, string]) => void;
}) {
  const [open, setOpen] = useState(false);
  // Range being chosen in the pop-up (applied with "Apply").
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState<string | null>(to);
  const [hover, setHover] = useState<string | null>(null);
  // First month shown (the second one is the month after).
  const [view, setView] = useState(() => {
    const d = fromISO(to);
    return new Date(d.getFullYear(), d.getMonth() - 1, 1);
  });
  const wrap = useRef<HTMLDivElement | null>(null);
  // The pop-up floats above everything (fixed position under the button), so a
  // report pop-up with its own scroll area cannot cut it.
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const place = () => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    const width = window.innerWidth >= 768 ? 700 : 420; // two months / one month
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
  };

  // Opening: start from the current period, months around its end.
  const openPopup = () => {
    setStart(from);
    setEnd(to);
    setHover(null);
    const d = fromISO(to);
    setView(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    place();
    setOpen(true);
  };

  // Close on a click outside or Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onMove = () => place(); // follow the button if the page scrolls / resizes
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  const pickDay = (day: string) => {
    if (end !== null || day < start) {
      // first click (or a day before the start): new start
      setStart(day);
      setEnd(null);
    } else {
      setEnd(day);
    }
  };

  const applyPreset = (range: [string, string]) => {
    onChange(range);
    setOpen(false);
  };

  const apply = () => {
    onChange([start, end ?? start]);
    setOpen(false);
  };

  const today = toISO(new Date());
  const rangeEnd = end ?? (hover && hover >= start ? hover : start);
  const active = presetOf(from, to);
  const choosingActive = end ? presetOf(start, end) : null;
  const label = from === to ? show(from) : `${show(from)} → ${show(to)}`;

  const Month = ({ offset }: { offset: number }) => {
    const m = new Date(view.getFullYear(), view.getMonth() + offset, 1);
    const days = monthDays(m.getFullYear(), m.getMonth());
    return (
      <div className="w-[15.5rem]">
        <div className="mb-1 text-center text-sm font-bold text-slate-800">
          {MONTHS[m.getMonth()]} {m.getFullYear()}
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400">
          {WEEK.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm">
          {days.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const isStart = d === start;
            const isEnd = d === rangeEnd;
            const inside = d > start && d < rangeEnd;
            const edge = isStart || isEnd;
            return (
              <button
                key={d}
                type="button"
                onClick={() => pickDay(d)}
                onMouseEnter={() => setHover(d)}
                className={[
                  'relative h-8 tabular-nums transition',
                  inside ? 'bg-[#c9a24b]/20 text-slate-800' : '',
                  isStart && rangeEnd > start ? 'rounded-l-full bg-[#c9a24b]/20' : '',
                  isEnd && rangeEnd > start ? 'rounded-r-full bg-[#c9a24b]/20' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'mx-auto flex h-8 w-8 items-center justify-center rounded-full',
                    edge ? 'bg-[#131c18] font-bold text-white' : 'hover:bg-[#c9a24b]/30',
                    !edge && d === today ? 'ring-1 ring-[#c9a24b] font-semibold text-[#8a6d2c]' : '',
                  ].join(' ')}
                >
                  {Number(d.slice(8))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div ref={wrap} className="relative">
      {/* The button */}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPopup())}
        className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold shadow-sm transition ${
          open ? 'border-[#c9a24b] bg-[#c9a24b]/15 text-[#8a6d2c]' : 'border-[#c9a24b]/60 bg-white text-slate-800 hover:bg-[#c9a24b]/10'
        }`}
      >
        <CalendarDays className="h-4 w-4 text-[#c9a24b]" />
        <span className="tabular-nums">{label}</span>
        {active && <span className="rounded bg-[#131c18] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#c9a24b]">{active}</span>}
        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* The pop-up */}
      {open && (
        <div
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[1100] flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        >
          {/* Quick periods */}
          <div className="flex w-36 flex-col gap-0.5 border-r border-slate-100 bg-slate-50 p-2">
            {RANGE_PRESETS.map((p) => {
              const isOn = (choosingActive ?? active) === p.label;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.range())}
                  className={`rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition ${
                    isOn ? 'bg-[#131c18] text-[#c9a24b]' : 'text-slate-600 hover:bg-[#c9a24b]/15 hover:text-slate-900'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Two months */}
          <div className="p-3">
            <div className="relative flex gap-5" onMouseLeave={() => setHover(null)}>
              <button
                type="button"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
                className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                title="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
                className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                title="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <Month offset={0} />
              <div className="hidden md:block">
                <Month offset={1} />
              </div>
            </div>

            {/* Chosen range + buttons */}
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="text-sm tabular-nums text-slate-600">
                <span className="font-semibold text-slate-800">{show(start)}</span>
                <span className="mx-1.5 text-slate-400">→</span>
                <span className={end ? 'font-semibold text-slate-800' : 'italic text-slate-400'}>{end ? show(end) : 'pick the last day'}</span>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-md border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-100">
                  Cancel
                </button>
                <button type="button" onClick={apply} className="h-8 rounded-md bg-[#131c18] px-4 text-sm font-semibold text-white hover:bg-[#1f2d26]">
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
