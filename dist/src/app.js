"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const index_js_1 = require("./db/index.js");
const schema_js_1 = require("./db/schema.js");
const drizzle_orm_1 = require("drizzle-orm");
require("dotenv/config");
const categories_js_1 = __importDefault(require("./routes/categories.js"));
const kitchenStations_js_1 = __importDefault(require("./routes/kitchenStations.js"));

const fastify = (0, fastify_1.default)({ logger: true });
// 1. Health Check
fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});
// 2. Menuitems 
// -------------------------------------------------------------
// 1. CREATE (POST /api/menu-items)
// -------------------------------------------------------------
fastify.post('/api/menu-items', async (request, reply) => {
    const body = request.body;
    if (!body?.restaurantId || !body?.menuName || body?.priceDineIn === undefined) {
        return reply.status(400).send({
            error: 'restaurantId, menuName, and priceDineIn are required fields.',
        });
    }
    const [newItem] = await index_js_1.db
        .insert(schema_js_1.menuItems)
        .values({
        restaurantId: body.restaurantId,
        categoryId: body.categoryId || null,
        stationId: body.stationId || null,
        menuName: body.menuName,
        invoiceName: body.invoiceName || body.menuName,
        kitchenName: body.kitchenName || body.menuName,
        priceDineIn: String(body.priceDineIn),
        priceTakeaway: String(body.priceTakeaway ?? body.priceDineIn),
        priceDelivery: String(body.priceDelivery ?? body.priceDineIn),
        priceWaiter: String(body.priceWaiter ?? body.priceDineIn),
        costPrice: String(body.costPrice ?? '0.00'),
        description: body.description || null,
        images: body.images || [],
        isAvailable: body.isAvailable ?? true,
    })
        .returning();
    return reply.status(201).send({ menuItem: newItem });
});
// -------------------------------------------------------------
// 2. READ ALL / FILTER (GET /api/menu-items)
// Query params: ?restaurantId=1&categoryId=2
// -------------------------------------------------------------
fastify.get('/api/menu-items', async (request, reply) => {
    const { restaurantId, categoryId } = request.query;
    const conditions = [];
    if (restaurantId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_js_1.menuItems.restaurantId, parseInt(restaurantId)));
    }
    if (categoryId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_js_1.menuItems.categoryId, parseInt(categoryId)));
    }
    const items = await index_js_1.db
        .select()
        .from(schema_js_1.menuItems)
        .where(conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined);
    return reply.send({ menuItems: items });
});
// -------------------------------------------------------------
// 3. READ ONE (GET /api/menu-items/:id)
// -------------------------------------------------------------
fastify.get('/api/menu-items/:id', async (request, reply) => {
    const { id } = request.params;
    const itemId = parseInt(id);
    if (isNaN(itemId)) {
        return reply.status(400).send({ error: 'Invalid ID format.' });
    }
    const [item] = await index_js_1.db
        .select()
        .from(schema_js_1.menuItems)
        .where((0, drizzle_orm_1.eq)(schema_js_1.menuItems.id, itemId));
    if (!item) {
        return reply.status(404).send({ error: 'Menu item not found.' });
    }
    return reply.send({ menuItem: item });
});
// -------------------------------------------------------------
// 4. UPDATE (PUT / PATCH /api/menu-items/:id)
// -------------------------------------------------------------
fastify.patch('/api/menu-items/:id', async (request, reply) => {
    const { id } = request.params;
    const itemId = parseInt(id);
    if (isNaN(itemId)) {
        return reply.status(400).send({ error: 'Invalid ID format.' });
    }
    const body = request.body;
    // Check if item exists
    const [existing] = await index_js_1.db
        .select()
        .from(schema_js_1.menuItems)
        .where((0, drizzle_orm_1.eq)(schema_js_1.menuItems.id, itemId));
    if (!existing) {
        return reply.status(404).send({ error: 'Menu item not found.' });
    }
    // Construct dynamic update object
    const updateData = {};
    if (body.menuName !== undefined)
        updateData.menuName = body.menuName;
    if (body.invoiceName !== undefined)
        updateData.invoiceName = body.invoiceName;
    if (body.kitchenName !== undefined)
        updateData.kitchenName = body.kitchenName;
    if (body.priceDineIn !== undefined)
        updateData.priceDineIn = String(body.priceDineIn);
    if (body.priceTakeaway !== undefined)
        updateData.priceTakeaway = String(body.priceTakeaway);
    if (body.priceDelivery !== undefined)
        updateData.priceDelivery = String(body.priceDelivery);
    if (body.priceWaiter !== undefined)
        updateData.priceWaiter = String(body.priceWaiter);
    if (body.costPrice !== undefined)
        updateData.costPrice = String(body.costPrice);
    if (body.description !== undefined)
        updateData.description = body.description;
    if (body.images !== undefined)
        updateData.images = body.images;
    if (body.isAvailable !== undefined)
        updateData.isAvailable = body.isAvailable;
    if (body.categoryId !== undefined)
        updateData.categoryId = body.categoryId;
    if (body.stationId !== undefined)
        updateData.stationId = body.stationId;
    const [updatedItem] = await index_js_1.db
        .update(schema_js_1.menuItems)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(schema_js_1.menuItems.id, itemId))
        .returning();
    return reply.send({ menuItem: updatedItem });
});
// -------------------------------------------------------------
// 5. DELETE (DELETE /api/menu-items/:id)
// -------------------------------------------------------------
fastify.delete('/api/menu-items/:id', async (request, reply) => {
    const { id } = request.params;
    const itemId = parseInt(id);
    if (isNaN(itemId)) {
        return reply.status(400).send({ error: 'Invalid ID format.' });
    }
    const [deletedItem] = await index_js_1.db
        .delete(schema_js_1.menuItems)
        .where((0, drizzle_orm_1.eq)(schema_js_1.menuItems.id, itemId))
        .returning();
    if (!deletedItem) {
        return reply.status(404).send({ error: 'Menu item not found.' });
    }
    return reply.send({
        message: 'Menu item deleted successfully.',
        deletedItemId: itemId,
    });
});
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
    const { name, phone } = request.body;
    // 1. Basic validation
    if (!name || name.trim() === '') {
        return reply.status(400).send({ error: 'Restaurant name is required' });
    }
    // 2. Check if restaurant with the same name already exists
    const existingRestaurant = await index_js_1.db
        .select()
        .from(schema_js_1.restaurants)
        .where((0, drizzle_orm_1.eq)(schema_js_1.restaurants.name, name.trim()))
        .limit(1);
    if (existingRestaurant.length > 0) {
        return reply.status(409).send({
            error: `A restaurant with the name '${name}' already exists.`,
        });
    }
    // 3. Insert if it does not exist
    const [newRestaurant] = await index_js_1.db
        .insert(schema_js_1.restaurants)
        .values({ name: name.trim(), phone })
        .returning();
    return reply.status(201).send({ restaurant: newRestaurant });
});
// 3. Create Order (Waitstaff POS)
fastify.post('/api/orders', async (request, reply) => {
    const body = request.body;
    if (!body) {
        return reply.status(400).send({ error: 'Missing request body.' });
    }
    const { restaurantId, tableId, totalAmount, orderType, customerName, customerPhone, deliveryAddress, serverId, cashierId, } = body;
    if (!restaurantId) {
        return reply.status(400).send({ error: 'restaurantId is required.' });
    }
    try {
        const [newOrder] = await index_js_1.db
            .insert(schema_js_1.orders)
            .values({
            restaurantId: Number(restaurantId),
            // Safely parse tableId into a number or set to null
            tableId: tableId ? Number(tableId) : null,
            totalAmount: totalAmount ?? '0.00',
            status: 'open',
            orderType: orderType ?? 'dine_in',
            customerName: customerName ?? null,
            customerPhone: customerPhone ?? null,
            deliveryAddress: deliveryAddress ?? null,
            serverId: serverId ? Number(serverId) : null,
            cashierId: cashierId ? Number(cashierId) : null,
        })
            .returning();
        return reply.status(201).send({ order: newOrder });
    }
    catch (err) {
        // PostgreSQL code 23503 = Foreign Key Violation (restaurantId, serverId, or cashierId missing)
        if (err.code === '23503') {
            return reply.status(404).send({
                error: `Foreign key constraint failed. Check if restaurantId (${restaurantId}), serverId, or cashierId exist.`,
                detail: err.detail,
            });
        }
        console.error('❌ Database Insert Error:', err);
        return reply.status(500).send({ error: err.message });
    }
});
// 4. Get Active Orders for Kitchen Display System (KDS)
fastify.get('/api/kds/:restaurantId', async (request, reply) => {
    const { restaurantId } = request.params;
    const kitchenOrders = await index_js_1.db
        .select()
        .from(schema_js_1.orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_js_1.orders.restaurantId, parseInt(restaurantId)), (0, drizzle_orm_1.notInArray)(schema_js_1.orders.status, ['closed', 'canceled'])));
    return reply.send({ orders: kitchenOrders });
});
// 5. Update Order Status (Kitchen updates to 'preparing' or 'completed')
fastify.patch('/api/orders/:id/status', async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body;
    const [updatedOrder] = await index_js_1.db
        .update(schema_js_1.orders)
        .set({ status })
        .where((0, drizzle_orm_1.eq)(schema_js_1.orders.id, parseInt(id)))
        .returning();
    return reply.send({ order: updatedOrder });
});
// 6. orderitems 
async function updateOrderTotal(orderId) {
    // Query sum of subtotals matching order_items.order_id
    const [result] = await index_js_1.db
        .select({
        total: (0, drizzle_orm_1.sql) `COALESCE(SUM(${schema_js_1.orderItems.subtotal}), '0.00')::text`,
    })
        .from(schema_js_1.orderItems)
        .where((0, drizzle_orm_1.eq)(schema_js_1.orderItems.orderId, orderId)); // <--- FIXED: orderItems.orderId instead of orders.id
    const newTotal = result?.total ?? '0.00';
    // Update parent order record
    await index_js_1.db
        .update(schema_js_1.orders)
        .set({ totalAmount: newTotal })
        .where((0, drizzle_orm_1.eq)(schema_js_1.orders.id, orderId));
}
fastify.post('/api/orders/:orderId/items', async (request, reply) => {
    const { orderId } = request.params;
    const body = request.body;
    if (!body?.items?.length) {
        return reply.status(400).send({ error: 'At least one item is required.' });
    }
    const parsedOrderId = parseInt(orderId);
    const resultItems = [];
    for (const item of body.items) {
        const qtyToAdd = item.quantity || 1;
        const priceNum = Number(item.unitPrice);
        // 1. Check if item already exists for this order
        const [existingItem] = await index_js_1.db
            .select()
            .from(schema_js_1.orderItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_js_1.orderItems.orderId, parsedOrderId), (0, drizzle_orm_1.eq)(schema_js_1.orderItems.menuItemId, item.menuItemId)));
        if (existingItem) {
            // 2. Item exists: Update quantity and subtotal
            const newQuantity = qtyToAdd;
            const newSubtotal = (priceNum * qtyToAdd).toFixed(2);
            const [updatedItem] = await index_js_1.db
                .update(schema_js_1.orderItems)
                .set({
                quantity: newQuantity,
                subtotal: newSubtotal,
                unitPrice: priceNum.toFixed(2), // update unit price if changed
            })
                .where((0, drizzle_orm_1.eq)(schema_js_1.orderItems.id, existingItem.id))
                .returning();
            resultItems.push(updatedItem);
        }
        else {
            // 3. Item is new: Insert new line item
            const newSubtotal = (priceNum * qtyToAdd).toFixed(2);
            const [newItem] = await index_js_1.db
                .insert(schema_js_1.orderItems)
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
    const { id } = request.params;
    const body = request.body;
    const itemId = parseInt(id);
    const [existingItem] = await index_js_1.db
        .select()
        .from(schema_js_1.orderItems)
        .where((0, drizzle_orm_1.eq)(schema_js_1.orderItems.id, itemId));
    if (!existingItem) {
        return reply.status(404).send({ error: 'Order item not found.' });
    }
    const updateData = {};
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
    const [updatedItem] = await index_js_1.db
        .update(schema_js_1.orderItems)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(schema_js_1.orderItems.id, itemId))
        .returning();
    if (body.quantity && existingItem.orderId) {
        await updateOrderTotal(existingItem.orderId);
    }
    return reply.send({ item: updatedItem });
});
// New one get the order item 
fastify.get('/api/orders/:id', async (request, reply) => {
    const { id } = request.params;
    const orderId = parseInt(id);
    if (isNaN(orderId)) {
        return reply.status(400).send({ error: 'Invalid order ID format.' });
    }
    // 1. Fetch order details with joined order_items and menu_items
    const rows = await index_js_1.db
        .select({
        order: schema_js_1.orders,
        item: schema_js_1.orderItems,
        menuItemName: schema_js_1.menuItems.menuName,
    })
        .from(schema_js_1.orders)
        .leftJoin(schema_js_1.orderItems, (0, drizzle_orm_1.eq)(schema_js_1.orderItems.orderId, schema_js_1.orders.id))
        .leftJoin(schema_js_1.menuItems, (0, drizzle_orm_1.eq)(schema_js_1.orderItems.menuItemId, schema_js_1.menuItems.id))
        .where((0, drizzle_orm_1.eq)(schema_js_1.orders.id, orderId));
    if (!rows.length) {
        return reply.status(404).send({ error: 'Order not found.' });
    }
    // 2. Extract base order details
    const orderData = rows[0].order;
    // 3. Format items array (filtering out nulls if order has no items yet)
    const items = rows
        .filter((r) => r.item !== null)
        .map((r) => ({
        ...r.item,
        name: r.menuItemName ?? 'Unknown Item',
    }));
    return reply.send({
        order: {
            ...orderData,
            items,
        },
    });
});
// delete item from order 
fastify.delete('/api/order-items/:id', async (request, reply) => {
    const { id } = request.params;
    const itemId = parseInt(id);
    if (isNaN(itemId)) {
        return reply.status(400).send({ error: 'Invalid item ID format.' });
    }
    // 1. Fetch the item first so we know which orderId it belongs to
    const [existingItem] = await index_js_1.db
        .select()
        .from(schema_js_1.orderItems)
        .where((0, drizzle_orm_1.eq)(schema_js_1.orderItems.id, itemId));
    if (!existingItem) {
        return reply.status(404).send({ error: 'Order item not found.' });
    }
    const { orderId } = existingItem;
    // 2. Delete the order item
    await index_js_1.db
        .delete(schema_js_1.orderItems)
        .where((0, drizzle_orm_1.eq)(schema_js_1.orderItems.id, itemId));
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
    const { id } = request.params;
    const orderId = parseInt(id);
    if (isNaN(orderId)) {
        return reply.status(400).send({ error: 'Invalid order ID format.' });
    }
    // 1. Fetch current order to verify existence and status
    const [existingOrder] = await index_js_1.db
        .select()
        .from(schema_js_1.orders)
        .where((0, drizzle_orm_1.eq)(schema_js_1.orders.id, orderId));
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
    const [updatedOrder] = await index_js_1.db
        .update(schema_js_1.orders)
        .set({
        status: 'cancelled',
        totalAmount: '0.00',
    })
        .where((0, drizzle_orm_1.eq)(schema_js_1.orders.id, orderId))
        .returning();
    // 3. Mark all pending/preparing kitchen items as 'cancelled'
    await index_js_1.db
        .update(schema_js_1.orderItems)
        .set({ kitchenStatus: 'cancelled' })
        .where((0, drizzle_orm_1.eq)(schema_js_1.orderItems.orderId, orderId));
    return reply.send({
        message: 'Order cancelled successfully.',
        order: updatedOrder,
    });
});
// Register plugins
fastify.register(categories_js_1.default);
fastify.register(kitchenStations_js_1.default);
// Start Server
const start = async () => {
    try {
        const port = Number(process.env.PORT) || 3000;
        await fastify.listen({ port, host: '127.0.0.1' });
        console.log(`\n🚀 API Server running on http://127.0.0.1:${port}\n`);
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();
