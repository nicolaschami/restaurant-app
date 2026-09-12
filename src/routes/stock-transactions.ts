import { FastifyInstance } from 'fastify';
import { eq, and,sql ,desc,inArray} from 'drizzle-orm';
import { db } from "../db";
import { stockTransactions, stockDetails } from '../db/schema';
import type { CreateStockTransactionPayload } from '../db/schema';

export default async function stockTransactionRoutes(fastify: FastifyInstance) {

  // ==========================================
  // 1. GET /api/stock-transactions?restaurantId=1
  // Filter all transactions by restaurantId
  // ==========================================
  // fastify.get<{ Querystring: { restaurantId: string } }>(
  //   '/api/stock-transactions',
  //   async (request, reply) => {
  //     const { restaurantId } = request.query;

  //     if (!restaurantId) {
  //       return reply.code(400).send({ error: 'restaurantId query parameter is required.' });
  //     }

  //     const parsedRestaurantId = parseInt(restaurantId, 10);

  //     try {
  //       const transactions = await db.query.stockTransactions.findMany({
  //         where: eq(stockTransactions.restaurantId, parsedRestaurantId),
  //         with: {
  //           details: true,
  //         },
  //         orderBy: (transactions, { desc }) => [desc(transactions.transactionId)],
  //       });

  //       return reply.code(200).send(transactions);
  //     } catch (error) {
  //       request.log.error(error);
  //       return reply.code(500).send({ error: 'Failed to fetch stock transactions' });
  //     }
  //   }
  // );



// fastify.get<{ Querystring: { restaurantId: string } }>(
//   '/api/stock-transactions',
//   async (request, reply) => {
//     const { restaurantId } = request.query;

//     if (!restaurantId) {
//       return reply.code(400).send({ error: 'restaurantId query parameter is required.' });
//     }

//     const parsedRestaurantId = parseInt(restaurantId, 10);

//     try {
//       const transactions = await db.query.stockTransactions.findMany({
//         where: eq(stockTransactions.restaurantId, parsedRestaurantId),
//         // Select extra computed field or cast field as text
//         extras: {
//           transactionDateFormatted: sql<string>`"TransactionDate"::text`.as('transactionDateFormatted'),
//         },
//         with: {
//           details: true,
//         },
//         orderBy: (transactions, { desc }) => [desc(transactions.transactionId)],
//       });

//       // Replace null transactionDate with the formatted raw text from SQL
//       const response = transactions.map((tx) => ({
//         ...tx,
//         transactionDate: tx.transactionDate || tx.transactionDateFormatted,
//       }));

//       return reply.code(200).send(response);
//     } catch (error) {
//       request.log.error(error);
//       return reply.code(500).send({ error: 'Failed to fetch stock transactions' });
//     }
//   }
// );


  // ==========================================
  // 2. GET /api/stock-transactions/:id?restaurantId=1
  // Fetch a single transaction ensuring it belongs to the restaurant
  // ==========================================
fastify.get<{ Querystring: { restaurantId: string } }>(
    '/api/stock-transactions',
    async (request, reply) => {
      const { restaurantId } = request.query;

      if (!restaurantId) {
        return reply.code(400).send({ error: 'restaurantId query parameter is required.' });
      }

      const parsedRestaurantId = parseInt(restaurantId, 10);

      try {
        // 1. Fetch main stock transactions with date cast as raw string
        const transactions = await db
          .select({
            transactionId: stockTransactions.transactionId,
            restaurantId: stockTransactions.restaurantId,
            transactionNumber: stockTransactions.transactionNumber,
            grnNumber: stockTransactions.grnNumber,
            supplierName: stockTransactions.supplierName,
            transactionDate: sql<string>`"TransactionDate"::text`,
            reference: stockTransactions.reference,
            comment: stockTransactions.comment,
            subtotal: stockTransactions.subtotal,
            discountAmount: stockTransactions.discountAmount,
            taxableAmount: stockTransactions.taxableAmount,
            taxAmount: stockTransactions.taxAmount,
            netTotal: stockTransactions.netTotal,
            status: stockTransactions.status,
            type: stockTransactions.type,
          })
          .from(stockTransactions)
          .where(eq(stockTransactions.restaurantId, parsedRestaurantId))
          .orderBy(desc(stockTransactions.transactionId));

        if (!transactions.length) {
          return reply.code(200).send([]);
        }

        // 2. Fetch details ONLY for the returned transactions
        const transactionIds = transactions.map((t) => t.transactionId);
        const details = await db
          .select()
          .from(stockDetails)
          .where(inArray(stockDetails.transactionId, transactionIds));

        // 3. Attach details array to each transaction
        const result = transactions.map((tx) => ({
          ...tx,
          details: details.filter((d) => d.transactionId === tx.transactionId),
        }));

        return reply.code(200).send(result);
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch stock transactions' });
      }
    }
  );

  // ==========================================
  // 3. POST /api/stock-transactions (Create New)
  // Ensures restaurantId is present in body
  // ==========================================
fastify.post('/api/stock-transactions', async (request, reply) => {
  const body = request.body as Record<string, any>;
  const items = body.items || [];

  // Extract variables safely checking all casing variations
  const restaurantId = body.restaurantId ?? body.restaurant_id ?? body.RestaurantID;
  const supplierName = body.supplierName ?? body.supplier_name ?? body.SupplierName;
  const grnNumber = body.grnNumber ?? body.grn_number ?? body.GRNNumber;
  const receivedAt = body.receivedAt ?? body.received_at ?? body.TransactionDate;
  const reference = body.reference ?? body.Reference;
  const comment = body.comment ?? body.Comment;
  const subtotal = body.subtotal ?? body.Subtotal ?? 0;
  const discountAmount = body.discountAmount ?? body.discount ?? body.DiscountAmount ?? 0;
  const taxAmount = body.taxAmount ?? body.tax ?? body.TaxAmount ?? 0;
  const netTotal = body.netTotal ?? body.net_total ?? body.NetTotal ?? 0;
  const status = body.status ?? body.Status ?? 'DRAFT';
  const type = body.type ?? 'PUR';

  try {
   const result = await db.transaction(async (tx) => {
  // Extract values cleanly from request body
  const body = request.body as Record<string, any>;

  const generatedTxNumber = `TX-${Date.now().toString().slice(-6)}`;

const headerPayload: any = {
  // Required field that failed the NOT NULL constraint:
  TransactionNumber: body.transactionNumber || body.TransactionNumber || generatedTxNumber,
  transactionNumber: body.transactionNumber || body.TransactionNumber || generatedTxNumber,

  RestaurantID: Number(restaurantId),
  restaurantId: Number(restaurantId),

  GRNNumber: grnNumber ? String(grnNumber) : null,
  grnNumber: grnNumber ? String(grnNumber) : null,

  SupplierName: String(supplierName || ''),
  supplierName: String(supplierName || ''),

  TransactionDate: receivedAt ? new Date(receivedAt) : new Date(),
  transactionDate: receivedAt ? new Date(receivedAt) : new Date(),

  Reference: reference ? String(reference) : null,
  reference: reference ? String(reference) : null,

  Comment: comment ? String(comment) : null,
  comment: comment ? String(comment) : null,

  Subtotal: String(subtotal),
  subtotal: String(subtotal),

  DiscountAmount: String(discountAmount),
  discountAmount: String(discountAmount),

  TaxAmount: String(taxAmount),
  taxAmount: String(taxAmount),

  NetTotal: String(netTotal),
  netTotal: String(netTotal),

  Status: String(status),
  status: String(status),

  type: String(type),
};

  const [newTransaction] = await tx
    .insert(stockTransactions)
    .values(headerPayload as any)
    .returning();

  // Map details payload
  console.log('=== RAW NEW TRANSACTION RETURNED ===', newTransaction);

// 2. Safely resolve the primary key
  const headerId = Number(
  (newTransaction as any).transactionid ??
  (newTransaction as any).transactionId ??
  (newTransaction as any).TransactionID ??
  (newTransaction as any).id
);
console.log('=== RAW NEW TRANSACTION RETURNED ===>>>>>>>', headerId);
// const detailsPayload = items.map((item: any) => ({  
//     console.log("Current item:", item);
//   return{
//   // Map to the exact schema key (lowercase 'transactionid' as shown in your query log)
//   transactionId: headerId,
//   RawMaterialID : item.id,
//   itemname: String(item.name || item.itemName || item.rawMaterialName || ''),
  
  
//   unit: String(item.unit || ''),
//   qty: Number(item.quantity ?? item.qty ?? 0),
//   unitCost: String(item.unitCost ?? item.unit_cost ?? 0),
//   discountPct: String(item.discountPct ?? item.discount_pct ?? 0),
//   lineTotal : String(item.lineTotal ?? item.line_total ?? 0),
//   type: 'PUR',
//   }
// }));


const detailsPayload = items.map((item: any) => {
  console.log("====Current item:===============", item);

  return {
    transactionId: headerId,
    RawMaterialId: item.rawMaterialId,
    itemname: String(
      item.name ||
      item.itemName ||
      item.rawMaterialName ||
      ''
    ),
    unit: String(item.unit || ''),
    qty: Number(item.quantity ?? item.qty ?? 0),
    unitCost: String(item.unitCost ?? item.unit_cost ?? 0),
    discountPct: String(item.discountPct ?? item.discount_pct ?? 0),
    lineTotal: String(item.lineTotal ?? item.line_total ?? 0),
    type: 'PUR',
  };
});


console.log('***** EXECUTING DETAILS INSERT ===', detailsPayload,"  ****************");

const insertedDetails = await tx
  .insert(stockDetails)
  .values(detailsPayload as any)
  .returning();

  return { ...newTransaction, details: insertedDetails };
});

    return reply.code(201).send({ message: 'Transaction saved successfully', data: result });
  } catch (error: any) {
    console.error('=== DB ERROR ===', error);
    return reply.code(500).send({ error: 'Failed to create transaction', details: error?.message || String(error) });
  }
});

  // ==========================================
  // 4. PUT /api/stock-transactions/:id (Update Existing)
  // Ensures transaction being updated matches the restaurantId
  // ==========================================
//   fastify.put<{ Params: { id: string }; Body: CreateStockTransactionPayload }>(
//     '/api/stock-transactions/:id',
//     async (request, reply) => {
//       const transactionId = parseInt(request.params.id, 10);
//       const { items, ...headerData } = request.body;

//       if (!headerData.restaurantId) {
//         return reply.code(400).send({ error: 'restaurantId is required.' });
//       }

//       if (!headerData.supplierName?.trim()) {
//         return reply.code(400).send({ error: 'Supplier is required.' });
//       }

//       if (!Array.isArray(items) || items.length === 0) {
//         return reply.code(400).send({ error: 'At least one transaction item is required.' });
//       }

//       try {
//         const result = await db.transaction(async (tx) => {
//           // Update only if both TransactionID and RestaurantID match
//           const [updatedTransaction] = await tx
//             .update(stockTransactions)
//             .set({
//               ...headerData,
//               updatedAt: new Date(),
//             })
//            .where(
//   and(
//     eq(stockTransactions.transactionId, transactionId),
//     eq(stockTransactions.restaurantId, headerData.restaurantId!)
//   )
// )
//             .returning();

//           if (!updatedTransaction) {
//             throw new Error('NOT_FOUND');
//           }

//           // Delete Old Details
//           await tx
//             .delete(stockDetails)
//             .where(eq(stockDetails.transactionId, transactionId));

//           // Insert New Details
//           const detailsToInsert = items.map((item) => ({
//             ...item,
//             transactionId: transactionId,
//             type: item.type || updatedTransaction.type,
//           }));

//           const insertedDetails = await tx
//             .insert(stockDetails)
//             .values(detailsToInsert)
//             .returning();

//           return { ...updatedTransaction, details: insertedDetails };
//         });

//         return reply.code(200).send({
//           message: 'Transaction updated successfully',
//           data: result,
//         });
//       } catch (error) {
//         if (error instanceof Error && error.message === 'NOT_FOUND') {
//           return reply.code(404).send({ error: 'Stock transaction not found for this restaurant' });
//         }
//         request.log.error(error);
//         return reply.code(500).send({ error: 'Failed to update transaction' });
//       }
//     }
//   );

fastify.put<{ Params: { id: string }; Body: any }>(
  '/api/stock-transactions/:id',
  async (request, reply) => {
    const transactionId = parseInt(request.params.id, 10);
    if (Number.isNaN(transactionId)) {
      return reply.code(400).send({ error: 'Invalid transaction id.' });
    }

    const body = request.body as Record<string, any>;
    const items = body.items || [];

    // Casing-tolerant extraction (same as POST)
    const restaurantId  = body.restaurantId ?? body.restaurant_id ?? body.RestaurantID;
    const supplierName  = body.supplierName ?? body.supplier_name ?? body.SupplierName;
    const grnNumber     = body.grnNumber ?? body.grn_number ?? body.GRNNumber;
    const receivedAt    = body.receivedAt ?? body.received_at ?? body.TransactionDate;
    const reference     = body.reference ?? body.Reference;
    const comment       = body.comment ?? body.Comment;
    const subtotal      = body.subtotal ?? body.Subtotal ?? 0;
    const discountAmount = body.discountAmount ?? body.discount ?? body.DiscountAmount ?? 0;
    const taxAmount     = body.taxAmount ?? body.tax ?? body.TaxAmount ?? 0;
    const netTotal      = body.netTotal ?? body.net_total ?? body.NetTotal ?? 0;
    const status        = body.status ?? body.Status ?? 'DRAFT';
    const type          = body.type ?? body.Type ?? 'PUR';

    if (!restaurantId) {
      return reply.code(400).send({ error: 'restaurantId is required.' });
    }
    if (!supplierName || !String(supplierName).trim()) {
      return reply.code(400).send({ error: 'Supplier is required.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'At least one transaction item is required.' });
    }

    try {
      const result = await db.transaction(async (tx) => {
        // Build a clean, schema-shaped header payload (do NOT spread raw body)
        const headerPayload: Record<string, any> = {
          RestaurantID: Number(restaurantId),
          restaurantId: Number(restaurantId),

          GRNNumber: grnNumber ? String(grnNumber) : null,
          grnNumber: grnNumber ? String(grnNumber) : null,

          SupplierName: String(supplierName),
          supplierName: String(supplierName),

          TransactionDate: receivedAt ? new Date(receivedAt) : new Date(),
          transactionDate: receivedAt ? new Date(receivedAt) : new Date(),

          Reference: reference ? String(reference) : null,
          reference: reference ? String(reference) : null,

          Comment: comment ? String(comment) : null,
          comment: comment ? String(comment) : null,

          Subtotal: String(subtotal),
          subtotal: String(subtotal),

          DiscountAmount: String(discountAmount),
          discountAmount: String(discountAmount),

          TaxAmount: String(taxAmount),
          taxAmount: String(taxAmount),

          NetTotal: String(netTotal),
          netTotal: String(netTotal),

          Status: String(status),
          status: String(status),

          type: String(type),

          updatedAt: new Date(),
        };

        // Drop undefined values so Drizzle doesn't complain
        for (const k of Object.keys(headerPayload)) {
          if (headerPayload[k] === undefined) delete headerPayload[k];
        }

        const [updatedTransaction] = await tx
          .update(stockTransactions)
          .set(headerPayload)
          .where(
            and(
              eq(stockTransactions.transactionId, transactionId),
              eq(stockTransactions.restaurantId, Number(restaurantId))
            )
          )
          .returning();

        if (!updatedTransaction) throw new Error('NOT_FOUND');

        // Delete old lines
        await tx
          .delete(stockDetails)
          .where(eq(stockDetails.transactionId, transactionId));

        // Map items exactly like the POST does
        const detailsPayload = items.map((item: any) => ({
          transactionId,
          RawMaterialId:
            item.rawMaterialId ??
            item.rawMaterialID ??
            item.RawMaterialID ??
            item.id,
          itemname: String(
            item.name ||
            item.itemName ||
            item.rawMaterialName ||
            item.itemname ||
            ''
          ),
          unit: String(item.unit || ''),
          qty: Number(item.quantity ?? item.qty ?? 0),
          unitCost: String(item.unitCost ?? item.unit_cost ?? 0),
          discountPct: String(item.discountPct ?? item.discount_pct ?? 0),
          lineTotal: String(item.lineTotal ?? item.line_total ?? 0),
          type: String(item.type || type || 'PUR'),
        }));

        const insertedDetails = await tx
          .insert(stockDetails)
          .values(detailsPayload as any)
          .returning();

        return { ...updatedTransaction, details: insertedDetails };
      });

      return reply.code(200).send({
        message: 'Transaction updated successfully',
        data: result,
      });
    } catch (error: any) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        return reply.code(404).send({
          error: 'Stock transaction not found for this restaurant',
        });
      }
      request.log.error(error);
      // Include details so you can actually see what Drizzle is complaining about
      return reply.code(500).send({
        error: 'Failed to update transaction',
        details: error?.message || String(error),
      });
    }
  }
);



fastify.get<{
  Params: {
    transactionId: string;
  };
  Querystring: {
    restaurantId: string;
  };
}>(
  '/api/stock-transactions/:transactionId',
  async (request, reply ) => {
    const { transactionId } = request.params;
    const { restaurantId } = request.query;

    if (!restaurantId) {
      return reply.code(400).send({
        error: 'restaurantId query parameter is required.',
      });
    }

    const parsedTransactionId = Number(transactionId);
    const parsedRestaurantId = Number(restaurantId);

    if (
      !Number.isInteger(parsedTransactionId) ||
      parsedTransactionId <= 0
    ) {
      return reply.code(400).send({
        error: 'transactionId must be a valid positive number.',
      });
    }

    if (
      !Number.isInteger(parsedRestaurantId) ||
      parsedRestaurantId <= 0
    ) {
      return reply.code(400).send({
        error: 'restaurantId must be a valid positive number.',
      });
    }

    try {
      const transactions = await db
        .select({
          transactionId: stockTransactions.transactionId,
          restaurantId: stockTransactions.restaurantId,
          transactionNumber: stockTransactions.transactionNumber,
          grnNumber: stockTransactions.grnNumber,
          supplierName: stockTransactions.supplierName,
          transactionDate: sql<string>`"TransactionDate"::text`,
          reference: stockTransactions.reference,
          comment: stockTransactions.comment,
          subtotal: stockTransactions.subtotal,
          discountAmount: stockTransactions.discountAmount,
          taxableAmount: stockTransactions.taxableAmount,
          taxAmount: stockTransactions.taxAmount,
          netTotal: stockTransactions.netTotal,
          status: stockTransactions.status,
          type: stockTransactions.type,
        })
        .from(stockTransactions)
        .where(
          and(
            eq(stockTransactions.transactionId, parsedTransactionId),
            eq(stockTransactions.restaurantId, parsedRestaurantId),
          ),
        )
        .limit(1);

      if (!transactions.length) {
        return reply.code(404).send({
          error: 'Stock transaction not found.',
        });
      }

      const transaction = transactions[0];

      const details = await db
        .select()
        .from(stockDetails)
        .where(
          eq(stockDetails.transactionId, parsedTransactionId),
        );

      return reply.code(200).send({
        ...transaction,
        details,
      });
    } catch (error) {
      request.log.error(error);

      return reply.code(500).send({
        error: 'Failed to fetch stock transaction.',
      });
    }
  },
);







}