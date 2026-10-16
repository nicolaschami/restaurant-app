import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import { kitchenStations } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getRestaurantId } from "../lib/tenant.js";

interface StationParams {
  id: string;
}

interface StationQuery {
  restaurantId?: string;
}

interface StationBody {
  restaurantId: number;
  name: string;
  description?: string;
}

export default async function kitchenStationRoutes(fastify: FastifyInstance) {
  
  // -------------------------------------------------------------
  // 1. GET ALL (stations of the logged-in user's restaurant)
  // -------------------------------------------------------------
  fastify.get(
    "/api/kitchenStation",
    async (
      request: FastifyRequest<{ Querystring: StationQuery }>,
      reply: FastifyReply
    ) => {
      // Only the stations of the user's restaurant (from the login token).
      // Before, without ?restaurantId it returned the stations of ALL restaurants.
      const restaurantId = getRestaurantId(request);
      try {
        const stations = await db
          .select()
          .from(kitchenStations)
          .where(eq(kitchenStations.restaurantId, restaurantId));

        return reply.status(200).send(stations);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ message: "Failed to fetch kitchen stations" });
      }
    }
  );

  // -------------------------------------------------------------
  // 2. GET ONE BY ID
  // -------------------------------------------------------------
  fastify.get(
    "/api/kitchenStation/:id",
    async (
      request: FastifyRequest<{ Params: StationParams }>,
      reply: FastifyReply
    ) => {
      const restaurantId = getRestaurantId(request);
      try {
        const stationId = parseInt(request.params.id, 10);
        if (isNaN(stationId)) {
          return reply.status(400).send({ message: "Invalid station ID" });
        }

        // Match the id AND the restaurant: another restaurant's station counts as "not found".
        const [station] = await db
          .select()
          .from(kitchenStations)
          .where(and(eq(kitchenStations.id, stationId), eq(kitchenStations.restaurantId, restaurantId)))
          .limit(1);

        if (!station) {
          return reply.status(404).send({ message: "Kitchen station not found" });
        }

        return reply.status(200).send(station);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ message: "Failed to fetch kitchen station" });
      }
    }
  );

  // -------------------------------------------------------------
  // 3. POST (CREATE)
  // -------------------------------------------------------------
  fastify.post(
    "/api/kitchenStation",
    async (
      request: FastifyRequest<{ Body: StationBody }>,
      reply: FastifyReply
    ) => {
      // The new station belongs to the user's restaurant (token), whatever the body says.
      const restaurantId = getRestaurantId(request);
      try {
        const { name, description } = request.body;

        if (!name) {
          return reply.status(400).send({ message: "Missing required field: name" });
        }

        const [newStation] = await db
          .insert(kitchenStations)
          .values({
            restaurantId,
            name,
            description: description || null,
          })
          .returning();

        return reply.status(201).send(newStation);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ message: "Failed to create kitchen station" });
      }
    }
  );

  // -------------------------------------------------------------
  // 4. PUT (UPDATE)
  // -------------------------------------------------------------
  fastify.put(
    "/api/kitchenStation/:id",
    async (
      request: FastifyRequest<{ Params: StationParams; Body: Partial<StationBody> }>,
      reply: FastifyReply
    ) => {
      const restaurantId = getRestaurantId(request);
      try {
        const stationId = parseInt(request.params.id, 10);
        if (isNaN(stationId)) {
          return reply.status(400).send({ message: "Invalid station ID" });
        }

        // restaurantId can no longer be changed from the body (that would move the
        // station to another restaurant).
        const { name, description } = request.body;

        const [updatedStation] = await db
          .update(kitchenStations)
          .set({
            ...(name !== undefined && { name }),
            ...(description !== undefined && { description }),
          })
          .where(and(eq(kitchenStations.id, stationId), eq(kitchenStations.restaurantId, restaurantId)))
          .returning();

        if (!updatedStation) {
          return reply.status(404).send({ message: "Kitchen station not found" });
        }

        return reply.status(200).send(updatedStation);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ message: "Failed to update kitchen station" });
      }
    }
  );

  // -------------------------------------------------------------
  // 5. DELETE
  // -------------------------------------------------------------
  fastify.delete(
    "/api/kitchenStation/:id",
    async (
      request: FastifyRequest<{ Params: StationParams }>,
      reply: FastifyReply
    ) => {
      const restaurantId = getRestaurantId(request);
      try {
        const stationId = parseInt(request.params.id, 10);
        if (isNaN(stationId)) {
          return reply.status(400).send({ message: "Invalid station ID" });
        }

        const [deletedStation] = await db
          .delete(kitchenStations)
          .where(and(eq(kitchenStations.id, stationId), eq(kitchenStations.restaurantId, restaurantId)))
          .returning();

        if (!deletedStation) {
          return reply.status(404).send({ message: "Kitchen station not found" });
        }

        return reply.status(200).send({ 
          message: "Kitchen station deleted successfully",
          deletedId: deletedStation.id 
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ message: "Failed to delete kitchen station" });
      }
    }
  );
}