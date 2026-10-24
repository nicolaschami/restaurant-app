// client/src/pages/ZReportPage.tsx
//
// Reports → Financial → Z Report / Closing (step B, rules agreed 2026-10-24):
//   - Top: the CURRENT DAY so far (= X report): everything paid since the last Z.
//     Looking at it changes nothing.
//   - Opening cash (2026-10-25): the cash put in the drawer before selling. Set here
//     ("Set opening cash") or confirmed in the POS; by default it is the cash left in
//     the drawer at the last Z.
//   - "Close the day": the cashier enters the cash counted in the drawer; the screen
//     shows expected cash and the difference while typing, then the cash taken out
//     (owner / bank) and what stays in the drawer for tomorrow.
//     Confirm → the Z is saved (numbers frozen) and printed; a new day starts.
//   - Below: the past Z reports; click one to see or reprint it.
// A day runs from one Z to the next (not the calendar date). One drawer per restaurant.
// Data: /api/z-reports/current, /api/z-reports/close, /api/z-reports, /api/z-reports/:id

import { useEffect, useState } from 'react';
import { AlertTriangle, Lock, Printer, RefreshCw, X } from 'lucide-react';
import { api } from '../api';
import { niceDate, qty } from '../components/ItemMovementView';
import { money } from '../components/SupplierPurchasesModal';
import { methodLabel } from '../components/TicketDetailModal';

export interface Totals {
  summary: { tickets: number; totalPaid: number; itemsTotal: number; taxAndFees: number; cashTotal: number; tax?: number; deliveryFees?: number };
  byMethod: Array<{ method: string; count: number; amount: number }>;
  byType: Array<{ type: string; count: number; amount: number }>;
  byCategory: Array<{ category: string; qty: number; amount: number }>;
}
interface CurrentDay extends Totals {
  lastZ: { zNumber: number } | null;
  openedAtText: string | null;
  nextNumber: number;
  suggestedFloat: number;
  openingCash: { amount: number; source: 'set' | 'last-z' | 'none'; setAt: string | null; setBy: string | null };
  open: { count: number; amount: number };
}
export interface ZRow {
  id: number;
  zNumber: number;
  openedAt: string | null;
  closedAt: string;
  netSales: number;
  tickets: number;
  openingFloat: number;
  cashSales: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  cashTaken: number; // taken out of the drawer at closing (owner / bank)
  cashLeft: number; // left in the drawer = next day's opening cash
  closedBy: string;
}
export interface ZFull extends ZRow {
  notes: string | null;
  totals: Totals & { openAtClose?: { count: number; amount: number } };
}

export const zLabel = (n: number) => `Z-${String(n).padStart(4, '0')}`;
// "2026-10-24 23:50" → "24/10/2026 23:50"
export const niceDateTime = (t: string | null) => (t ? `${niceDate(t.slice(0, 10))} ${t.slice(11, 16)}` : '—');
// Difference: + over (blue), − short (red), 0 OK (green)
export const diffTone = (d: number) => (Math.abs(d) < 0.005 ? 'text-emerald-700' : d > 0 ? 'text-sky-700' : 'text-red-600');
export const diffText = (d: number) => (Math.abs(d) < 0.005 ? `${money(0)} (exact)` : d > 0 ? `+${money(d)} (over)` : `−${money(-d)} (short)`);

