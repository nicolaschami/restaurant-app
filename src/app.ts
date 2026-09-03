import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { WebSocket } from 'ws';
import path from 'path';
import 'dotenv/config';
import fastifyJwt from '@fastify/jwt';
import cors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { eq, asc, sql, and, notInArray } from 'drizzle-orm';

import { roomManager } from './lib/roomManager.js';
import { db } from './db/index.js';
import {
  restaurants,
  orders,
  menuItems,
  orderItems,
  menuItemModifiers,
} from './db/schema.js';

// Route Imports
import uploadRoutes from './routes/upload.js';
import categoryRoutes from './routes/categories.js';
import { modifierGroupRoutes } from './routes/modifier-groups.js';
import { modifierOptionRoutes } from './routes/modifier-options.js';
import rawMaterialsRoutes from './routes/rawMaterials.js';
import supplierRoutes from './routes/supplier.js';
import kitchenStationRoutes from './routes/kitchenStations.js';
import authRoutes from './routes/aut.js';
import printerRoutes from './routes/printer.js';
import tableRoutes from './routes/tables.js';
import customerRoutes from './routes/customers.js';
import orderRoutes from './routes/orders.js';

// Module Type Augmentations
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: number;
      email: string;
      role: number | null;
      restaurantId?: number | null;
    };
    user: {
      id: number;
      email: string;
      role: number | null;
      restaurantId?: number | null;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

const fastify = Fastify({
  logger: true,
  bodyLimit: 10485760, // 10MB limit to prevent dropping large payload requests
});

// --- Register Plugins ---

// 1. WebSocket Plugin Registration
fastify.register(fastifyWebsocket);

// 2. Core Plugins
fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});

fastify.register(fastifyStatic, {
  root: path.join(process.cwd(), 'uploads'),
  prefix: '/uploads/',
});

fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'super-secret-key-change-me-in-prod',
});

// Authentication Decorator
fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
});

// --- WebSocket Route ---
fastify.register(async function (fastifyInstance) {
  fastifyInstance.get(
    '/ws',
    { websocket: true },
    (connection, req) => {
      fastify.log.info('New WebSocket connection opened');

      // @fastify/websocket v8+ passes the raw ws socket directly as
      // `connection`. Older versions (v7 and below) wrap it as
      // `connection.socket`. Handle both so this doesn't silently break
      // depending on which version is installed.
      const socket = ((connection as any).socket ?? connection) as WebSocket;

      if (!socket || typeof socket.on !== 'function') {
        fastify.log.error(
          'WebSocket handler could not resolve a valid socket instance — check @fastify/websocket version'
        );
        return;
      }

      // Never let a bug in message handling crash the whole process —
      // an uncaught exception here previously took down the dev server
      // (nodemon/tsx restart) and killed every open connection with an
      // abrupt code 1006 close on the client.
      try {
        if (typeof roomManager?.handleConnection === 'function') {
          roomManager.handleConnection(socket, req);
        } else {
          socket.on('message', (message: Buffer) => {
            console.log('Received WS message:', message.toString());
          });
        }
      } catch (err) {
        fastify.log.error({ err }, 'Error wiring up WebSocket connection');
      }

      socket.on('close', () => {
        fastify.log.info('WebSocket connection closed');
      });

      socket.on('error', (err) => {
        fastify.log.error({ err }, 'WebSocket connection error');
      });
    }
  );
});

