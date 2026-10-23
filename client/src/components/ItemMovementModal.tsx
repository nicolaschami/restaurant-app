// client/src/components/ItemMovementModal.tsx
//
// Pop-up opened from Reports → Current Stock (click an item's code) and from
// Reports → Stock Movement (click an item's line).
// Shows, for one raw material: the period (default: this month), the 4 numbers
// (opening / in / out / closing), every purchase and return with the running
// balance, and the menu dishes that use the item.
// Closing it (✕, Esc or a click outside) returns to the Current Stock list as it was.

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import {
  type DishUse,
  type ItemTotals,
  type MoveLine,
  ItemMovementTable,
  ItemMovementTiles,
  PERIOD_PRESETS,
  PeriodPicker,
  UsedInMenu,
} from './ItemMovementView';

interface ItemMovementModalProps {
  rawMaterialId: number;
  title: string; // shown while loading (the item's name from the stock list)
  onClose: () => void;
  // Period to open with (e.g. the dates chosen in the Stock Movement report).
  // Default: this month.
  initialRange?: [string, string];
}

export default function ItemMovementModal({ rawMaterialId, title, onClose, initialRange }: ItemMovementModalProps) {
  const [[from, to], setRange] = useState<[string, string]>(initialRange ?? PERIOD_PRESETS[0].range());
  const [item, setItem] = useState<ItemTotals | null>(null);
  const [lines, setLines] = useState<MoveLine[]>([]);
  const [usedIn, setUsedIn] = useState<DishUse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the item's movements whenever the period changes.
  useEffect(() => {
    if (from > to) {
      setError('The "From" date must be before the "To" date.');
      return;
    }
    let cancelled = false; // ignore an old answer if the user changed the period meanwhile
    setLoading(true);
    setError(null);
    api
      .get('/reports/stock-movement', { params: { from, to, rawMaterialId } })
      .then((res) => {
        if (cancelled) return;
        setItem(res.data.item);
        setLines(res.data.lines || []);
        setUsedIn(res.data.usedIn || []);
      })
      .catch((err) => !cancelled && setError(err?.response?.data?.error || 'The movements could not be loaded.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, to, rawMaterialId]);

  // Esc closes the pop-up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 lg:pl-60" onMouseDown={onClose}>
      <div
        className="flex max-h-[95vh] w-full max-w-6xl flex-col gap-3 overflow-y-auto rounded-xl bg-slate-50 p-4 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onMouseDown={(e) => e.stopPropagation()} // clicks inside don't close it
        role="dialog"
        aria-modal="true"
      >
        {/* One-line header */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-800">
            Stock movement ·{' '}
            <span className="text-[#8a6d2c]">
              {item ? `${item.name} (${item.unit})` : title}
            </span>
            {item?.code && <span className="ml-2 font-mono text-xs font-normal text-slate-500">{item.code}</span>}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker from={from} to={to} onChange={setRange} />
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">{error}</div>
        ) : !item ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <>
            <ItemMovementTiles item={item} from={from} to={to} />
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <div
                className={`min-w-0 flex-1 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}
              >
                <ItemMovementTable item={item} lines={lines} from={from} to={to} />
              </div>
              <div className="shrink-0 lg:w-60">
                <UsedInMenu dishes={usedIn} unit={item.unit} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
