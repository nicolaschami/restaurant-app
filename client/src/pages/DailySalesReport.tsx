// client/src/pages/DailySalesReport.tsx
//
// Reports → Sales → Daily Sales (step A before the real Z closing, agreed 2026-10-24).
// For a day (default: today) or a period:
//   - 4 numbers: Net sales (total paid), Tickets, Average ticket, Cash in the drawer.
//   - 3 small tables: by payment method, by order type, by category.
//   - The list of paid tickets; click one to see its lines.
// A sale = a PAID order; the day is the day of the payment (restaurant time zone).
// Orders not paid yet are not sales: shown apart. This report changes nothing.
// Data: GET /api/reports/daily-sales

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FileSpreadsheet, Printer, RefreshCw, Search } from 'lucide-react';
import { api } from '../api';
import { PeriodPicker, niceDate, qty, toISO } from '../components/ItemMovementView';
import { money } from '../components/SupplierPurchasesModal';
import TicketDetailModal, { methodLabel } from '../components/TicketDetailModal';

interface Summary {
  tickets: number;
  totalPaid: number;
  itemsTotal: number;
  taxAndFees: number;
  cashTotal: number;
  tax?: number; // apart since 2026-10-25
  deliveryFees?: number;
}
interface Group {
  count: number;
  amount: number;
}
interface Ticket {
  orderId: number;
  ticketNo: number | null;
  date: string;
  time: string;
  type: string;
  table: string;
  method: string;
  nbItems: number;
  itemsTotal: number;
  total: number;
}

