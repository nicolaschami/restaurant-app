// client/src/pages/SalesByItemReport.tsx
//
// Reports → Sales → Sales by Item & Category (agreed 2026-10-25).
//   - Same rules as Daily Sales: only paid orders, on the day they were paid;
//     amounts before tax.
//   - Grouped by category (open / close each one), one line per item:
//     Qty, Sales, Cost (asked by the user: two columns, also on categories and
//     total), % of sales, average price. Every column sorts.
//   - Click an item → its sales by size and the options added.
// Cost = cost of one unit today (recipe / stock item / cost price) × quantity sold.
// Data: GET /api/reports/sales-items, /api/reports/sales-items/:menuItemId

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, FileSpreadsheet, Printer, RefreshCw, Search } from 'lucide-react';
import { api } from '../api';
import { PeriodPicker, niceDate, qty, toISO, unitPrice } from '../components/ItemMovementView';
import { money } from '../components/SupplierPurchasesModal';
import { Modal, Tile } from './ZReportPage';

interface ItemLine {
  id: number;
  name: string;
  categoryId: number;
  category: string;
  qty: number;
  sales: number;
  unitCost: number;
  cost: number;
}

type Key = 'name' | 'qty' | 'sales' | 'cost' | 'share' | 'avg';

export default function SalesByItemReport() {
  const today = toISO(new Date());
  const [[from, to], setRange] = useState<[string, string]>([today, today]);
  const [items, setItems] = useState<ItemLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(''); // '' = all categories
  const [search, setSearch] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({}); // categories folded
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'sales', dir: -1 }); // best first
  const [detail, setDetail] = useState<ItemLine | null>(null);

  const load = async () => {
    if (from > to) {
      setError('The "From" date must be before the "To" date.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/reports/sales-items', { params: { from, to } });
      setItems(res.data.items || []);
    } catch (err: any) {
      setError(
        err?.response?.status === 404
          ? 'The server does not know this report yet: it is running an old version. Restart the API server (npm run dev).'
          : err?.response?.data?.error || 'The sales by item report could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))).sort(), [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => (!categoryFilter || i.category === categoryFilter) && (!q || i.name.toLowerCase().includes(q)));
  }, [items, categoryFilter, search]);

  // % of sales is out of ALL sales of the period (so filtering does not change it).
  const allSales = items.reduce((s, i) => s + i.sales, 0);
  const share = (v: number) => (allSales ? (v / allSales) * 100 : 0);

  const value = (i: { name: string; qty: number; sales: number; cost: number }, k: Key): string | number =>
    k === 'share' ? i.sales : k === 'avg' ? (i.qty ? i.sales / i.qty : 0) : i[k];
  const compare = (a: string | number, b: string | number) =>
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true });

  // Categories with their items, both sorted by the chosen column.
  const groups = useMemo(() => {
    const map = new Map<string, ItemLine[]>();
    visible.forEach((i) => map.set(i.category, [...(map.get(i.category) || []), i]));
    return Array.from(map.entries())
      .map(([category, list]) => ({
        category,
        items: [...list].sort((a, b) => compare(value(a, sort.key), value(b, sort.key)) * sort.dir),
        qty: list.reduce((s, i) => s + i.qty, 0),
        sales: list.reduce((s, i) => s + i.sales, 0),
        cost: list.reduce((s, i) => s + i.cost, 0),
      }))
      .sort((a, b) => compare(value({ name: a.category, ...a }, sort.key), value({ name: b.category, ...b }, sort.key)) * sort.dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sort]);

  const total = {
    qty: visible.reduce((s, i) => s + i.qty, 0),
    sales: visible.reduce((s, i) => s + i.sales, 0),
    cost: visible.reduce((s, i) => s + i.cost, 0),
  };
  const best = [...visible].sort((a, b) => b.qty - a.qty)[0];
  const oneDay = from === to;
  const periodText = oneDay ? niceDate(from) : `${niceDate(from)} → ${niceDate(to)}`;

  // ---------------------------------------------------------------- export / print

  const exportExcel = () => {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const out: Array<Array<string | number>> = [['Category', 'Item', 'Qty', 'Sales', 'Cost', '% of sales', 'Avg price']];
    groups.forEach((g) => {
      out.push([g.category, '', g.qty, g.sales.toFixed(2), g.cost.toFixed(2), share(g.sales).toFixed(1) + '%', '']);
      g.items.forEach((i) =>
        out.push(['', i.name, i.qty, i.sales.toFixed(2), i.cost.toFixed(2), share(i.sales).toFixed(1) + '%', (i.qty ? i.sales / i.qty : 0).toFixed(2)])
      );
    });
    out.push(['TOTAL', '', total.qty, total.sales.toFixed(2), total.cost.toFixed(2), share(total.sales).toFixed(1) + '%', '']);
    const csv = '﻿' + out.map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-by-item-${from}${oneDay ? '' : `-to-${to}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const restaurant = localStorage.getItem('restaurantName') || '';
    const body = groups
      .map(
        (g) =>
          `<tr class="g"><td>${esc(g.category)}</td><td class="n">${qty(g.qty)}</td><td class="n">${money(g.sales)}</td><td class="n">${money(g.cost)}</td><td class="n">${share(g.sales).toFixed(1)}%</td><td></td></tr>` +
          g.items
            .map(
              (i) =>
                `<tr><td class="i">${esc(i.name)}</td><td class="n">${qty(i.qty)}</td><td class="n">${money(i.sales)}</td><td class="n">${money(i.cost)}</td><td class="n">${share(i.sales).toFixed(1)}%</td><td class="n">${money(i.qty ? i.sales / i.qty : 0)}</td></tr>`
            )
            .join('')
      )
      .join('');
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Sales by Item</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}
      h1{font-size:16px;margin:0} .sub{color:#555;margin:2px 0 10px}
      table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}
      th{background:#131c18;color:#fff} .n{text-align:right} .g td{font-weight:bold;background:#f3efe4} .i{padding-left:18px}
      tfoot td{font-weight:bold;border-top:2px solid #111}
    </style></head><body>
      <h1>${esc(restaurant)} · Sales by Item &amp; Category</h1>
      <div class="sub">${esc(periodText)}${categoryFilter ? ' · ' + esc(categoryFilter) : ''} · amounts before tax · printed ${new Date().toLocaleString()}</div>
      <table><thead><tr><th>Category / Item</th><th class="n">Qty</th><th class="n">Sales</th><th class="n">Cost</th><th class="n">%</th><th class="n">Avg price</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td>Total</td><td class="n">${qty(total.qty)}</td><td class="n">${money(total.sales)}</td><td class="n">${money(total.cost)}</td><td class="n">${share(total.sales).toFixed(1)}%</td><td></td></tr></tfoot></table>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  // ---------------------------------------------------------------- UI

  const SortTh = ({ k, label, right, title }: { k: Key; label: string; right?: boolean; title?: string }) => {
    const active = sort.key === k;
    return (
      <th
        onClick={() => setSort(active ? { key: k, dir: (sort.dir * -1) as 1 | -1 } : { key: k, dir: k === 'name' ? 1 : -1 })}
        className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 font-semibold hover:text-[#c9a24b] ${right ? 'text-right' : 'text-left'} ${active ? 'text-[#c9a24b]' : ''}`}
        title={title ?? 'Click to sort'}
      >
        <span className="inline-flex items-center gap-0.5">
          {label}
          {active && (sort.dir === 1 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
        </span>
      </th>
    );
  };

  const td = 'px-3 py-1.5 text-right tabular-nums';
  const allOpen = groups.every((g) => !closed[g.category]);

  return (
    <div className="flex h-full flex-col gap-3 bg-slate-50 p-4">
      {/* One-line header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold text-slate-800">Sales by Item &amp; Category</h1>
          <span className="text-xs text-slate-500">{periodText}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} title="Refresh" className="flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100">
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

      {/* Period + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker from={from} to={to} onChange={setRange} />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-[#c9a24b]"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search an item…"
            className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-2 text-sm outline-none focus:border-[#c9a24b]"
          />
        </div>
      </div>

      {/* 4 numbers */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile label="Items sold" value={qty(total.qty)} sub={`${visible.length} different items`} tone="text-slate-800" />
        <Tile label="Sales (before tax)" value={money(total.sales)} tone="text-emerald-700" />
        <Tile label="Cost" value={money(total.cost)} sub={total.sales ? `${Math.round((total.cost / total.sales) * 100)}% of sales` : undefined} tone="text-red-600" />
        <Tile label="Best seller" value={best ? best.name : '—'} sub={best ? `${qty(best.qty)} sold · ${money(best.sales)}` : undefined} tone="text-[#8a6d2c]" />
      </div>

      {/* Grouped table */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">{error}</div>
        ) : loading && !items.length ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
        ) : !visible.length ? (
          <div className="p-6 text-center text-sm text-slate-500">{items.length ? 'No item matches these filters.' : 'No sale in this period.'}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#131c18] text-xs text-white">
              <tr>
                <th className="w-8 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => setClosed(allOpen ? Object.fromEntries(groups.map((g) => [g.category, true])) : {})}
                    title={allOpen ? 'Close all categories' : 'Open all categories'}
                    className="text-slate-300 hover:text-[#c9a24b]"
                  >
                    {allOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </th>
                <SortTh k="name" label="Category / Item" />
                <SortTh k="qty" label="Qty" right />
                <SortTh k="sales" label="Sales" right />
                <SortTh k="cost" label="Cost" right title="Cost of one unit today × quantity sold. Click to sort" />
                <SortTh k="share" label="% of sales" right />
                <SortTh k="avg" label="Avg price" right />
              </tr>
            </thead>
            {groups.map((g) => {
              const isClosed = !!closed[g.category];
              return (
                <tbody key={g.category}>
                  <tr
                    onClick={() => setClosed((c) => ({ ...c, [g.category]: !isClosed }))}
                    className="cursor-pointer border-b border-slate-200 bg-[#c9a24b]/10 font-bold text-slate-800 hover:bg-[#c9a24b]/20"
                  >
                    <td className="px-2 py-1.5 text-slate-500">{isClosed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
                    <td className="px-3 py-1.5">
                      {g.category} <span className="text-xs font-normal text-slate-500">({g.items.length})</span>
                    </td>
                    <td className={td}>{qty(g.qty)}</td>
                    <td className={`${td} text-emerald-700`}>{money(g.sales)}</td>
                    <td className={`${td} text-red-600`}>{money(g.cost)}</td>
                    <td className={td}>{share(g.sales).toFixed(1)}%</td>
                    <td />
                  </tr>
                  {!isClosed &&
                    g.items.map((i) => (
                      <tr
                        key={i.id}
                        onClick={() => setDetail(i)}
                        title="See this item by size and options"
                        className="cursor-pointer border-b border-slate-100 hover:bg-[#c9a24b]/10"
                      >
                        <td />
                        <td className="px-3 py-1.5 pl-6 font-medium text-[#8a6d2c] underline decoration-dotted underline-offset-2">{i.name}</td>
                        <td className={`${td} text-slate-700`}>{qty(i.qty)}</td>
                        <td className={`${td} font-semibold text-slate-800`}>{money(i.sales)}</td>
                        <td className={`${td} text-slate-600`} title={`${unitPrice(i.unitCost)} per unit`}>
                          {money(i.cost)}
                        </td>
                        <td className={`${td} text-slate-500`}>{share(i.sales).toFixed(1)}%</td>
                        <td className={`${td} text-slate-500`}>{money(i.qty ? i.sales / i.qty : 0)}</td>
                      </tr>
                    ))}
                </tbody>
              );
            })}
            <tfoot className="sticky bottom-0 bg-white">
              <tr className="border-t-2 border-slate-300 bg-[#131c18]/5 font-bold text-slate-800">
                <td />
                <td className="px-3 py-2">Total</td>
                <td className={td}>{qty(total.qty)}</td>
                <td className={`${td} text-emerald-700`}>{money(total.sales)}</td>
                <td className={`${td} text-red-600`}>{money(total.cost)}</td>
                <td className={td}>{share(total.sales).toFixed(1)}%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Only paid orders, on the day they were paid. Amounts before tax. Cost = cost of one unit today (recipe, stock item or
        cost price on the menu item) × quantity sold.
      </p>

      {detail && <ItemDetailModal item={detail} from={from} to={to} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- one item

function ItemDetailModal({ item, from, to, onClose }: { item: ItemLine; from: string; to: string; onClose: () => void }) {
  const [data, setData] = useState<{ bySize: Array<{ size: string; qty: number; sales: number }>; options: Array<{ name: string; group: string; qty: number; amount: number }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get(`/reports/sales-items/${item.id}`, { params: { from, to } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err?.response?.data?.error || 'The item sales could not be loaded.'));
  }, [item.id, from, to]);

  const th = 'px-3 py-1.5 font-semibold';
  return (
    <Modal
      onClose={onClose}
      width="max-w-2xl"
      title={
        <>
          <span className="text-[#8a6d2c]">{item.name}</span>
          <span className="ml-2 text-sm font-normal text-slate-500">
            {item.category} · {qty(item.qty)} sold · sales {money(item.sales)} · cost {money(item.cost)} ({unitPrice(item.unitCost)} / unit)
          </span>
        </>
      }
    >
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">{error}</div>
      ) : !data ? (
        <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="bg-[#131c18] px-3 py-1.5 text-xs font-semibold text-white">By size</div>
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500">
                <tr>
                  <th className={`${th} text-left`}>Size</th>
                  <th className={`${th} text-right`}>Qty</th>
                  <th className={`${th} text-right`}>Sales</th>
                </tr>
              </thead>
              <tbody>
                {data.bySize.map((s) => (
                  <tr key={s.size || '-'} className="border-t border-slate-100">
                    <td className="px-3 py-1 font-medium text-slate-800">{s.size || 'No size'}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{qty(s.qty)}</td>
                    <td className="px-3 py-1 text-right font-semibold tabular-nums">{money(s.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="bg-[#131c18] px-3 py-1.5 text-xs font-semibold text-white">Options added</div>
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500">
                <tr>
                  <th className={`${th} text-left`}>Option</th>
                  <th className={`${th} text-right`}>Times</th>
                  <th className={`${th} text-right`}>Extra $</th>
                </tr>
              </thead>
              <tbody>
                {!data.options.length && (
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-center text-slate-400">No option added</td>
                  </tr>
                )}
                {data.options.map((o) => (
                  <tr key={`${o.group}-${o.name}`} className="border-t border-slate-100">
                    <td className="px-3 py-1">
                      <span className="font-medium text-slate-800">{o.name}</span>
                      {o.group && <span className="ml-1 text-[11px] text-slate-400">{o.group}</span>}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">{qty(o.qty)}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{money(o.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
