// src/routes/orders.ts

import { FastifyInstance } from 'fastify';
import { roomManager } from '../lib/roomManager';
import { db } from '../db';
import { orders, orderItems, menuItems, restaurantTables } from '../db/schema';
import { eq, max, inArray, sql, and, ne } from 'drizzle-orm';

interface OrderItemInput {
  menuItemId: number;
  name?: string;
  quantity: number;
  unitPrice?: number | string;
  variantSize?: string | null;
  isComp?: boolean;
  compReason?: string | null;
  modifiers?: any[] | null;
  lineTotal?: number | string;
}

interface CreateOrderBody {
  restaurantId: number;
  ticketNo?: number;
  orderType?: string;
  orderStatus?:string;
  tableStatus?: 'free' | 'occupied';   // 👈 new — sent explicitly by the frontend
  tableId?: number | string | null;
  tableLabel?: string | null;
  customerId?: number | string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  deliveryFee?: number | string;
  subtotal?: number | string;
  tax?: number | string;
  total?: number | string;
  items: OrderItemInput[];
}

/**
 * Helper to select the correct price column based on orderType
 */
function getPriceForOrderType(item: any, orderType?: string): number {
  const normalizedType = (orderType || '').toLowerCase();

  if (normalizedType.includes('dine')) {
    return Number(item.priceDineIn ?? 0);
  }
  if (normalizedType.includes('take') || normalizedType.includes('pick')) {
    return Number(item.priceTakeout ?? item.priceDineIn ?? 0);
  }
  if (normalizedType.includes('deliver')) {
    return Number(item.priceDelivery ?? item.priceDineIn ?? 0);
  }

  // Default fallback
  return Number(item.priceDineIn ?? 0);
}

