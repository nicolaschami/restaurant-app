import {
    pgTable,
    serial,
    integer,
    varchar,
    numeric,
    text,
    boolean,
    timestamp,
    jsonb ,
    primaryKey   ,
    uniqueIndex, 
    pgEnum,
    bigint,
    bigserial,
  index
  } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
export const tableStatusEnum = pgEnum('table_status', ['free', 'occupied', 'reserved']);


export type RawMaterialItem = {
  materialId: number;
  name: string;
  cost: number;
  quantity: number;
  totalCost: number;
};

export const orderKdsStatusEnum = pgEnum('order_kds_status_enum', [
  'PENDING_FIRE',   // Drafted, not yet sent to kitchen
  'FIRE_SENT',      // Sent to kitchen, cooking in progress
  'READY',          // All items bumped on KDS
  'PARTIAL_FIRE',   // Some items cooking, new add-ons drafted on POS
]);

// 2. KDS Item State Enum
export const itemKdsStatusEnum = pgEnum('item_kds_status_enum', [
  'PENDING',        // Draft item
  'FIRE_SENT',      // Displayed on KDS screen as new order/add-on
  'IN_PREP',        // Cook explicitly started work on this item
  'BUMPED',         // Marked complete on KDS
  'CANCELLED',      // Item voided
]);

// 3. Station Enum
export const stationEnum = pgEnum('station_enum', [
  'GRILL',
  'FRYER',
  'SALAD',
  'ASSEMBLY',
]);

