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
  rawMaterials,
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
import drawerRoutes from './routes/open-drawer';
import tableRoutes from './routes/tables.js';
import customerRoutes from './routes/customers.js';
import orderRoutes from './routes/orders.js';
import { kdsRoutes} from './routes/kds.js'
import printerRoutes from './routes/silent-print.js';
import  stockTransactionRoutes from './routes/stock-transactions.js';
import restaurantRoutes from './routes/restaurants.js';
import dashboardRoutes from './routes/dashboard.js';
import paymentRoutes from './routes/payments.js';
import reportRoutes from './routes/reports.js';
import zReportRoutes from './routes/zReports.js';
import salesItemRoutes from './routes/salesItems.js';
import printingRoutes from './routes/printing.js';
import userRoutes from './routes/users.js';
import terminalRoutes from './routes/terminals.js';
import {
  getRestaurantId,
  assertOrderInRestaurant,
  assertOrderItemInRestaurant,
  assertMenuItemInRestaurant,
} from './lib/tenant.js';
import { currentUser, hasRole, requiredRole } from './lib/roles.js';


// Module Type Augmentations
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: number;
      email: string;
      role: string | number | null;
      restaurantId?: number | null;
    };
    user: {
      id: number;
      email: string;
      // 'owner' | 'manager' | 'cashier' — refreshed from the database on every request
      role: string | number | null;
      restaurantId?: number | null;
      isPlatformAdmin?: boolean;
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
  logger: {
    // Hide the login token in logged URLs. The WebSocket sends it as /ws?token=...
    // (browsers can't add headers to a WebSocket), and logs must never contain tokens.
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url.replace(/([?&]token=)[^&]*/, '$1***'),
          host: req.host,
          remoteAddress: req.ip,
        };
      },
    },
  },
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

// --- Global login guard ---
// Every /api/* request must carry a valid login token (JWT), unless its path is in
// PUBLIC_API_ROUTES. Being "secure by default" means a new route is protected
// automatically, even if someone forgets to add `onRequest: [fastify.authenticate]`.
// This matters on-premise too: guests on the restaurant Wi-Fi can reach the server.
//
// Not covered here (on purpose):
//   - /uploads/*  → menu pictures; <img> tags cannot send a token.
//   - /ws         → the WebSocket; it gets its own check in the security step #3.
const PUBLIC_API_ROUTES = new Set<string>([
  '/api/auth/login', // you can't be logged in before logging in
  // PIN pad of a registered POS terminal: the PC proves itself with its secret key
  '/api/auth/terminal-check',
  '/api/auth/terminal-login',
]);

