// client/src/pages/AccountBalancesReport.tsx
//
// Reports → Financial → Account Balances (trial balance, asked 2026-10-27): for each
// account of the chart (370 Stocks, 401 Suppliers, 4426 VAT, 512 Bank, 530 Cash drawer…):
//   balance before the period · debits and credits of the period · balance at the end.
// The end balance is shown on the debit side (assets: what we HAVE, e.g. stock, VAT to
// recover, cash) or the credit side (what we OWE, e.g. suppliers). Σ debit = Σ credit.
// Click an account → the Journal (JV) report of the same period, filtered on it.
// Data: GET /api/reports/trial-balance?from=&to=

import { useEffect, useState } from 'react';
import { FileSpreadsheet, Printer, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { PERIOD_PRESETS, PeriodPicker, niceDate } from '../components/ItemMovementView';
import { money } from '../lib/restaurantSettings';
import { Tile } from './ZReportPage';
import JournalReport from './JournalReport';

interface AccountRow {
  code: string;
  name: string;
  kind: string;
  opening: number; // Σ debit − Σ credit before the period
  debit: number;
  credit: number;
  closing: number; // Σ debit − Σ credit up to the end of the period
  entries: number;
}

// a balance on its side: debit (positive) or credit (negative)
const side = (v: number) => ({ dr: v > 0.004 ? v : 0, cr: v < -0.004 ? -v : 0 });
const cellMoney = (v: number) => (v ? money(v) : '');

export default function AccountBalancesReport() {
  const [[from, to], setRange] = useState<[string, string]>(PERIOD_PRESETS[0].range());
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [drill, setDrill] = useState<string | null>(null); // account opened in the journal

  const load = async () => {
    if (from > to) {
      setError('The "From" date must be before the "To" date.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/reports/trial-balance', { params: { from, to } });
      setRows(res.data.accounts || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'The account balances could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // The journal of one account, same period; ← comes back here.
  if (drill) return <JournalReport initialAccount={drill} initialRange={[from, to]} onBack={() => setDrill(null)} />;

  const shown = hideEmpty ? rows.filter((r) => r.opening || r.debit || r.credit || r.closing) : rows;
  const sum = (f: (r: AccountRow) => number) => rows.reduce((s, r) => s + Math.round(f(r) * 100), 0) / 100;
  const total = {
    openDr: sum((r) => side(r.opening).dr),
    openCr: sum((r) => side(r.opening).cr),
    debit: sum((r) => r.debit),
    credit: sum((r) => r.credit),
    closeDr: sum((r) => side(r.closing).dr),
    closeCr: sum((r) => side(r.closing).cr),
  };
  const balanced = Math.round(total.debit * 100) === Math.round(total.credit * 100) && Math.round(total.closeDr * 100) === Math.round(total.closeCr * 100);
  const find = (code: string) => rows.find((r) => r.code === code)?.closing ?? 0;
  const periodText = `${niceDate(from)} → ${niceDate(to)}`;

  // ---------------------------------------------------------------- export / print

  const exportExcel = () => {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const f = (v: number) => (v ? v.toFixed(2) : '');
    const out: Array<Array<string | number>> = [
      ['Account', 'Name', 'Opening debit', 'Opening credit', 'Period debit', 'Period credit', 'Closing debit', 'Closing credit'],
      ...shown.map((r) => [r.code, r.name, f(side(r.opening).dr), f(side(r.opening).cr), f(r.debit), f(r.credit), f(side(r.closing).dr), f(side(r.closing).cr)]),
      ['TOTAL', '', f(total.openDr), f(total.openCr), f(total.debit), f(total.credit), f(total.closeDr), f(total.closeCr)],
    ];
    const csv = '﻿' + out.map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `account-balances-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const restaurant = localStorage.getItem('restaurantName') || '';
    const body = shown
      .map((r) => {
        const o = side(r.opening), c = side(r.closing);
        return `<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td class="n">${cellMoney(o.dr)}</td><td class="n">${cellMoney(o.cr)}</td>
          <td class="n">${cellMoney(r.debit)}</td><td class="n">${cellMoney(r.credit)}</td><td class="n">${cellMoney(c.dr)}</td><td class="n">${cellMoney(c.cr)}</td></tr>`;
      })
      .join('');
    const w = window.open('', '_blank', 'width=1000,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Account Balances</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}
      h1{font-size:16px;margin:0} .sub{color:#555;margin:2px 0 10px}
      table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}
      th{background:#131c18;color:#fff} .n{text-align:right} tfoot td{font-weight:bold;border-top:2px solid #111}
    </style></head><body>
      <h1>${esc(restaurant)} · Account Balances</h1>
      <div class="sub">${esc(periodText)} · printed ${new Date().toLocaleString()}</div>
      <table><thead>
        <tr><th rowspan="2">Account</th><th rowspan="2">Name</th><th colspan="2" class="n">Before the period</th><th colspan="2" class="n">Period</th><th colspan="2" class="n">End of the period</th></tr>
        <tr><th class="n">Debit</th><th class="n">Credit</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Debit</th><th class="n">Credit</th></tr>
      </thead><tbody>${body}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="n">${money(total.openDr)}</td><td class="n">${money(total.openCr)}</td>
        <td class="n">${money(total.debit)}</td><td class="n">${money(total.credit)}</td><td class="n">${money(total.closeDr)}</td><td class="n">${money(total.closeCr)}</td></tr></tfoot></table>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  // ---------------------------------------------------------------- UI

  const td = 'px-3 py-1.5 text-right tabular-nums';
  const th = 'px-3 py-1.5 text-right font-semibold';

  return (
    <div className="flex h-full flex-col gap-3 bg-slate-50 p-4">
      {/* One-line header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-800">Account Balances</h1>
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

      <div className="flex flex-wrap items-center gap-3">
        <PeriodPicker from={from} to={to} onChange={setRange} />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} className="accent-[#131c18]" />
          Hide accounts with no movement
        </label>
      </div>

      {/* the key balances at the end of the period */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile label="We owe suppliers (401)" value={money(-find('401'))} sub="credit balance" tone="text-[#9a3412]" />
        <Tile label="Stock value (370)" value={money(find('370'))} sub="purchases − returns, before tax" tone="text-slate-800" />
        <Tile label="VAT to recover (4426)" value={money(find('4426'))} tone="text-slate-800" />
        <Tile label="Check" value={balanced ? 'Balanced ✓' : 'Not balanced'} sub="Σ debit = Σ credit" tone={balanced ? 'text-emerald-700' : 'text-red-600'} />
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">{error}</div>
        ) : loading && !rows.length ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10 bg-[#131c18] text-xs text-white">
              <tr>
                <th className="px-3 pt-2 text-left font-semibold" rowSpan={2}>Account</th>
                <th className="px-3 pt-2 text-center font-semibold text-[#e6cf8f]" colSpan={2}>Before the period</th>
                <th className="px-3 pt-2 text-center font-semibold text-[#e6cf8f]" colSpan={2}>Period</th>
                <th className="px-3 pt-2 text-center font-semibold text-[#e6cf8f]" colSpan={2}>End of the period</th>
              </tr>
              <tr>
                <th className={th}>Debit</th>
                <th className={th}>Credit</th>
                <th className={th}>Debit</th>
                <th className={th}>Credit</th>
                <th className={th}>Debit</th>
                <th className={th}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const o = side(r.opening), c = side(r.closing);
                return (
                  <tr
                    key={r.code}
                    onClick={() => setDrill(r.code)}
                    title="See the journal entries of this account"
                    className="cursor-pointer border-b border-slate-100 even:bg-slate-50/60 hover:bg-[#c9a24b]/10"
                  >
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-xs font-semibold text-[#8a6d2c] underline decoration-dotted underline-offset-2">{r.code}</span>{' '}
                      <span className="text-slate-700">{r.name}</span>
                      {r.entries > 0 && <span className="ml-1 text-[11px] text-slate-400">· {r.entries} entries</span>}
                    </td>
                    <td className={`${td} text-slate-500`}>{cellMoney(o.dr)}</td>
                    <td className={`${td} text-slate-500`}>{cellMoney(o.cr)}</td>
                    <td className={td}>{cellMoney(r.debit)}</td>
                    <td className={td}>{cellMoney(r.credit)}</td>
                    <td className={`${td} font-semibold text-slate-800`}>{cellMoney(c.dr)}</td>
                    <td className={`${td} font-semibold text-slate-800`}>{cellMoney(c.cr)}</td>
                  </tr>
                );
              })}
              {!shown.length && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-slate-500">No movement up to the end of this period.</td>
                </tr>
              )}
            </tbody>
            <tfoot className="sticky bottom-0 bg-white">
              <tr className="border-t-2 border-slate-300 bg-[#c9a24b]/10 font-bold text-slate-800">
                <td className="px-3 py-2">Total</td>
                <td className={td}>{money(total.openDr)}</td>
                <td className={td}>{money(total.openCr)}</td>
                <td className={td}>{money(total.debit)}</td>
                <td className={td}>{money(total.credit)}</td>
                <td className={td}>{money(total.closeDr)}</td>
                <td className={td}>{money(total.closeCr)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Debit balance = what the restaurant has (stock, VAT to recover, cash). Credit balance = what it owes (suppliers). Click an account to see its entries.
      </p>
    </div>
  );
}