export default async function orderRoutes(fastify: FastifyInstance) {
  // 1. CREATE ORDER
fastify.post('/api/orders', async (request, reply) => {
  const body = (request.body || {}) as CreateOrderBody;

  if (!body || !body.restaurantId) {
    return reply.status(400).send({ error: 'restaurantId is required.' });
  }

  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return reply.status(400).send({ error: 'Order must contain at least one item.' });
  }

  const {
    restaurantId,
    tableId,
    orderType,
    orderStatus,
    tableStatus,
    customerName,
    customerPhone,
    customerAddress,
    total,
    items,
  } = body;

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Fetch menu items with dynamic price columns
      const requestedIds = items.map((i) => Number(i.menuItemId));
      const dbMenuItems = await tx
        .select({
          id: menuItems.id,
          priceDineIn: menuItems.priceDineIn,
          priceTakeout: menuItems.priceTakeaway,
          priceDelivery: menuItems.priceDelivery,
        })
        .from(menuItems)
        .where(inArray(menuItems.id, requestedIds));

      // Map base price according to orderType
      const priceMap = new Map<number, number>();
      dbMenuItems.forEach((item) => {
        const selectedPrice = getPriceForOrderType(item, orderType);
        priceMap.set(item.id, selectedPrice);
      });

      // 2. Compute item totals, unit prices, and attach variantSize
      let computedGrandTotal = 0;
      const preparedItems = items.map((item) => {
        const qty = Number(item.quantity || 1);
        const dbPrice = priceMap.get(Number(item.menuItemId)) || 0;

        const itemSubtotal =
          item.lineTotal != null ? Number(item.lineTotal) : qty * dbPrice;

        let unitPriceNum: number;
        if (item.unitPrice != null && Number(item.unitPrice) > 0) {
          unitPriceNum = Number(item.unitPrice);
        } else if (itemSubtotal > 0 && qty > 0) {
          unitPriceNum = itemSubtotal / qty;
        } else {
          unitPriceNum = dbPrice;
        }

        computedGrandTotal += itemSubtotal;

        return {
          menuItemId: Number(item.menuItemId),
          quantity: qty,
          quantityFired: qty,
          // FIX: was `quantityOrderd` — verify this matches your actual schema
          // column name exactly (likely `quantityOrdered`). A mismatch here
          // will make Drizzle throw on every insert, which was very possibly
          // the reason POST was failing outright.
          quantityOrdered: qty,
          quantityCompleted: 0,
          kdsStatus: 'FIRE_SENT' as const,
          unitPrice: unitPriceNum.toFixed(2),
          subtotal: itemSubtotal.toFixed(2),
          variantSize: item.variantSize ?? null,
          modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
          fireBatchNumber: 1,
          firedAt: new Date(),
        };
      });

      const finalTotalAmount =
        total != null ? Number(total).toFixed(2) : computedGrandTotal.toFixed(2);

      // 3. Sequential ticket number generation
      const maxTicketResult = await tx
        .select({ maxTicket: max(orders.ticketNo) })
        .from(orders)
        .where(eq(orders.restaurantId, Number(restaurantId)));

      const currentMax = maxTicketResult[0]?.maxTicket ?? 1000;
      const nextTicketNo = currentMax + 1;

      // 4. Insert Order Header
      const [newOrder] = await tx
        .insert(orders)
        .values({
          restaurantId: Number(restaurantId),
          ticketNo: nextTicketNo,
          tableId: tableId ? Number(tableId) : null,
          totalAmount: finalTotalAmount,
          status: orderStatus ?? 'open',
          // FIX: this was missing entirely. GET /api/kds/active filters on
          // orders.kdsStatus IN ('FIRE_SENT','PARTIAL_FIRE') — without this,
          // the order row's kdsStatus stayed NULL/default and a brand-new
          // order could never appear on the KDS screen, no matter what.
          kdsStatus: 'FIRE_SENT',
          orderType: orderType ?? 'dine_in',
          customerName: customerName ?? null,
          customerPhone: customerPhone ?? null,
          deliveryAddress: customerAddress ?? null,
        })
        .returning();

      // 5. Update Table Status to 'occupied' (if tableId is provided)
      if (tableId) {
        await tx
          .update(restaurantTables)
          .set({ status: tableStatus ?? 'occupied' })
          .where(eq(restaurantTables.id, Number(tableId)));
      }

      // 6. Insert Order Items (includes variantSize)
      const itemsToInsert = preparedItems.map((item) => ({
        ...item,
        orderId: newOrder.id,
      }));

      const insertedItems = await tx
        .insert(orderItems)
        .values(itemsToInsert)
        .returning();

      return {
        ...newOrder,
        items: insertedItems,
      };
    });

    // Broadcast to every dashboard/POS/KDS screen watching this restaurant
    if (result?.restaurantId) {
      roomManager.broadcastToRestaurant(
        String(result.restaurantId),
        'ORDER_UPDATED',
        result
      );
    }

    return reply.status(201).send({ order: result });

  } catch (err: any) {
    console.error('❌ Order creation failed:', err);
    return reply.status(500).send({
      error: err.message || 'Internal Server Error',
      details: err.stack,
    });
  }
});

// update order 

// fastify.put('/api/orders/:id', async (request, reply) => {
//   const { id } = request.params as { id: string };
//   const orderId = Number(id);
//   const body = (request.body || {}) as CreateOrderBody;

//   if (!orderId || isNaN(orderId)) {
//     return reply.status(400).send({ error: 'Valid Order ID is required for update.' });
//   }

//  try {
//   const result = await db.transaction(async (tx) => {
//     // 🔍 LOG 1: Incoming payload values before updating
//     console.log('--- 🔄 DB UPDATE START ---');
//     console.log(`Target Order ID: ${orderId}`);
//     console.log(`Received body.orderStatus: "${body.orderStatus}"`);
//     console.log(`Received body.status: "${body.orderStatus}"`);

//     // Determine target status safely (fallback to body.status if body.orderStatus is undefined)
//     const targetStatus = body.orderStatus ??  'open';
//     console.log(`Final Status Sent to DB: "${targetStatus}"`);

