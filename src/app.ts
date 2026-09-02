import Fastify from 'fastify';
import express from 'express';
import path from 'path';
import fastifyJwt from '@fastify/jwt';
import { db } from './db/index.js';
import { restaurants, orders,menuItems,orderItems,categories,kitchenStations,modifierGroups, modifierOptions,menuItemModifiers } from './db/schema.js';
import uploadRouter from './routes/upload';
import cors from '@fastify/cors';


import fastifyMultipart from '@fastify/multipart';
 import fastifyStatic from '@fastify/static';


// Import refactored Fastify upload plugin
import uploadRoutes from './routes/upload.js';



import { eq , asc ,sql,and, notInArray} from 'drizzle-orm';


import 'dotenv/config';
import categoryRoutes from './routes/categories.js';
import  {modifierGroupRoutes}  from './routes/modifier-groups.js'
import  {modifierOptionRoutes}  from './routes/modifier-options.js';
import rawMaterialsRoutes from './routes/rawMaterials';
import supplierRoutes from './routes/supplier.js';
import kitchenStationRoutes from './routes/kitchenStations.js';
import authRoutes from './routes/aut.js';
import printerRoutes from './routes/printer';
import tableRoutes from './routes/tables.js';
import customerRoutes from './routes/customers.js';
import orderRoutes from './routes/orders.js';

const app = express();

// Serve the uploads directory statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: number;
      email: string;
      role: number | null; // 👈 Add role here
      restaurantId?: number | null; // 👈 Add restaurantId here;
    };
    user: {
      id: number;
      email: string;
      role: number | null; // 👈 Add role here
      restaurantId?: number | null; // 👈 Add restaurantId hereber;
    };
  }
}


interface MenuItemBody {
    restaurantId: number;
    categoryId?: number;
    stationId?: number;
    menuName: string;
    invoiceName: string;
    kitchenName: string;
    priceDineIn: number | string;
    priceTakeaway?: number | string;
    priceDelivery?: number | string;
    priceWaiter?: number | string;
    costPrice?: number | string;
    description?: string;
    images?: string[];
    isAvailable?: boolean;
  }



const fastify = Fastify({ logger: true });


fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // Limit max file size (10 MB)
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



// 1. Register JWT plugin
fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'super-secret-key-change-me-in-prod',
});



fastify.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify(); // Automatically populates request.user from JWT token
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}



// 1. Health Check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// 2. Menuitems 

// -------------------------------------------------------------
// 1. CREATE (POST /api/menu-items)
// -------------------------------------------------------------
fastify.post(
  '/api/menu-items',
  { onRequest: [fastify.authenticate] },
  async (request, reply) => {
    const body = request.body as any;
    const { restaurantId } = request.user;

    // 🔍 1. Log incoming request body
    console.log('--- [POST /api/menu-items] INCOMING BODY ---');
    console.log('hasVariants:', body?.hasVariants);
    console.log('variantPrices:', JSON.stringify(body?.variantPrices, null, 2));

    if (!restaurantId) {
      return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
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

    // Insert menu item + junction table modifiers inside a transaction
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
          variantPrices: body.variantPrices || [], // Drizzle automatically serializes JS arrays to JSONB
          rawMaterials: body.rawMaterials || [],
        })
        .returning();

      // 🔍 2. Log what PostgreSQL returned right after the insert query
      console.log('--- [POST /api/menu-items] DB INSERT RESULT ---');
      console.log('insertedItem.hasVariants:', insertedItem.hasVariants);
      console.log('insertedItem.variantPrices:', insertedItem.variantPrices);
      console.log('rawMaterials:', insertedItem.rawMaterials);
      // 🟢 Save selected modifier groups into junction table
      const rawGroupIds = body.modifierGroupIds ?? body.modifier_group_ids;
      if (Array.isArray(rawGroupIds) && rawGroupIds.length > 0) {
        const groupIds = rawGroupIds.map((id) => Number(id)).filter((id) => !isNaN(id));
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
);  // -------------------------------------------------------------
  // 2. READ ALL / FILTER (GET /api/menu-items)
  // Query params: ?restaurantId=1&categoryId=2
  // -------------------------------------------------------------
  // Updated GET /api/menu-items route
fastify.get('/api/menu-items',
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

    // Fetch all items matching conditions
    const items = await db
      .select()
      .from(menuItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(menuItems.position));

    // Fetch junction table records to attach modifierGroupIds to each item
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
  });
  
  // -------------------------------------------------------------
  // 3. READ ONE (GET /api/menu-items/:id)
  // -------------------------------------------------------------
  fastify.get('/api/menu-items/:id', 
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
  });
  
  // -------------------------------------------------------------
  // 4. UPDATE (PUT / PATCH /api/menu-items/:id)
  // -------------------------------------------------------------