// Print a Z on a narrow page, like a till receipt.
export function printZ(z: ZFull) {
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const restaurant = localStorage.getItem('restaurantName') || '';
  const t = z.totals;
  const rows = (list: Array<[string, string]>) => list.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="n">${b}</td></tr>`).join('');
  const w = window.open('', '_blank', 'width=420,height=760');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${zLabel(z.zNumber)}</title><style>
    body{font-family:Arial,sans-serif;font-size:12px;margin:12px;color:#111;max-width:340px}
    h1{font-size:15px;margin:0;text-align:center} .z{text-align:center;font-size:18px;font-weight:bold;margin:4px 0}
    .sub{text-align:center;color:#555;margin:0 0 8px}
    h2{font-size:12px;margin:10px 0 2px;border-bottom:1px dashed #999;padding-bottom:2px;text-transform:uppercase}
    table{width:100%;border-collapse:collapse} td{padding:2px 0} .n{text-align:right} .b td{font-weight:bold;font-size:14px}
    .sign{margin-top:24px;border-top:1px solid #111;padding-top:2px;text-align:center;color:#555}
  </style></head><body>
    <h1>${esc(restaurant)}</h1>
    <div class="z">${zLabel(z.zNumber)}</div>
    <div class="sub">Opened ${esc(niceDateTime(z.openedAt))}<br/>Closed ${esc(niceDateTime(z.closedAt))}${z.closedBy ? `<br/>by ${esc(z.closedBy)}` : ''}</div>
    <h2>Sales</h2>
    <table>${rows([
      ['Items (before tax)', money(t.summary.itemsTotal)],
      ['Tax', money(t.summary.tax ?? t.summary.taxAndFees)],
      ...((t.summary.deliveryFees ?? 0) > 0 ? ([['Delivery fees', money(t.summary.deliveryFees!)]] as Array<[string, string]>) : []),
    ])}<tr class="b"><td>Net sales</td><td class="n">${money(t.summary.totalPaid)}</td></tr>${rows([
      ['Tickets', String(t.summary.tickets)],
      ['Average ticket', money(t.summary.tickets ? t.summary.totalPaid / t.summary.tickets : 0)],
    ])}</table>
    <h2>Payment methods</h2><table>${rows(t.byMethod.map((m) => [`${methodLabel(m.method)} (${m.count})`, money(m.amount)]))}</table>
    <h2>Cash check</h2><table>${rows([
      ['Opening cash', money(z.openingFloat)],
      ['+ Cash sales', money(z.cashSales)],
      ['= Expected in drawer', money(z.expectedCash)],
      ['Counted', money(z.countedCash)],
    ])}<tr class="b"><td>Difference</td><td class="n">${esc(diffText(z.difference))}</td></tr>${rows([
      ['Taken out (owner / bank)', money(z.cashTaken)],
    ])}<tr class="b"><td>Left in drawer</td><td class="n">${money(z.cashLeft)}</td></tr></table>
    <h2>Order types</h2><table>${rows(t.byType.map((x) => [`${x.type} (${x.count})`, money(x.amount)]))}</table>
    <h2>Categories (before tax)</h2><table>${rows(t.byCategory.map((c) => [`${c.category} × ${qty(c.qty)}`, money(c.amount)]))}</table>
    ${t.openAtClose?.count ? `<h2>Not paid at closing</h2><table>${rows([[`${t.openAtClose.count} open orders`, money(t.openAtClose.amount)]])}</table>` : ''}
    ${z.notes ? `<h2>Notes</h2><div>${esc(z.notes)}</div>` : ''}
    <div class="sign">Signature</div>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

// ---------------------------------------------------------------- small UI pieces

export const Tile = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
    <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    <div className={`text-lg font-bold leading-tight tabular-nums ${tone}`}>{value}</div>
    {sub && <div className="text-[11px] tabular-nums text-slate-500">{sub}</div>}
  </div>
);

const SmallTable = ({ title, rows, countLabel = 'Tickets' }: { title: string; rows: Array<{ label: string; count: string | number; amount: number }>; countLabel?: string }) => (
  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
    <div className="bg-[#131c18] px-3 py-1.5 text-xs font-semibold text-white">{title}</div>
    <table className="w-full text-sm">
      <thead className="text-[11px] text-slate-500">
        <tr>
          <th className="px-3 py-1 text-left font-medium" />
          <th className="px-3 py-1 text-right font-medium">{countLabel}</th>
          <th className="px-3 py-1 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {!rows.length && (
          <tr>
            <td colSpan={3} className="px-3 py-2 text-center text-slate-400">—</td>
          </tr>
        )}
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-slate-100">
            <td className="px-3 py-1 font-medium text-slate-800">{r.label}</td>
            <td className="px-3 py-1 text-right tabular-nums text-slate-500">{r.count}</td>
            <td className="px-3 py-1 text-right font-semibold tabular-nums text-slate-800">{money(r.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// The numbers of a day (current day or a closed Z).
export const DayBlocks = ({ t }: { t: Totals }) => (
  <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
    <SmallTable title="By payment method" rows={t.byMethod.map((m) => ({ label: methodLabel(m.method), count: m.count, amount: m.amount }))} />
    <SmallTable title="By order type" rows={t.byType.map((x) => ({ label: x.type, count: x.count, amount: x.amount }))} />
    <SmallTable title="By category (before tax)" countLabel="Qty" rows={t.byCategory.map((c) => ({ label: c.category, count: qty(c.qty), amount: c.amount }))} />
  </div>
);

// A modal shell, shifted right of the sidebar like the other pop-ups.
export const Modal = ({ title, onClose, children, width = 'max-w-2xl' }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; width?: string }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 lg:pl-60" onMouseDown={onClose}>
      <div
        className={`flex max-h-[95vh] w-full ${width} flex-col gap-3 overflow-y-auto rounded-xl bg-slate-50 p-4 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200" title="Close (Esc)">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- page

export default function ZReportPage() {
  const [current, setCurrent] = useState<CurrentDay | null>(null);
  const [list, setList] = useState<ZRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false); // "Close the day" window open
  const [viewZ, setViewZ] = useState<ZFull | null>(null);
  const [settingOpening, setSettingOpening] = useState(false); // "Set opening cash" window open

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, l] = await Promise.all([api.get('/z-reports/current'), api.get('/z-reports')]);
      setCurrent(c.data);
      setList(l.data.zReports || []);
    } catch (err: any) {
      setError(
        err?.response?.status === 404
          ? 'The server does not know the Z report yet: it is running an old version. Restart the API server (npm run dev).'
          : err?.response?.data?.error || 'The Z report could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openZ = async (id: number, thenPrint = false) => {
    try {
      const res = await api.get(`/z-reports/${id}`);
      setViewZ(res.data.zReport);
      if (thenPrint) printZ(res.data.zReport);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'The Z report could not be loaded.');
    }
  };

  const s = current?.summary;

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto bg-slate-50 p-4">
      {/* One-line header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-800">Z Report / Closing</h1>
        <div className="flex items-center gap-2">
          <button onClick={load} title="Refresh" className="flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setClosing(true)}
            disabled={!current}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[#131c18] px-3 text-sm font-semibold text-white hover:bg-[#1f2d26] disabled:opacity-50"
          >
            <Lock className="h-4 w-4 text-[#c9a24b]" /> Close the day {current ? `(${zLabel(current.nextNumber)})` : ''}
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">{error}</div>}

      {current && s && (
        <>
          {/* Current day (X) */}
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-bold text-slate-700">Current day</h2>
            <span className="text-xs text-slate-500">
              {current.openedAtText
                ? `open since ${niceDateTime(current.openedAtText)}${current.lastZ ? ` (after ${zLabel(current.lastZ.zNumber)})` : ' (first sale)'}`
                : 'no sale yet'}
              {' · '}live numbers, nothing is closed yet
            </span>
          </div>
          {/* Opening cash of the day */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#c9a24b]/40 bg-[#c9a24b]/10 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-700">Opening cash in the drawer:</span>
            <span className="text-base font-bold tabular-nums text-[#8a6d2c]">{money(current.openingCash.amount)}</span>
            <span className="text-xs text-slate-500">
              {current.openingCash.source === 'set'
                ? `set ${niceDateTime(current.openingCash.setAt)}${current.openingCash.setBy ? ` by ${current.openingCash.setBy}` : ''}`
                : current.openingCash.source === 'last-z'
                  ? `left in the drawer at ${current.lastZ ? zLabel(current.lastZ.zNumber) : 'the last Z'} · not confirmed yet`
                  : 'not set yet'}
            </span>
            <button
              type="button"
              onClick={() => setSettingOpening(true)}
              className="ml-auto h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {current.openingCash.source === 'set' ? 'Change opening cash' : 'Set opening cash'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Tile label="Net sales" value={money(s.totalPaid)} sub={`items ${money(s.itemsTotal)} · tax ${money(s.tax ?? s.taxAndFees)}${s.deliveryFees ? ` · delivery ${money(s.deliveryFees)}` : ''}`} tone="text-emerald-700" />
            <Tile label="Tickets" value={String(s.tickets)} sub={current.open.count ? `${current.open.count} still open (${money(current.open.amount)})` : 'no open order'} tone="text-slate-800" />
            <Tile label="Average ticket" value={money(s.tickets ? s.totalPaid / s.tickets : 0)} tone="text-slate-800" />
            <Tile label="Expected in the drawer" value={money(current.openingCash.amount + s.cashTotal)} sub={`opening ${money(current.openingCash.amount)} + cash sales ${money(s.cashTotal)}`} tone="text-[#8a6d2c]" />
          </div>
          <DayBlocks t={current} />
        </>
      )}

      {/* Past Z */}
      <h2 className="pt-1 text-sm font-bold text-slate-700">Closed days</h2>
      <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {!list.length ? (
          <div className="p-6 text-center text-sm text-slate-500">No day closed yet. The first "Close the day" will be {zLabel(1)}.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#131c18] text-xs text-white">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Z</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Opened</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Closed</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Tickets</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Net sales</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Expected cash</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Counted</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Difference</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Taken out</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Left in drawer</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Closed by</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((z) => (
                <tr key={z.id} onClick={() => openZ(z.id)} title="See this Z" className="cursor-pointer border-b border-slate-100 even:bg-slate-50/60 hover:bg-[#c9a24b]/10">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs font-semibold text-[#8a6d2c] underline decoration-dotted underline-offset-2">{zLabel(z.zNumber)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-600">{niceDateTime(z.openedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-600">{niceDateTime(z.closedAt)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{z.tickets}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-800">{money(z.netSales)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{money(z.expectedCash)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{money(z.countedCash)}</td>
                  <td className={`whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums ${diffTone(z.difference)}`}>{diffText(z.difference)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{money(z.cashTaken)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-[#8a6d2c]">{money(z.cashLeft)}</td>
                  <td className="px-3 py-1.5 text-slate-600">{z.closedBy || '—'}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openZ(z.id, true);
                      }}
                      title="Print this Z"
                      className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        A day runs from one Z to the next: every payment after the last closing belongs to the current day, even after
        midnight. A closed Z never changes. One cash drawer per restaurant.
      </p>

      {settingOpening && current && (
        <OpeningCashModal
          initial={current.openingCash.amount}
          onClose={() => setSettingOpening(false)}
          onSaved={async () => {
            setSettingOpening(false);
            await load();
          }}
        />
      )}

      {closing && current && (
        <CloseDayModal
          current={current}
          onClose={() => setClosing(false)}
          onClosed={async (id) => {
            setClosing(false);
            await load();
            await openZ(id, true); // show and print the new Z
          }}
        />
      )}

      {viewZ && <ZViewModal z={viewZ} onClose={() => setViewZ(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- one closed Z

// The window of one closed Z (its frozen numbers) with a Print button.
// Used here and in Reports → Closed Days.
export function ZViewModal({ z, onClose }: { z: ZFull; onClose: () => void }) {
  return (
    <Modal
      width="max-w-5xl"
      onClose={onClose}
      title={
        <>
          <span className="text-[#8a6d2c]">{zLabel(z.zNumber)}</span>
          <span className="ml-2 text-sm font-normal text-slate-500">
            {niceDateTime(z.openedAt)} → {niceDateTime(z.closedAt)}
            {z.closedBy ? ` · closed by ${z.closedBy}` : ''}
          </span>
        </>
      }
    >
      <div className="flex justify-end">
        <button
          onClick={() => printZ(z)}
          className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <Tile label="Net sales" value={money(z.totals.summary.totalPaid)} sub={`${z.totals.summary.tickets} tickets`} tone="text-emerald-700" />
        <Tile label="Expected cash" value={money(z.expectedCash)} sub={`opening ${money(z.openingFloat)} + cash ${money(z.cashSales)}`} tone="text-slate-800" />
        <Tile label="Counted" value={money(z.countedCash)} tone="text-slate-800" />
        <Tile label="Difference" value={diffText(z.difference)} tone={diffTone(z.difference)} />
        <Tile label="Taken out (owner / bank)" value={money(z.cashTaken)} tone="text-slate-800" />
        <Tile label="Left in the drawer" value={money(z.cashLeft)} sub="next day's opening cash" tone="text-[#8a6d2c]" />
      </div>
      <DayBlocks t={z.totals} />
      {z.notes && <div className="text-sm text-slate-600">Notes: {z.notes}</div>}
    </Modal>
  );
}

// ---------------------------------------------------------------- close the day

// "Set opening cash": the cash put in the drawer before selling.
export function OpeningCashModal({ initial, onClose, onSaved }: { initial: number; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(initial ? initial.toFixed(2) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const n = Number(amount);
    if (amount === '' || isNaN(n) || n < 0) {
      setError('Enter the cash put in the drawer (0 if it is empty).');
      return;
    }
    setSaving(true);
    try {
      await api.post('/z-reports/opening-cash', { amount: n });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'The opening cash could not be saved.');
      setSaving(false);
    }
  };
  return (
    <Modal onClose={onClose} width="max-w-sm" title="Opening cash">
      <label className="block text-sm font-semibold text-slate-700">
        Cash in the drawer before selling
        <input
          type="number" min="0" step="0.01" value={amount} autoFocus
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-right text-lg font-semibold tabular-nums outline-none focus:border-[#c9a24b]"
        />
      </label>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-700 hover:bg-slate-100">Cancel</button>
        <button onClick={save} disabled={saving} className="h-10 rounded-md bg-[#131c18] px-4 text-sm font-semibold text-white hover:bg-[#1f2d26] disabled:opacity-50">
          {saving ? 'Saving…' : 'Save opening cash'}
        </button>
      </div>
    </Modal>
  );
}

function CloseDayModal({ current, onClose, onClosed }: { current: CurrentDay; onClose: () => void; onClosed: (id: number) => void }) {
  const [counted, setCounted] = useState('');
  const [taken, setTaken] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The opening cash of the day comes from the server (set at the start, or left at the last Z).
  const opening = current.openingCash.amount;
  const cash = current.summary.cashTotal;
  const expected = opening + cash;
  const countedNum = counted === '' ? null : Number(counted);
  const countedOk = countedNum !== null && !isNaN(countedNum) && countedNum >= 0;
  const difference = countedOk ? countedNum! - expected : null;
  const takenNum = taken === '' ? 0 : Number(taken);
  const left = countedOk ? countedNum! - (isNaN(takenNum) ? 0 : takenNum) : null;
  const round2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

  const confirm = async () => {
    if (!countedOk) {
      setError('Count the cash in the drawer and enter the amount.');
      return;
    }
    if (isNaN(takenNum) || takenNum < 0) {
      setError('Enter the cash taken out of the drawer (0 if none).');
      return;
    }
    if (takenNum > countedNum! + 0.0001) {
      setError(`You cannot take out ${money(takenNum)}: only ${money(countedNum!)} is in the drawer.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.post('/z-reports/close', { countedCash: countedNum, cashTaken: takenNum, notes: notes.trim() || undefined });
      onClosed(res.data.id);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'The day could not be closed. Please try again.');
      setSaving(false);
    }
  };

  const input = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-right text-lg font-semibold tabular-nums outline-none focus:border-[#c9a24b]';
  const quick = 'h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40';

  return (
    <Modal onClose={onClose} width="max-w-md" title={<>Close the day · <span className="text-[#8a6d2c]">{zLabel(current.nextNumber)}</span></>}>
      <div className="text-xs text-slate-500">
        {current.openedAtText ? `Day open since ${niceDateTime(current.openedAtText)}` : 'No sale in this day'} · {current.summary.tickets} tickets ·
        net sales {money(current.summary.totalPaid)}
      </div>

      {/* Warnings before closing */}
      {current.open.count > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {current.open.count} order(s) are still open ({money(current.open.amount)}). They are not in this Z: when they are paid,
          they will count in the next day.
        </div>
      )}
      {current.summary.tickets === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Nothing was sold since the last Z. You can still close an empty day.
        </div>
      )}

      {/* 1. Cash check */}
      <div className="space-y-0.5 rounded-lg border border-slate-200 bg-white p-3 text-sm tabular-nums">
        <div className="flex justify-between text-slate-600">
          <span>
            Opening cash
            <span className="ml-1 text-[11px] text-slate-400">
              {current.openingCash.source === 'set' ? '(set at the start of the day)' : current.openingCash.source === 'last-z' ? '(left at the last Z)' : ''}
            </span>
          </span>
          <span>{money(opening)}</span>
        </div>
        <div className="flex justify-between text-slate-600"><span>+ Cash sales</span><span>{money(cash)}</span></div>
        <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-800"><span>= Expected in the drawer</span><span>{money(expected)}</span></div>
      </div>

      <label className="block text-sm font-semibold text-slate-700">
        Cash counted in the drawer
        <input type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" className={input} autoFocus />
      </label>

      {difference !== null && (
        <div className={`flex justify-between rounded-lg border px-3 py-2 text-base font-bold tabular-nums ${
          Math.abs(difference) < 0.005 ? 'border-emerald-200 bg-emerald-50' : difference > 0 ? 'border-sky-200 bg-sky-50' : 'border-red-200 bg-red-50'
        } ${diffTone(difference)}`}>
          <span>Difference</span>
          <span>{diffText(difference)}</span>
        </div>
      )}

      {/* 2. Cash taken out → left in the drawer for tomorrow */}
      <label className="block text-sm font-semibold text-slate-700">
        Cash taken out <span className="font-normal text-slate-500">(owner / bank)</span>
        <input type="number" min="0" step="0.01" value={taken} onChange={(e) => setTaken(e.target.value)} placeholder="0.00" className={input} />
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={!countedOk} onClick={() => setTaken(round2(countedNum!))} className={quick}>Take all</button>
      </div>
      {left !== null && (
        <div className={`flex justify-between rounded-lg border px-3 py-2 text-base font-bold tabular-nums ${left < -0.0001 ? 'border-red-200 bg-red-50 text-red-600' : 'border-[#c9a24b]/40 bg-[#c9a24b]/10 text-[#8a6d2c]'}`}>
          <span>Left in the drawer for tomorrow</span>
          <span>{money(left)}</span>
        </div>
      )}

      <label className="block text-sm font-semibold text-slate-700">
        Notes <span className="font-normal text-slate-500">(optional, e.g. why the cash is short)</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-[#c9a24b]" />
      </label>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-700 hover:bg-slate-100">Cancel</button>
        <button
          onClick={confirm}
          disabled={saving || !countedOk}
          className="flex h-10 items-center gap-1.5 rounded-md bg-[#131c18] px-4 text-sm font-semibold text-white hover:bg-[#1f2d26] disabled:opacity-50"
        >
          <Lock className="h-4 w-4 text-[#c9a24b]" /> {saving ? 'Closing…' : `Close the day & print ${zLabel(current.nextNumber)}`}
        </button>
      </div>
      <p className="text-[11px] text-slate-500">After closing, this Z cannot be changed and a new day starts with the cash left in the drawer.</p>
    </Modal>
  );
}
