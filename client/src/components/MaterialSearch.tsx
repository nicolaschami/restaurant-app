import { useEffect, useRef, useState, type FC, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

// ==========================================================================
// MaterialSearch — a search box with a rich dropdown of raw materials.
// Used on the purchase screen (item of each line) and in the purchase list
// (filter by item). Search by name, code, barcode or brand; the list shows
// stock, unit, last price and supplier. Keyboard: ↑ ↓ Enter Esc.
// ==========================================================================

// A raw material as the API returns it. Fields may be camelCase (costPrice,
// barCode…) or snake_case (cost_price…), so we read them through materialInfo().
export type MaterialLike = { id: number; name: string } & Record<string, any>;

export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
};

export const materialInfo = (p: MaterialLike) => ({
  code: (p.code ?? null) as string | null,
  barcode: (p.barCode ?? p.barcode ?? null) as string | null,
  brand: (p.brand ?? null) as string | null,
  unit: (p.unit ?? p.Unit ?? 'kg') as string,
  costPrice: num(p.costPrice ?? p.cost_price),
  lastPrice: num(p.lastPurchasePrice ?? p.last_purchase_price),
  stock: num(p.currentStock ?? p.current_stock),
  minQty: num(p.minQty ?? p.min_qty),
  supplierId: num(p.supplierId ?? p.supplier_id),
});

// 1.500 → "1.5", 100.000 → "100"
const shortNum = (n: number) => String(Math.round(n * 1000) / 1000);
const money = (n: number) => `$${n.toFixed(2)}`;

// Wrap the parts of `text` that match one of the search words in <mark>.
const highlight = (text: string, words: string[]) => {
  const active = words.filter(Boolean);
  if (active.length === 0) return text;
  const escaped = active.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return parts.map((part, i) =>
    active.some((w) => part.toLowerCase() === w) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
  );
};

interface MaterialSearchProps<T extends MaterialLike> {
  value: string;
  products: T[];
  onTextChange: (text: string) => void;   // what the user types (free text allowed)
  onPick: (product: T) => void;
  ariaLabel: string;
  inputRef?: (element: HTMLInputElement | null) => void;
  inputClassName?: string;
  placeholder?: string;
  supplierId?: number | null;              // items of this supplier are listed first (★)
  usedOnLines?: Record<number, number[]>;  // material id → line numbers that already have it (⚠)
  onFocusNext?: (input: HTMLInputElement) => void; // after a pick / Enter: go to the next field
}

