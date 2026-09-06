import { FastifyInstance } from 'fastify';
import { printer as ThermalPrinter, types as PrinterTypes } from 'node-thermal-printer';

interface SilentPrintItem {
  name: string;
  quantity: number;
  lineTotal: number;
  variantSize?: string | null;
  modifiers?: string[];
}

interface SilentPrintBody {
  restaurantName?: string;
  ticketNo: number | string;
  orderType: string;
  tableLabel?: string | null;
  customerName?: string | null;
  items: SilentPrintItem[];
  subtotal: number;
  tax: number;
  deliveryFee?: number;
  total: number;
}

export default async function printerRoutes(fastify: FastifyInstance, opts: any) {
  fastify.post('/api/silent-print', async (request, reply) => {
    const body = (request.body || {}) as SilentPrintBody;

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'At least one item is required to print a ticket.',
      });
    }

    try {
      // 1. Initialize printer instance
      let printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: '', // Empty interface string prevents stream auto-binding
      });

      // 2. Build ticket buffer in memory, from the real payload this time
      printer.alignCenter();
      printer.bold(true);
      printer.println(body.restaurantName || 'MY RESTAURANT');
      printer.bold(false);
      printer.println(`Ticket #${body.ticketNo}`);
      if (body.tableLabel) printer.println(`Table: ${body.tableLabel}`);
      if (body.customerName) printer.println(body.customerName);
      printer.println(body.orderType);
      printer.drawLine();

      printer.alignLeft();
      body.items.forEach((item) => {
        const label = `${item.quantity}x ${item.name}${item.variantSize ? ` (${item.variantSize})` : ''}`;
        printer.tableCustom([
          { text: label, align: 'LEFT', width: 0.7 },
          { text: `$${Number(item.lineTotal).toFixed(2)}`, align: 'RIGHT', width: 0.3 },
        ]);
        (item.modifiers || []).forEach((m) => printer.println(`   + ${m}`));
      });

      printer.drawLine();
      printer.tableCustom([
        { text: 'Subtotal', align: 'LEFT', width: 0.7 },
        { text: `$${Number(body.subtotal).toFixed(2)}`, align: 'RIGHT', width: 0.3 },
      ]);
      if (body.deliveryFee) {
        printer.tableCustom([
          { text: 'Delivery Fee', align: 'LEFT', width: 0.7 },
          { text: `$${Number(body.deliveryFee).toFixed(2)}`, align: 'RIGHT', width: 0.3 },
        ]);
      }
      printer.tableCustom([
        { text: 'Tax', align: 'LEFT', width: 0.7 },
        { text: `$${Number(body.tax).toFixed(2)}`, align: 'RIGHT', width: 0.3 },
      ]);
      printer.bold(true);
      printer.tableCustom([
        { text: 'TOTAL', align: 'LEFT', width: 0.7 },
        { text: `$${Number(body.total).toFixed(2)}`, align: 'RIGHT', width: 0.3 },
      ]);
      printer.bold(false);
      printer.cut();

      // 3. Extract purely the formatted string buffer
      const rawText = printer.getText();

      // DO NOT call printer.execute() or printer.isPrinterConnected()
      // without a real hardware printer, as those methods open native sockets.

      return {
        success: true,
        message: 'Ticket generated successfully!',
        ticketText: rawText,
      };
    } catch (err: any) {
      fastify.log.error('Thermal printer error caught:', err);
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate receipt text',
        details: err?.message || String(err),
      });
    }
  });
}
