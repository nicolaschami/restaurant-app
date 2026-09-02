// src/routes/orders.ts

import { FastifyInstance } from 'fastify';

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

        // Determine subtotal (lineTotal from request payload or DB default)
        const itemSubtotal =
          item.lineTotal != null ? Number(item.lineTotal) : qty * dbPrice;

        // Determine unit price (handles variants where unitPrice isn't explicitly passed)
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
          unitPrice: unitPriceNum.toFixed(2),
          subtotal: itemSubtotal.toFixed(2),
          variantSize: item.variantSize ?? null,
          modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
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
          .set({ status: tableStatus ?? 'occupied' }) // default: occupied on a fresh Hold
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

fastify.put('/api/orders/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const orderId = Number(id);
  const body = (request.body || {}) as CreateOrderBody;

  if (!orderId || isNaN(orderId)) {
    return reply.status(400).send({ error: 'Valid Order ID is required for update.' });
  }

 try {
  const result = await db.transaction(async (tx) => {
    // 🔍 LOG 1: Incoming payload values before updating
    console.log('--- 🔄 DB UPDATE START ---');
    console.log(`Target Order ID: ${orderId}`);
    console.log(`Received body.orderStatus: "${body.orderStatus}"`);
    console.log(`Received body.status: "${body.orderStatus}"`);

    // Determine target status safely (fallback to body.status if body.orderStatus is undefined)
    const targetStatus = body.orderStatus ??  'open';
    console.log(`Final Status Sent to DB: "${targetStatus}"`);

    // 1. UPDATE existing order header
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        orderType: body.orderType ?? 'Dine-In',
        totalAmount: String(body.total),
        deliveryAddress: body.customerAddress ?? null,
        customerName: body.customerName ?? null,
        customerPhone: body.customerPhone ?? null,
        status: targetStatus, // 👈 Uses sanitized targetStatus
        tableId: body.tableId ? Number(body.tableId) : null,
      })
      .where(eq(orders.id, orderId))
      .returning();

    if (!updatedOrder) {
      throw new Error('ORDER_NOT_FOUND');
    }


    if (!updatedOrder) {
  throw new Error('ORDER_NOT_FOUND');
}

// 👇 new: sync table status on Hold vs Pay
if (updatedOrder.tableId) {
  await tx
    .update(restaurantTables)
    .set({ status: body.tableStatus ?? 'occupied' })
    .where(eq(restaurantTables.id, updatedOrder.tableId));
}
    // 🔍 LOG 2: Verification of record returned from DB
    console.log('✅ DB Updated Row Result:', {
      id: updatedOrder.id,
      status: updatedOrder.status,
      totalAmount: updatedOrder.totalAmount,
      tableId: updatedOrder.tableId,
    });

    // 2. Clear old items and re-insert updated items for THIS orderId
    await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));

    const itemsToInsert = body.items.map((item) => ({
      orderId: orderId,
      menuItemId: Number(item.menuItemId),
      quantity: Number(item.quantity),
      unitPrice: String(item.unitPrice),
      subtotal: String(item.lineTotal),
      variantSize: item.variantSize ?? null,
      modifiers: item.modifiers ?? [],
    }));

    const insertedItems = await tx
      .insert(orderItems)
      .values(itemsToInsert)
      .returning();

    console.log(`✅ Re-inserted ${insertedItems.length} items for Order #${orderId}`);
    console.log('--- 🔄 DB UPDATE END ---');

    return { ...updatedOrder, items: insertedItems };
  });

  return reply.status(200).send({ order: result });
} catch (err: any) {
  console.error('❌ Order Update Failed:', err);
  return reply.status(500).send({ error: err.message });
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