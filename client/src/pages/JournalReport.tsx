// client/src/pages/JournalReport.tsx
//
// Reports → Financial → Journal (JV) (asked 2026-10-27, "classic journal" layout chosen):
// every journal entry of a period as a block — its header (JV no., date, document,
// description) and its lines (account, supplier, debit, credit) — like a journal book.
//   - Filters: type, account, supplier, search (JV no., GRN / PAY no., text).
//   - Totals: entries, Σ debit, Σ credit and the check that they are equal.
//   - Click a GRN / RP → the purchase opens; click a PAY → the supplier's account.
//   - Print and Export to Excel (CSV, one row per line).
// Data: GET /api/reports/journal?from=&to=&type=&account=&supplierId=&q=

import { useEffect, useState } from 'react';
import { ArrowLeft, FileSpreadsheet, Printer, RefreshCw, Search } from 'lucide-react';
import { api } from '../api';
import { PERIOD_PRESETS, PeriodPicker, niceDate } from '../components/ItemMovementView';
import { money } from '../lib/restaurantSettings';
import { Tile } from './ZReportPage';
import PurchaseTransactionEditModal from './PurchaseTransactionEditModal';
import SupplierAccount from '../components/SupplierAccount';

type SourceType = 'PURCHASE' | 'RETURN' | 'SUPPLIER_PAYMENT' | 'VOID' | 'OPENING';
interface Line {
  lineNo: number;
  account: string;
  accountName: string;
  supplierId: number | null;
  supplierName: string | null;
  debit: number;
  credit: number;
}
interface Entry {
  entryId: number;
  entryNo: string;
  date: string;
  sourceType: SourceType;
  sourceId: number | null;
  documentNo: string | null;
  description: string | null;
  createdBy: string;
  lines: Line[];
}
interface Journal {
  entries: Entry[];
  totals: { entries: number; debit: number; credit: number };
  accounts: Array<{ code: string; name: string }>;
  suppliers: Array<{ id: number; name: string }>;
}

export const TYPE_LABEL: Record<SourceType, string> = {
  PURCHASE: 'Purchase',
  RETURN: 'Purchase return',
  SUPPLIER_PAYMENT: 'Supplier payment',
  VOID: 'Void',
  OPENING: 'Opening balance',
};

// 0 → empty cell (a line is a debit OR a credit)
const cellMoney = (v: number) => (v ? money(v) : '');
const lineLabel = (l: Line) => `${l.account} ${l.accountName}${l.supplierName ? ` · ${l.supplierName}` : ''}`;