fastify.patch('/api/menu-items/:id', 
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

    // 🟢 Added missing variant and raw material fields: OK !!!!
    if (body.hasVariants !== undefined) updateData.hasVariants = Boolean(body.hasVariants);
    if (body.variantPrices !== undefined) updateData.variantPrices = body.variantPrices;
    if (body.rawMaterials !== undefined) updateData.rawMaterials = body.rawMaterials;

    // Run updates & modifier sync atomically inside a transaction
    const updatedItem = await db.transaction(async (tx) => {
      let item = existing;
      
      if (Object.keys(updateData).length > 0) {
        [item] = await tx
          .update(menuItems)
          .set(updateData)
          .where(eq(menuItems.id, itemId))
          .returning();
      }

      // 🟢 Sync modifier groups if provided
      const rawGroupIds = body.modifierGroupIds ?? body.modifier_group_ids;
      if (Array.isArray(rawGroupIds)) {
        // Clear existing modifiers first for clean replacement
        await tx.delete(menuItemModifiers).where(eq(menuItemModifiers.menuItemId, itemId));

        const groupIds = rawGroupIds.map((id) => Number(id)).filter((id) => !isNaN(id));
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
  // -------------------------------------------------------------
  // 5. DELETE (DELETE /api/menu-items/:id)
  // -------------------------------------------------------------
  fastify.delete('/api/menu-items/:id', 
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
  });



fastify.put(
  '/api/menu-items/reorder',
  { onRequest: [fastify.authenticate] },
  async (request, reply) => {
    const { restaurantId } = request.user;
    const body = request.body as { categoryId?: number; itemIds?: number[] };

    if (!restaurantId) {
      return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
    }

    if (!body?.categoryId || typeof body.categoryId !== 'number') {
      return reply.status(400).send({ error: 'A valid categoryId is required.' });
    }

    if (!body?.itemIds || !Array.isArray(body.itemIds) || body.itemIds.length === 0) {
      return reply.status(400).send({ error: 'itemIds must be a non-empty array of numbers.' });
    }

    const { categoryId, itemIds } = body;

    // Run updates atomically inside a transaction
    await db.transaction(async (tx) => {
      for (let index = 0; index < itemIds.length; index++) {
        const itemId = itemIds[index];
        const newPosition = index + 1; // 1, 2, 3...

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



// end Menu




// 2. Create Restaurant
//fastify.post('/api/restaurants', async (request, reply) => {
  //  const { name, phone } = request.body as { name: string; phone?: string };
   // const [newRestaurant] = await db
   // .insert(restaurants)
   // .values({ name, phone })
   // .returning();
 // return reply.status(201).send({ restaurant: newRestaurant });
//});

//const fastify = Fastify({ logger: true });

fastify.post('/api/restaurants', async (request, reply) => {
  const { name, phone } = request.body as { name: string; phone?: string };

  // 1. Basic validation
  if (!name || name.trim() === '') {
    return reply.status(400).send({ error: 'Restaurant name is required' });
  }

  // 2. Check if restaurant with the same name already exists
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

  // 3. Insert if it does not exist
  const [newRestaurant] = await db
    .insert(restaurants)
    .values({ name: name.trim(), phone })
    .returning();

  return reply.status(201).send({ restaurant: newRestaurant });
});




// 3. Create Order (Waitstaff POS)


// 4. Get Active Orders for Kitchen Display System (KDS)
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

// 5. Update Order Status (Kitchen updates to 'preparing' or 'completed')
fastify.patch('/api/orders/:id/status', async (request, reply) => {
  const { id } = request.params as { id: string };
  const { status } = request.body as { status: string };

  const [updatedOrder] = await db
    .update(orders)
    .set({ status })
    .where(eq(orders.id, parseInt(id)))
    .returning();

  return reply.send({ order: updatedOrder });
});
// 6. orderitems 
async function updateOrderTotal(orderId: number) {
    // Query sum of subtotals matching order_items.order_id
    const [result] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${orderItems.subtotal}), '0.00')::text`,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId)); // <--- FIXED: orderItems.orderId instead of orders.id
  
    const newTotal = result?.total ?? '0.00';
  
    // Update parent order record
    await db
      .update(orders)
      .set({ totalAmount: newTotal })
      .where(eq(orders.id, orderId));
  }

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
  
      // 1. Check if item already exists for this order
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
        // 2. Item exists: Update quantity and subtotal
        const newQuantity =  qtyToAdd;
        const newSubtotal = (priceNum * qtyToAdd).toFixed(2);
  
        const [updatedItem] = await db
          .update(orderItems)
          .set({
            quantity: newQuantity,
            subtotal: newSubtotal,
            unitPrice: priceNum.toFixed(2), // update unit price if changed
          })
          .where(eq(orderItems.id, existingItem.id))
          .returning();
  
        resultItems.push(updatedItem);
      } else {
        // 3. Item is new: Insert new line item
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
  
    // 4. Recalculate parent order total
    await updateOrderTotal(parsedOrderId);
  
    return reply.status(201).send({ items: resultItems });
  });

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


// New one get the order item 



// delete item from order 
fastify.delete('/api/order-items/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const itemId = parseInt(id);
  
    if (isNaN(itemId)) {
      return reply.status(400).send({ error: 'Invalid item ID format.' });
    }
  
    // 1. Fetch the item first so we know which orderId it belongs to
    const [existingItem] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, itemId));
  
    if (!existingItem) {
      return reply.status(404).send({ error: 'Order item not found.' });
    }
  
    const { orderId } = existingItem;
  
    // 2. Delete the order item
    await db
      .delete(orderItems)
      .where(eq(orderItems.id, itemId));
  
    // 3. Recalculate parent order total_amount
    if (orderId) {
      await updateOrderTotal(orderId);
    }
  
    return reply.send({
      message: 'Item removed successfully.',
      deletedItemId: itemId,
      orderId,
    });
  });

// delete the whole order
fastify.patch('/api/orders/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const orderId = parseInt(id);
  
    if (isNaN(orderId)) {
      return reply.status(400).send({ error: 'Invalid order ID format.' });
    }
  
    // 1. Fetch current order to verify existence and status
    const [existingOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));
  
    if (!existingOrder) {
      return reply.status(404).send({ error: 'Order not found.' });
    }
  
    // Prevent cancelling an already closed/cancelled order
    if (existingOrder.status === 'cancelled') {
      return reply.status(400).send({ error: 'Order is already cancelled.' });
    }
  
    if (existingOrder.status === 'closed' || existingOrder.status === 'completed') {
      return reply.status(400).send({ error: 'Cannot cancel a completed or closed order.' });
    }
  
    // 2. Update order status to 'cancelled' and reset totalAmount to 0.00
    const [updatedOrder] = await db
      .update(orders)
      .set({
        status: 'cancelled',
        totalAmount: '0.00',
      })
      .where(eq(orders.id, orderId))
      .returning();
  
    // 3. Mark all pending/preparing kitchen items as 'cancelled'
    await db
      .update(orderItems)
      .set({ kitchenStatus: 'cancelled' })
      .where(eq(orderItems.orderId, orderId));
  
    return reply.send({
      message: 'Order cancelled successfully.',
      order: updatedOrder,
    });
  });
  
  // Register plugins

app.use(express.json());


fastify.register(uploadRoutes); // 👈 Registers POST /api/upload under Fastify
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
fastify.register(orderRoutes)
// Serve the root uploads folder statically
app.use('/uploads', express.static('uploads'));

// Register your upload router under /api
app.use('/api', uploadRouter);
// Start Server
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