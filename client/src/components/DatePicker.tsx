// client/src/components/DatePicker.tsx
//
// ONE date (2026-10-27, for the supplier payment), same look as the reports' period
// picker (DateRangePicker): a gold button shows the date; clicking it opens one month.
//   - Quick buttons: Today / Yesterday.
//   - One click on a day chooses it and closes the pop-up.
//   - Days after `max` are greyed and cannot be chosen (a payment cannot be in the future).
// Dates are YYYY-MM-DD texts, shown as dd/mm/yyyy. Weeks start on Monday.

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTHS, WEEK, fromISO, monthDays, show, toISO } from './DateRangePicker';

const dayBefore = (iso: string) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() - 1);
  return toISO(d);
};

export default function DatePicker({
  value,
  onChange,
  max,
  today = toISO(new Date()),
}: {
  value: string;
  onChange: (date: string) => void;
  max?: string; // last day allowed (included)
  today?: string; // "today" to use (e.g. the restaurant's, from the server)
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const d = fromISO(value);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const wrap = useRef<HTMLDivElement | null>(null);
  // Fixed position under the button, so a pop-up window with a scroll cannot cut it.
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const place = () => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 290)) });
  };

  const openPopup = () => {
    const d = fromISO(value);
    setView(new Date(d.getFullYear(), d.getMonth(), 1));
    place();
    setOpen(true);
  };

  // Close on a click outside or Esc (Esc must not also close the payment window).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  const allowed = (d: string) => !max || d <= max;
  const pick = (d: string) => {
    if (!allowed(d)) return;
    onChange(d);
    setOpen(false);
  };

  const days = monthDays(view.getFullYear(), view.getMonth());
  // no "next month" after the month of the last allowed day
  const nextBlocked = !!max && toISO(new Date(view.getFullYear(), view.getMonth() + 1, 1)) > max;
  const label = value === today ? 'Today' : value === dayBefore(today) ? 'Yesterday' : null;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPopup())}
        className={`flex h-9 w-full items-center gap-2 rounded-lg border px-2.5 text-sm font-semibold transition ${
          open ? 'border-[#c9a24b] bg-[#c9a24b]/15 text-[#8a6d2c]' : 'border-[#c9a24b]/60 bg-white text-slate-800 hover:bg-[#c9a24b]/10'
        }`}
      >
        <CalendarDays className="h-4 w-4 text-[#c9a24b]" />
        <span className="tabular-nums">{show(value)}</span>
        {label && <span className="rounded bg-[#131c18] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#c9a24b]">{label}</span>}
        <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div style={{ top: pos.top, left: pos.left }} className="fixed z-[1100] w-[17.5rem] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
          {/* quick choices */}
          <div className="mb-2 flex gap-1.5">
            {[
              ['Today', today],
              ['Yesterday', dayBefore(today)],
            ].map(([text, d]) => (
              <button
                key={text}
                type="button"
                onClick={() => pick(d)}
                className={`h-7 flex-1 rounded-md text-xs font-semibold transition ${
                  value === d ? 'bg-[#131c18] text-[#c9a24b]' : 'bg-slate-100 text-slate-600 hover:bg-[#c9a24b]/20'
                }`}
              >
                {text}
              </button>
            ))}
          </div>

          {/* month + arrows */}
          <div className="mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              title="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold text-slate-800">
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </span>
            <button
              type="button"
              disabled={nextBlocked}
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-30"
              title="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400">
            {WEEK.map((w) => (
              <div key={w} className="py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm">
            {days.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const ok = allowed(d);
              const chosen = d === value;
              return (
                <button key={d} type="button" disabled={!ok} onClick={() => pick(d)} className="h-8 tabular-nums">
                  <span
                    className={[
                      'mx-auto flex h-8 w-8 items-center justify-center rounded-full transition',
                      chosen ? 'bg-[#131c18] font-bold text-white' : ok ? 'hover:bg-[#c9a24b]/30' : 'cursor-not-allowed text-slate-300',
                      !chosen && d === today ? 'font-semibold text-[#8a6d2c] ring-1 ring-[#c9a24b]' : '',
                    ].join(' ')}
                  >
                    {Number(d.slice(8))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
