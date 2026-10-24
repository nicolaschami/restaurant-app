// client/src/components/ItemMovementView.tsx
//
// The movement detail of ONE raw material for a period, shared by:
//   - Reports → Stock Movement (when an item is chosen), and
//   - the pop-up opened from Reports → Current Stock (click an item's code).
//
// It only SHOWS data already loaded from GET /api/reports/stock-movement?rawMaterialId=…
// (4 numbers, the movement lines with running balance, and the menu dishes that
// use the item). Loading, printing and exporting stay with the screen that uses it.

import { ArrowDownLeft, ArrowUpRight, UtensilsCrossed } from 'lucide-react';
import DateRangePicker from './DateRangePicker';
import { money } from '../lib/restaurantSettings';

export interface ItemTotals {
  id: number;
  code: string | null;
  name: string;
  unit: string;
  warehouse: string;
  opening: number;
  qtyIn: number;
  qtyOut: number;
  closing: number;
  moves: number;
}

export interface MoveLine {
  transactionId: number;
  date: string; // YYYY-MM-DD
  doc: string; // GRN-0003, RP-0001…
  kind: string; // PUR | RP
  supplier: string;
  unitCost: number;
  qtyIn: number;
  qtyOut: number;
  balance: number;
}

// A menu dish whose recipe (ingredients on the menu item) uses this raw material.
export interface DishUse {
  id: number;
  name: string;
  qtyPerDish: number;
  costPerDish: number;
  countable: boolean; // a Countable item sold from this stock item (1 per sale)
}

// What each kind of document is called on screen.
export const KIND_LABEL: Record<string, string> = { PUR: 'Purchase', RP: 'Purchase return', SAL: 'Sale' };

// Badge colors per kind: purchases green (in), returns red (out), sales blue (out).
const KIND_BADGE: Record<string, string> = {
  PUR: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  RP: 'border-red-200 bg-red-50 text-red-700',
  SAL: 'border-sky-200 bg-sky-50 text-sky-700',
};

export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Quantities: up to 3 decimals, no useless zeros (22, 4.5, 0.125).
export const qty = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 3 });
// Unit prices can have 3 decimals ($0.495 per kg); restaurant currency.
export const unitPrice = (v: number) => money(v, 3);
// Dates as dd/mm/yyyy (e.g. 17/10/2026), built from the text so the time zone can't shift the day.
export const niceDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

// Quick period buttons.
export const PERIOD_PRESETS: Array<{ label: string; range: () => [string, string] }> = [
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
];

// The period of a report: one button + a two-month calendar with quick periods
// (see components/DateRangePicker.tsx). Every report uses this.
export function PeriodPicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: [string, string]) => void;
}) {
  return <DateRangePicker from={from} to={to} onChange={onChange} />;
}

const Tile = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
    <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    <div className={`text-lg font-bold leading-tight tabular-nums ${tone}`}>{value}</div>
  </div>
);

// The 4 numbers of the period: Opening, In, Out, Closing.
export function ItemMovementTiles({ item, from, to }: { item: ItemTotals; from: string; to: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Tile label={`Opening · ${niceDate(from)}`} value={`${qty(item.opening)} ${item.unit}`} tone="text-slate-800" />
      <Tile label="In (purchases)" value={item.qtyIn ? `+${qty(item.qtyIn)}` : '0'} tone="text-emerald-700" />
      <Tile label="Out (returns + sales)" value={item.qtyOut ? `−${qty(item.qtyOut)}` : '0'} tone="text-red-600" />
      <Tile label={`Closing · ${niceDate(to)}`} value={`${qty(item.closing)} ${item.unit}`} tone="text-[#8a6d2c]" />
    </div>
  );
}