//     // 1. UPDATE existing order header
//     const [updatedOrder] = await tx
//       .update(orders)
//       .set({
//         orderType: body.orderType ?? 'Dine-In',
//         totalAmount: String(body.total),
//         deliveryAddress: body.customerAddress ?? null,
//         customerName: body.customerName ?? null,
//         customerPhone: body.customerPhone ?? null,
//         status: targetStatus, // 👈 Uses sanitized targetStatus
//         tableId: body.tableId ? Number(body.tableId) : null,
//       })
//       .where(eq(orders.id, orderId))
//       .returning();

//     if (!updatedOrder) {
//       throw new Error('ORDER_NOT_FOUND');
//     }


//     if (!updatedOrder) {
//   throw new Error('ORDER_NOT_FOUND');
// }

// // 👇 new: sync table status on Hold vs Pay
// if (updatedOrder.tableId) {
//   await tx
//     .update(restaurantTables)
//     .set({ status: body.tableStatus ?? 'occupied' })
//     .where(eq(restaurantTables.id, updatedOrder.tableId));
// }
//     // 🔍 LOG 2: Verification of record returned from DB
//     console.log('✅ DB Updated Row Result:', {
//       id: updatedOrder.id,
//       status: updatedOrder.status,
//       totalAmount: updatedOrder.totalAmount,
//       tableId: updatedOrder.tableId,
//     });

//     // 2. Clear old items and re-insert updated items for THIS orderId
//     await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));

//     const itemsToInsert = body.items.map((item) => ({
//       orderId: orderId,
//       menuItemId: Number(item.menuItemId),
//       quantity: Number(item.quantity),
//       unitPrice: String(item.unitPrice),
//       subtotal: String(item.lineTotal),
//       variantSize: item.variantSize ?? null,
//       modifiers: item.modifiers ?? [],
//     }));

//     const insertedItems = await tx
//       .insert(orderItems)
//       .values(itemsToInsert)
//       .returning();

//     console.log(`✅ Re-inserted ${insertedItems.length} items for Order #${orderId}`);
//     console.log('--- 🔄 DB UPDATE END ---');

//     return { ...updatedOrder, items: insertedItems };
//   });
// if (result?.restaurantId) {
//     roomManager.broadcastToRestaurant(
//       String(result.restaurantId),
//       'ORDER_UPDATED', // Action/Event type for your frontend listeners
//       result          // The payload containing updated header + re-inserted items
//     );
//   }
//   return reply.status(200).send({ order: result });
// } catch (err: any) {
//   console.error('❌ Order Update Failed:', err);
//   return reply.status(500).send({ error: err.message });
// }
// });

// fastify.put('/api/orders/:id', async (request, reply) => {
//   const { id } = request.params as { id: string };
//   const orderId = Number(id);
//   const body = (request.body || {}) as CreateOrderBody;

//   if (!orderId || isNaN(orderId)) {
//     return reply.status(400).send({ error: 'Valid Order ID is required.' });
//   }

//   try {
//     const result = await db.transaction(async (tx) => {
//       // 1. Fetch current order header & existing items
//       const existingOrder = await tx
//         .select()
//         .from(orders)
//         .where(eq(orders.id, orderId))
//         .limit(1);

//       if (!existingOrder || existingOrder.length === 0) {
//         throw new Error('ORDER_NOT_FOUND');
//       }

//       const currentOrder = existingOrder[0];
//       const existingItems = await tx
//         .select()
//         .from(orderItems)
//         .where(eq(orderItems.orderId, orderId));

//       // 2. Increment revision count & prepare order updates
//       const nextRevision = (currentOrder.revisionNumber || 1) + 1;
//       const targetOrderStatus = body.orderStatus ?? currentOrder.status;

//       // 3. Process item updates using Split Line pattern
//       let newlyFiredCount = 0;
//       const itemsToInsert: any[] = [];
//       const itemIdsToCancel: number[] = [];
//       const itemQuantityAdjustments: { id: number; newQuantity: number }[] = [];

//       // Group existing (non-cancelled) rows by menuItemId, keeping every
//       // row (not just the primary one) so removals/reductions can target
//       // the right rows instead of only ever looking at one.
//       type ExistingItemRow = (typeof existingItems)[number];