export const restaurantTables = pgTable('restaurant_tables', {
  id: bigserial('id', { mode: 'number' }).primaryKey(), // OR use: serial('id').primaryKey(),
  restaurantId: bigint('restaurant_id', { mode: 'number' }).notNull(),
  label: varchar('label', { length: 50 }).notNull(),
  capacity: integer('capacity'),
  zone: varchar('zone', { length: 50 }),
  notes: text('notes'),
  status: tableStatusEnum('status').default('free').notNull(),
  currentOrderId: bigint('current_order_id', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  restaurantId: varchar('restaurant_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  email: varchar('email', { length: 50 }),
  address: text('address'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// supplier table 
export const suppliers = pgTable(
  'supplier',
  {
    supplierId: serial('supplier_id').primaryKey(),
    restaurantId: varchar('restaurant_id', { length: 10 }).notNull(),
    supplierCode: varchar('supplier_code', { length: 50 }),
    supplierName: varchar('supplier_name', { length: 200 }).notNull(),
    contactPerson: varchar('contact_person', { length: 150 }),

    // Contact details
    phone: varchar('phone', { length: 50 }),
    phone2: varchar('phone2', { length: 50 }),
    email: varchar('email', { length: 150 }),

    // Location
    address: varchar('address', { length: 300 }),
    city: varchar('city', { length: 100 }),
    country: varchar('country', { length: 100 }),

    // Commercial & Financial
    taxNumber: varchar('tax_number', { length: 100 }),
    currencyCode: varchar('currency_code', { length: 10 }).default('USD'),
    paymentTerms: varchar('payment_terms', { length: 50 }).default('NET30'),
    creditLimit: numeric('credit_limit', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    openingBalance: numeric('opening_balance', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),

    // Metadata & Status
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),

    // Timestamps
    createdDate: timestamp('created_date', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedDate: timestamp('updated_date', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Indexes & Unique Constraints
    supplierCodeIdx: uniqueIndex('uk_restaurant_supplier_code').on(
      table.restaurantId,
      table.supplierCode
    ),
    restaurantIdx: index('idx_supplier_restaurant').on(table.restaurantId),
    activeIdx: index('idx_supplier_active').on(table.restaurantId, table.isActive),
  })
);
export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;


// raw_material table 


export const rawMaterials = pgTable('raw_materials', {
  id: serial('id').primaryKey(),
  code: text('code'),
  restaurantId: integer('restaurant_id').notNull().default(0), // 👈 Check exact casing here
  barCode: text('barcode'),
  name: text('name').notNull(),
  categoryId: integer('category_id'),
  supplierId: integer('supplier_id'),
  brand: text('brand'),
  unit: text('unit').notNull().default('kg'),
  costPrice: numeric('cost_price', { precision: 10, scale: 4 }).notNull().default('0.0000'),
  lastPurchasePrice: numeric('last_purchase_price', { precision: 10, scale: 4 }),
  currencyCode: text('currency_code').default('USD'),
  currentStock: numeric('current_stock', { precision: 10, scale: 3 }).default('0.000'),
  minQty: numeric('min_qty', { precision: 10, scale: 3 }).default('0.000'),
  maxQty: numeric('max_qty', { precision: 10, scale: 3 }).default('0.000'),
  hasTva: boolean('has_tva').default(false),
  warehouse: text('warehouse'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});




// modifier groups  
export const modifierGroups = pgTable('modifier_groups', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id').notNull(), // 👈 Add .notNull()
  name: varchar('name').notNull(),
  minSelection: integer('min_selection').default(0),
  maxSelection: integer('max_selection').default(1),
  isRequired: boolean('is_required').default(false).notNull(), // 👈 ADD THIS LINE
});





// modifier option 


export const modifierOptions = pgTable('modifier_options', {
  id: serial('id').primaryKey(),
  modifierGroupId: integer('modifier_group_id').references(() => modifierGroups.id, { onDelete: 'cascade' }),
  name: varchar('name').notNull(),
  priceAdjustment: numeric('price_adjustment', { precision: 10, scale: 2 }).default('0.00'),
});

// --- DRIZZLE RELATIONS ---
export const modifierGroupsRelations = relations(modifierGroups, ({ many }) => ({
  options: many(modifierOptions),
}));

export const modifierOptionsRelations = relations(modifierOptions, ({ one }) => ({
  group: one(modifierGroups, {
    fields: [modifierOptions.modifierGroupId],
    references: [modifierGroups.id],
  }),
}));




export const menuItemModifiers = pgTable('menu_item_modifiers', {
  menuItemId: integer('menu_item_id')
    .notNull()
    .references(() => menuItems.id, { onDelete: 'cascade' }),
  modifierGroupId: integer('modifier_group_id')
    .notNull()
    .references(() => modifierGroups.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').default(0).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.menuItemId, table.modifierGroupId] }),
}));

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id'),
  name: varchar('full_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  
  // 👈 Make sure JavaScript property 'role' points to 'role_id' DB column
  role: integer('role_id').default(1), 
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
  export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  printername:varchar('printername', { length: 255 }),
  position: integer('position').notNull().default(0), // 👈 Added position field
  // --- Audit Fields ---
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),

  createdById: integer('created_by_id'), // Nullable in case created by system
  updatedById: integer('updated_by_id'),
});

  export const kitchenStations = pgTable('kitchen_stations', {
    id: serial('id').primaryKey(),
    restaurantId: integer('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: text("description"),
  });

  // 3. Menu Items Table
  export const menuItems = pgTable('menu_items', {
    id: serial('id').primaryKey(),
    restaurantId: integer('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    stationId: integer('station_id').references(() => kitchenStations.id, { onDelete: 'set null' }),
  
    // Contextual Names
    menuName: varchar('menu_name', { length: 100 }).notNull(),
    invoiceName: varchar('invoice_name', { length: 100 }).notNull(),
    kitchenName: varchar('kitchen_name', { length: 100 }).notNull(),
  
    // Pricing Tiers & Cost
    priceDineIn: numeric('price_dine_in', { precision: 10, scale: 2 }).default('0.00').notNull(),
    priceTakeaway: numeric('price_takeaway', { precision: 10, scale: 2 }).default('0.00').notNull(),
    priceDelivery: numeric('price_delivery', { precision: 10, scale: 2 }).default('0.00').notNull(),
    priceWaiter: numeric('price_waiter', { precision: 10, scale: 2 }).default('0.00').notNull(),
    costPrice: numeric('cost_price', { precision: 10, scale: 2 }).default('0.00'),
  
    // Extra Details & Media
    description: text('description'),
    images: jsonb('images').$type<string[]>().default([]),
  
    // Availability
    isAvailable: boolean('is_available').default(true),
    position: integer('position').notNull().default(0), // 👈 Add position field
    createdAt: timestamp('created_at').defaultNow(),
    // Add these columns inside menuItems table in db/schema.ts
countryTax: numeric('country_tax', { precision: 5, scale: 2 }).default('0.00'), // e.g., 15.00 for 15%
ingredients: text('ingredients'), // Raw materials / ingredients list
isInventoryTracked: boolean('is_inventory_tracked').default(false), // Quantitative tracking checkbox
hasVariants: boolean('has_variants').default(false), // Enables Size-based pricing
variantPrices: jsonb('variant_prices'), // Holds sizes & prices e.g., [{ name: 'Small', price: 10 }, { name: 'Large', price: 15 }]
rawMaterials: jsonb('raw_materials').$type<RawMaterialItem[]>().default([]),

  });

// 1. RESTAURANTS (Multi-tenancy table)

// 2. users



// 3. ORDERS
export const orders = pgTable('orders', {
    id: serial('id').primaryKey(),
    restaurantId: integer('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
    ticketNo: integer('ticket_no'), // 👈 New column added
    tableId: integer('table_id'),
    status: varchar('status', { length: 20 }).default('open'),
    totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).default('0.00'),
    createdAt: timestamp('created_at').defaultNow(),
    serverId: integer('server_id').references(() => users.id, { onDelete: 'set null' }),
    cashierId: integer('cashier_id').references(() => users.id, { onDelete: 'set null' }),
    orderType: varchar('order_type', { length: 20 }).default('dine_in'),
    customerName: varchar('customer_name', { length: 100 }),
    customerPhone: varchar('customer_phone', { length: 20 }),
    notes: varchar('notes', { length: 200 }),
    deliveryAddress: text('delivery_address'),
    kdsStatus: orderKdsStatusEnum('kds_status').notNull().default('PENDING_FIRE'),
    revisionNumber: integer('revision_number').notNull().default(1),
     lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),

  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

    
  });

  // 4. OrdersItems 
  
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'cascade' }),
  menuItemId: integer('menu_item_id'),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
  variantSize: varchar('variant_size', { length: 50 }),
  modifiers: jsonb('modifiers').default([]), // 👈 Added JSONB field

  kitchenStatus: varchar('kitchen_status', { length: 20 }).default('pending'),
  sentToKitchenAt: timestamp('sent_to_kitchen_at'),
  completedAt: timestamp('completed_at'),
station: stationEnum('station').notNull().default('GRILL'),
  quantityFired: integer('quantity_fired').notNull().default(0),
  quantityOrderd: integer('quantity_ordered').notNull().default(0),
  quantityCompleted: integer('quantity_completed').notNull().default(0),
  kdsStatus: itemKdsStatusEnum('kds_status').notNull().default('PENDING'),
  fireBatchNumber: integer('fire_batch_number').notNull().default(1),

  // Timestamps
  firedAt: timestamp('fired_at', { withTimezone: true }),
  
parentItemId: integer('parent_item_id').references((): any => orderItems.id, { onDelete: 'set null' }),

});


export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
}));


