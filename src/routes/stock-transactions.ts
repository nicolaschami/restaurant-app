import { FastifyInstance } from 'fastify';
import { eq, and,sql ,desc,inArray} from 'drizzle-orm';
import { db } from "../db";
import { stockTransactions, stockDetails, rawMaterials } from '../db/schema';
import type { CreateStockTransactionPayload } from '../db/schema';
import { getRestaurantId } from '../lib/tenant.js';

// ==========================================================================
// STOCK MOVEMENTS
//
// A saved purchase is POSTED: its quantities are added to the raw materials'
// current_stock right away. The purchase lines are the history ("ledger");
// raw_materials.current_stock is the running balance. Both change together,
// inside the same database transaction, so they always agree.
//
// Units: no conversion yet — the quantity entered is added as is.
// ==========================================================================

type StockLine = { rawMaterialId: number; qty: number; unitCost?: number; discountPct?: number };

class StockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StockError';
  }
}

// sign = +1 to add the quantities (post), -1 to take them back out (before an edit).
// When adding, the material's last purchase price becomes the line's cost after its discount.
async function moveStock(tx: any, restaurantId: number, lines: StockLine[], sign: 1 | -1) {
  const valid = lines.filter((l) => l.rawMaterialId && Number.isFinite(l.qty));
  if (valid.length === 0) return;

  // Every raw material must belong to this restaurant.
  const ids = [...new Set(valid.map((l) => l.rawMaterialId))];
  const owned = await tx
    .select({ id: rawMaterials.id })
    .from(rawMaterials)
    .where(and(inArray(rawMaterials.id, ids), eq(rawMaterials.restaurantId, restaurantId)));
  if (owned.length !== ids.length) {
    throw new StockError('One or more items are not raw materials of this restaurant.');
  }

  for (const line of valid) {
    const change = sign * line.qty;
    const set: Record<string, any> = {
      currentStock: sql`COALESCE(${rawMaterials.currentStock}, 0) + ${change}`,
    };
    if (sign > 0 && line.unitCost !== undefined) {
      const netUnitCost = line.unitCost * (1 - (line.discountPct || 0) / 100);
      set.lastPurchasePrice = netUnitCost.toFixed(4);
    }
    await tx.update(rawMaterials).set(set).where(eq(rawMaterials.id, line.rawMaterialId));
  }
}

// Two kinds of transaction share the same tables and screens:
//   PUR = purchase         → stock goes UP,   numbers GRN-0001…
//   RP  = purchase return  → stock goes DOWN, numbers RP-0001…
type TxKind = 'PUR' | 'RP';
const txKind = (value: unknown): TxKind => (String(value ?? '').toUpperCase() === 'RP' ? 'RP' : 'PUR');
const stockSign = (kind: TxKind): 1 | -1 => (kind === 'RP' ? -1 : 1);
const numberPrefix = (kind: TxKind) => (kind === 'RP' ? 'RP' : 'GRN');

