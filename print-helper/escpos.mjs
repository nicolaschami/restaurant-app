// print-helper/escpos.mjs
//
// A small ESC/POS builder — the SAME as the server's src/lib/escpos.ts, in plain
// JavaScript, so RES Local prints offline exactly like the server prints online.
// (Keep the two files in step: a change of the paper layout goes in both.)
// 80 mm paper = 48 characters per line (font A). Text is kept to plain ASCII.

const ESC = 0x1b;
const GS = 0x1d;

export const LINE_WIDTH = 48;

// Plain ASCII: "Café" → "Cafe", "€12.00" → "EUR 12.00", "£" → "GBP ".
export function ascii(text) {
  return String(text ?? '')
    .replace(/€/g, 'EUR ')
    .replace(/£/g, 'GBP ')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/×/g, 'x')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e\n]/g, '?');
}

export class EscPos {
  constructor() {
    this.parts = [ESC, 0x40]; // initialise the printer
  }
  bytes(...b) {
    this.parts.push(...b);
    return this;
  }
  text(t) {
    for (const ch of ascii(t)) this.parts.push(ch.charCodeAt(0));
    return this;
  }
  line(t = '') {
    return this.text(t).bytes(0x0a);
  }
  align(a) {
    return this.bytes(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
  }
  bold(on) {
    return this.bytes(ESC, 0x45, on ? 1 : 0);
  }
  // double width + double height (titles, totals)
  big(on) {
    return this.bytes(GS, 0x21, on ? 0x11 : 0x00);
  }
  divider(ch = '-') {
    return this.line(ch.repeat(LINE_WIDTH));
  }
  // "Left text ........ right text" on one line (left text is cut if too long).
  row(left, right, width = LINE_WIDTH) {
    const r = ascii(right);
    const room = Math.max(1, width - r.length - 1);
    let l = ascii(left);
    if (l.length > room) l = l.slice(0, room);
    return this.line(l + ' '.repeat(width - l.length - r.length) + r);
  }
  // A long text wrapped on several lines.
  wrap(t, width = LINE_WIDTH) {
    for (const para of ascii(t).split('\n')) {
      let cur = '';
      for (const word of para.split(' ')) {
        if ((cur + ' ' + word).trim().length > width) {
          this.line(cur.trim());
          cur = word;
        } else cur = (cur + ' ' + word).trim();
      }
      this.line(cur);
    }
    return this;
  }
  feed(n = 3) {
    return this.bytes(ESC, 0x64, n);
  }
  cut() {
    return this.feed(4).bytes(GS, 0x56, 0x42, 0x00); // feed then partial cut
  }
  // Opens the cash drawer connected to the printer (pin 2, ~50 ms pulse).
  openDrawer() {
    return this.bytes(ESC, 0x70, 0x00, 0x19, 0xfa);
  }
  toBase64() {
    return Buffer.from(this.parts).toString('base64');
  }
}

// Money in the restaurant's currency, like the server (src/lib/money.ts).
export function formatMoney(amount, currency) {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
