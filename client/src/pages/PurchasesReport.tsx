// client/src/pages/PurchasesReport.tsx
//
// Reports → Inventory → Purchases by Supplier.
// For a period (From → To): one line per supplier with its purchases, returns and
// net, each before tax and with tax (agreed 2026-10-24: show both). Biggest supplier
// first, % of the total, date of the last purchase.
// Click a supplier → pop-up with its Documents and the Items bought (two tabs).
// Data: GET /api/reports/purchases — only POSTED purchases (GRN) and returns (RP).

import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Printer, RefreshCw } from 'lucide-react';
import Select from 'react-select';
import { api } from '../api';
import { PERIOD_PRESETS, PeriodPicker, niceDate } from '../components/ItemMovementView';
import SupplierPurchasesModal, { money } from '../components/SupplierPurchasesModal';

interface SupplierLine {
  supplier: string;
  nbPurchases: number;
  nbReturns: number;
  purchasesBeforeTax: number;
  purchasesNet: number;
  returnsBeforeTax: number;
  returnsNet: number;
  netBeforeTax: number;
  netWithTax: number;
  lastPurchase: string | null;
}

// A supplier card (GET /api/suppliers, table "supplier").
interface SupplierCard {
  supplierId: number;
  supplierCode: string | null;
  supplierName: string;
}

// A purchase saves its supplier as the text "CODE - Name" (see the purchase screen).
// A report line belongs to a supplier card when its text is that card's
// "CODE - Name", or starts with its code (so a later rename of the name still matches).
const cardText = (c: SupplierCard) => (c.supplierCode ? `${c.supplierCode} - ${c.supplierName}` : c.supplierName);
const lineIsCard = (line: string, c: SupplierCard) =>
  line === cardText(c) || (!!c.supplierCode && line.startsWith(`${c.supplierCode} - `)) || line === c.supplierName;