export function MaterialSearch<T extends MaterialLike>({
  value,
  products,
  onTextChange,
  onPick,
  ariaLabel,
  inputRef,
  inputClassName = 'pr-row-input',
  placeholder = 'Search name, code or barcode…',
  supplierId = null,
  usedOnLines = {},
  onFocusNext,
}: MaterialSearchProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const localRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // "cheese mozz" finds "Mozzarella Cheese": every word, any order, in name/code/barcode/brand.
  const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = products
    .map((p) => ({ p, info: materialInfo(p) }))
    .filter(({ p, info }) => {
      if (words.length === 0) return true;
      const haystack = [p.name, info.code, info.barcode, info.brand].filter(Boolean).join(' ').toLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .map((m) => {
      const q = value.trim().toLowerCase();
      const exact = !!q && (m.info.barcode?.toLowerCase() === q || m.info.code?.toLowerCase() === q);
      const fromSupplier = supplierId !== null && m.info.supplierId === supplierId;
      const startsWith = !!q && m.p.name.toLowerCase().startsWith(q);
      return { ...m, exact, fromSupplier, rank: (exact ? 0 : 4) + (fromSupplier ? 0 : 2) + (startsWith ? 0 : 1) };
    })
    .sort((a, b) => a.rank - b.rank || a.p.name.localeCompare(b.p.name))
    .slice(0, 50);

  // The list is drawn on top of the page, so a scrolling table can't cut it off.
  const place = () => {
    const rect = localRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 460) });
  };
  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  // Keep the highlighted row visible when moving with the arrow keys.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (product: T) => {
    onPick(product);
    setOpen(false);
    if (localRef.current && onFocusNext) onFocusNext(localRef.current);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      // A barcode scanner types the code then presses Enter: an exact
      // code/barcode match is picked at once.
      const exact = matches.find((m) => m.exact);
      if (exact) return pick(exact.p);
      if (open && words.length > 0 && matches[active]) return pick(matches[active].p);
      setOpen(false);
      if (localRef.current && onFocusNext) onFocusNext(localRef.current);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <>
      <input
        className={inputClassName}
        ref={(el) => {
          localRef.current = el;
          inputRef?.(el);
        }}
        value={value}
        onChange={(event) => {
          onTextChange(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {open && position && createPortal(
        <div
          className="ms-menu"
          ref={listRef}
          role="listbox"
          style={{ top: position.top, left: position.left, width: position.width }}
          // Keep focus in the input while clicking in the list.
          onMouseDown={(event) => event.preventDefault()}
        >
          <MaterialSearchStyles />
          {matches.length === 0 ? (
            <div className="ms-empty">
              {products.length === 0
                ? 'No raw materials yet. Add them in the Raw Materials screen.'
                : <>No match for “{value.trim()}”.</>}
            </div>
          ) : (
            matches.map(({ p, info, fromSupplier }, index) => {
              const low = info.stock !== null && info.minQty !== null && info.minQty > 0 && info.stock <= info.minQty;
              const out = info.stock !== null && info.stock <= 0;
              const usedOn = usedOnLines[p.id] || [];
              const price = info.lastPrice ?? info.costPrice;
              return (
                <button
                  type="button"
                  key={p.id}
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  className={`ms-option ${index === active ? 'is-active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(p)}
                  tabIndex={-1}
                >
                  <span className="ms-top">
                    <span className="ms-name">{highlight(p.name, words)}</span>
                    {info.stock !== null && (
                      <span className={`ms-stock ${out ? 'is-out' : low ? 'is-low' : ''}`}>
                        {shortNum(info.stock)} {info.unit}
                        {info.minQty ? <em> / min {shortNum(info.minQty)}</em> : null}
                        {out ? <b>OUT</b> : low ? <b>LOW</b> : null}
                      </span>
                    )}
                  </span>
                  <span className="ms-meta">
                    {info.code && <span className="ms-code">{highlight(info.code, words)}</span>}
                    <span>{info.unit}</span>
                    {price !== null && <span>{info.lastPrice !== null ? 'Last price' : 'Cost'} {money(price)}</span>}
                    {info.barcode && <span className="ms-code">▮ {highlight(info.barcode, words)}</span>}
                    {fromSupplier && <span className="ms-supplier">★ this supplier</span>}
                    {usedOn.length > 0 && <span className="ms-used">⚠ already on line {usedOn.join(', ')}</span>}
                  </span>
                </button>
              );
            })
          )}
          <div className="ms-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> choose</span>
            <span><kbd>Enter</kbd> select</span>
            <span><kbd>Esc</kbd> close</span>
            <span className="ms-count">{matches.length} {matches.length === 1 ? 'item' : 'items'}</span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// The list's look (white card, orange highlight) — included with the list itself,
// so the component looks the same on every screen that uses it.
const MaterialSearchStyles: FC = () => (
  <style>{`
    .ms-menu {
      position: fixed; z-index: 1200; max-height: 340px; overflow-y: auto; display: flex; flex-direction: column;
      border: 1px solid #dce5dd; border-radius: 13px; background: #fff;
      box-shadow: 0 18px 40px rgba(23,35,30,.18), 0 3px 10px rgba(23,35,30,.08);
      font-family: 'Manrope', system-ui, sans-serif; color: #17231e; animation: ms-in .12s ease-out;
    }
    @keyframes ms-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    .ms-menu > .ms-option:first-of-type { margin-top: 6px; }
    .ms-option {
      display: flex; flex-direction: column; gap: 4px; width: calc(100% - 12px); margin: 0 6px; padding: 9px 11px;
      border: 0; border-radius: 9px; background: transparent; color: inherit; text-align: left; cursor: pointer; font-family: inherit;
    }
    .ms-option.is-active { background: #fbf1ea; box-shadow: inset 3px 0 0 #d18a58; }
    .ms-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .ms-name { font-size: 13px; font-weight: 800; letter-spacing: -.01em; }
    .ms-name mark, .ms-code mark { background: #fde3c6; color: inherit; border-radius: 3px; padding: 0 1px; }
    .ms-stock { flex-shrink: 0; font: 500 11px/1 'DM Mono', ui-monospace, monospace; color: #3c6b4c; }
    .ms-stock em { font-style: normal; color: #8a958e; }
    .ms-stock b { margin-left: 6px; padding: 2px 6px; border-radius: 999px; font: 800 9px/1.2 system-ui, sans-serif; letter-spacing: .06em; }
    .ms-stock.is-low { color: #a9521b; }
    .ms-stock.is-low b { background: #fbe9d8; color: #a9521b; }
    .ms-stock.is-out { color: #ba513f; }
    .ms-stock.is-out b { background: #fde4df; color: #ba513f; }
    .ms-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 11px; color: #6e7b73; }
    .ms-code { font-family: 'DM Mono', ui-monospace, monospace; font-size: 10.5px; }
    .ms-supplier { color: #3c6b4c; font-weight: 700; }
    .ms-used { color: #a9521b; font-weight: 700; }
    .ms-empty { padding: 16px 14px; font-size: 12px; color: #6e7b73; }
    .ms-foot {
      position: sticky; bottom: 0; display: flex; align-items: center; gap: 14px; margin-top: 6px; padding: 8px 14px;
      border-top: 1px solid #edf1ed; background: #f7faf7; font-size: 10.5px; color: #6e7b73;
    }
    .ms-count { margin-left: auto; font-family: 'DM Mono', ui-monospace, monospace; }
    .ms-menu kbd {
      display: inline-block; min-width: 18px; margin-right: 3px; padding: 1px 5px; border: 1px solid #dce5dd;
      border-bottom-width: 2px; border-radius: 5px; background: #fff; font: 500 10px/1.3 'DM Mono', ui-monospace, monospace; text-align: center;
    }
  `}</style>
);

export default MaterialSearch;