//       const existingQtyMap = new Map<number, { totalQty: number; rows: ExistingItemRow[] }>();

//       for (const item of existingItems) {
//         if (item.kdsStatus === 'CANCELLED') continue;
//         const key = Number(item.menuItemId);
//         const current = existingQtyMap.get(key);
//         if (!current) {
//           existingQtyMap.set(key, { totalQty: Number(item.quantity), rows: [item] });
//         } else {
//           current.totalQty += Number(item.quantity);
//           current.rows.push(item);
//         }
//       }

//       const incomingItemKeys = new Set<number>();

//       for (const item of body.items) {
//         const menuItemId = Number(item.menuItemId);
//         const incomingQty = Number(item.quantity);
//         incomingItemKeys.add(menuItemId);

//         const existingRecord = existingQtyMap.get(menuItemId);

//         if (!existingRecord) {
//           // CASE A: Brand new item added to existing order
//           itemsToInsert.push({
//             orderId,
//             menuItemId,
//             quantity: incomingQty,
//             quantityFired: incomingQty,
//             quantityCompleted: 0,
//             unitPrice: String(item.unitPrice),
//             subtotal: String(item.lineTotal),
//             variantSize: item.variantSize ?? null,
//             modifiers: item.modifiers ?? [],
//             kdsStatus: 'FIRE_SENT',
//             fireBatchNumber: nextRevision,
//             firedAt: new Date(),
//           });
//           newlyFiredCount += incomingQty;

//         } else if (incomingQty > existingRecord.totalQty) {
//           // CASE B: Quantity increased — Split Line: insert the delta as a
//           // new add-on row so the kitchen only fires what's genuinely new.
//           const deltaQty = incomingQty - existingRecord.totalQty;
//           const unitPriceNum = Number(item.unitPrice) || 0;
//           const primaryItem = existingRecord.rows[0];

//           itemsToInsert.push({
//             orderId,
//             menuItemId,
//             parentItemId: primaryItem.id,
//             quantity: deltaQty,
//             quantityFired: deltaQty,
//             quantityCompleted: 0,
//             unitPrice: String(item.unitPrice),
//             subtotal: (deltaQty * unitPriceNum).toFixed(2),
//             variantSize: item.variantSize ?? null,
//             modifiers: item.modifiers ?? [],
//             kdsStatus: 'FIRE_SENT',
//             fireBatchNumber: nextRevision,
//             firedAt: new Date(),
//           });
//           newlyFiredCount += deltaQty;

//         } else if (incomingQty < existingRecord.totalQty) {
//           // FIX — CASE C was previously an empty comment, meaning a
//           // reduced quantity was silently ignored and the kitchen kept
//           // seeing the old, larger amount forever.
//           //
//           // Strategy: shrink the primary row's quantity down to what's
//           // needed first; if that alone isn't enough (multiple split rows
//           // exist), cancel additional rows starting from the most recently
//           // fired, until the total matches incomingQty.
//           let remainingToRemove = existingRecord.totalQty - incomingQty;
//           // Most recently fired rows get cancelled first — the original
//           // line item is the one most likely already in progress.
//           const rowsNewestFirst = [...existingRecord.rows].sort(
//             (a, b) => (b.fireBatchNumber ?? 0) - (a.fireBatchNumber ?? 0)
//           );

//           for (const row of rowsNewestFirst) {
//             if (remainingToRemove <= 0) break;
//             const rowQty = Number(row.quantity);

//             if (rowQty <= remainingToRemove) {
//               // Cancel this whole row
//               itemIdsToCancel.push(row.id);
//               remainingToRemove -= rowQty;
//             } else {
//               // Partially reduce this row
//               itemQuantityAdjustments.push({
//                 id: row.id,
//                 newQuantity: rowQty - remainingToRemove,
//               });
//               remainingToRemove = 0;
//             }
//           }
//         }
//       }