export default function PurchasesReport() {
  const [[from, to], setRange] = useState<[string, string]>(PERIOD_PRESETS[0].range());
  const [rows, setRows] = useState<SupplierLine[]>([]);
  // The supplier picker lists the restaurant's supplier cards (not only the ones
  // with purchases in the period). '' = all suppliers.
  const [suppliers, setSuppliers] = useState<SupplierCard[]>([]);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [popupSupplier, setPopupSupplier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (from > to) {
      setError('The "From" date must be before the "To" date.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/reports/purchases', { params: { from, to } });
      setRows(res.data.suppliers || []);
    } catch (err: any) {
      setError(
        err?.response?.status === 404
          ? 'The server does not know this report yet: it is running an old version. Restart the API server (npm run dev).'
          : err?.response?.data?.error || 'The purchases report could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Supplier cards, once.
  useEffect(() => {
    api
      .get('/suppliers')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.suppliers || [];
        setSuppliers(
          [...list].sort((a: SupplierCard, b: SupplierCard) => cardText(a).localeCompare(cardText(b), undefined, { numeric: true }))
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const chosenCard = suppliers.find((c) => String(c.supplierId) === supplierFilter) || null;
  const visible = useMemo(
    () => (chosenCard ? rows.filter((r) => lineIsCard(r.supplier, chosenCard)) : rows),
    [rows, chosenCard]
  );

  // Totals of what is shown (all suppliers, or the chosen one).
  const total = useMemo(() => {
    const sum = (k: keyof SupplierLine) => visible.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    return {
      nbPurchases: sum('nbPurchases'),
      nbReturns: sum('nbReturns'),
      purchasesBeforeTax: sum('purchasesBeforeTax'),
      purchasesNet: sum('purchasesNet'),
      returnsBeforeTax: sum('returnsBeforeTax'),
      returnsNet: sum('returnsNet'),
      netBeforeTax: sum('netBeforeTax'),
      netWithTax: sum('netWithTax'),
    };
  }, [visible]);

  // % of the total net purchases (with tax) of ALL suppliers in the period.
  const allNet = rows.reduce((s, r) => s + r.netWithTax, 0);
  const share = (r: SupplierLine) => (allNet ? `${Math.round((r.netWithTax / allNet) * 100)}%` : '—');

  const periodText = `${niceDate(from)} → ${niceDate(to)}`;

  // ---------------------------------------------------------------- export / print

  const header = [
    'Supplier', 'Nb purchases', 'Nb returns',
    'Purchases before tax', 'Purchases with tax', 'Returns before tax', 'Returns with tax',
    'Net before tax', 'Net with tax', '% of total', 'Last purchase',
  ];
  const line = (r: SupplierLine) => [
    r.supplier, r.nbPurchases, r.nbReturns,
    r.purchasesBeforeTax.toFixed(2), r.purchasesNet.toFixed(2), r.returnsBeforeTax.toFixed(2), r.returnsNet.toFixed(2),
    r.netBeforeTax.toFixed(2), r.netWithTax.toFixed(2), share(r), r.lastPurchase ? niceDate(r.lastPurchase) : '',
  ];

  const exportExcel = () => {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rowsOut = [
      header,
      ...visible.map(line),
      ['TOTAL', total.nbPurchases, total.nbReturns,
        total.purchasesBeforeTax.toFixed(2), total.purchasesNet.toFixed(2), total.returnsBeforeTax.toFixed(2), total.returnsNet.toFixed(2),
        total.netBeforeTax.toFixed(2), total.netWithTax.toFixed(2), '', ''],
    ];
    const csv = '﻿' + rowsOut.map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchases-by-supplier-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const restaurant = localStorage.getItem('restaurantName') || '';
    const body = visible
      .map(
        (r) => `<tr><td>${esc(r.supplier)}</td><td class="n">${r.nbPurchases}</td><td class="n">${r.nbReturns || ''}</td>
          <td class="n">${money(r.purchasesBeforeTax)}</td><td class="n">${money(r.purchasesNet)}</td>
          <td class="n">${r.returnsNet ? '−' + money(r.returnsBeforeTax) : ''}</td><td class="n">${r.returnsNet ? '−' + money(r.returnsNet) : ''}</td>
          <td class="n">${money(r.netBeforeTax)}</td><td class="n"><b>${money(r.netWithTax)}</b></td><td class="n">${share(r)}</td></tr>`
      )
      .join('');
    const w = window.open('', '_blank', 'width=1000,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Purchases by Supplier</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}
      h1{font-size:16px;margin:0} .sub{color:#555;margin:2px 0 10px}
      table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}
      th{background:#131c18;color:#fff} .n{text-align:right} tfoot td{font-weight:bold;border-top:2px solid #111}
    </style></head><body>
      <h1>${esc(restaurant)} · Purchases by Supplier</h1>
      <div class="sub">${esc(periodText)} · printed ${new Date().toLocaleString()}</div>
      <table><thead><tr><th>Supplier</th><th class="n">Purch.</th><th class="n">Ret.</th>
        <th class="n">Purchases excl. tax</th><th class="n">Purchases incl. tax</th>
        <th class="n">Returns excl. tax</th><th class="n">Returns incl. tax</th>
        <th class="n">Net excl. tax</th><th class="n">Net incl. tax</th><th class="n">%</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td>Total</td><td class="n">${total.nbPurchases}</td><td class="n">${total.nbReturns}</td>
        <td class="n">${money(total.purchasesBeforeTax)}</td><td class="n">${money(total.purchasesNet)}</td>
        <td class="n">−${money(total.returnsBeforeTax)}</td><td class="n">−${money(total.returnsNet)}</td>
        <td class="n">${money(total.netBeforeTax)}</td><td class="n">${money(total.netWithTax)}</td><td></td></tr></tfoot></table>
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

  const th = 'px-3 py-1.5 font-semibold whitespace-nowrap';
  const td = 'px-3 py-1.5 text-right tabular-nums';

  return (
    <div className="flex h-full flex-col gap-3 bg-slate-50 p-4">
      {/* One-line header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-800">Purchases by Supplier</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            title="Refresh"
            className="flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={printReport}
            disabled={!visible.length}
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            onClick={exportExcel}
            disabled={!visible.length}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[#131c18] px-3 text-sm font-medium text-white hover:bg-[#1f2d26] disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#c9a24b]" /> Export to Excel
          </button>
        </div>
      </div>

      {/* Period + supplier on one line */}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker from={from} to={to} onChange={setRange} />
        {/* Searchable: type part of the code or the name (e.g. "101" or "meat"). Empty = all suppliers. */}
        <div className="w-80">
          <Select
            isClearable
            isSearchable
            placeholder="All suppliers · type to search…"
            noOptionsMessage={() => 'No supplier found'}
            value={chosenCard ? { value: String(chosenCard.supplierId), label: cardText(chosenCard) } : null}
            onChange={(opt: any) => setSupplierFilter(opt ? opt.value : '')}
            options={suppliers.map((c) => ({ value: String(c.supplierId), label: cardText(c) }))}
            styles={{
              control: (base, state) => ({
                ...base,
                minHeight: 36,
                fontSize: 14,
                borderColor: state.isFocused ? '#c9a24b' : '#cbd5e1',
                boxShadow: 'none',
                '&:hover': { borderColor: '#c9a24b' },
              }),
              option: (base, state) => ({
                ...base,
                fontSize: 14,
                backgroundColor: state.isSelected ? '#131c18' : state.isFocused ? 'rgba(201,162,75,0.15)' : 'white',
                color: state.isSelected ? 'white' : '#1e293b',
              }),
              menu: (base) => ({ ...base, zIndex: 30 }),
            }}
          />
        </div>
      </div>

      {/* 4 numbers of the period (with tax; before tax underneath) */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile label="Purchases" value={money(total.purchasesNet)} sub={`before tax ${money(total.purchasesBeforeTax)}`} tone="text-emerald-700" />
        <Tile label="Returns" value={total.returnsNet ? `−${money(total.returnsNet)}` : money(0)} sub={`before tax ${money(total.returnsBeforeTax)}`} tone="text-red-600" />
        <Tile label="Net purchases" value={money(total.netWithTax)} sub={`before tax ${money(total.netBeforeTax)}`} tone="text-[#8a6d2c]" />
        <Tile label="Documents" value={String(total.nbPurchases + total.nbReturns)} sub={`${total.nbPurchases} purchases · ${total.nbReturns} returns`} tone="text-slate-800" />
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">{error}</div>
        ) : loading && !rows.length ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
        ) : !visible.length ? (
          <div className="p-6 text-center text-sm text-slate-500">
            {chosenCard ? `No purchase from ${cardText(chosenCard)} in this period.` : 'No purchase in this period.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#131c18] text-xs text-white">
              <tr>
                <th className={`${th} text-left`} rowSpan={2}>Supplier</th>
                <th className={`${th} text-right`} rowSpan={2} title="Number of purchases (GRN)">Nb purch.</th>
                <th className={`${th} text-right`} rowSpan={2} title="Number of returns (RP)">Nb ret.</th>
                <th className={`${th} border-l border-white/10 text-center`} colSpan={2}>Purchases</th>
                <th className={`${th} border-l border-white/10 text-center`} colSpan={2}>Returns</th>
                <th className={`${th} border-l border-white/10 text-center text-[#c9a24b]`} colSpan={2}>Net</th>
                <th className={`${th} border-l border-white/10 text-right`} rowSpan={2} title="Share of the net purchases (with tax)">%</th>
                <th className={`${th} text-right`} rowSpan={2}>Last purchase</th>
              </tr>
              <tr className="text-[11px] font-normal text-slate-300">
                <th className={`${th} border-l border-white/10 text-right font-normal`}>before tax</th>
                <th className={`${th} text-right font-normal`}>with tax</th>
                <th className={`${th} border-l border-white/10 text-right font-normal`}>before tax</th>
                <th className={`${th} text-right font-normal`}>with tax</th>
                <th className={`${th} border-l border-white/10 text-right font-normal`}>before tax</th>
                <th className={`${th} text-right font-normal`}>with tax</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.supplier}
                  onClick={() => setPopupSupplier(r.supplier)}
                  title="See the documents and items of this supplier"
                  className="cursor-pointer border-b border-slate-100 even:bg-slate-50/60 hover:bg-[#c9a24b]/10"
                >
                  <td className="px-3 py-1.5 font-medium text-[#8a6d2c] underline decoration-dotted underline-offset-2">{r.supplier}</td>
                  <td className={`${td} text-slate-600`}>{r.nbPurchases}</td>
                  <td className={`${td} text-slate-600`}>{r.nbReturns || '—'}</td>
                  <td className={`${td} border-l border-slate-100 text-slate-600`}>{money(r.purchasesBeforeTax)}</td>
                  <td className={`${td} text-slate-800`}>{money(r.purchasesNet)}</td>
                  <td className={`${td} border-l border-slate-100 text-red-600`}>{r.returnsNet ? `−${money(r.returnsBeforeTax)}` : '—'}</td>
                  <td className={`${td} text-red-600`}>{r.returnsNet ? `−${money(r.returnsNet)}` : '—'}</td>
                  <td className={`${td} border-l border-slate-100 text-slate-600`}>{money(r.netBeforeTax)}</td>
                  <td className={`${td} font-bold text-slate-800`}>{money(r.netWithTax)}</td>
                  <td className={`${td} border-l border-slate-100 text-slate-500`}>{share(r)}</td>
                  <td className={`${td} whitespace-nowrap text-slate-500`}>{r.lastPurchase ? niceDate(r.lastPurchase) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-white">
              <tr className="border-t-2 border-slate-300 bg-[#c9a24b]/10 font-bold text-slate-800">
                <td className="px-3 py-2">Total ({visible.length} suppliers)</td>
                <td className={td}>{total.nbPurchases}</td>
                <td className={td}>{total.nbReturns}</td>
                <td className={`${td} border-l border-slate-200`}>{money(total.purchasesBeforeTax)}</td>
                <td className={td}>{money(total.purchasesNet)}</td>
                <td className={`${td} border-l border-slate-200 text-red-600`}>−{money(total.returnsBeforeTax)}</td>
                <td className={`${td} text-red-600`}>−{money(total.returnsNet)}</td>
                <td className={`${td} border-l border-slate-200`}>{money(total.netBeforeTax)}</td>
                <td className={td}>{money(total.netWithTax)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Only posted purchases (GRN) and returns (RP) count; returns are subtracted. Click a supplier to see its documents
        and the items bought.
      </p>

      {popupSupplier && (
        <SupplierPurchasesModal
          supplier={popupSupplier}
          initialRange={[from, to]}
          onClose={() => setPopupSupplier(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
