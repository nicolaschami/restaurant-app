// client/src/components/TicketDetailModal.tsx
//
// Pop-up of Reports → Sales → Daily Sales: click a ticket to see its lines
// (dish, size, options, quantity, price) and how it was paid.
// Data: GET /api/reports/daily-sales/ticket/:orderId
// Closing it (✕, Esc or a click outside) returns to the report as it was.

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import { money } from './SupplierPurchasesModal';
import { qty } from './ItemMovementView';

interface TicketLine {
  id: number;
  name: string;
  size: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  modifiers: Array<{ optionName?: string; price?: number }>;
}

interface TicketOrder {
  id: number;
  ticketNo: number | null;
  type: string;
  customer: string;
  notes: string;
  total: number;
  method: string | null;
  received: number | null;
  change: number | null;
}

// CASH → Cash, MASTERCARD → Mastercard…
export const methodLabel = (m: string | null | undefined) =>
  m ? m.charAt(0) + m.slice(1).toLowerCase() : '—';

export default function TicketDetailModal({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const [order, setOrder] = useState<TicketOrder | null>(null);
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get(`/reports/daily-sales/ticket/${orderId}`)
      .then((res) => {
        setOrder(res.data.order);
        setLines(res.data.lines || []);
      })
      .catch((err) => setError(err?.response?.data?.error || 'The ticket could not be loaded.'));
  }, [orderId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const itemsTotal = lines.reduce((s, l) => s + l.subtotal, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 lg:pl-60" onMouseDown={onClose}>
      <div
        className="flex max-h-[95vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-xl bg-slate-50 p-4 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-800">
            Ticket <span className="text-[#8a6d2c]">#{order?.ticketNo ?? orderId}</span>
            {order && <span className="ml-2 text-sm font-normal text-slate-500">{order.type}</span>}
          </h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200" title="Close (Esc)">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">{error}</div>
        ) : !order ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <>
            {(order.customer || order.notes) && (
              <div className="text-xs text-slate-600">
                {order.customer && <div>Customer: {order.customer}</div>}
                {order.notes && <div>Notes: {order.notes}</div>}
              </div>
            )}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-[#131c18] text-xs text-white">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Item</th>
                    <th className="px-3 py-2 text-right font-semibold">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold">Price</th>
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-slate-800">
                          {l.name}
                          {l.size && <span className="ml-1 text-xs text-slate-500">({l.size})</span>}
                        </div>
                        {Array.isArray(l.modifiers) && l.modifiers.length > 0 && (
                          <div className="text-[11px] text-slate-500">
                            {l.modifiers.map((m) => `+ ${m.optionName ?? ''}${m.price ? ` ${money(Number(m.price))}` : ''}`).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{qty(l.qty)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{money(l.unitPrice)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{money(l.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto w-64 space-y-0.5 text-sm tabular-nums">
              <div className="flex justify-between text-slate-600"><span>Items</span><span>{money(itemsTotal)}</span></div>
              <div className="flex justify-between text-slate-600"><span>Tax &amp; fees</span><span>{money(order.total - itemsTotal)}</span></div>
              <div className="flex justify-between border-t border-slate-300 pt-1 text-base font-bold text-slate-800"><span>Total</span><span>{money(order.total)}</span></div>
              <div className="flex justify-between pt-1 text-slate-600"><span>Paid by</span><span>{methodLabel(order.method)}</span></div>
              {order.method === 'CASH' && order.received != null && (
                <>
                  <div className="flex justify-between text-slate-600"><span>Received</span><span>{money(order.received)}</span></div>
                  <div className="flex justify-between text-slate-600"><span>Change</span><span>{money(order.change ?? 0)}</span></div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