//       // CASE D: item removed from the order entirely — cancel every
//       // remaining active row for any menuItemId no longer present at all.
//       for (const [menuItemId, record] of existingQtyMap.entries()) {
//         if (!incomingItemKeys.has(menuItemId)) {
//           record.rows.forEach((row) => itemIdsToCancel.push(row.id));
//         }
//       }

//       // 4. Update order header
//       const newKdsStatus = newlyFiredCount > 0 ? 'PARTIAL_FIRE' : currentOrder.kdsStatus;

//       const [updatedOrder] = await tx
//         .update(orders)
//         .set({
//           orderType: body.orderType ?? currentOrder.orderType,
//           totalAmount: String(body.total),
//           deliveryAddress: body.customerAddress ?? currentOrder.deliveryAddress,
//           customerName: body.customerName ?? currentOrder.customerName,
//           customerPhone: body.customerPhone ?? currentOrder.customerPhone,
//           status: targetOrderStatus,
//           kdsStatus: newKdsStatus,
//           revisionNumber: nextRevision,
//           lastFiredAt: newlyFiredCount > 0 ? new Date() : currentOrder.lastFiredAt,
//           tableId: body.tableId ? Number(body.tableId) : currentOrder.tableId,
//         })
//         .where(eq(orders.id, orderId))
//         .returning();

//       // 5. Update Table Status
//       if (updatedOrder.tableId) {
//         await tx
//           .update(restaurantTables)
//           .set({ status: body.tableStatus ?? 'occupied' })
//           .where(eq(restaurantTables.id, updatedOrder.tableId));
//       }

//       // 6. Insert new split-line add-on items (if any)
//       let insertedNewItems: any[] = [];
//       if (itemsToInsert.length > 0) {
//         insertedNewItems = await tx
//           .insert(orderItems)
//           .values(itemsToInsert)
//           .returning();
//       }

//       // 7. FIX — actually apply the removals/reductions computed above.
//       // Previously nothing in this handler ever wrote a cancellation or
//       // quantity decrease back to the database.
//       if (itemIdsToCancel.length > 0) {
//         await tx
//           .update(orderItems)
//           .set({ kdsStatus: 'CANCELLED' })
//           .where(inArray(orderItems.id, itemIdsToCancel));
//       }

//       for (const adjustment of itemQuantityAdjustments) {
//         await tx
//           .update(orderItems)
//           .set({ quantity: adjustment.newQuantity, quantityFired: adjustment.newQuantity })
//           .where(eq(orderItems.id, adjustment.id));
//       }

//       // 8. Return complete updated order state
//       const allActiveItems = await tx
//         .select()
//         .from(orderItems)
//         .where(eq(orderItems.orderId, orderId));

//       return {
//         ...updatedOrder,
//         items: allActiveItems,
//         newlyFiredItems: insertedNewItems,
//       };
//     });

//     // 9. WebSocket Broadcast
//     if (result?.restaurantId) {
//       roomManager.broadcastToRestaurant(
//         String(result.restaurantId),
//         'ORDER_UPDATED',
//         result
//       );
//     }

//     return reply.status(200).send({ order: result });
//   } catch (err: any) {
//     console.error('❌ Order Update Failed:', err);
//     return reply.status(500).send({ error: err.message || 'Internal Server Error' });
//   }
// });
// version 3 from order update 