export default function DailySalesReport() {
  const today = toISO(new Date());
  const [[from, to], setRange] = useState<[string, string]>([today, today]);
  const [data, setData] = useState<{
    summary: Summary;
    byMethod: Array<Group & { method: string }>;
    byType: Array<Group & { type: string }>;
    byCategory: Array<{ category: string; qty: number; amount: number }>;
    tickets: Ticket[];
    open: Group;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openTicket, setOpenTicket] = useState<number | null>(null);

  // Ticket list: search + sort
  const [search, setSearch] = useState('');
  type Key = 'time' | 'ticketNo' | 'type' | 'method' | 'nbItems' | 'total';
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'time', dir: -1 }); // latest first

  const load = async () => {
    if (from > to) {
      setError('The "From" date must be before the "To" date.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/reports/daily-sales', { params: { from, to } });
      setData(res.data);
    } catch (err: any) {
      setError(
        err?.response?.status === 404
          ? 'The server does not know this report yet: it is running an old version. Restart the API server (npm run dev).'
          : err?.response?.data?.error || 'The daily sales report could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const s = data?.summary;
  const avg = s && s.tickets ? s.totalPaid / s.tickets : 0;
  const oneDay = from === to;
  const periodText = oneDay ? niceDate(from) : `${niceDate(from)} → ${niceDate(to)}`;

  const tickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (data?.tickets || []).filter(
      (t) => !q || `${t.ticketNo ?? ''} ${t.type} ${t.table} ${t.method}`.toLowerCase().includes(q)
    );
    const val = (t: Ticket): string | number => (sort.key === 'time' ? `${t.date} ${t.time}` : (t[sort.key] ?? ''));
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b);
      const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return c * sort.dir;
    });
  }, [data, search, sort]);

  // ---------------------------------------------------------------- export / print

  const exportExcel = () => {
    if (!data || !s) return;
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: Array<Array<string | number>> = [
      ['Daily Sales', periodText],
      [],
      ['Net sales (total paid)', s.totalPaid.toFixed(2)],
      ['Items (before tax)', s.itemsTotal.toFixed(2)],
      ['Tax', (s.tax ?? s.taxAndFees).toFixed(2)],
      ['Delivery fees', (s.deliveryFees ?? 0).toFixed(2)],
      ['Tickets', s.tickets],
      ['Average ticket', avg.toFixed(2)],
      ['Cash in the drawer', s.cashTotal.toFixed(2)],
      [],
      ['Payment method', 'Tickets', 'Amount'],
      ...data.byMethod.map((m) => [methodLabel(m.method), m.count, m.amount.toFixed(2)]),
      [],
      ['Order type', 'Tickets', 'Amount'],
      ...data.byType.map((t) => [t.type, t.count, t.amount.toFixed(2)]),
      [],
      ['Category', 'Qty', 'Amount before tax'],
      ...data.byCategory.map((c) => [c.category, c.qty, c.amount.toFixed(2)]),
      [],
      ['Date', 'Time', 'Ticket', 'Type', 'Table', 'Method', 'Items', 'Before tax', 'Total'],
      ...tickets.map((t) => [niceDate(t.date), t.time, t.ticketNo ?? '', t.type, t.table, methodLabel(t.method), t.nbItems, t.itemsTotal.toFixed(2), t.total.toFixed(2)]),
    ];
    const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-sales-${from}${oneDay ? '' : `-to-${to}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // A narrow page, like a till receipt (it also prints well on A4).
  const printReport = () => {
    if (!data || !s) return;
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const restaurant = localStorage.getItem('restaurantName') || '';
    const rows = (list: Array<[string, string]>) => list.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="n">${b}</td></tr>`).join('');
    const w = window.open('', '_blank', 'width=420,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Daily Sales</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:12px;color:#111;max-width:340px}
      h1{font-size:15px;margin:0;text-align:center} .sub{text-align:center;color:#555;margin:2px 0 8px}
      h2{font-size:12px;margin:10px 0 2px;border-bottom:1px dashed #999;padding-bottom:2px;text-transform:uppercase}
      table{width:100%;border-collapse:collapse} td{padding:2px 0} .n{text-align:right} .b td{font-weight:bold;font-size:14px}
    </style></head><body>
      <h1>${esc(restaurant)}</h1>
      <div class="sub">Daily Sales · ${esc(periodText)}<br/>printed ${new Date().toLocaleString()}</div>
      <table>${rows([
        ['Items (before tax)', money(s.itemsTotal)],
        ['Tax', money(s.tax ?? s.taxAndFees)],
        ...((s.deliveryFees ?? 0) > 0 ? ([['Delivery fees', money(s.deliveryFees!)]] as Array<[string, string]>) : []),
      ])}<tr class="b"><td>Net sales</td><td class="n">${money(s.totalPaid)}</td></tr>${rows([
        ['Tickets', String(s.tickets)],
        ['Average ticket', money(avg)],
      ])}</table>
      <h2>Payment methods</h2><table>${rows(data.byMethod.map((m) => [`${methodLabel(m.method)} (${m.count})`, money(m.amount)]))}</table>
      <table><tr class="b"><td>Cash in drawer</td><td class="n">${money(s.cashTotal)}</td></tr></table>
      <h2>Order types</h2><table>${rows(data.byType.map((t) => [`${t.type} (${t.count})`, money(t.amount)]))}</table>
      <h2>Categories (before tax)</h2><table>${rows(data.byCategory.map((c) => [`${c.category} × ${qty(c.qty)}`, money(c.amount)]))}</table>
      ${data.open.count ? `<h2>Not paid yet</h2><table>${rows([[`${data.open.count} open orders`, money(data.open.amount)]])}</table>` : ''}
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  // ---------------------------------------------------------------- UI

  const Tile = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) => (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold leading-tight tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] tabular-nums text-slate-500">{sub}</div>}
    </div>
  );

  // A small table: label | count | amount, with a total line.
  const SmallTable = ({ title, rows, countLabel = 'Tickets' }: { title: string; rows: Array<{ label: string; count: number | string; amount: number }>; countLabel?: string }) => {
    const total = rows.reduce((a, r) => a + r.amount, 0);
    return (
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
          {rows.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-[#c9a24b]/10 font-bold text-slate-800">
                <td className="px-3 py-1">Total</td>
                <td />
                <td className="px-3 py-1 text-right tabular-nums">{money(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  };

  const SortTh = ({ k, label, right }: { k: Key; label: string; right?: boolean }) => {
    const active = sort.key === k;
    return (
      <th
        onClick={() => setSort(active ? { key: k, dir: (sort.dir * -1) as 1 | -1 } : { key: k, dir: k === 'nbItems' || k === 'total' || k === 'time' ? -1 : 1 })}
        className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 font-semibold hover:text-[#c9a24b] ${right ? 'text-right' : 'text-left'} ${active ? 'text-[#c9a24b]' : ''}`}
        title="Click to sort"
      >
        <span className="inline-flex items-center gap-0.5">
          {label}
          {active && (sort.dir === 1 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
        </span>
      </th>
    );
  };

  return (
    <div className="flex h-full flex-col gap-3 bg-slate-50 p-4">
      {/* One-line header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold text-slate-800">Daily Sales</h1>
          <span className="text-xs text-slate-500">{periodText}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} title="Refresh" className="flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={printReport}
            disabled={!s}
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            onClick={exportExcel}
            disabled={!s}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[#131c18] px-3 text-sm font-medium text-white hover:bg-[#1f2d26] disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#c9a24b]" /> Export to Excel
          </button>
        </div>
      </div>

      {/* Day / period */}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker from={from} to={to} onChange={setRange} />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">{error}</div>
      ) : !data || !s ? (
        <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
      ) : (
        <>
          {/* 4 numbers */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Tile label="Net sales" value={money(s.totalPaid)} sub={`items ${money(s.itemsTotal)} · tax ${money(s.tax ?? s.taxAndFees)}${s.deliveryFees ? ` · delivery ${money(s.deliveryFees)}` : ''}`} tone="text-emerald-700" />
            <Tile label="Tickets" value={String(s.tickets)} sub={data.open.count ? `${data.open.count} still open (${money(data.open.amount)})` : 'no open order'} tone="text-slate-800" />
            <Tile label="Average ticket" value={money(avg)} tone="text-slate-800" />
            <Tile label="Cash in the drawer" value={money(s.cashTotal)} sub="cash payments (change already given back)" tone="text-[#8a6d2c]" />
          </div>

          {/* 3 small tables side by side */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <SmallTable title="By payment method" rows={data.byMethod.map((m) => ({ label: methodLabel(m.method), count: m.count, amount: m.amount }))} />
            <SmallTable title="By order type" rows={data.byType.map((t) => ({ label: t.type, count: t.count, amount: t.amount }))} />
            <SmallTable
              title="By category (before tax)"
              countLabel="Qty"
              rows={data.byCategory.map((c) => ({ label: c.category, count: qty(c.qty), amount: c.amount }))}
            />
          </div>

          {/* Paid tickets */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-slate-700">Paid tickets</h2>
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ticket number, type, table, method…"
                className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-2 text-sm outline-none focus:border-[#c9a24b]"
              />
            </div>
            <span className="ml-auto text-xs text-slate-500">
              Showing {tickets.length} of {data.tickets.length} tickets
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            {!tickets.length ? (
              <div className="p-6 text-center text-sm text-slate-500">{data.tickets.length ? 'No ticket matches this search.' : 'No sale in this period.'}</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#131c18] text-xs text-white">
                  <tr>
                    <SortTh k="time" label={oneDay ? 'Time' : 'Date / time'} />
                    <SortTh k="ticketNo" label="Ticket" />
                    <SortTh k="type" label="Type" />
                    <th className="px-3 py-2 text-left font-semibold">Table</th>
                    <SortTh k="method" label="Paid by" />
                    <SortTh k="nbItems" label="Items" right />
                    <SortTh k="total" label="Total" right />
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr
                      key={t.orderId}
                      onClick={() => setOpenTicket(t.orderId)}
                      title="See the lines of this ticket"
                      className="cursor-pointer border-b border-slate-100 even:bg-slate-50/60 hover:bg-[#c9a24b]/10"
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-600">{oneDay ? t.time : `${niceDate(t.date)} ${t.time}`}</td>
                      <td className="px-3 py-1.5 font-mono text-xs font-semibold text-[#8a6d2c] underline decoration-dotted underline-offset-2">#{t.ticketNo ?? t.orderId}</td>
                      <td className="px-3 py-1.5 text-slate-600">{t.type}</td>
                      <td className="px-3 py-1.5 text-slate-600">{t.table || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-600">{methodLabel(t.method)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{qty(t.nbItems)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-800">{money(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <p className="text-[11px] text-slate-500">
        A sale = a paid order, on the day it was paid. Tax and delivery fees are saved apart for orders made since 25/10/2026 (older
        orders: everything above the items counts as tax). This report changes nothing: the real closing (Z) comes next.
      </p>

      {openTicket !== null && <TicketDetailModal orderId={openTicket} onClose={() => setOpenTicket(null)} />}
    </div>
  );
}
