// client/src/components/ReceiptPreviewModal.tsx
//
// The receipt EXACTLY as the printer prints it (2026-10-25): built by the server with
// the same builder as the real receipt (POST /api/printing/preview), shown as an
// 80 mm paper strip — 48 characters wide, big = double width/height, with the
// "drawer opens" and "paper cut" marks. No printer needed.
// Used by the POS ("Preview" button, and after a payment) and Settings → Printers.
// Optional "Print" button sends the same receipt to the printer (print helper).

import { useEffect, useState } from 'react';
import { Printer, Scissors, X } from 'lucide-react';
import { api } from '../api';
import { toast } from './Toaster';

interface PreviewLine {
  text: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  big: boolean;
  note?: 'cut' | 'drawer';
}

interface Props {
  // Which receipt: an order id, or a ticket number; nothing = the last paid order.
  orderId?: number | null;
  ticketNo?: number | null;
  copy?: boolean; // the "COPY - NOT PAID" version (before payment)
  onClose: () => void;
}

export default function ReceiptPreviewModal({ orderId, ticketNo, copy, onClose }: Props) {
  const [paper, setPaper] = useState<{ ticketNo: number; printer: string | null; lines: PreviewLine[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [resolvedOrderId, setResolvedOrderId] = useState<number | null>(orderId ?? null);

  useEffect(() => {
    api
      .post('/printing/preview', { orderId: orderId ?? undefined, ticketNo: ticketNo ?? undefined, copy: Boolean(copy) })
      .then((res) => {
        setPaper(res.data);
        if (res.data.orderId) setResolvedOrderId(res.data.orderId);
      })
      .catch((err) => setError(err?.response?.data?.error || 'The preview could not be built.'));
  }, [orderId, ticketNo, copy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const print = async () => {
    if (!resolvedOrderId) return;
    setPrinting(true);
    try {
      await api.post('/printing/receipt', { orderId: resolvedOrderId, copy: Boolean(copy) });
      toast.success('Receipt sent', `Ticket #${paper?.ticketNo ?? ''}${paper?.printer ? ` → ${paper.printer}` : ''}`);
    } catch (err: any) {
      toast.error('Receipt not printed', err?.response?.data?.error || 'Check the print helper.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="flex max-h-[95vh] flex-col gap-2 overflow-y-auto rounded-xl bg-slate-100 p-4 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-bold text-slate-800">
            {paper ? `Ticket #${paper.ticketNo}` : 'Receipt'}{' '}
            <span className="font-normal text-slate-500">· as printed on 80 mm paper{paper?.printer ? ` · ${paper.printer}` : ''}</span>
          </h3>
          <div className="flex items-center gap-1">
            {paper && resolvedOrderId && (
              <button
                onClick={print}
                disabled={printing}
                className="flex h-8 items-center gap-1.5 rounded-md bg-[#131c18] px-3 text-xs font-semibold text-white hover:bg-[#1f2d26] disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5 text-[#c9a24b]" /> {printing ? 'Printing…' : 'Print'}
              </button>
            )}
            <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-200" title="Close (Esc)">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">{error}</div>
        ) : !paper ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <div
            className="mx-auto bg-white px-3 py-4 shadow-md"
            style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, lineHeight: 1.35, width: 'calc(48ch + 1.5rem)', color: '#111' }}
          >
            {paper.lines.map((l, i) =>
              l.note === 'cut' ? (
                <div key={i} className="my-2 flex items-center gap-1 text-[10px] text-slate-400">
                  <Scissors className="h-3 w-3" /> <span className="flex-1 border-t border-dashed border-slate-300" /> paper cut
                </div>
              ) : l.note === 'drawer' ? (
                <div key={i} className="my-1 text-center text-[10px] font-semibold text-[#8a6d2c]">[ cash drawer opens ]</div>
              ) : (
                <div
                  key={i}
                  style={{
                    whiteSpace: 'pre',
                    textAlign: l.align,
                    fontWeight: l.bold ? 700 : 400,
                    fontSize: l.big ? '2em' : undefined,
                    lineHeight: l.big ? 1.1 : undefined,
                    overflow: 'hidden',
                  }}
                >
                  {l.text || ' '}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
