import { FastifyInstance } from 'fastify';
import { printer as ThermalPrinter, types as PrinterTypes } from 'node-thermal-printer';

export default async function printerRoutes(fastify: FastifyInstance, opts: any) {
  fastify.post('/api/silent-print', async (request, reply) => {
    try {
      // 1. Initialize printer instance
      let printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: '', // Empty interface string prevents stream auto-binding
      });

      // 2. Build ticket buffer in memory
      printer.alignCenter();
      printer.println("MY RESTAURANT");
      printer.println("Table: 5");
      printer.println("--------------------------------");
      printer.alignLeft();
      printer.println("2x Burger               $10.00");
      printer.println("1x Fries                $05.00");
      printer.println("6x Cola                 $03.00");
      printer.println("--------------------------------");
      printer.println("TOTAL:                  $18.00");
      printer.cut();

      // 3. Extract purely the formatted string buffer
      const rawText = printer.getText();

      // DO NOT call printer.execute() or printer.isPrinterConnected() 
      // without a real hardware printer, as those methods open native sockets.

      return { 
        success: true, 
        message: "Ticket simulated successfully!", 
        ticketText: rawText 
      };
      
    } catch (err: any) {
      fastify.log.error("Thermal printer error caught:", err);
      return reply.status(500).send({ 
        success: false,
        error: "Failed to generate receipt text",
        details: err?.message || String(err)
      });
    }
  });
}