fastify.put('/api/orders/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const orderId = Number(id);
  const body = (request.body || {}) as CreateOrderBody;

  if (!orderId || isNaN(orderId)) {
    return reply.status(400).send({ error: 'Valid Order ID is required.' });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Fetch current order header & existing items
      const existingOrder = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!existingOrder || existingOrder.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
      }

      const currentOrder = existingOrder[0];
      const existingItems = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      // 2. Increment revision count & prepare order updates
      const nextRevision = (currentOrder.revisionNumber || 1) + 1;
      const targetOrderStatus = body.orderStatus ?? currentOrder.status;

      // 3. Process item updates using Split Line pattern
      let newlyFiredCount = 0;
      const itemsToInsert: any[] = [];
      const itemIdsToCancel: number[] = [];
      const itemQuantityAdjustments: { id: number; newQuantity: number; newQuantityCompleted: number }[] = [];

      // Group existing (non-cancelled) rows by menuItemId, keeping every
      // row (not just the primary one) so removals/reductions can target
      // the right rows instead of only ever looking at one.
      type ExistingItemRow = (typeof existingItems)[number];

      const existingQtyMap = new Map<number, { totalQty: number; rows: ExistingItemRow[] }>();

      for (const item of existingItems) {
        if (item.kdsStatus === 'CANCELLED') continue;
        const key = Number(item.menuItemId);
        const current = existingQtyMap.get(key);
        if (!current) {
          existingQtyMap.set(key, { totalQty: Number(item.quantity), rows: [item] });
        } else {
          current.totalQty += Number(item.quantity);
          current.rows.push(item);
        }
      }

      // FIX: the incoming basket can contain multiple separate lines for
      // the same menuItemId — e.g. after a previous split-fire, POS loads
      // the order back with one basket line per fired batch (a "2" line
      // and a "1" line for the same item), rather than one merged line.
      //
      // The diff logic below needs exactly ONE entry per menuItemId
      // representing the true total desired quantity. Without collapsing
      // duplicates first, processing the same item twice against the same
      // unchanged snapshot (existingQtyMap is built once, above) causes an
      // earlier entry to cancel a fired line down to its own total, then a
      // later entry for the same item sees "no change" against the stale
      // snapshot and does nothing — silently losing the cancelled line.
      const aggregatedIncoming = new Map<
        number,
        {
          menuItemId: number;
          quantity: number;
          unitPrice: any;
          lineTotal: number;
          variantSize: any;
          modifiers: any[];
        }
      >();

      for (const item of body.items) {
        const menuItemId = Number(item.menuItemId);
        const existingAgg = aggregatedIncoming.get(menuItemId);
        if (!existingAgg) {
          aggregatedIncoming.set(menuItemId, {
            menuItemId,
            quantity: Number(item.quantity),
            unitPrice: item.unitPrice,
            lineTotal: Number(item.lineTotal) || 0,
            variantSize: item.variantSize ?? null,
            modifiers: item.modifiers ?? [],
          });
        } else {
          // Same menu item arriving as another basket line — combine into
          // one true total instead of processing it as two separate items.
          existingAgg.quantity += Number(item.quantity);
          existingAgg.lineTotal += Number(item.lineTotal) || 0;
        }
      }

      // Track items present in incoming payload
      const incomingItemKeys = new Set<number>();

      for (const item of aggregatedIncoming.values()) {
        const menuItemId = item.menuItemId;
        const incomingQty = item.quantity;
        incomingItemKeys.add(menuItemId);

        const existingRecord = existingQtyMap.get(menuItemId);

        if (!existingRecord) {
          // CASE A: Brand new item added to existing order
          itemsToInsert.push({
            orderId,
            menuItemId,
            quantity: incomingQty,
            quantityFired: incomingQty,
            quantityCompleted: 0,
            unitPrice: String(item.unitPrice),
            subtotal: String(item.lineTotal),
            variantSize: item.variantSize,
            modifiers: item.modifiers,
            kdsStatus: 'FIRE_SENT',
            fireBatchNumber: nextRevision,
            firedAt: new Date(),
          });
          newlyFiredCount += incomingQty;

        } else if (incomingQty > existingRecord.totalQty) {
          // CASE B: Quantity increased — Split Line: insert the delta as a
          // new add-on row so the kitchen only fires what's genuinely new.
          const deltaQty = incomingQty - existingRecord.totalQty;
          const unitPriceNum = Number(item.unitPrice) || 0;
          const primaryItem = existingRecord.rows[0];

          itemsToInsert.push({
            orderId,
            menuItemId,
            parentItemId: primaryItem.id,
            quantity: deltaQty,
            quantityFired: deltaQty,
            quantityCompleted: 0,
            unitPrice: String(item.unitPrice),
            subtotal: (deltaQty * unitPriceNum).toFixed(2),
            variantSize: item.variantSize,
            modifiers: item.modifiers,
            kdsStatus: 'FIRE_SENT',
            fireBatchNumber: nextRevision,
            firedAt: new Date(),
          });
          newlyFiredCount += deltaQty;

        } else if (incomingQty < existingRecord.totalQty) {
          // CASE C: Quantity reduced — pick which rows to shrink/cancel.
          //
          // FIX: previously sorted purely by fireBatchNumber (newest fired
          // first), with no regard for whether the kitchen had already
          // completed that row. That meant a completed item could get
          // cancelled instead of an untouched standby row that happened to
          // be fired earlier — e.g. 1 / 1 / 1 fired as three separate rows,
          // chef completes one, customer removes one: the completed row
          // could get cancelled while two untouched ones stood by.
          //
          // Priority now: untouched rows (quantityCompleted === 0) first,
          // most-recently-fired among those first. Only touch a row the
          // kitchen has already started/finished if there's no untouched
          // capacity left to remove from instead.
          let remainingToRemove = existingRecord.totalQty - incomingQty;
          const rowsByPriority = [...existingRecord.rows].sort((a, b) => {
            const aTouched = Number(a.quantityCompleted ?? 0) > 0 ? 1 : 0;
            const bTouched = Number(b.quantityCompleted ?? 0) > 0 ? 1 : 0;
            if (aTouched !== bTouched) return aTouched - bTouched; // untouched (0) before touched (1)
            return (b.fireBatchNumber ?? 0) - (a.fireBatchNumber ?? 0); // then newest-fired first
          });

          for (const row of rowsByPriority) {
            if (remainingToRemove <= 0) break;
            const rowQty = Number(row.quantity);

            if (rowQty <= remainingToRemove) {
              // Cancel this whole row
              itemIdsToCancel.push(row.id);
              remainingToRemove -= rowQty;
            } else {
              // Partially reduce this row.
              // Clamp quantityCompleted down to the new quantity too — if
              // this row was already partially completed and its quantity
              // shrinks below what was completed, leaving quantityCompleted
              // untouched would violate check_quantity_completed_valid.
              const newQuantity = rowQty - remainingToRemove;
              const currentCompleted = Number(row.quantityCompleted ?? 0);
              itemQuantityAdjustments.push({
                id: row.id,
                newQuantity,
                newQuantityCompleted: Math.min(currentCompleted, newQuantity),
              });
              remainingToRemove = 0;
            }
          }
        }
        // incomingQty === existingRecord.totalQty: genuinely unchanged, nothing to do.
      }

      // CASE D: item removed from the order entirely — cancel every
      // remaining active row for any menuItemId no longer present at all.
      for (const [menuItemId, record] of existingQtyMap.entries()) {
        if (!incomingItemKeys.has(menuItemId)) {
          record.rows.forEach((row) => itemIdsToCancel.push(row.id));
        }
      }

      // 4. Update order header
      const newKdsStatus = newlyFiredCount > 0 ? 'PARTIAL_FIRE' : currentOrder.kdsStatus;

      const [updatedOrder] = await tx
        .update(orders)
        .set({
          orderType: body.orderType ?? currentOrder.orderType,
          totalAmount: String(body.total),
          deliveryAddress: body.customerAddress ?? currentOrder.deliveryAddress,
          customerName: body.customerName ?? currentOrder.customerName,
          customerPhone: body.customerPhone ?? currentOrder.customerPhone,
          status: targetOrderStatus,
          kdsStatus: newKdsStatus,
          revisionNumber: nextRevision,
          lastFiredAt: newlyFiredCount > 0 ? new Date() : currentOrder.lastFiredAt,
          tableId: body.tableId ? Number(body.tableId) : currentOrder.tableId,
        })
        .where(eq(orders.id, orderId))
        .returning();

      // 5. Update Table Status
      if (updatedOrder.tableId) {
        await tx
          .update(restaurantTables)
          .set({ status: body.tableStatus ?? 'occupied' })
          .where(eq(restaurantTables.id, updatedOrder.tableId));
      }

      // 6. Insert new split-line add-on items (if any)
      let insertedNewItems: any[] = [];
      if (itemsToInsert.length > 0) {
        insertedNewItems = await tx
          .insert(orderItems)
          .values(itemsToInsert)
          .returning();
      }

      // 7. Apply the removals/reductions computed above.
      if (itemIdsToCancel.length > 0) {
        await tx
          .update(orderItems)
          .set({ kdsStatus: 'CANCELLED' })
          .where(inArray(orderItems.id, itemIdsToCancel));
      }

      for (const adjustment of itemQuantityAdjustments) {
        await tx
          .update(orderItems)
          .set({
            quantity: adjustment.newQuantity,
            quantityFired: adjustment.newQuantity,
            quantityCompleted: adjustment.newQuantityCompleted,
          })
          .where(eq(orderItems.id, adjustment.id));
      }

      // 8. Return complete updated order state
      const allActiveItems = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      return {
        ...updatedOrder,
        items: allActiveItems,
        newlyFiredItems: insertedNewItems,
      };
    });

    // 9. WebSocket Broadcast
    if (result?.restaurantId) {
      roomManager.broadcastToRestaurant(
        String(result.restaurantId),
        'ORDER_UPDATED',
        result
      );
    }

    return reply.status(200).send({ order: result });
  } catch (err: any) {
    console.error('❌ Order Update Failed:', err);
    return reply.status(500).send({ error: err.message || 'Internal Server Error' });
  }
});