fastify.addHook('onRequest', async (request, reply) => {
  // CORS "preflight" requests (OPTIONS) are sent by the browser itself, without the
  // token, before the real request. They must pass, or every call from the app fails.
  if (request.method === 'OPTIONS') return;

  const path = request.url.split('?')[0]; // ignore the ?query=part
  if (!path.startsWith('/api/') || PUBLIC_API_ROUTES.has(path)) return;

  try {
    await request.jwtVerify(); // checks the token and fills request.user
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  // Users & roles (2026-10-26): the CURRENT role and status come from the database
  // (cached a few seconds), so a deactivation or a role change applies at once.
  const me = await currentUser(Number(request.user.id));
  if (!me || !me.isActive) {
    return reply.status(401).send({ error: 'This account is deactivated or no longer exists.' });
  }
  request.user.role = me.role;
  request.user.isPlatformAdmin = me.isPlatformAdmin;

  const needed = requiredRole(request.method, path);
  const allowed = needed === 'platform' ? me.isPlatformAdmin : hasRole(me.role, needed);
  if (!allowed) {
    return reply.status(403).send({
      error: needed === 'platform' ? 'Only the platform owner can do this.' : `Your role (${me.role}) cannot do this. Ask a ${needed}.`,
    });
  }
});

// --- WebSocket Route ---
fastify.register(async function (fastifyInstance) {
  fastifyInstance.get(
    '/ws',
    {
      websocket: true,
      // Runs BEFORE the connection is opened: no valid login token → refused (401).
      // The token comes in the address (/ws?token=...) because browsers can't send
      // an Authorization header when opening a WebSocket.
      preValidation: async (request, reply) => {
        const { token } = request.query as { token?: string };
        try {
          request.user = fastify.jwt.verify(token ?? '');
        } catch {
          return reply.status(401).send({ error: 'Unauthorized' });
        }
        if (!request.user.restaurantId) {
          return reply.status(403).send({ error: 'User is not assigned to a restaurant.' });
        }
      },
    },
    (connection, req) => {
      // The room (= which restaurant's live updates this screen receives) comes from
      // the token, so a screen can only ever listen to its own restaurant.
      const restaurantId = String(req.user.restaurantId);
      fastify.log.info({ restaurantId }, 'New WebSocket connection opened');

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
          roomManager.handleConnection(socket, restaurantId);
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

// "Countable" (isInventoryTracked) menu items are sold from ONE raw material:
// each unit sold takes 1 of it out of stock (see routes/payments.ts).
// Returns the stock item id to save, or an error text when it is not valid.
async function countableStockItem(
  restaurantId: number,
  isInventoryTracked: boolean,
  stockMaterialId: unknown
): Promise<{ id: number | null } | { error: string }> {
  if (!isInventoryTracked) return { id: null }; // not countable → no stock item
  const id = Number(stockMaterialId);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: 'A Countable item needs its stock item: choose the raw material it is sold from.' };
  }
  const [owned] = await db
    .select({ id: rawMaterials.id })
    .from(rawMaterials)
    .where(and(eq(rawMaterials.id, id), eq(rawMaterials.restaurantId, restaurantId)));
  return owned ? { id } : { error: 'The stock item is not a raw material of this restaurant.' };
}

// A menu item's own tax rate in % ("0" for water…). Empty / invalid → null = the
// restaurant rate (Settings → Restaurant Info). Kept between 0 and 100.
function itemTaxRate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n)).toFixed(2);
}

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

    const isInventoryTracked = Boolean(body.isInventoryTracked);
    const stockItem = await countableStockItem(restaurantId, isInventoryTracked, body.stockMaterialId);
    if ('error' in stockItem) return reply.status(400).send({ error: stockItem.error });

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
          isInventoryTracked,
          stockMaterialId: stockItem.id,
          countryTax: itemTaxRate(body.countryTax),
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
    const { categoryId } = request.query as { categoryId?: string };

    // Always limited to the user's own restaurant (from the token). Before, a request
    // without ?restaurantId returned the menu items of ALL restaurants.
    const conditions = [eq(menuItems.restaurantId, getRestaurantId(request))];

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

    // Another restaurant's item → 404.
    await assertMenuItemInRestaurant(itemId, getRestaurantId(request));

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

    // Only the user's own restaurant's items can be edited.
    await assertMenuItemInRestaurant(itemId, getRestaurantId(request));

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
    if (body.countryTax !== undefined) updateData.countryTax = itemTaxRate(body.countryTax);
    if (body.isInventoryTracked !== undefined || body.stockMaterialId !== undefined) {
      const isInventoryTracked = Boolean(body.isInventoryTracked ?? existing.isInventoryTracked);
      const stockItem = await countableStockItem(
        getRestaurantId(request),
        isInventoryTracked,
        body.stockMaterialId ?? existing.stockMaterialId
      );
      if ('error' in stockItem) return reply.status(400).send({ error: stockItem.error });
      updateData.isInventoryTracked = isInventoryTracked;
      updateData.stockMaterialId = stockItem.id;
    }

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

    // Only the user's own restaurant's items can be deleted.
    await assertMenuItemInRestaurant(itemId, getRestaurantId(request));

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


// KDS Orders


// Update Order Status
fastify.patch('/api/orders/:id/status', async (request, reply) => {
  const { id } = request.params as { id: string };
  const { status } = request.body as { status: string };

  // Only the user's own restaurant's orders (another restaurant's → 404).
  await assertOrderInRestaurant(parseInt(id), getRestaurantId(request));

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
  // Items can only be added to the user's own restaurant's orders.
  await assertOrderInRestaurant(parsedOrderId, getRestaurantId(request));
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

  // Only items of the user's own restaurant's orders.
  await assertOrderItemInRestaurant(itemId, getRestaurantId(request));

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

  // Only items of the user's own restaurant's orders.
  await assertOrderItemInRestaurant(itemId, getRestaurantId(request));

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

  // Only the user's own restaurant's orders can be cancelled.
  await assertOrderInRestaurant(orderId, getRestaurantId(request));

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
fastify.register(kdsRoutes);
fastify.register(drawerRoutes);
fastify.register(restaurantRoutes);
fastify.register(stockTransactionRoutes);
fastify.register(dashboardRoutes);
fastify.register(paymentRoutes);
fastify.register(reportRoutes);
fastify.register(zReportRoutes);
fastify.register(salesItemRoutes);
fastify.register(printingRoutes);
fastify.register(userRoutes);
fastify.register(terminalRoutes);



// --- Start Server ---
const start = async () => {
  try {
    // PORT can be set in .env (default 3000), e.g. to run a second copy for tests.
    const port = Number(process.env.PORT) || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server running on http://127.0.0.1:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
