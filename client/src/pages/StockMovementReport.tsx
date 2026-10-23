// client/src/pages/StockMovementReport.tsx
//
// Reports → Inventory → Stock Movement.
// For a period (From → To):
//   - "All items": one line per raw material: opening, + in, − out, closing.
//     Click a line to see that item in a pop-up (same dates as the report).
//   - One item: its movements one by one (date, document, supplier, in / out)
//     with the running balance after each movement, and the menu dishes that use it.
// Data comes from GET /api/reports/stock-movement — the server computes the
// opening stock, the totals and the running balance; this screen only shows,
// filters, prints and exports. The one-item view is shared with the pop-up of the
// Current Stock report (components/ItemMovementView.tsx).

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileSpreadsheet, Printer, RefreshCw, Search } from 'lucide-react';
import { api } from '../api';
import ItemMovementModal from '../components/ItemMovementModal';
import {
  type DishUse,
  type ItemTotals,
  type MoveLine,
  ItemMovementTable,
  ItemMovementTiles,
  KIND_LABEL,
  PERIOD_PRESETS,
  PeriodPicker,
  UsedInMenu,
  niceDate,
  qty,
} from '../components/ItemMovementView';

export default function StockMovementReport() {
  const [[from, to], setRange] = useState<[string, string]>(PERIOD_PRESETS[0].range());
  const [itemId, setItemId] = useState<number | null>(null); // null = all items

  const [items, setItems] = useState<ItemTotals[]>([]); // all-items view
  const [item, setItem] = useState<ItemTotals | null>(null); // one-item view
  const [lines, setLines] = useState<MoveLine[]>([]);
  const [usedIn, setUsedIn] = useState<DishUse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The item whose movements are shown in the pop-up (click its line); null = closed.
  // (The item picker above still opens the item as a full page, for print / export.)
  const [popupItem, setPopupItem] = useState<ItemTotals | null>(null);

  // All-items filters
  const [search, setSearch] = useState('');
  const [movedOnly, setMovedOnly] = useState(false);

  const load = async () => {
    if (from > to) {
      setError('The "From" date must be before the "To" date.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { from, to };
      if (itemId !== null) params.rawMaterialId = itemId;
      const res = await api.get('/reports/stock-movement', { params });
      if (itemId === null) {
        setItems(res.data.items || []);
      } else {
        setItem(res.data.item);
        setLines(res.data.lines || []);
        setUsedIn(res.data.usedIn || []);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'The stock movement report could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  // Reload when the period or the chosen item changes.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, itemId]);

  // The item picker needs the list of items even when one item is open:
  // load the all-items list once in the background if we don't have it yet.
  useEffect(() => {
    if (itemId !== null && !items.length) {
      api.get('/reports/stock-movement', { params: { from, to } }).then((r) => setItems(r.data.items || [])).catch(() => { });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (it) => (!q || `${it.name} ${it.code ?? ''}`.toLowerCase().includes(q)) && (!movedOnly || it.moves > 0)
    );
  }, [items, search, movedOnly]);

  const periodText = `${niceDate(from)} → ${niceDate(to)}`;

  // ---------------------------------------------------------------- export / print

  const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const download = (name: string, rows: Array<Array<string | number>>) => {
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    if (itemId === null) {
      download(`stock-movement-${from}-to-${to}.csv`, [
        ['Code', 'Item', 'Unit', 'Opening', 'In', 'Out', 'Closing', 'Nb Transactions'],
        ...visibleItems.map((it) => [it.code ?? '', it.name.trim(), it.unit, it.opening, it.qtyIn, it.qtyOut, it.closing, it.moves]),
      ]);
    } else if (item) {
      download(`stock-movement-${(item.code || item.name).trim()}-${from}-to-${to}.csv`, [
        ['Date', 'Document', 'Type', 'Supplier', 'In', 'Out', 'Unit cost', 'Balance'],
        [from, '', 'Opening stock', '', '', '', '', item.opening],
        ...lines.map((l) => [l.date, l.doc, KIND_LABEL[l.kind] ?? l.kind, l.supplier, l.qtyIn || '', l.qtyOut || '', l.unitCost, l.balance]),
        [to, '', 'Closing stock', '', item.qtyIn, item.qtyOut, '', item.closing],
      ]);
    }
  };

  // Print only the report: a small clean page in a new window.
  const printReport = () => {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const restaurant = localStorage.getItem('restaurantName') || '';
    let title = 'Stock Movement';
    let table = '';

    if (itemId === null) {
      table = `<table><thead><tr><th>Code</th><th>Item</th><th>Unit</th><th class="n">Opening</th><th class="n">In</th>
        <th class="n">Out</th><th class="n">Closing</th></tr></thead><tbody>${visibleItems
          .map(
            (it) => `<tr><td>${esc(it.code ?? '')}</td><td>${esc(it.name)}</td><td>${esc(it.unit)}</td>
            <td class="n">${qty(it.opening)}</td><td class="n">${it.qtyIn ? '+' + qty(it.qtyIn) : ''}</td>
            <td class="n">${it.qtyOut ? '−' + qty(it.qtyOut) : ''}</td><td class="n"><b>${qty(it.closing)}</b></td></tr>`
          )
          .join('')}</tbody></table>`;
    } else if (item) {
      title = `Stock Movement · ${esc(item.name)} (${esc(item.unit)})`;
      table = `<table><thead><tr><th>Date</th><th>Document</th><th>Type</th><th>Supplier</th><th class="n">In</th>
        <th class="n">Out</th><th class="n">Balance</th></tr></thead><tbody>
        <tr class="b"><td>${niceDate(from)}</td><td></td><td>Opening stock</td><td></td><td></td><td></td><td class="n">${qty(item.opening)}</td></tr>
        ${lines
          .map(
            (l) => `<tr><td>${niceDate(l.date)}</td><td>${esc(l.doc)}</td><td>${esc(KIND_LABEL[l.kind] ?? l.kind)}</td>
            <td>${esc(l.supplier)}</td><td class="n">${l.qtyIn ? '+' + qty(l.qtyIn) : ''}</td>
            <td class="n">${l.qtyOut ? '−' + qty(l.qtyOut) : ''}</td><td class="n">${qty(l.balance)}</td></tr>`
          )
          .join('')}
        <tr class="b"><td>${niceDate(to)}</td><td></td><td>Closing stock</td><td></td><td class="n">+${qty(item.qtyIn)}</td>
        <td class="n">−${qty(item.qtyOut)}</td><td class="n">${qty(item.closing)}</td></tr></tbody></table>`;
    }

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Stock Movement</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}
      h1{font-size:16px;margin:0} .sub{color:#555;margin:2px 0 10px}
      table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}
      th{background:#131c18;color:#fff} .n{text-align:right} tr.b td{font-weight:bold;background:#f3efe4}
    </style></head><body>
      <h1>${esc(restaurant)} · ${title}</h1>
      <div class="sub">${esc(periodText)} · printed ${new Date().toLocaleString()}</div>
      ${table}
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  // ---------------------------------------------------------------- UI

  const canExport = itemId === null ? visibleItems.length > 0 : !!item;

  return (
    <div className="flex h-full flex-col gap-3 bg-slate-50 p-4">
      {/* One-line header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {itemId !== null && (
            <button
              onClick={() => setItemId(null)}
              className="flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 hover:bg-slate-100"
              title="Back to all items"
            >
              <ArrowLeft className="h-4 w-4" /> All items
            </button>
          )}
          <h1 className="text-lg font-bold text-slate-800">
            Stock Movement
            {itemId !== null && item && (
              <span className="font-semibold text-[#8a6d2c]"> · {item.name} ({item.unit})</span>
            )}
          </h1>
        </div>
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
            disabled={!canExport}
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            onClick={exportExcel}
            disabled={!canExport}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[#131c18] px-3 text-sm font-medium text-white hover:bg-[#1f2d26] disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#c9a24b]" /> Export to Excel
          </button>
        </div>
      </div>

      {/* Period + item on one line */}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker from={from} to={to} onChange={setRange} />

        <select
          value={itemId ?? ''}
          onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : null)}
          className="h-9 max-w-xs rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-[#c9a24b]"
        >
          <option value="">All items</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name.trim()}
              {it.code ? ` (${it.code})` : ''}
            </option>
          ))}
        </select>

        {itemId === null && (
          <>
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search item or code…"
                className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-2 text-sm outline-none focus:border-[#c9a24b]"
              />
            </div>
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={movedOnly}
                onChange={(e) => setMovedOnly(e.target.checked)}
                className="accent-[#c9a24b]"
              />
              Transactions only
            </label>
          </>
        )}
      </div>

      {/* One item: 4 numbers that tell the story of the period */}
      {itemId !== null && item && <ItemMovementTiles item={item} from={from} to={to} />}

      {/* Table (+ "Used in the menu" on the right for one item) */}
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {error ? (
            <div className="p-6 text-center text-sm text-red-600">{error}</div>
          ) : loading && (itemId === null ? !items.length : !item) ? (
            <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
          ) : itemId === null ? (
            /* ---------------- All items ---------------- */
            !visibleItems.length ? (
              <div className="p-6 text-center text-sm text-slate-500">
                {items.length ? 'No item matches these filters.' : 'No raw materials yet.'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#131c18] text-xs text-white">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Code</th>
                    <th className="px-3 py-2 text-left font-semibold">Item</th>
                    <th className="px-3 py-2 text-left font-semibold">Unit</th>
                    <th className="px-3 py-2 text-right font-semibold">Opening</th>
                    <th className="px-3 py-2 text-right font-semibold">In</th>
                    <th className="px-3 py-2 text-right font-semibold">Out</th>
                    <th className="px-3 py-2 text-right font-semibold">Closing</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-semibold" title="How many purchases, returns and sales changed this item's stock in the period">Nb Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((it) => (
                    <tr
                      key={it.id}
                      onClick={() => setPopupItem(it)}
                      title="Open the movements of this item"
                      className="cursor-pointer border-b border-slate-100 even:bg-slate-50/60 hover:bg-[#c9a24b]/10"
                    >
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{it.code || '—'}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-800">{it.name}</td>
                      <td className="px-3 py-1.5 text-slate-600">{it.unit}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{qty(it.opening)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{it.qtyIn ? `+${qty(it.qtyIn)}` : ''}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-red-600">{it.qtyOut ? `−${qty(it.qtyOut)}` : ''}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-800">{qty(it.closing)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{it.moves || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            /* ---------------- One item ---------------- */
            item && <ItemMovementTable item={item} lines={lines} from={from} to={to} />
          )}
        </div>

        {itemId !== null && item && !error && (
          <div className="hidden w-72 shrink-0 overflow-auto lg:block">
            <UsedInMenu dishes={usedIn} unit={item.unit} />
          </div>
        )}
      </div>

      {popupItem && (
        <ItemMovementModal
          rawMaterialId={popupItem.id}
          title={popupItem.name}
          initialRange={[from, to]}
          onClose={() => setPopupItem(null)}
        />
      )}

      <p className="text-[11px] text-slate-500">
        Only posted purchases, returns and POS sales (inventory-tracked dishes) move stock. Opening stock = today's stock minus everything that moved since
        the "From" date, so it always agrees with the Current Stock report.
      </p>
    </div>
  );
}
