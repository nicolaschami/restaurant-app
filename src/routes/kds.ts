import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import {
  orders,
  orderItems,
  menuItems,
  kitchenStations,
} from "../db/schema";
import { sql, eq, inArray, and } from "drizzle-orm";
import { roomManager } from "../lib/roomManager.js";

console.log("🚨🚨🚨 KDS ROUTES FILE LOADED 🚨🚨🚨");

interface KDSQuery {
  restaurantId?: string;
  restaurant_id?: string;
}

export async function kdsRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/kds/active",
    async (
      request: FastifyRequest<{ Querystring: KDSQuery }>,
      reply: FastifyReply
    ) => {
      console.log("🔥🔥🔥 KDS ACTIVE ROUTE HIT 🔥🔥🔥");
      console.log("QUERY:", request.query);

      try {
        const rawId = request.query.restaurantId || request.query.restaurant_id;
        const restaurantId = parseInt(String(rawId), 10);

        if (isNaN(restaurantId)) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Missing or invalid restaurantId query parameter",
            received: rawId ?? null,
          });
        }

        const activeOrders = await db
          .select({
            id: orders.id,
            ticketNo: orders.ticketNo,
            tableId: orders.tableId,
            orderType: orders.orderType,
            createdAt: orders.createdAt,
            kdsStatus: orders.kdsStatus,
        //    notes: orders.notes,
          })
          .from(orders)
          .where(
            and(
              eq(orders.restaurantId, restaurantId),
              sql`${orders.kdsStatus}::text IN ('FIRE_SENT', 'PARTIAL_FIRE')`
            )
          )
          .orderBy(orders.createdAt);

        if (activeOrders.length === 0) {
          return reply.status(200).send([]);
        }

        const orderIds = activeOrders.map((o) => o.id);

        const items = await db
          .select({
            id: orderItems.id,
            orderId: orderItems.orderId,
            quantity: orderItems.quantity,
            quantityFired: orderItems.quantityFired,
            quantityCompleted: orderItems.quantityCompleted,
            variantSize: orderItems.variantSize,
            modifiers: orderItems.modifiers,
            kdsStatus: orderItems.kdsStatus,
            menuItemName: menuItems.kitchenName,
            stationName: kitchenStations.name,
          })
          .from(orderItems)
          .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
          .leftJoin(kitchenStations, eq(menuItems.stationId, kitchenStations.id))
          .where(inArray(orderItems.orderId, orderIds));

        const formattedTickets = activeOrders.map((order) => {
          const orderItemsList = items.filter((i) => i.orderId === order.id);

          return {
            id: String(order.id),
            orderNumber: String(order.ticketNo),
            tableNumber: order.tableId ? `T-${order.tableId}` : undefined,
            orderType: (order.orderType?.toUpperCase() || "DINE_IN") as
              | "DINE_IN"
              | "TAKEAWAY"
              | "DELIVERY",
            createdAt: order.createdAt ? new Date(order.createdAt).getTime() : Date.now(),
            status: order.kdsStatus === "FIRE_SENT" ? "PENDING" : "IN_PROGRESS",
          //  notes: order.notes || undefined,
            items: orderItemsList
              // Exclude cancelled lines from what the kitchen sees at all.
              .filter((item) => item.kdsStatus !== "CANCELLED")
              .map((item) => ({
                id: String(item.id),
                name: item.menuItemName,
                quantity: item.quantityFired || item.quantity,
                // No longer forced into a fixed 4-value union — stations
                // are dynamic now (see KDSContainer's /kitchenStation
                // fetch on the frontend). "UNASSIGNED" instead of the old
                // silent "ASSEMBLY" default, since an item with no station
                // set isn't actually an Assembly item — it's just missing
                // data, and hiding that under a real station name made it
                // invisible.
                station: item.stationName?.toUpperCase() || "UNASSIGNED",
                modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
                variantSize: item.variantSize || undefined,
                completed:
                  (item.quantityCompleted ?? 0) >= (item.quantityFired || item.quantity),
              })),
          };
        });

        return reply.status(200).send(formattedTickets);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    }
  );

  // ------------------------------------------------------------
  // NEW: toggle a single item's completion state.
  // Called when a cook taps a line item on the ticket. Broadcasts so
  // every other connected KDS/dashboard screen re-fetches and reflects it.
  // ------------------------------------------------------------
  fastify.patch(
    "/api/kds/items/:id/toggle",
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { completed?: boolean } }>,
      reply: FastifyReply
    ) => {
      const itemId = parseInt(request.params.id, 10);
      if (isNaN(itemId)) {
        return reply.status(400).send({ error: "Invalid item ID." });
      }

      try {
        const [item] = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.id, itemId));

        if (!item) {
          return reply.status(404).send({ error: "Order item not found." });
        }

        const firedQty = item.quantityFired || item.quantity;
        const alreadyDone = (item.quantityCompleted ?? 0) >= firedQty;
        // If the client didn't say explicitly, just flip the current state.
        const completed = request.body?.completed ?? !alreadyDone;
        const newQuantityCompleted = completed ? firedQty : 0;

        const [updatedItem] = await db
          .update(orderItems)
          .set({ quantityCompleted: newQuantityCompleted })
          .where(eq(orderItems.id, itemId))
          .returning();

        // orderItems doesn't carry restaurantId directly — resolve it
        // through the parent order so the broadcast is scoped correctly.
        if (item.orderId) {
          const [orderRow] = await db
            .select({ restaurantId: orders.restaurantId })
            .from(orders)
            .where(eq(orders.id, item.orderId));

          if (orderRow?.restaurantId) {
            roomManager.broadcastToRestaurant(
              String(orderRow.restaurantId),
              "ORDER_UPDATED",
              { orderId: item.orderId, itemId }
            );
          }
        }

        return reply.status(200).send({ item: updatedItem });
      } catch (err: any) {
        fastify.log.error(err);
        return reply.status(500).send({ error: err.message || "Internal Server Error" });
      }
    }
  );

  // ------------------------------------------------------------
  // NEW: bump (complete) an entire order.
  // Called when a cook taps "Bump Ticket". Marks every remaining item as
  // completed and flips the order's kdsStatus out of the active set, so
  // GET /api/kds/active no longer returns it — the same broadcast pattern
  // as order creation removes it live from every connected screen.
  // ------------------------------------------------------------
  fastify.patch(
    "/api/kds/orders/:id/bump",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const orderId = parseInt(request.params.id, 10);
      if (isNaN(orderId)) {
        return reply.status(400).send({ error: "Invalid order ID." });
      }

      try {
        // NOTE: 'COMPLETED' must be a valid value for your kdsStatus
        // column (enum/check constraint) — confirm against your schema.
        // Anything outside ('FIRE_SENT','PARTIAL_FIRE') works for the
        // GET /api/kds/active filter; 'COMPLETED' is just a clear name.
        const [updatedOrder] = await db
          .update(orders)
          .set({ kdsStatus: "READY" })
          .where(eq(orders.id, orderId))
          .returning();

        if (!updatedOrder) {
          return reply.status(404).send({ error: "Order not found." });
        }

        // Mark every still-open item as fully completed too, so a bump
        // can't leave stray unfinished items behind in the data.
        await db
          .update(orderItems)
          .set({ quantityCompleted: sql`${orderItems.quantityFired}` })
          .where(eq(orderItems.orderId, orderId));

        if (updatedOrder.restaurantId) {
          roomManager.broadcastToRestaurant(
            String(updatedOrder.restaurantId),
            "ORDER_UPDATED",
            updatedOrder
          );
        }

        return reply.status(200).send({ order: updatedOrder });
      } catch (err: any) {
        fastify.log.error(err);
        return reply.status(500).send({ error: err.message || "Internal Server Error" });
      }
    }
  );
}
