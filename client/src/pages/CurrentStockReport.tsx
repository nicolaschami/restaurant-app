// client/src/pages/CurrentStockReport.tsx
//
// Reports → Inventory → Current Stock.
// Shows every raw material with its quantity in stock today, its value and a
// status (OK / Low / Out). Data comes from GET /api/reports/current-stock — the
// server works out the value and the status, this screen only filters, sorts,
// prints and exports.
//
// Layout (compact, one screen): a slim row of 4 numbers, one line of filters,
// then the table with a total line at the bottom.

import { useEffect, useMemo, useState } from 'react';
import {
  PackageCheck,
  DollarSign,
  AlertTriangle,
  XCircle,
  Search,
  Printer,
  FileSpreadsheet,
  RefreshCw,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { api } from '../api';
import ItemMovementModal from '../components/ItemMovementModal';

type StockStatus = 'OK' | 'LOW' | 'OUT';

interface StockRow {
  id: number;
  code: string | null;
  name: string;
  unit: string;
  warehouse: string;
  inStock: number;
  minQty: number;
  maxQty: number;
  price: number;
  priceFromCard: boolean; // never purchased → price is the card's cost price
  value: number;
  status: StockStatus;
}

type SortKey = 'code' | 'name' | 'warehouse' | 'inStock' | 'minQty' | 'price' | 'value' | 'status';

// How each status looks (badge colors) and its sort order (problems first).
const STATUS_INFO: Record<StockStatus, { label: string; badge: string; order: number }> = {
  OUT: { label: 'Out', badge: 'bg-red-50 text-red-700 border-red-200', order: 0 },
  LOW: { label: 'Low', badge: 'bg-amber-50 text-amber-700 border-amber-200', order: 1 },
  OK: { label: 'OK', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', order: 2 },
};

const money = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Unit prices can have 3 decimals (e.g. $0.495 per kg): keep them, don't round to $0.50.
const unitPrice = (v: number) =>
  `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;

// Quantities: up to 3 decimals, but no useless zeros (22, 4.5, 0.125).
const qty = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 3 });

export default function CurrentStockReport() {
  const [rows, setRows] = useState<StockRow[]>([]);
  // The item whose movements are shown in the pop-up (click its code); null = closed.
  const [detailItem, setDetailItem] = useState<StockRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [warehouse, setWarehouse] = useState(''); // '' = all warehouses
  const [lowOnly, setLowOnly] = useState(false); // Low + Out only

  // Sorting: click a column header; click again to reverse.
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/reports/current-stock');
      setRows(res.data.items || []);
      setGeneratedAt(new Date(res.data.generatedAt || Date.now()));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'The stock report could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // The warehouse picker lists only the warehouses that really exist in the data.
  const warehouses = useMemo(
    () => Array.from(new Set(rows.map((r) => r.warehouse).filter(Boolean))).sort(),
    [rows]
  );

  // Rows after filters and sorting — what the table, the totals, print and export use.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q && !`${r.name} ${r.code ?? ''}`.toLowerCase().includes(q)) return false;
      if (warehouse && r.warehouse !== warehouse) return false;
      if (lowOnly && r.status === 'OK') return false;
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'status') return (STATUS_INFO[a.status].order - STATUS_INFO[b.status].order) * dir;
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [rows, search, warehouse, lowOnly, sortKey, sortDir]);

  // The 4 numbers at the top always describe the WHOLE stock (not the filter),
  // so the manager sees the real situation at a glance.
  const summary = useMemo(
    () => ({
      items: rows.length,
      value: rows.reduce((s, r) => s + r.value, 0),
      low: rows.filter((r) => r.status === 'LOW').length,
      out: rows.filter((r) => r.status === 'OUT').length,
    }),
    [rows]
  );

  const visibleValue = visible.reduce((s, r) => s + r.value, 0);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      // Numbers usually read best biggest-first; text A→Z.
      setSortDir(['inStock', 'minQty', 'price', 'value'].includes(key) ? 'desc' : 'asc');
    }
  };

  // ---------------------------------------------------------------- export / print

  // Excel opens CSV files directly. The BOM (﻿) makes Excel read accents correctly.
  const exportExcel = () => {
    const header = ['Code', 'Item', 'Warehouse', 'Unit', 'In stock', 'Min', 'Max', 'Last price', 'Value', 'Status'];
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = visible.map((r) =>
      [r.code ?? '', r.name.trim(), r.warehouse, r.unit, r.inStock, r.minQty, r.maxQty, r.price, r.value, STATUS_INFO[r.status].label]
        .map(cell)
        .join(',')
    );
    lines.push(['', 'TOTAL', '', '', '', '', '', '', visibleValue.toFixed(2), ''].map(cell).join(','));
    const csv = '﻿' + [header.map(cell).join(','), ...lines].join('\r\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `current-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print only the report (not the sidebar): build a small clean page in a new
  // window and open the browser's print dialog on it.
  const printReport = () => {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const body = visible
      .map(
        (r) => `<tr>
          <td>${esc(r.code ?? '')}</td><td>${esc(r.name)}</td><td>${esc(r.warehouse)}</td><td>${esc(r.unit)}</td>
          <td class="n">${qty(r.inStock)}</td><td class="n">${qty(r.minQty)}</td>
          <td class="n">${unitPrice(r.price)}</td><td class="n">${money(r.value)}</td>
          <td>${STATUS_INFO[r.status].label}</td></tr>`
      )
      .join('');
    const restaurant = localStorage.getItem('restaurantName') || '';
    const filters = [warehouse && `Warehouse: ${warehouse}`, lowOnly && 'Low stock only', search && `Search: "${search}"`]
      .filter(Boolean)
      .join(' · ');

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Current Stock</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}
      h1{font-size:16px;margin:0} .sub{color:#555;margin:2px 0 10px}
      table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}
      th{background:#131c18;color:#fff} .n{text-align:right} tfoot td{font-weight:bold;border-top:2px solid #111}
    </style></head><body>
      <h1>${esc(restaurant)} · Current Stock</h1>
      <div class="sub">${new Date().toLocaleString()}${filters ? ' · ' + esc(filters) : ''} · ${visible.length} items</div>
      <table><thead><tr><th>Code</th><th>Item</th><th>Warehouse</th><th>Unit</th><th class="n">In stock</th>
      <th class="n">Min</th><th class="n">Last price</th><th class="n">Value</th><th>Status</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="7">Total</td><td class="n">${money(visibleValue)}</td><td></td></tr></tfoot></table>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  // ---------------------------------------------------------------- UI pieces

  const SortHead = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-3 py-2 font-semibold cursor-pointer select-none whitespace-nowrap hover:text-[#c9a24b] ${right ? 'text-right' : 'text-left'}`}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sortKey === k && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </span>
    </th>
  );

  const Tile = ({
    icon: Icon,
    label,
    value,
    tone,
    onClick,
  }: {
    icon: typeof PackageCheck;
    label: string;
    value: string | number;
    tone: string;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm ${onClick ? 'hover:border-[#c9a24b] cursor-pointer' : 'cursor-default'}`}
    >
      <span className={`flex h-8 w-8 items-center justify-center rounded-md ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
        <span className="block text-lg font-bold leading-tight text-slate-800">{value}</span>
      </span>
    </button>
  );

  return (
    <div className="flex h-full flex-col gap-3 bg-slate-50 p-4">
      {/* One-line header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold text-slate-800">Current Stock</h1>
          {generatedAt && (
            <span className="text-xs text-slate-500">as of {generatedAt.toLocaleString()}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            title="Refresh"
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100"
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

      {/* Slim row of 4 numbers. Low / Out tiles are shortcuts to the "Low stock only" filter. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile icon={PackageCheck} label="Items" value={summary.items} tone="bg-slate-100 text-slate-600" />
        <Tile icon={DollarSign} label="Stock value" value={money(summary.value)} tone="bg-[#c9a24b]/15 text-[#8a6d2c]" />
        <Tile
          icon={AlertTriangle}
          label="Low stock"
          value={summary.low}
          tone="bg-amber-50 text-amber-600"
          onClick={() => setLowOnly(true)}
        />
        <Tile
          icon={XCircle}
          label="Out of stock"
          value={summary.out}
          tone="bg-red-50 text-red-600"
          onClick={() => setLowOnly(true)}
        />
      </div>

      {/* Filters on one line */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item or code…"
            className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-2 text-sm outline-none focus:border-[#c9a24b]"
          />
        </div>
        <select
          value={warehouse}
          onChange={(e) => setWarehouse(e.target.value)}
          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-[#c9a24b]"
        >
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
            className="accent-[#c9a24b]"
          />
          Low stock only
        </label>
        {(search || warehouse || lowOnly) && (
          <button
            onClick={() => {
              setSearch('');
              setWarehouse('');
              setLowOnly(false);
            }}
            className="h-9 px-2 text-sm text-slate-500 underline hover:text-slate-800"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">
          Showing {visible.length} of {rows.length}
        </span>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">{error}</div>
        ) : loading && !rows.length ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
        ) : !visible.length ? (
          <div className="p-6 text-center text-sm text-slate-500">
            {rows.length ? 'No item matches these filters.' : 'No raw materials yet.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#131c18] text-xs text-white">
              <tr>
                <SortHead k="code" label="Code" />
                <SortHead k="name" label="Item" />
                <SortHead k="warehouse" label="Warehouse" />
                <th className="px-3 py-2 text-left font-semibold">Unit</th>
                <SortHead k="inStock" label="In stock" right />
                <SortHead k="minQty" label="Min" right />
                <th className="px-3 py-2 text-right font-semibold">Max</th>
                <SortHead k="price" label="Last price" right />
                <SortHead k="value" label="Value" right />
                <SortHead k="status" label="Status" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 even:bg-slate-50/60 hover:bg-[#c9a24b]/10">
                  <td className="px-3 py-1.5">
                    {/* Click the code → pop-up with this item's purchases, returns and menu dishes */}
                    <button
                      type="button"
                      onClick={() => setDetailItem(r)}
                      title="See the movements of this item"
                      className="font-mono text-xs font-semibold text-[#8a6d2c] underline decoration-dotted underline-offset-2 hover:text-[#131c18]"
                    >
                      {r.code || 'open'}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-3 py-1.5 text-slate-600">{r.warehouse || '—'}</td>
                  <td className="px-3 py-1.5 text-slate-600">{r.unit}</td>
                  <td
                    className={`px-3 py-1.5 text-right font-semibold tabular-nums ${
                      r.status === 'OUT' ? 'text-red-600' : r.status === 'LOW' ? 'text-amber-600' : 'text-slate-800'
                    }`}
                  >
                    {qty(r.inStock)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.minQty ? qty(r.minQty) : '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.maxQty ? qty(r.maxQty) : '—'}</td>
                  <td
                    className="px-3 py-1.5 text-right tabular-nums text-slate-700"
                    title={r.priceFromCard ? 'Never purchased yet: cost price from the item card' : 'Price of the latest purchase'}
                  >
                    {unitPrice(r.price)}
                    {r.priceFromCard && <span className="ml-0.5 text-[#c9a24b]">*</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-800">{money(r.value)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-semibold ${STATUS_INFO[r.status].badge}`}>
                      {STATUS_INFO[r.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-white">
              <tr className="border-t-2 border-slate-300 font-bold text-slate-800">
                <td className="px-3 py-2" colSpan={8}>
                  Total ({visible.length} items)
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(visibleValue)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {rows.some((r) => r.priceFromCard) && (
        <p className="text-[11px] text-slate-500">
          <span className="text-[#c9a24b]">*</span> Never purchased yet: the value uses the cost price from the item card.
        </p>
      )}

      {detailItem && (
        <ItemMovementModal
          rawMaterialId={detailItem.id}
          title={detailItem.name}
          onClose={() => setDetailItem(null)}
        />
      )}
    </div>
  );
}
