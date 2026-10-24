// src/lib/escpos.ts
//
// A small ESC/POS builder: the language of thermal receipt printers (Epson and the
// many compatible ones, e.g. BTP-R180II). The print helper sends these bytes RAW to
// the Windows printer, so printing is instant, sharp, and needs no browser.
// 80 mm paper = 48 characters per line (font A).
// Text is kept to plain ASCII (accents removed, "€" → "EUR") so every printer shows it.

const ESC = 0x1b;
const GS = 0x1d;

export const LINE_WIDTH = 48;

// A readable copy of what is printed (for the on-screen preview, 2026-10-25).
export interface PreviewLine {
  text: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  big: boolean;
  note?: 'cut' | 'drawer'; // paper cut / drawer opens (not printed text)
}

// Plain ASCII: "Café" → "Cafe", "€12.00" → "EUR 12.00", "£" → "GBP ".
export function ascii(text: unknown): string {
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
  private parts: number[] = [];
  // preview state
  private previewLines: PreviewLine[] = [];
  private cur = '';
  private st: { align: PreviewLine['align']; bold: boolean; big: boolean } = { align: 'left', bold: false, big: false };

  constructor() {
    this.parts.push(ESC, 0x40); // initialise the printer
  }

  private bytes(...b: number[]) {
    this.parts.push(...b);
    return this;
  }

  text(t: string) {
    const a = ascii(t);
    for (const ch of a) this.parts.push(ch.charCodeAt(0));
    this.cur += a;
    return this;
  }
  line(t = '') {
    this.text(t).bytes(0x0a);
    this.previewLines.push({ text: this.cur, ...this.st });
    this.cur = '';
    return this;
  }
  align(a: 'left' | 'center' | 'right') {
    this.st.align = a;
    return this.bytes(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
  }
  bold(on: boolean) {
    this.st.bold = on;
    return this.bytes(ESC, 0x45, on ? 1 : 0);
  }
  // double width + double height (titles, totals)
  big(on: boolean) {
    this.st.big = on;
    return this.bytes(GS, 0x21, on ? 0x11 : 0x00);
  }
  divider(ch = '-') {
    return this.line(ch.repeat(LINE_WIDTH));
  }
  // "Left text ........ right text" on one line (left text is cut if too long).
  row(left: string, right: string, width = LINE_WIDTH) {
    const r = ascii(right);
    const room = Math.max(1, width - r.length - 1);
    let l = ascii(left);
    if (l.length > room) l = l.slice(0, room);
    return this.line(l + ' '.repeat(width - l.length - r.length) + r);
  }
  // A long text wrapped on several lines.
  wrap(t: string, width = LINE_WIDTH) {
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
    this.previewLines.push({ text: '', align: 'center', bold: false, big: false, note: 'cut' });
    return this.feed(4).bytes(GS, 0x56, 0x42, 0x00); // feed then partial cut
  }
  // Opens the cash drawer connected to the printer (pin 2, ~50 ms pulse).
  openDrawer() {
    this.previewLines.push({ text: '', align: 'center', bold: false, big: false, note: 'drawer' });
    return this.bytes(ESC, 0x70, 0x00, 0x19, 0xfa);
  }

  // What the paper will show (for the screen preview).
  preview(): PreviewLine[] {
    return this.previewLines;
  }

  toBase64(): string {
    return Buffer.from(this.parts).toString('base64');
  }
}