export const restaurants = pgTable('restaurants', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }),
  address_line1: varchar('address_line1', { length: 255 }),
  address_line2: varchar('address_line2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  state_province: varchar('state_province', { length: 100 }),
  postal_code: varchar('postal_code', { length: 20 }),
  country: varchar('country', { length: 100 }).default('US'),
  currency: varchar('currency', { length: 3 }).default('USD'),
  timezone: varchar('timezone', { length: 50 }).default('UTC'),
  logoUrl: text('logo_url'),
  receipt_header: text('receipt_header'),
  receipt_footer: text('receipt_footer'),
  tax_number: varchar('tax_number', { length: 50 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});



// schema.ts


// 1. Parent Table: stocktransactions
export const stockTransactions = pgTable('stocktransactions', {
  transactionId: serial('TransactionID').primaryKey(),
  restaurantId: integer('RestaurantID'),
  transactionNumber: varchar('TransactionNumber', { length: 50 }),
  grnNumber: varchar('GRNNumber', { length: 50 }),
  supplierName: varchar('SupplierName', { length: 255 }).notNull(),
  transactionDate: timestamp('TransactionDate').defaultNow(),
  reference: varchar('Reference', { length: 100 }),
  comment: text('Comment'),
  subtotal: numeric('Subtotal', { precision: 10, scale: 2 }).default('0.00'),
  discountAmount: numeric('DiscountAmount', { precision: 10, scale: 2 }).default('0.00'),
  taxableAmount: numeric('TaxableAmount', { precision: 10, scale: 2 }).default('0.00'),
  taxAmount: numeric('TaxAmount', { precision: 10, scale: 2 }).default('0.00'),
  netTotal: numeric('NetTotal', { precision: 10, scale: 2 }).default('0.00'),
  attachmentPath: varchar('AttachmentPath', { length: 500 }),
  status: varchar('Status', { length: 20 }).default('DRAFT'),
  type: varchar('type', { length: 20 }).default('IN'),
  createdAt: timestamp('CreatedAt').defaultNow(),
  updatedAt: timestamp('UpdatedAt').defaultNow(),
});

// 2. Child Table: stockdetails
export const stockDetails = pgTable('stockdetails', {
  detailId: serial('detailid').primaryKey(),
  transactionId: integer('transactionid').references(() => stockTransactions.transactionId, { onDelete: 'cascade' }),
  itemname: varchar('itemname', { length: 255 }).notNull(),
  unit: varchar('unit', { length: 50 }),
  qty: numeric('qty', { precision: 10, scale: 2 }).default('0.00'),
  unitCost: numeric('unitcost', { precision: 10, scale: 2 }).default('0.00'),
  discountPct: numeric('discountpct', { precision: 5, scale: 2 }).default('0.00'),
  lineTotal: numeric('linetotal', { precision: 10, scale: 2 }).default('0.00'),
  type: varchar('type', { length: 20 }).default('IN'),
});

// 3. Table Relations
export const stockTransactionsRelations = relations(stockTransactions, ({ many }) => ({
  details: many(stockDetails),
}));

export const stockDetailsRelations = relations(stockDetails, ({ one }) => ({
  transaction: one(stockTransactions, {
    fields: [stockDetails.transactionId],
    references: [stockTransactions.transactionId],
  }),
}));

// Export Types for Request/Response usage
export type StockTransaction = typeof stockTransactions.$inferSelect;
export type NewStockTransaction = typeof stockTransactions.$inferInsert;
export type StockDetail = typeof stockDetails.$inferSelect;
export type NewStockDetail = typeof stockDetails.$inferInsert;
export interface CreateStockTransactionPayload extends Omit<NewStockTransaction, 'transactionId'> {
  items: Omit<NewStockDetail, 'detailId' | 'transactionId'>[];
}
// ==========================================
// TYPE EXPORTS
// ==========================================


// Schema specifically for PUT updates




export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  // Parent item relation for Split Line add-ons
  parentItem: one(orderItems, {
    fields: [orderItems.parentItemId],
    references: [orderItems.id],
    relationName: 'itemAddOns',
  }),
  // Child add-on items relation
  childAddOns: many(orderItems, {
    relationName: 'itemAddOns',
  }),
}));