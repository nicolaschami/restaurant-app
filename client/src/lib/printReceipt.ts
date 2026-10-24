// client/src/lib/printReceipt.ts
//
// Prints a customer receipt on the computer's DEFAULT printer (agreed 2026-10-25,
// until the cloud print helper exists):
//   - the receipt is built as a small 80 mm page in a hidden frame, then printed;
//   - with Chrome started in "kiosk printing" mode (shortcut option --kiosk-printing)
//     it goes straight to the Windows default printer, WITHOUT the print pop-up
//     (default printer = the receipt printer, or "Microsoft Print to PDF" to test);
//   - without that option, Chrome shows its normal print window.
// Used automatically after each payment, and by the POS "Print Copy" button.
// Restaurant details, currency and tax come from Settings → Restaurant Info.

import { money, settings, taxLabel } from './restaurantSettings';

export interface ReceiptLine {
  qty: number;
  name: string;
  size?: string | null;
  amount: number; // line total (0 for a comp)
  comp?: boolean;
  options?: Array<{ name: string; price: number }>;
}

export interface ReceiptData {
  kind: 'paid' | 'copy'; // paid = final receipt; copy = before payment
  ticketNo: number | string;
  orderType: string;
  table?: string | null;
  customer?: string | null;
  lines: ReceiptLine[];
  subtotal: number;
  tax: number;
  deliveryFee?: number;
  total: number;
  payment?: { method: string; received: number; change: number };
  date?: Date;
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const methodLabel = (m: string) => (m ? m.charAt(0) + m.slice(1).toLowerCase() : '');

function receiptHtml(d: ReceiptData): string {
  const s = settings;
  const when = (d.date ?? new Date()).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
  const row = (a: string, b: string, cls = '') => `<tr class="${cls}"><td>${a}</td><td class="r">${b}</td></tr>`;
  const lines = d.lines
    .map(
      (l) =>
        row(`${l.qty} × ${esc(l.name)}${l.size ? ` (${esc(l.size)})` : ''}`, l.comp ? 'COMP' : money(l.amount)) +
        (l.options || []).map((o) => row(`&nbsp;&nbsp;+ ${esc(o.name)}`, o.price > 0 ? money(o.price) : '', 'opt')).join('')
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(d.ticketNo)}</title><style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { width: 72mm; margin: 0 auto; padding: 3mm 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #000; }
    .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
    .logo { max-width: 34mm; max-height: 20mm; display: block; margin: 0 auto 2mm; }
    .name { font-size: 16px; font-weight: bold; }
    .small { font-size: 10px; }
    .pre { white-space: pre-line; }
    hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
    table { width: 100%; border-collapse: collapse; } td { padding: 0.6mm 0; vertical-align: top; }
    .opt td { font-size: 11px; }
    .total td { font-size: 15px; font-weight: bold; padding-top: 1.5mm; }
    .copy { border: 1px solid #000; padding: 1mm; font-weight: bold; margin: 1mm 0; }
  </style></head><body>
    ${s.logoUrl ? `<img class="logo" src="${esc(s.logoUrl)}" onerror="this.remove()">` : ''}
    <div class="c name">${esc(s.name || 'Restaurant')}</div>
    ${s.address ? `<div class="c small">${esc(s.address)}</div>` : ''}
    ${s.phone ? `<div class="c small">Tel ${esc(s.phone)}</div>` : ''}
    ${s.taxNumber ? `<div class="c small">${esc(s.taxName)} No. ${esc(s.taxNumber)}</div>` : ''}
    ${s.receiptHeader ? `<div class="c small pre" style="margin-top:1.5mm">${esc(s.receiptHeader)}</div>` : ''}
    ${d.kind === 'copy' ? `<div class="c copy">COPY · NOT PAID</div>` : ''}
    <hr>
    <table>
      ${row(`<b>Ticket #${esc(d.ticketNo)}</b>`, esc(when))}
      ${row(esc(d.orderType), d.table ? `Table ${esc(d.table)}` : esc(d.customer || ''))}
    </table>
    <hr>
    <table>${lines}</table>
    <hr>
    <table>
      ${row('Subtotal', money(d.subtotal))}
      ${d.deliveryFee ? row('Delivery fee', money(d.deliveryFee)) : ''}
      ${row(esc(taxLabel()), money(d.tax))}
      ${row('TOTAL', money(d.total), 'total')}
    </table>
    ${
      d.payment
        ? `<hr><table>
            ${row('Paid by', esc(methodLabel(d.payment.method)))}
            ${d.payment.method === 'CASH' ? row('Received', money(d.payment.received)) + row('Change', money(d.payment.change)) : ''}
          </table>`
        : ''
    }
    <hr>
    <div class="c small pre">${esc(s.receiptFooter || 'Thank you!')}</div>
  </body></html>`;
}

// Print the receipt (never throws: a printer problem must not block the cashier).
export function printReceipt(d: ReceiptData): Promise<void> {
  return new Promise((resolve) => {
    try {
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
      document.body.appendChild(frame);
      const doc = frame.contentWindow?.document;
      if (!doc) {
        frame.remove();
        return resolve();
      }
      doc.open();
      doc.write(receiptHtml(d));
      doc.close();

      const go = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } finally {
          // give the printer time to take the page, then clean up
          setTimeout(() => {
            frame.remove();
            resolve();
          }, 1500);
        }
      };
      // wait for the logo (if any) so it is on the paper; never wait more than 1.5 s
      const img = doc.querySelector('img');
      if (img && !(img as HTMLImageElement).complete) {
        const t = setTimeout(go, 1500);
        img.addEventListener('load', () => (clearTimeout(t), go()), { once: true });
        img.addEventListener('error', () => (clearTimeout(t), go()), { once: true });
      } else {
        setTimeout(go, 50);
      }
    } catch {
      resolve();
    }
  });
}

// Automatic receipt after each payment: on by default; each POS computer can switch
// it off (e.g. while testing) — remembered in this browser only.
export const autoPrintEnabled = (): boolean => {
  try {
    return localStorage.getItem('pos_auto_print') !== 'off';
  } catch {
    return true;
  }
};
export const setAutoPrint = (on: boolean) => {
  try {
    localStorage.setItem('pos_auto_print', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
};
