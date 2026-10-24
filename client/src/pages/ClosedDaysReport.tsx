// client/src/pages/ClosedDaysReport.tsx
//
// Reports → Financial → Closed Days (asked 2026-10-25): the list of the Z (closed
// days) for a period, by the day each Z was CLOSED (restaurant time zone).
//   - 4 numbers: days closed, net sales, total cash difference, cash taken out.
//   - One line per Z with its cash check; a total line at the bottom.
//   - Click a Z to see it (same window as on the Z page) and reprint it.
// Data: GET /api/z-reports?from=&to=  (the Z themselves never change)

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FileSpreadsheet, Printer, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { PERIOD_PRESETS, PeriodPicker, niceDate } from '../components/ItemMovementView';
import { money } from '../components/SupplierPurchasesModal';
import { Tile, ZViewModal, diffText, diffTone, niceDateTime, printZ, zLabel, type ZFull, type ZRow } from './ZReportPage';

type Key = 'zNumber' | 'closedAt' | 'tickets' | 'netSales' | 'expectedCash' | 'countedCash' | 'difference' | 'cashTaken' | 'cashLeft' | 'closedBy';

export default function ClosedDaysReport() {
  const [[from, to], setRange] = useState<[string, string]>(PERIOD_PRESETS[0].range());
  const [rows, setRows] = useState<ZRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewZ, setViewZ] = useState<ZFull | null>(null);
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'zNumber', dir: -1 }); // latest first

  const load = async () => {
    if (from > to) {
      setError('The "From" date must be before the "To" date.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/z-reports', { params: { from, to } });
      setRows(res.data.zReports || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'The closed days could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const openZ = async (id: number, thenPrint = false) => {
    try {
      const res = await api.get(`/z-reports/${id}`);
      if (thenPrint) printZ(res.data.zReport);
      else setViewZ(res.data.zReport);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'The Z report could not be loaded.');
    }
  };

  const sorted = useMemo(() => {
    const val = (z: ZRow) => z[sort.key] ?? '';
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return c * sort.dir;
    });
  }, [rows, sort]);

  const sum = (k: keyof ZRow) => rows.reduce((s, z) => s + (Number(z[k]) || 0), 0);
  const total = {
    tickets: sum('tickets'),
    netSales: sum('netSales'),
    expectedCash: sum('expectedCash'),
    countedCash: sum('countedCash'),
    difference: sum('difference'),
    cashTaken: sum('cashTaken'),
  };
  const shortDays = rows.filter((z) => z.difference < -0.005).length;
  const periodText = `${niceDate(from)} → ${niceDate(to)}`;

  // ---------------------------------------------------------------- export / print

  const exportExcel = () => {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const out: Array<Array<string | number>> = [
      ['Z', 'Opened', 'Closed', 'Tickets', 'Net sales', 'Opening cash', 'Cash sales', 'Expected cash', 'Counted', 'Difference', 'Taken out', 'Left in drawer', 'Closed by'],
      ...sorted.map((z) => [
        zLabel(z.zNumber), niceDateTime(z.openedAt), niceDateTime(z.closedAt), z.tickets, z.netSales.toFixed(2),
        z.openingFloat.toFixed(2), z.cashSales.toFixed(2), z.expectedCash.toFixed(2), z.countedCash.toFixed(2),
        z.difference.toFixed(2), z.cashTaken.toFixed(2), z.cashLeft.toFixed(2), z.closedBy,
      ]),
      ['TOTAL', '', '', total.tickets, total.netSales.toFixed(2), '', '', total.expectedCash.toFixed(2), total.countedCash.toFixed(2),
        total.difference.toFixed(2), total.cashTaken.toFixed(2), '', ''],
    ];
    const csv = '﻿' + out.map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `closed-days-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const restaurant = localStorage.getItem('restaurantName') || '';
    const body = sorted
      .map(
        (z) => `<tr><td>${zLabel(z.zNumber)}</td><td>${esc(niceDateTime(z.closedAt))}</td><td class="n">${z.tickets}</td>
          <td class="n">${money(z.netSales)}</td><td class="n">${money(z.expectedCash)}</td><td class="n">${money(z.countedCash)}</td>
          <td class="n">${esc(diffText(z.difference))}</td><td class="n">${money(z.cashTaken)}</td><td class="n">${money(z.cashLeft)}</td>
          <td>${esc(z.closedBy || '')}</td></tr>`
      )
      .join('');
    const w = window.open('', '_blank', 'width=1000,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Closed Days</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}
      h1{font-size:16px;margin:0} .sub{color:#555;margin:2px 0 10px}
      table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}
      th{background:#131c18;color:#fff} .n{text-align:right} tfoot td{font-weight:bold;border-top:2px solid #111}
    </style></head><body>
      <h1>${esc(restaurant)} · Closed Days</h1>
      <div class="sub">${esc(periodText)} · ${rows.length} days · printed ${new Date().toLocaleString()}</div>
      <table><thead><tr><th>Z</th><th>Closed</th><th class="n">Tickets</th><th class="n">Net sales</th><th class="n">Expected</th>
        <th class="n">Counted</th><th class="n">Difference</th><th class="n">Taken out</th><th class="n">Left</th><th>By</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="n">${total.tickets}</td><td class="n">${money(total.netSales)}</td>
        <td class="n">${money(total.expectedCash)}</td><td class="n">${money(total.countedCash)}</td>
        <td class="n">${esc(diffText(total.difference))}</td><td class="n">${money(total.cashTaken)}</td><td></td><td></td></tr></tfoot></table>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  // ---------------------------------------------------------------- UI

  const SortTh = ({ k, label, right }: { k: Key; label: string; right?: boolean }) => {
    const active = sort.key === k;
    return (
      <th
        onClick={() => setSort(active ? { key: k, dir: (sort.dir * -1) as 1 | -1 } : { key: k, dir: k === 'closedBy' ? 1 : -1 })}
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

  const td = 'px-3 py-1.5 text-right tabular-nums';

  return (
    <div className="flex h-full flex-col gap-3 bg-slate-50 p-4">
      {/* One-line header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-800">Closed Days</h1>
        <div className="flex items-center gap-2">
          <button onClick={load} title="Refresh" className="flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={printReport}
            disabled={!rows.length}
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            onClick={exportExcel}
            disabled={!rows.length}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[#131c18] px-3 text-sm font-medium text-white hover:bg-[#1f2d26] disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#c9a24b]" /> Export to Excel
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker from={from} to={to} onChange={setRange} />
        <span className="text-xs text-slate-500">by the day each Z was closed</span>
      </div>

      {/* 4 numbers of the period */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile label="Days closed" value={String(rows.length)} sub={`${total.tickets} tickets`} tone="text-slate-800" />
        <Tile label="Net sales" value={money(total.netSales)} sub={rows.length ? `average ${money(total.netSales / rows.length)} / day` : undefined} tone="text-emerald-700" />
        <Tile
          label="Cash difference"
          value={diffText(total.difference)}
          sub={shortDays ? `${shortDays} day(s) short` : 'no day short'}
          tone={diffTone(total.difference)}
        />
        <Tile label="Cash taken out" value={money(total.cashTaken)} sub="owner / bank" tone="text-[#8a6d2c]" />
      </div>

      {/* One line per Z */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">{error}</div>
        ) : loading && !rows.length ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
        ) : !rows.length ? (
          <div className="p-6 text-center text-sm text-slate-500">No day was closed in this period.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#131c18] text-xs text-white">
              <tr>
                <SortTh k="zNumber" label="Z" />
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Opened</th>
                <SortTh k="closedAt" label="Closed" />
                <SortTh k="tickets" label="Tickets" right />
                <SortTh k="netSales" label="Net sales" right />
                <SortTh k="expectedCash" label="Expected cash" right />
                <SortTh k="countedCash" label="Counted" right />
                <SortTh k="difference" label="Difference" right />
                <SortTh k="cashTaken" label="Taken out" right />
                <SortTh k="cashLeft" label="Left in drawer" right />
                <SortTh k="closedBy" label="Closed by" />
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((z) => (
                <tr key={z.id} onClick={() => openZ(z.id)} title="See this Z" className="cursor-pointer border-b border-slate-100 even:bg-slate-50/60 hover:bg-[#c9a24b]/10">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs font-semibold text-[#8a6d2c] underline decoration-dotted underline-offset-2">{zLabel(z.zNumber)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-600">{niceDateTime(z.openedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-600">{niceDateTime(z.closedAt)}</td>
                  <td className={`${td} text-slate-600`}>{z.tickets}</td>
                  <td className={`${td} font-semibold text-slate-800`}>{money(z.netSales)}</td>
                  <td className={`${td} text-slate-600`}>{money(z.expectedCash)}</td>
                  <td className={`${td} text-slate-600`}>{money(z.countedCash)}</td>
                  <td className={`${td} whitespace-nowrap font-semibold ${diffTone(z.difference)}`}>{diffText(z.difference)}</td>
                  <td className={`${td} text-slate-600`}>{money(z.cashTaken)}</td>
                  <td className={`${td} font-semibold text-[#8a6d2c]`}>{money(z.cashLeft)}</td>
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
            <tfoot className="sticky bottom-0 bg-white">
              <tr className="border-t-2 border-slate-300 bg-[#c9a24b]/10 font-bold text-slate-800">
                <td className="px-3 py-2" colSpan={3}>Total ({rows.length} days)</td>
                <td className={td}>{total.tickets}</td>
                <td className={td}>{money(total.netSales)}</td>
                <td className={td}>{money(total.expectedCash)}</td>
                <td className={td}>{money(total.countedCash)}</td>
                <td className={`${td} whitespace-nowrap ${diffTone(total.difference)}`}>{diffText(total.difference)}</td>
                <td className={td}>{money(total.cashTaken)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        A Z belongs to the day it was closed. Closed days never change. Click a Z to see its details or reprint it.
      </p>

      {viewZ && <ZViewModal z={viewZ} onClose={() => setViewZ(null)} />}
    </div>
  );
}