// --- Utility Functions ---
async function updateOrderTotal(orderId: number) {
  const [result] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${orderItems.subtotal}), '0.00')::text`,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const newTotal = result?.total ?? '0.00';

  await db
    .update(orders)
    .set({ totalAmount: newTotal })
    .where(eq(orders.id, orderId));
}

// --- Routes ---

// Health Check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Create Menu Item
fastify.post(
  '/api/menu-items',
  { onRequest: [fastify.authenticate] },
  async (request, reply) => {
    const body = request.body as any;
    const { restaurantId } = request.user;

    if (!restaurantId) {
      return reply
        .status(403)
        .send({ error: 'User is not associated with a restaurant.' });
    }

    if (!body?.menuName?.trim() || body?.priceDineIn === undefined) {
      return reply.status(400).send({
        error: 'menuName and priceDineIn are required fields.',
      });
    }

    const menuName = body.menuName.trim();

    const existingItem = await db.query.menuItems.findFirst({
      where: and(
        eq(menuItems.restaurantId, restaurantId),
        eq(menuItems.menuName, menuName)
      ),
    });

    if (existingItem) {
      return reply.status(409).send({
        error: `A menu item named "${menuName}" already exists for this restaurant.`,
      });
    }

    const newItem = await db.transaction(async (tx) => {
      const [insertedItem] = await tx
        .insert(menuItems)
        .values({
          restaurantId,
          categoryId: body.categoryId || null,
          stationId: body.stationId || null,
          menuName,
          invoiceName: body.invoiceName || menuName,
          kitchenName: body.kitchenName || menuName,
          priceDineIn: String(body.priceDineIn),
          priceTakeaway: String(body.priceTakeaway ?? body.priceDineIn),
          priceDelivery: String(body.priceDelivery ?? body.priceDineIn),
          priceWaiter: String(body.priceWaiter ?? body.priceDineIn),
          costPrice: String(body.costPrice ?? '0.00'),
          description: body.description || null,
          images: body.images || [],
          isAvailable: body.isAvailable ?? true,
          hasVariants: Boolean(body.hasVariants),
          variantPrices: body.variantPrices || [],
          rawMaterials: body.rawMaterials || [],
        })
        .returning();

      const rawGroupIds = body.modifierGroupIds ?? body.modifier_group_ids;
      if (Array.isArray(rawGroupIds) && rawGroupIds.length > 0) {
        const groupIds = rawGroupIds
          .map((id) => Number(id))
          .filter((id) => !isNaN(id));
        if (groupIds.length > 0) {
          await tx.insert(menuItemModifiers).values(
            groupIds.map((groupId, index) => ({
              menuItemId: insertedItem.id,
              modifierGroupId: groupId,
              sortOrder: index,
            }))
          );
        }
      }

      return insertedItem;
    });

    return reply.status(201).send({ menuItem: newItem });
  }
);

// Read All Menu Items
fastify.get(
  '/api/menu-items',
  { onRequest: [fastify.authenticate] },
  async (request, reply) => {
    const { restaurantId, categoryId } = request.query as {
      restaurantId?: string;
      categoryId?: string;
    };

    const conditions = [];

    if (restaurantId) {
      conditions.push(eq(menuItems.restaurantId, parseInt(restaurantId)));
    }
    if (categoryId) {
      conditions.push(eq(menuItems.categoryId, parseInt(categoryId)));
    }

    const items = await db
      .select()
      .from(menuItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(menuItems.position));

    const itemsWithModifiers = await Promise.all(
      items.map(async (item) => {
        const modifiers = await db
          .select({ modifierGroupId: menuItemModifiers.modifierGroupId })
          .from(menuItemModifiers)
          .where(eq(menuItemModifiers.menuItemId, item.id));

        return {
          ...item,
          modifierGroupIds: modifiers.map((m) => m.modifierGroupId),
        };
      })
    );

    return reply.send({ menuItems: itemsWithModifiers });
  }
);

// Read One Menu Item
fastify.get(
  '/api/menu-items/:id',
  { onRequest: [fastify.authenticate] },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const itemId = parseInt(id);

    if (isNaN(itemId)) {
      return reply.status(400).send({ error: 'Invalid ID format.' });
    }

    const [item] = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.id, itemId));

    if (!item) {
      return reply.status(404).send({ error: 'Menu item not found.' });
    }

    return reply.send({ menuItem: item });
  }
);

// Update Menu Item
fastify.patch(
  '/api/menu-items/:id',
  { onRequest: [fastify.authenticate] },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const itemId = parseInt(id);

    if (isNaN(itemId)) {
      return reply.status(400).send({ error: 'Invalid ID format.' });
    }

    const body = request.body as Record<string, any>;

    const [existing] = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.id, itemId));

    if (!existing) {
      return reply.status(404).send({ error: 'Menu item not found.' });
    }

    const updateData: Record<string, any> = {};

    if (body.menuName !== undefined) updateData.menuName = body.menuName;
    if (body.invoiceName !== undefined) updateData.invoiceName = body.invoiceName;
    if (body.kitchenName !== undefined) updateData.kitchenName = body.kitchenName;
    if (body.priceDineIn !== undefined) updateData.priceDineIn = String(body.priceDineIn);
    if (body.priceTakeaway !== undefined) updateData.priceTakeaway = String(body.priceTakeaway);
    if (body.priceDelivery !== undefined) updateData.priceDelivery = String(body.priceDelivery);
    if (body.priceWaiter !== undefined) updateData.priceWaiter = String(body.priceWaiter);
    if (body.costPrice !== undefined) updateData.costPrice = String(body.costPrice);
    if (body.description !== undefined) updateData.description = body.description;
    if (body.images !== undefined) updateData.images = body.images;
    if (body.isAvailable !== undefined) updateData.isAvailable = body.isAvailable;
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;
    if (body.stationId !== undefined) updateData.stationId = body.stationId;
    if (body.hasVariants !== undefined) updateData.hasVariants = Boolean(body.hasVariants);
    if (body.variantPrices !== undefined) updateData.variantPrices = body.variantPrices;
    if (body.rawMaterials !== undefined) updateData.rawMaterials = body.rawMaterials;

    const updatedItem = await db.transaction(async (tx) => {
      let item = existing;

      if (Object.keys(updateData).length > 0) {
        [item] = await tx
          .update(menuItems)
          .set(updateData)
          .where(eq(menuItems.id, itemId))
          .returning();
      }

      const rawGroupIds = body.modifierGroupIds ?? body.modifier_group_ids;
      if (Array.isArray(rawGroupIds)) {
        await tx
          .delete(menuItemModifiers)
          .where(eq(menuItemModifiers.menuItemId, itemId));

        const groupIds = rawGroupIds
          .map((id) => Number(id))
          .filter((id) => !isNaN(id));
        if (groupIds.length > 0) {
          await tx.insert(menuItemModifiers).values(
            groupIds.map((groupId, index) => ({
              menuItemId: itemId,
              modifierGroupId: groupId,
              sortOrder: index,
            }))
          );
        }
      }

      return item;
    });

    return reply.send({ menuItem: updatedItem });
  }
);

// Delete Menu Item
fastify.delete(
  '/api/menu-items/:id',
  { onRequest: [fastify.authenticate] },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const itemId = parseInt(id);

    if (isNaN(itemId)) {
      return reply.status(400).send({ error: 'Invalid ID format.' });
    }

    const [deletedItem] = await db
      .delete(menuItems)
      .where(eq(menuItems.id, itemId))
      .returning();

    if (!deletedItem) {
      return reply.status(404).send({ error: 'Menu item not found.' });
    }

    return reply.send({
      message: 'Menu item deleted successfully.',
      deletedItemId: itemId,
    });
  }
);

// Reorder Menu Items
fastify.put(
  '/api/menu-items/reorder',
  { onRequest: [fastify.authenticate] },
  async (request, reply) => {
    const { restaurantId } = request.user;
    const body = request.body as { categoryId?: number; itemIds?: number[] };

    if (!restaurantId) {
      return reply
        .status(403)
        .send({ error: 'User is not associated with a restaurant.' });
    }

    if (!body?.categoryId || typeof body.categoryId !== 'number') {
      return reply
        .status(400)
        .send({ error: 'A valid categoryId is required.' });
    }

    if (
      !body?.itemIds ||
      !Array.isArray(body.itemIds) ||
      body.itemIds.length === 0
    ) {
      return reply
        .status(400)
        .send({ error: 'itemIds must be a non-empty array of numbers.' });
    }

    const { categoryId, itemIds } = body;

    await db.transaction(async (tx) => {
      for (let index = 0; index < itemIds.length; index++) {
        const itemId = itemIds[index];
        const newPosition = index + 1;

        await tx
          .update(menuItems)
          .set({ position: newPosition })
          .where(
            and(
              eq(menuItems.id, itemId),
              eq(menuItems.categoryId, categoryId),
              eq(menuItems.restaurantId, restaurantId)
            )
          );
      }
    });

    return reply.send({ message: 'Menu item positions updated successfully.' });
  }
);

// Create Restaurant
fastify.post('/api/restaurants', async (request, reply) => {
  const { name, phone } = request.body as { name: string; phone?: string };

  if (!name || name.trim() === '') {
    return reply.status(400).send({ error: 'Restaurant name is required' });
  }

  const existingRestaurant = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.name, name.trim()))
    .limit(1);

  if (existingRestaurant.length > 0) {
    return reply.status(409).send({
      error: `A restaurant with the name '${name}' already exists.`,
    });
  }

  const [newRestaurant] = await db
    .insert(restaurants)
    .values({ name: name.trim(), phone })
    .returning();

  return reply.status(201).send({ restaurant: newRestaurant });
});

// KDS Orders
fastify.get('/api/kds/:restaurantId', async (request, reply) => {
  const { restaurantId } = request.params as { restaurantId: string };

  const kitchenOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, parseInt(restaurantId)),
        notInArray(orders.status, ['closed', 'canceled'])
      )
    );

  return reply.send({ orders: kitchenOrders });
});

// Update Order Status
fastify.patch('/api/orders/:id/status', async (request, reply) => {
  const { id } = request.params as { id: string };
  const { status } = request.body as { status: string };

  const [updatedOrder] = await db
    .update(orders)
    .set({ status })
    .where(eq(orders.id, parseInt(id)))
    .returning();

  // Optionally trigger roomManager broadcast if available
  if (updatedOrder?.restaurantId) {
    roomManager.broadcastToRestaurant(
      String(updatedOrder.restaurantId),
      'ORDER_STATUS_UPDATED',
      updatedOrder
    );
  }

  return reply.send({ order: updatedOrder });
});

// Add Order Items
fastify.post('/api/orders/:orderId/items', async (request, reply) => {
  const { orderId } = request.params as { orderId: string };
  const body = request.body as {
    items: Array<{
      menuItemId: number;
      quantity: number;
      unitPrice: number | string;
    }>;
  };

  if (!body?.items?.length) {
    return reply.status(400).send({ error: 'At least one item is required.' });
  }

  const parsedOrderId = parseInt(orderId);
  const resultItems = [];

  for (const item of body.items) {
    const qtyToAdd = item.quantity || 1;
    const priceNum = Number(item.unitPrice);

    const [existingItem] = await db
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, parsedOrderId),
          eq(orderItems.menuItemId, item.menuItemId)
        )
      );

    if (existingItem) {
      const newQuantity = qtyToAdd;
      const newSubtotal = (priceNum * qtyToAdd).toFixed(2);

      const [updatedItem] = await db
        .update(orderItems)
        .set({
          quantity: newQuantity,
          subtotal: newSubtotal,
          unitPrice: priceNum.toFixed(2),
        })
        .where(eq(orderItems.id, existingItem.id))
        .returning();

      resultItems.push(updatedItem);
    } else {
      const newSubtotal = (priceNum * qtyToAdd).toFixed(2);

      const [newItem] = await db
        .insert(orderItems)
        .values({
          orderId: parsedOrderId,
          menuItemId: item.menuItemId,
          quantity: qtyToAdd,
          unitPrice: priceNum.toFixed(2),
          subtotal: newSubtotal,
          kitchenStatus: 'pending',
          sentToKitchenAt: new Date(),
        })
        .returning();

      resultItems.push(newItem);
    }
  }

  await updateOrderTotal(parsedOrderId);
  return reply.status(201).send({ items: resultItems });
});

// Update Order Item
fastify.patch('/api/order-items/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as {
    quantity?: number;
    kitchenStatus?: string;
  };

  const itemId = parseInt(id);

  const [existingItem] = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.id, itemId));

  if (!existingItem) {
    return reply.status(404).send({ error: 'Order item not found.' });
  }

  const updateData: Record<string, any> = {};

  if (body.kitchenStatus) {
    updateData.kitchenStatus = body.kitchenStatus;
    if (body.kitchenStatus === 'ready' || body.kitchenStatus === 'completed') {
      updateData.completedAt = new Date();
    }
  }

  if (body.quantity && body.quantity > 0) {
    const unitPriceNum = Number(existingItem.unitPrice);
    updateData.quantity = body.quantity;
    updateData.subtotal = (unitPriceNum * body.quantity).toFixed(2);
  }

  const [updatedItem] = await db
    .update(orderItems)
    .set(updateData)
    .where(eq(orderItems.id, itemId))
    .returning();

  if (body.quantity && existingItem.orderId) {
    await updateOrderTotal(existingItem.orderId);
  }

  return reply.send({ item: updatedItem });
});

// Delete Order Item
fastify.delete('/api/order-items/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const itemId = parseInt(id);

  if (isNaN(itemId)) {
    return reply.status(400).send({ error: 'Invalid item ID format.' });
  }

  const [existingItem] = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.id, itemId));

  if (!existingItem) {
    return reply.status(404).send({ error: 'Order item not found.' });
  }

  const { orderId } = existingItem;

  await db.delete(orderItems).where(eq(orderItems.id, itemId));

  if (orderId) {
    await updateOrderTotal(orderId);
  }

  return reply.send({
    message: 'Item removed successfully.',
    deletedItemId: itemId,
    orderId,
  });
});

// Cancel Order
fastify.patch('/api/orders/:id/cancel', async (request, reply) => {
  const { id } = request.params as { id: string };
  const orderId = parseInt(id);

  if (isNaN(orderId)) {
    return reply.status(400).send({ error: 'Invalid order ID format.' });
  }

  const [existingOrder] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId));

  if (!existingOrder) {
    return reply.status(404).send({ error: 'Order not found.' });
  }

  if (existingOrder.status === 'cancelled') {
    return reply.status(400).send({ error: 'Order is already cancelled.' });
  }

  if (
    existingOrder.status === 'closed' ||
    existingOrder.status === 'completed'
  ) {
    return reply
      .status(400)
      .send({ error: 'Cannot cancel a completed or closed order.' });
  }

  const [updatedOrder] = await db
    .update(orders)
    .set({
      status: 'cancelled',
      totalAmount: '0.00',
    })
    .where(eq(orders.id, orderId))
    .returning();

  await db
    .update(orderItems)
    .set({ kitchenStatus: 'cancelled' })
    .where(eq(orderItems.orderId, orderId));

  return reply.send({
    message: 'Order cancelled successfully.',
    order: updatedOrder,
  });
});

// --- Register External Modular Routes ---
fastify.register(uploadRoutes);
fastify.register(printerRoutes);
fastify.register(categoryRoutes);
fastify.register(tableRoutes);
fastify.register(customerRoutes);
fastify.register(kitchenStationRoutes);
fastify.register(authRoutes);
fastify.register(modifierGroupRoutes);
fastify.register(modifierOptionRoutes);
fastify.register(rawMaterialsRoutes);
fastify.register(supplierRoutes);
fastify.register(orderRoutes);

// --- Start Server ---
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server running on http://127.0.0.1:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