// end order update 


  // 2. GET ACTIVE ORDERS SUMMARY
  // GET /api/orders/active?restaurantId=1
  fastify.get('/api/orders/active', async (request, reply) => {
    const { restaurantId } = request.query as { restaurantId?: string };

    if (!restaurantId) {
      return reply.status(400).send({ error: 'restaurantId query parameter is required.' });
    }

    try {
      // Fetch all orders that are NOT CLOSED for the specified restaurant
      const activeOrders = await db
        .select({
          orderId: orders.id,
          ticketNo: orders.ticketNo,
          orderType: orders.orderType,
          status: orders.status,
          totalAmount: orders.totalAmount,
          customerName: orders.customerName,
          customerPhone: orders.customerPhone,
          deliveryAddress: orders.deliveryAddress,
          created_at: orders.createdAt,
          itemCount: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
        })
        .from(orders)
        .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
        .where(
          and(
            eq(orders.restaurantId, Number(restaurantId)),
            ne(orders.status, 'CLOSED') // Filter out CLOSED orders
          )
        )
        .groupBy(orders.id);

      return reply.status(200).send({ orders: activeOrders });
    } catch (err: any) {
      console.error('❌ Error fetching active orders:', err);
      return reply.status(500).send({ error: err.message || 'Internal Server Error' });
    }
  });

  // 3. GET SINGLE ORDER WITH ALL LINE ITEMS FOR TICKET SELECTION
  // GET /api/orders/:id
  fastify.get('/api/orders/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const orderId = Number(id);

    if (isNaN(orderId)) {
      return reply.status(400).send({ error: 'Invalid order ID format.' });
    }

    try {
      // 1. Fetch Order Header
      const [orderHeader] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId));

      if (!orderHeader) {
        return reply.status(404).send({ error: 'Order not found.' });
      }

      // 2. Fetch Order Items joined with menu item details (for item names)
      const items = await db
        .select({
          id: orderItems.id,
          orderId: orderItems.orderId,
          menuItemId: orderItems.menuItemId,
          name: menuItems.menuName,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          subtotal: orderItems.subtotal,
          variantSize: orderItems.variantSize,
          modifiers: orderItems.modifiers,
        })
        .from(orderItems)
        .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
        .where(eq(orderItems.orderId, orderId));

      return reply.status(200).send({
        order: {
          ...orderHeader,
          items,
        },
      });
    } catch (err: any) {
      console.error('❌ Error fetching full order details:', err);
      return reply.status(500).send({ error: err.message || 'Internal Server Error' });
    }
  });
}