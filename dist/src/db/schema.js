"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderItems = exports.orders = exports.users = exports.restaurants = exports.menuItems = exports.kitchenStations = exports.categories = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.categories = (0, pg_core_1.pgTable)('categories', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    restaurantId: (0, pg_core_1.integer)('restaurant_id').references(() => exports.restaurants.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
});
exports.kitchenStations = (0, pg_core_1.pgTable)('kitchen_stations', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    restaurantId: (0, pg_core_1.integer)('restaurant_id').references(() => exports.restaurants.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
});
// 3. Menu Items Table
exports.menuItems = (0, pg_core_1.pgTable)('menu_items', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    restaurantId: (0, pg_core_1.integer)('restaurant_id').references(() => exports.restaurants.id, { onDelete: 'cascade' }),
    categoryId: (0, pg_core_1.integer)('category_id').references(() => exports.categories.id, { onDelete: 'set null' }),
    stationId: (0, pg_core_1.integer)('station_id').references(() => exports.kitchenStations.id, { onDelete: 'set null' }),
    // Contextual Names
    menuName: (0, pg_core_1.varchar)('menu_name', { length: 100 }).notNull(),
    invoiceName: (0, pg_core_1.varchar)('invoice_name', { length: 100 }).notNull(),
    kitchenName: (0, pg_core_1.varchar)('kitchen_name', { length: 100 }).notNull(),
    // Pricing Tiers & Cost
    priceDineIn: (0, pg_core_1.numeric)('price_dine_in', { precision: 10, scale: 2 }).default('0.00').notNull(),
    priceTakeaway: (0, pg_core_1.numeric)('price_takeaway', { precision: 10, scale: 2 }).default('0.00').notNull(),
    priceDelivery: (0, pg_core_1.numeric)('price_delivery', { precision: 10, scale: 2 }).default('0.00').notNull(),
    priceWaiter: (0, pg_core_1.numeric)('price_waiter', { precision: 10, scale: 2 }).default('0.00').notNull(),
    costPrice: (0, pg_core_1.numeric)('cost_price', { precision: 10, scale: 2 }).default('0.00'),
    // Extra Details & Media
    description: (0, pg_core_1.text)('description'),
    images: (0, pg_core_1.jsonb)('images').$type().default([]),
    // Availability
    isAvailable: (0, pg_core_1.boolean)('is_available').default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
// 1. RESTAURANTS (Multi-tenancy table)
exports.restaurants = (0, pg_core_1.pgTable)('restaurants', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    phone: (0, pg_core_1.varchar)('phone', { length: 100 }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// 2. users
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    email: (0, pg_core_1.varchar)('email', { length: 255 }).notNull().unique(),
    role: (0, pg_core_1.varchar)('role', { length: 50 }).default('staff'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// 3. ORDERS
exports.orders = (0, pg_core_1.pgTable)('orders', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    restaurantId: (0, pg_core_1.integer)('restaurant_id').references(() => exports.restaurants.id, { onDelete: 'cascade' }),
    tableId: (0, pg_core_1.integer)('table_id'),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('open'),
    totalAmount: (0, pg_core_1.numeric)('total_amount', { precision: 10, scale: 2 }).default('0.00'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    serverId: (0, pg_core_1.integer)('server_id').references(() => exports.users.id, { onDelete: 'set null' }),
    cashierId: (0, pg_core_1.integer)('cashier_id').references(() => exports.users.id, { onDelete: 'set null' }),
    orderType: (0, pg_core_1.varchar)('order_type', { length: 20 }).default('dine_in'),
    customerName: (0, pg_core_1.varchar)('customer_name', { length: 100 }),
    customerPhone: (0, pg_core_1.varchar)('customer_phone', { length: 20 }),
    deliveryAddress: (0, pg_core_1.text)('delivery_address'),
});
// 4. OrdersItems 
exports.orderItems = (0, pg_core_1.pgTable)('order_items', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    orderId: (0, pg_core_1.integer)('order_id').references(() => exports.orders.id, { onDelete: 'cascade' }),
    menuItemId: (0, pg_core_1.integer)('menu_item_id').references(() => exports.menuItems.id, { onDelete: 'set null' }),
    quantity: (0, pg_core_1.integer)('quantity').default(1).notNull(),
    unitPrice: (0, pg_core_1.numeric)('unit_price', { precision: 10, scale: 2 }).notNull(),
    subtotal: (0, pg_core_1.numeric)('subtotal', { precision: 10, scale: 2 }).notNull(),
    kitchenStatus: (0, pg_core_1.varchar)('kitchen_status', { length: 20 }).default('pending'),
    sentToKitchenAt: (0, pg_core_1.timestamp)('sent_to_kitchen_at'),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
});
