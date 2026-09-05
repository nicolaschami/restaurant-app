// src/services/pdfService.ts
import PDFDocument from 'pdfkit';
import { Buffer } from 'buffer';

interface OrderData {
  tableNumber: number;
  items: Array<{ name: string; price: number; quantity: number }>;
  subtotal: number;
  tax: number;
  total: number;
}

export const generateReceiptPDF = (order: OrderData): Promise<Buffer> => {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: [200, 600], margin: 10 });
    const buffers: Buffer[] = [];

    // Collect PDF data chunks
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

    // ---- Build the receipt ----
    doc.fontSize(14).text('My Restaurant', { align: 'center' });
    doc.fontSize(10).text(`Table: ${order.tableNumber}`, { align: 'center' });
    doc.text('----------------------------------------');

    // Items
    order.items.forEach((item) => {
      const line = `${item.name} x${item.quantity}`;
      const price = `$${(item.price * item.quantity).toFixed(2)}`;
      doc.text(`${line} ${price}`, { align: 'left' });
    });

    doc.text('----------------------------------------');
    doc.fontSize(12).text(`Subtotal: $${order.subtotal.toFixed(2)}`);
    doc.text(`Tax: $${order.tax.toFixed(2)}`);
    doc.fontSize(14).text(`TOTAL: $${order.total.toFixed(2)}`, { align: 'center' });
    doc.fontSize(10).text('Thank you!', { align: 'center' });

    doc.end();
  });
};