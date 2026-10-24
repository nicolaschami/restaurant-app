// client/src/components/SupplierPurchasesModal.tsx
//
// Pop-up of Reports → Purchases by Supplier: click a supplier's line.
// Two tabs (agreed 2026-10-24):
//   - Documents: every purchase (GRN) and return (RP) of the period,
//     with before tax, discount, tax and net. Returns are shown in red and subtracted.
//   - Items: what was bought from this supplier: quantity bought / returned,
//     average price and amount before tax.
// Data: GET /api/reports/purchases/supplier?from=&to=&supplier=
// Click a document number → the purchase (GRN) or return (RP) opens in the same
// screen as in the Purchase List; after a save, this pop-up and the report reload.
// Closing it (✕, Esc or a click outside) returns to the report as it was.

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Package, Search, X } from 'lucide-react';
import { api } from '../api';
import PurchaseTransactionEditModal from '../pages/PurchaseTransactionEditModal';
import { PeriodPicker, niceDate, qty, unitPrice } from './ItemMovementView';

interface PurchaseDoc {
  id: number;
  date: string;
  doc: string;
  kind: 'PUR' | 'RP';
  reference: string;
  nbItems: number;
  beforeTax: number;
  discount: number;
  tax: number;
  net: number;
}

interface PurchasedItem {
  id: number;
  name: string;
  unit: string;
  qtyBought: number;
  qtyReturned: number;
  amountBought: number; // line totals, before tax
  amountReturned: number;
}

// Money in the restaurant's currency (Settings → Restaurant Info).
import { money } from '../lib/restaurantSettings';
export { money };

// A return takes money back: show it negative.
const signed = (d: PurchaseDoc, v: number) => (d.kind === 'RP' ? -v : v);

interface Props {
  supplier: string;
  initialRange: [string, string];
  onClose: () => void;
  onChanged?: () => void; // a document was edited and saved → the report reloads
}