export default function JournalReport({
  initialAccount = '',
  initialRange,
  onBack,
}: {
  initialAccount?: string; // opened from Account Balances: already filtered on that account
  initialRange?: [string, string];
  onBack?: () => void;
}) {
  const [[from, to], setRange] = useState<[string, string]>(initialRange ?? PERIOD_PRESETS[0].range());
  const [type, setType] = useState('');
  const [account, setAccount] = useState(initialAccount);
  const [supplierId, setSupplierId] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<Journal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<{ id: number; kind: 'PUR' | 'RP' } | null>(null);
  const [accountOf, setAccountOf] = useState<number | null>(null);

  const load = async () => {
    if (from > to) {
      setError('The "From" date must be before the "To" date.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/reports/journal', {
        params: { from, to, type: type || undefined, account: account || undefined, supplierId: supplierId || undefined, q: search.trim() || undefined },
      });
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'The journal could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  // reload when the period or a filter changes; the search waits until typing stops
  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, type, account, supplierId, search]);

  const entries = data?.entries ?? [];
  const totals = data?.totals ?? { entries: 0, debit: 0, credit: 0 };
  const balanced = Math.round(totals.debit * 100) === Math.round(totals.credit * 100);
  const periodText = `${niceDate(from)} → ${niceDate(to)}`;

  // A document number: purchases / returns open their screen, payments the supplier's account.
  const openSource = (e: Entry) => {
    if ((e.sourceType === 'PURCHASE' || e.sourceType === 'RETURN') && e.sourceId) {
      setOpenDoc({ id: e.sourceId, kind: e.sourceType === 'RETURN' ? 'RP' : 'PUR' });
      return;
    }
    const supplier = e.lines.find((l) => l.supplierId)?.supplierId;
    if (supplier) setAccountOf(supplier);
  };

  // ---------------------------------------------------------------- export / print

  const exportExcel = () => {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const out: Array<Array<string | number>> = [['JV', 'Date', 'Type', 'Document', 'Description', 'Account', 'Account name', 'Supplier', 'Debit', 'Credit']];
    for (const e of entries) {
      for (const l of e.lines) {
        out.push([
          e.entryNo, niceDate(e.date), TYPE_LABEL[e.sourceType], e.documentNo ?? '', e.description ?? '',
          l.account, l.accountName, l.supplierName ?? '', l.debit ? l.debit.toFixed(2) : '', l.credit ? l.credit.toFixed(2) : '',
        ]);
      }
    }
    out.push(['TOTAL', '', '', '', `${totals.entries} entries`, '', '', '', totals.debit.toFixed(2), totals.credit.toFixed(2)]);
    const csv = '﻿' + out.map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const restaurant = localStorage.getItem('restaurantName') || '';
    const body = entries
      .map(
        (e) =>
          `<tr class="h"><td>${esc(e.entryNo)}</td><td>${esc(niceDate(e.date))}</td><td>${esc(e.documentNo ?? '')}</td>
            <td colspan="3">${esc(e.description ?? TYPE_LABEL[e.sourceType])}</td></tr>` +
          e.lines
            .map(
              (l) => `<tr><td></td><td></td><td></td><td class="${l.credit ? 'cr' : ''}">${esc(lineLabel(l))}</td>
                <td class="n">${cellMoney(l.debit)}</td><td class="n">${cellMoney(l.credit)}</td></tr>`
            )
            .join('')
      )
      .join('');
    const filters = [
      type && TYPE_LABEL[type as SourceType],
      account && `account ${account}`,
      supplierId && data?.suppliers.find((s) => String(s.id) === supplierId)?.name,
      search.trim() && `"${search.trim()}"`,
    ].filter(Boolean);
    const w = window.open('', '_blank', 'width=1000,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Journal</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}
      h1{font-size:16px;margin:0} .sub{color:#555;margin:2px 0 10px}
      table{width:100%;border-collapse:collapse} td,th{padding:3px 6px;text-align:left}
      th{background:#131c18;color:#fff} .n{text-align:right;white-space:nowrap} .cr{padding-left:28px}
      tr.h td{border-top:1px solid #bbb;font-weight:bold;background:#f6f3ea}
      tfoot td{font-weight:bold;border-top:2px solid #111}
    </style></head><body>
      <h1>${esc(restaurant)} · Journal (JV)</h1>
      <div class="sub">${esc(periodText)} · ${totals.entries} entries${filters.length ? ' · ' + esc(filters.join(' · ')) : ''} · printed ${new Date().toLocaleString()}</div>
      <table><thead><tr><th>JV</th><th>Date</th><th>Document</th><th>Account / description</th><th class="n">Debit</th><th class="n">Credit</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="4">Total</td><td class="n">${money(totals.debit)}</td><td class="n">${money(totals.credit)}</td></tr></tfoot></table>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  // ---------------------------------------------------------------- UI

  // A supplier's account opened from a PAY number: it replaces the report, ← comes back.
  if (accountOf !== null) {
    return (
      <SupplierAccount
        supplierId={accountOf}
        onBack={() => {
          setAccountOf(null);
          load();
        }}
      />
    );
  }

  const select = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 outline-none focus:border-[#c9a24b]';
  const td = 'px-3 py-1 tabular-nums';

  return (
    <div className="flex h-full flex-col gap-3 bg-slate-50 p-4">
      {/* One-line header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} title="Back" className="rounded-md p-1 text-slate-500 hover:bg-slate-200">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-lg font-bold text-slate-800">Journal (JV)</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} title="Refresh" className="flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={printReport}
            disabled={!entries.length}
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            onClick={exportExcel}
            disabled={!entries.length}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[#131c18] px-3 text-sm font-medium text-white hover:bg-[#1f2d26] disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#c9a24b]" /> Export to Excel
          </button>
        </div>
      </div>

      {/* period + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker from={from} to={to} onChange={setRange} />
        <select value={type} onChange={(e) => setType(e.target.value)} className={select} aria-label="Type">
          <option value="">All types</option>
          {(Object.keys(TYPE_LABEL) as SourceType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        <select value={account} onChange={(e) => setAccount(e.target.value)} className={select} aria-label="Account">
          <option value="">All accounts</option>
          {(data?.accounts ?? []).map((a) => (
            <option key={a.code} value={a.code}>{a.code} {a.name}</option>
          ))}
        </select>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={select} aria-label="Supplier">
          <option value="">All suppliers</option>
          {(data?.suppliers ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="JV, GRN, PAY or text…"
            className={`${select} w-52 pl-8`}
          />
        </div>
      </div>

      {/* the numbers of the period */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile label="Entries" value={String(totals.entries)} sub={periodText} tone="text-slate-800" />
        <Tile label="Total debit" value={money(totals.debit)} tone="text-slate-800" />
        <Tile label="Total credit" value={money(totals.credit)} tone="text-slate-800" />
        <Tile
          label="Check"
          value={balanced ? 'Balanced ✓' : 'Not balanced'}
          sub="Σ debit = Σ credit"
          tone={balanced ? 'text-emerald-700' : 'text-red-600'}
        />
      </div>

      {/* the journal book */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">{error}</div>
        ) : loading && !entries.length ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
        ) : !entries.length ? (
          <div className="p-6 text-center text-sm text-slate-500">No journal entry in this period.</div>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10 bg-[#131c18] text-xs text-white">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">JV</th>
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Document</th>
                <th className="px-3 py-2 text-left font-semibold">Account / description</th>
                <th className="px-3 py-2 text-right font-semibold">Debit</th>
                <th className="px-3 py-2 text-right font-semibold">Credit</th>
              </tr>
            </thead>
            {entries.map((e) => (
              // one <tbody> per entry: the header row + its lines stay together
              <tbody key={e.entryId} className="border-b border-slate-200">
                <tr className={e.sourceType === 'VOID' ? 'bg-red-50/60' : 'bg-[#faf7ef]'}>
                  <td className={`${td} pt-1.5 font-mono text-xs font-bold text-slate-800`}>{e.entryNo}</td>
                  <td className={`${td} pt-1.5 text-slate-600`}>{niceDate(e.date)}</td>
                  <td className={`${td} pt-1.5`}>
                    {e.documentNo ? (
                      <button onClick={() => openSource(e)} className="font-mono text-xs font-semibold text-[#8a6d2c] underline decoration-dotted underline-offset-2">
                        {e.documentNo}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={`${td} pt-1.5 font-semibold text-slate-700`} colSpan={3}>
                    <span className="mr-2 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                      {TYPE_LABEL[e.sourceType]}
                    </span>
                    {e.description}
                    {e.createdBy && <span className="ml-2 text-[11px] font-normal text-slate-400">by {e.createdBy}</span>}
                  </td>
                </tr>
                {e.lines.map((l) => (
                  <tr key={l.lineNo}>
                    <td colSpan={3} />
                    {/* credits are indented, like in a journal book */}
                    <td className={`${td} ${l.credit ? 'pl-10 text-slate-600' : 'text-slate-800'}`}>{lineLabel(l)}</td>
                    <td className={`${td} text-right`}>{cellMoney(l.debit)}</td>
                    <td className={`${td} text-right`}>{cellMoney(l.credit)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot className="sticky bottom-0 bg-white">
              <tr className="border-t-2 border-slate-300 bg-[#c9a24b]/10 font-bold text-slate-800">
                <td className="px-3 py-2" colSpan={4}>Total ({totals.entries} entries)</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.debit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.credit)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Every purchase, return and supplier payment writes one balanced entry. Filters keep whole entries. Click a document number to open it.
      </p>

      {openDoc && (
        <PurchaseTransactionEditModal transactionId={openDoc.id} kind={openDoc.kind} onClose={() => setOpenDoc(null)} onSaved={load} />
      )}
    </div>
  );
}