// Next number for a restaurant and kind: GRN-0001… or RP-0001…
// pg_advisory_xact_lock holds a lock (per restaurant and kind) until the
// transaction ends, so a second save waits and then sees the first one's number.
async function nextPurchaseNumber(tx: any, restaurantId: number, kind: TxKind = 'PUR'): Promise<string> {
  const prefix = numberPrefix(kind);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'purchase-number-' + prefix}), ${restaurantId})`);
  const [row] = await tx.execute(sql`
    SELECT COALESCE(MAX(SUBSTRING("GRNNumber" FROM ${'^' + prefix + '-([0-9]+)$'})::int), 0) + 1 AS next
    FROM stocktransactions
    WHERE "RestaurantID" = ${restaurantId}
  `);
  return `${prefix}-${String((row as { next: number }).next).padStart(4, '0')}`;
}

// The lines of a request body, in the form moveStock() needs.
const stockLinesFromItems = (items: any[]): StockLine[] =>
  items.map((item: any) => ({
    rawMaterialId: Number(item.rawMaterialId ?? item.rawMaterialID ?? item.RawMaterialID ?? item.id),
    qty: Number(item.quantity ?? item.qty ?? 0),
    unitCost: Number(item.unitCost ?? item.unit_cost ?? 0),
    discountPct: Number(item.discountPct ?? item.discount_pct ?? 0),
  }));

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
fastify.get<{ Querystring: { restaurantId: string; type?: string } }>(
    '/api/stock-transactions',
    async (request, reply) => {
      // The restaurant comes from the login token; ?restaurantId is ignored.
      const parsedRestaurantId = getRestaurantId(request);
      // ?type=RP → purchase returns only; anything else → purchases only.
      const kind = txKind(request.query.type);

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
          .where(
            and(
              eq(stockTransactions.restaurantId, parsedRestaurantId),
              // Old purchases may have another/empty type: everything that is not RP is a purchase.
              kind === 'RP'
                ? eq(stockTransactions.type, 'RP')
                : sql`COALESCE(${stockTransactions.type}, '') <> 'RP'`
            )
          )
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

  // The purchase belongs to the user's restaurant (login token), not to the body's restaurantId.
  const restaurantId = getRestaurantId(request);

  // Extract variables safely checking all casing variations
  const supplierName = body.supplierName ?? body.supplier_name ?? body.SupplierName;
  // (The purchase number is assigned by the server below, not taken from the body.)
  const receivedAt = body.receivedAt ?? body.received_at ?? body.TransactionDate;
  const reference = body.reference ?? body.Reference;
  const comment = body.comment ?? body.Comment;
  const subtotal = body.subtotal ?? body.Subtotal ?? 0;
  const discountAmount = body.discountAmount ?? body.discount ?? body.DiscountAmount ?? 0;
  const taxAmount = body.taxAmount ?? body.tax ?? body.TaxAmount ?? 0;
  const netTotal = body.netTotal ?? body.net_total ?? body.NetTotal ?? 0;
  // Every saved purchase is posted (its stock is applied below).
  const status = 'POSTED';
  // PUR (purchase) or RP (purchase return) — the only difference between the two.
  const type: TxKind = txKind(body.type);

  try {
   const result = await db.transaction(async (tx) => {
  // Extract values cleanly from request body
  const body = request.body as Record<string, any>;

  // The purchase number is chosen HERE, never by the screen: GRN-0001, GRN-0002…
  // per restaurant. The lock makes two purchases saved at the same moment wait
  // for each other, so they can never get the same number.
  const purchaseNumber = await nextPurchaseNumber(tx, restaurantId, type);

const headerPayload: any = {
  // One number shown everywhere (list, detail, purchase screen).
  TransactionNumber: purchaseNumber,
  transactionNumber: purchaseNumber,

  RestaurantID: Number(restaurantId),
  restaurantId: Number(restaurantId),

  GRNNumber: purchaseNumber,
  grnNumber: purchaseNumber,

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
    type, // PUR or RP, same as the header
  };
});


console.log('***** EXECUTING DETAILS INSERT ===', detailsPayload,"  ****************");

// Posted → add the received quantities to stock (same transaction: all or nothing).
// Done BEFORE writing the lines, so an item of another restaurant is refused
// with a clear message.
// Purchase → stock up (+); return → stock down (−).
await moveStock(tx, restaurantId, stockLinesFromItems(items), stockSign(type));

const insertedDetails = await tx
  .insert(stockDetails)
  .values(detailsPayload as any)
  .returning();

  return { ...newTransaction, details: insertedDetails };
});

    return reply.code(201).send({ message: 'Transaction saved successfully', data: result });
  } catch (error: any) {
    if (error instanceof StockError) {
      return reply.code(400).send({ error: error.message });
    }
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

    // Restaurant from the login token: you can only update your own restaurant's purchases.
    const restaurantId  = getRestaurantId(request);

    // Casing-tolerant extraction (same as POST)
    const supplierName  = body.supplierName ?? body.supplier_name ?? body.SupplierName;
    // (The purchase number never changes on edit, so it is not read from the body.)
    const receivedAt    = body.receivedAt ?? body.received_at ?? body.TransactionDate;
    const reference     = body.reference ?? body.Reference;
    const comment       = body.comment ?? body.Comment;
    const subtotal      = body.subtotal ?? body.Subtotal ?? 0;
    const discountAmount = body.discountAmount ?? body.discount ?? body.DiscountAmount ?? 0;
    const taxAmount     = body.taxAmount ?? body.tax ?? body.TaxAmount ?? 0;
    const netTotal      = body.netTotal ?? body.net_total ?? body.NetTotal ?? 0;
    // Saving = posted. An old draft becomes posted (and counts in stock) when edited.
    const status        = 'POSTED';
    // (The type — PUR or RP — never changes on edit; it is read from the saved row below.)

    if (!supplierName || !String(supplierName).trim()) {
      return reply.code(400).send({ error: 'Supplier is required.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'At least one transaction item is required.' });
    }

    try {
      const result = await db.transaction(async (tx) => {
        // Was this purchase already counted in stock? (old drafts were not)
        const [before] = await tx
          .select({ status: stockTransactions.status, type: stockTransactions.type })
          .from(stockTransactions)
          .where(
            and(
              eq(stockTransactions.transactionId, transactionId),
              eq(stockTransactions.restaurantId, Number(restaurantId))
            )
          );
        if (!before) throw new Error('NOT_FOUND');
        const wasPosted = String(before.status || '').toUpperCase() === 'POSTED';
        const type: TxKind = txKind(before.type); // purchase stays purchase, return stays return

        // Build a clean, schema-shaped header payload (do NOT spread raw body)
        const headerPayload: Record<string, any> = {
          RestaurantID: Number(restaurantId),
          restaurantId: Number(restaurantId),

          // The purchase number is NOT updated: it was given when the purchase
          // was created and never changes.

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

          type, // unchanged

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

        // If it was posted, first undo the effect of its OLD lines on stock;
        // the new lines are applied again below. Net effect = only the difference.
        if (wasPosted) {
          const oldLines = await tx
            .select({ rawMaterialId: stockDetails.RawMaterialId, qty: stockDetails.qty })
            .from(stockDetails)
            .where(eq(stockDetails.transactionId, transactionId));
          await moveStock(
            tx,
            Number(restaurantId),
            oldLines.map((l) => ({ rawMaterialId: Number(l.rawMaterialId), qty: Number(l.qty) })),
            // Undo the old effect: a purchase had added (+), so take out; a return had removed (−), so put back.
            (-stockSign(type)) as 1 | -1
          );
        }

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
          type, // PUR or RP, same as the header
        }));

        // Apply the NEW lines: purchase → stock up (and last purchase price updated),
        // return → stock down. Before writing the lines, so an item of another
        // restaurant is refused clearly.
        await moveStock(tx, Number(restaurantId), stockLinesFromItems(items), stockSign(type));

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
      if (error instanceof StockError) {
        return reply.code(400).send({ error: error.message });
      }
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

    const parsedTransactionId = Number(transactionId);
    // Restaurant from the login token; ?restaurantId is ignored.
    const parsedRestaurantId = getRestaurantId(request);

    if (
      !Number.isInteger(parsedTransactionId) ||
      parsedTransactionId <= 0
    ) {
      return reply.code(400).send({
        error: 'transactionId must be a valid positive number.',
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