export default function SupplierPurchasesModal({ supplier, initialRange, onClose, onChanged }: Props) {
  const [[from, to], setRange] = useState<[string, string]>(initialRange);
  const [tab, setTab] = useState<'documents' | 'items'>('documents');
  const [documents, setDocuments] = useState<PurchaseDoc[]>([]);
  const [items, setItems] = useState<PurchasedItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The document opened in the purchase screen (click its number); null = none.
  const [openDoc, setOpenDoc] = useState<PurchaseDoc | null>(null);
  const [reloadKey, setReloadKey] = useState(0); // +1 after a document was saved

  useEffect(() => {
    if (from > to) {
      setError('The "From" date must be before the "To" date.');
      return;
    }
    let cancelled = false; // ignore an old answer if the period changed meanwhile
    setLoading(true);
    setError(null);
    api
      .get('/reports/purchases/supplier', { params: { from, to, supplier } })
      .then((res) => {
        if (cancelled) return;
        setDocuments(res.data.documents || []);
        setItems(res.data.items || []);
        setLoaded(true);
      })
      .catch((err) => !cancelled && setError(err?.response?.data?.error || 'The supplier purchases could not be loaded.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, to, supplier, reloadKey]);

  // Esc closes the pop-up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !openDoc && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, openDoc]);

  // ---------------------------------------------------------------- sort + filter
  // Click a column title to sort; click again to reverse. Default: by date, oldest first.
  type DocKey = 'date' | 'doc' | 'kind' | 'reference' | 'nbItems' | 'beforeTax' | 'discount' | 'tax' | 'net';
  type ItemKey = 'name' | 'unit' | 'qtyBought' | 'qtyReturned' | 'netQty' | 'avgPrice' | 'amount';
  const [docSort, setDocSort] = useState<{ key: DocKey; dir: 1 | -1 }>({ key: 'date', dir: 1 });
  const [itemSort, setItemSort] = useState<{ key: ItemKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  // Filters. Default = everything (empty search, all types).
  const [docSearch, setDocSearch] = useState(''); // part of the document number or the reference
  const [docKind, setDocKind] = useState<'' | 'PUR' | 'RP'>('');
  const [itemSearch, setItemSearch] = useState(''); // part of the item name

  // Text compares "GRN-0010" after "GRN-0009" (numeric: true); numbers compare as numbers.
  const compare = (a: string | number, b: string | number) =>
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true });

  const docValue = (d: PurchaseDoc, k: DocKey): string | number =>
    k === 'beforeTax' || k === 'tax' || k === 'net' ? signed(d, d[k]) : k === 'kind' ? (d.kind === 'RP' ? 'Return' : 'Purchase') : d[k];
  const itemValue = (i: PurchasedItem, k: ItemKey): string | number =>
    k === 'netQty'
      ? i.qtyBought - i.qtyReturned
      : k === 'avgPrice'
        ? (i.qtyBought ? i.amountBought / i.qtyBought : 0)
        : k === 'amount'
          ? i.amountBought - i.amountReturned
          : i[k];

  const visibleDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    return documents
      .filter((d) => (!q || `${d.doc} ${d.reference}`.toLowerCase().includes(q)) && (!docKind || d.kind === docKind))
      .sort((a, b) => compare(docValue(a, docSort.key), docValue(b, docSort.key)) * docSort.dir || a.id - b.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, docSearch, docKind, docSort]);

  const visibleItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return items
      .filter((i) => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => compare(itemValue(a, itemSort.key), itemValue(b, itemSort.key)) * itemSort.dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, itemSearch, itemSort]);

  // Totals follow the filter: they add up the lines you see.
  const docTotal = (field: 'beforeTax' | 'discount' | 'tax' | 'net') =>
    visibleDocs.reduce((s, d) => s + signed(d, d[field]), 0);
  const itemsTotal = visibleItems.reduce((s, i) => s + i.amountBought - i.amountReturned, 0);

  // Text columns start A→Z / oldest first; number columns start biggest first.
  const NUMBER_KEYS = ['nbItems', 'beforeTax', 'discount', 'tax', 'net', 'qtyBought', 'qtyReturned', 'netQty', 'avgPrice', 'amount'];
  function SortTh<K extends string>({
    k, label, sort, setSort, right, title,
  }: {
    k: K; label: string; sort: { key: K; dir: 1 | -1 }; setSort: (v: { key: K; dir: 1 | -1 }) => void; right?: boolean; title?: string;
  }) {
    const active = sort.key === k;
    return (
      <th
        title={title ?? 'Click to sort'}
        onClick={() => setSort(active ? { key: k, dir: (sort.dir * -1) as 1 | -1 } : { key: k, dir: NUMBER_KEYS.includes(k) ? -1 : 1 })}
        className={`${th} cursor-pointer select-none hover:text-[#c9a24b] ${right ? 'text-right' : 'text-left'} ${active ? 'text-[#c9a24b]' : ''}`}
      >
        <span className="inline-flex items-center gap-0.5">
          {label}
          {active && (sort.dir === 1 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
        </span>
      </th>
    );
  }

  const th = 'px-3 py-2 font-semibold whitespace-nowrap';
  const td = 'px-3 py-1.5 tabular-nums';

  const TabButton = ({ id, label, icon: Icon, count }: { id: 'documents' | 'items'; label: string; icon: typeof FileText; count: number }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex h-9 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold ${
        tab === id ? 'border-[#c9a24b] text-[#8a6d2c]' : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
      <span className="rounded bg-slate-100 px-1.5 text-[11px] font-medium text-slate-500">{count}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 lg:pl-60" onMouseDown={onClose}>
      <div
        className="flex max-h-[95vh] w-full max-w-6xl flex-col gap-3 overflow-y-auto rounded-xl bg-slate-50 p-4 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onMouseDown={(e) => e.stopPropagation()} // clicks inside don't close it
        role="dialog"
        aria-modal="true"
      >
        {/* One-line header */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-800">
            Purchases · <span className="text-[#8a6d2c]">{supplier}</span>
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker from={from} to={to} onChange={setRange} />
        </div>

        <div className="flex border-b border-slate-200">
          <TabButton id="documents" label="Documents" icon={FileText} count={documents.length} />
          <TabButton id="items" label="Items" icon={Package} count={items.length} />
        </div>

        {/* Filters of the open tab. Default: all the documents / all the items. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={tab === 'documents' ? docSearch : itemSearch}
              onChange={(e) => (tab === 'documents' ? setDocSearch(e.target.value) : setItemSearch(e.target.value))}
              placeholder={tab === 'documents' ? 'Document number or reference…' : 'Item name…'}
              className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-2 text-sm outline-none focus:border-[#c9a24b]"
            />
          </div>
          {tab === 'documents' && (
            <select
              value={docKind}
              onChange={(e) => setDocKind(e.target.value as '' | 'PUR' | 'RP')}
              className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-[#c9a24b]"
            >
              <option value="">Purchases and returns</option>
              <option value="PUR">Purchases only</option>
              <option value="RP">Returns only</option>
            </select>
          )}
          {(tab === 'documents' ? docSearch || docKind : itemSearch) && (
            <button
              type="button"
              onClick={() => (tab === 'documents' ? (setDocSearch(''), setDocKind('')) : setItemSearch(''))}
              className="h-9 px-2 text-sm text-slate-500 underline hover:text-slate-800"
            >
              Show all
            </button>
          )}
          <span className="ml-auto text-xs text-slate-500">
            {tab === 'documents'
              ? `Showing ${visibleDocs.length} of ${documents.length} documents`
              : `Showing ${visibleItems.length} of ${items.length} items`}
          </span>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">{error}</div>
        ) : !loaded ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <div className={`overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}>
            {tab === 'documents' ? (
              /* ---------------- Documents ---------------- */
              <table className="w-full text-sm">
                <thead className="bg-[#131c18] text-xs text-white">
                  <tr>
                    <SortTh k="date" label="Date" sort={docSort} setSort={setDocSort} />
                    <SortTh k="doc" label="Document" sort={docSort} setSort={setDocSort} />
                    <SortTh k="kind" label="Type" sort={docSort} setSort={setDocSort} />
                    <SortTh k="reference" label="Reference" sort={docSort} setSort={setDocSort} />
                    <SortTh k="nbItems" label="Items" sort={docSort} setSort={setDocSort} right />
                    <SortTh k="beforeTax" label="Before tax" sort={docSort} setSort={setDocSort} right />
                    <SortTh k="discount" label="Discount" sort={docSort} setSort={setDocSort} right />
                    <SortTh k="tax" label="Tax" sort={docSort} setSort={setDocSort} right />
                    <SortTh k="net" label="Net" sort={docSort} setSort={setDocSort} right />
                  </tr>
                </thead>
                <tbody>
                  {!visibleDocs.length && (
                    <tr>
                      <td colSpan={9} className="px-3 py-4 text-center text-slate-500">
                        {documents.length ? 'No document matches this filter.' : 'No purchase from this supplier in this period.'}
                      </td>
                    </tr>
                  )}
                  {visibleDocs.map((d) => {
                    const rp = d.kind === 'RP';
                    return (
                      <tr key={d.id} className={`border-b border-slate-100 even:bg-slate-50/60 ${rp ? 'text-red-600' : 'text-slate-700'}`}>
                        <td className={`${td} whitespace-nowrap`}>{niceDate(d.date)}</td>
                        <td className={`${td} whitespace-nowrap font-mono text-xs`}>
                          <button
                            type="button"
                            onClick={() => setOpenDoc(d)}
                            title={rp ? 'Open this purchase return' : 'Open this purchase'}
                            className="font-semibold text-[#8a6d2c] underline decoration-dotted underline-offset-2 hover:text-[#131c18]"
                          >
                            {d.doc || 'open'}
                          </button>
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                              rp ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {rp ? 'Return' : 'Purchase'}
                          </span>
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-1.5 text-slate-500" title={d.reference}>
                          {d.reference || '—'}
                        </td>
                        <td className={`${td} text-right text-slate-500`}>{d.nbItems}</td>
                        <td className={`${td} text-right`}>{money(signed(d, d.beforeTax))}</td>
                        <td className={`${td} text-right text-slate-500`}>{d.discount ? money(d.discount) : '—'}</td>
                        <td className={`${td} text-right`}>{money(signed(d, d.tax))}</td>
                        <td className={`${td} text-right font-semibold`}>{money(signed(d, d.net))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {visibleDocs.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-[#c9a24b]/10 font-bold text-slate-800">
                      <td className="px-3 py-2" colSpan={5}>
                        Total ({visibleDocs.length} documents, returns subtracted)
                      </td>
                      <td className={`${td} text-right`}>{money(docTotal('beforeTax'))}</td>
                      <td className={`${td} text-right`}>{money(docTotal('discount'))}</td>
                      <td className={`${td} text-right`}>{money(docTotal('tax'))}</td>
                      <td className={`${td} text-right`}>{money(docTotal('net'))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            ) : (
              /* ---------------- Items ---------------- */
              <table className="w-full text-sm">
                <thead className="bg-[#131c18] text-xs text-white">
                  <tr>
                    <SortTh k="name" label="Item" sort={itemSort} setSort={setItemSort} />
                    <SortTh k="unit" label="Unit" sort={itemSort} setSort={setItemSort} />
                    <SortTh k="qtyBought" label="Bought" sort={itemSort} setSort={setItemSort} right />
                    <SortTh k="qtyReturned" label="Returned" sort={itemSort} setSort={setItemSort} right />
                    <SortTh k="netQty" label="Net qty" sort={itemSort} setSort={setItemSort} right />
                    <SortTh k="avgPrice" label="Avg price" sort={itemSort} setSort={setItemSort} right title="Amount bought ÷ quantity bought (before tax). Click to sort" />
                    <SortTh k="amount" label="Amount before tax" sort={itemSort} setSort={setItemSort} right />
                  </tr>
                </thead>
                <tbody>
                  {!visibleItems.length && (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                        {items.length ? 'No item matches this filter.' : 'No item bought from this supplier in this period.'}
                      </td>
                    </tr>
                  )}
                  {visibleItems.map((i) => (
                    <tr key={i.id} className="border-b border-slate-100 even:bg-slate-50/60 text-slate-700">
                      <td className="px-3 py-1.5 font-medium text-slate-800">{i.name}</td>
                      <td className="px-3 py-1.5 text-slate-500">{i.unit}</td>
                      <td className={`${td} text-right text-emerald-700`}>{i.qtyBought ? `+${qty(i.qtyBought)}` : '—'}</td>
                      <td className={`${td} text-right text-red-600`}>{i.qtyReturned ? `−${qty(i.qtyReturned)}` : '—'}</td>
                      <td className={`${td} text-right font-semibold`}>{qty(i.qtyBought - i.qtyReturned)}</td>
                      <td className={`${td} text-right text-slate-500`}>
                        {i.qtyBought ? unitPrice(i.amountBought / i.qtyBought) : '—'}
                      </td>
                      <td className={`${td} text-right font-semibold`}>{money(i.amountBought - i.amountReturned)}</td>
                    </tr>
                  ))}
                </tbody>
                {visibleItems.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-[#c9a24b]/10 font-bold text-slate-800">
                      <td className="px-3 py-2" colSpan={6}>
                        Total ({visibleItems.length} items, returns subtracted)
                      </td>
                      <td className={`${td} text-right`}>{money(itemsTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        )}

        {openDoc && (
          <PurchaseTransactionEditModal
            transactionId={openDoc.id}
            kind={openDoc.kind}
            onClose={() => setOpenDoc(null)}
            onSaved={() => {
              setReloadKey((k) => k + 1);
              onChanged?.();
            }}
          />
        )}
      </div>
    </div>
  );
}