// The movement lines: Opening stock, each purchase / return, Closing stock.
export function ItemMovementTable({ item, lines, from, to }: { item: ItemTotals; lines: MoveLine[]; from: string; to: string }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 z-10 bg-[#131c18] text-xs text-white">
        <tr>
          <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Date</th>
          <th className="px-3 py-2 text-left font-semibold">Document</th>
          <th className="px-3 py-2 text-left font-semibold">Type</th>
          <th className="px-3 py-2 text-left font-semibold">Supplier / ticket</th>
          <th className="px-3 py-2 text-right font-semibold">In</th>
          <th className="px-3 py-2 text-right font-semibold">Out</th>
          <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Unit cost</th>
          <th className="px-3 py-2 text-right font-semibold">Balance</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-slate-200 bg-[#c9a24b]/10 font-semibold text-slate-700">
          <td className="whitespace-nowrap px-3 py-1.5">{niceDate(from)}</td>
          <td className="px-3 py-1.5" colSpan={6}>Opening stock</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{qty(item.opening)}</td>
        </tr>
        {!lines.length && (
          <tr>
            <td colSpan={8} className="px-3 py-4 text-center text-slate-500">
              No movement in this period.
            </td>
          </tr>
        )}
        {lines.map((l, i) => (
          <tr key={`${l.transactionId}-${i}`} className="border-b border-slate-100 even:bg-slate-50/60">
            <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{niceDate(l.date)}</td>
            <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-slate-700">{l.doc || '—'}</td>
            <td className="px-3 py-1.5">
              <span
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                  KIND_BADGE[l.kind] ?? KIND_BADGE.PUR
                }`}
              >
                {l.kind === 'RP' || l.kind === 'SAL' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                {KIND_LABEL[l.kind] ?? l.kind}
              </span>
            </td>
            <td className="max-w-[13rem] truncate px-3 py-1.5 text-slate-600" title={l.supplier}>
              {l.supplier || '—'}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{l.qtyIn ? `+${qty(l.qtyIn)}` : ''}</td>
            <td className="px-3 py-1.5 text-right tabular-nums text-red-600">{l.qtyOut ? `−${qty(l.qtyOut)}` : ''}</td>
            <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{unitPrice(l.unitCost)}</td>
            <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-800">{qty(l.balance)}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-slate-300 bg-[#c9a24b]/10 font-bold text-slate-800">
          <td className="whitespace-nowrap px-3 py-2">{niceDate(to)}</td>
          <td className="px-3 py-2" colSpan={3}>Closing stock</td>
          <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{item.qtyIn ? `+${qty(item.qtyIn)}` : '0'}</td>
          <td className="px-3 py-2 text-right tabular-nums text-red-600">{item.qtyOut ? `−${qty(item.qtyOut)}` : '0'}</td>
          <td />
          <td className="px-3 py-2 text-right tabular-nums">{qty(item.closing)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// "Used in the menu": the dishes whose ingredients include this item.
export function UsedInMenu({ dishes, unit }: { dishes: DishUse[]; unit: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <UtensilsCrossed className="h-3.5 w-3.5 text-[#c9a24b]" />
        Used in the menu
        <span className="ml-auto font-normal normal-case text-slate-400">{dishes.length} dishes</span>
      </div>
      {!dishes.length ? (
        <div className="px-3 py-3 text-sm text-slate-500">No menu dish uses this item yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-[11px] text-slate-500">
            <tr>
              <th className="px-3 py-1 text-left font-medium">Dish</th>
              <th className="px-3 py-1 text-right font-medium">Per dish</th>
              <th className="px-3 py-1 text-right font-medium">Cost per dish</th>
            </tr>
          </thead>
          <tbody>
            {dishes.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-3 py-1.5 font-medium text-slate-800">
                  {d.name || `Dish #${d.id}`}
                  {d.countable && (
                    <span className="ml-1 rounded bg-sky-50 px-1 text-[10px] font-semibold text-sky-700" title="Countable item: each sale takes 1">
                      countable
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                  {qty(d.qtyPerDish)} {unit}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{unitPrice(d.costPerDish)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
