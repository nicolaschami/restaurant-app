import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import { kitchenStations } from "../db/schema";
import { eq, and } from "drizzle-orm";

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
  // 1. GET ALL (Optional query param ?restaurantId=1 to filter)
  // -------------------------------------------------------------
  fastify.get(
    "/api/kitchenStation",
    async (
      request: FastifyRequest<{ Querystring: StationQuery }>,
      reply: FastifyReply
    ) => {
      try {
        const { restaurantId } = request.query;

        if (restaurantId) {
          const parsedId = parseInt(restaurantId, 10);
          if (isNaN(parsedId)) {
            return reply.status(400).send({ message: "Invalid restaurantId" });
          }

          const stations = await db
            .select()
            .from(kitchenStations)
            .where(eq(kitchenStations.restaurantId, parsedId));

          return reply.status(200).send(stations);
        }

        const stations = await db.select().from(kitchenStations);
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
      try {
        const stationId = parseInt(request.params.id, 10);
        if (isNaN(stationId)) {
          return reply.status(400).send({ message: "Invalid station ID" });
        }

        const [station] = await db
          .select()
          .from(kitchenStations)
          .where(eq(kitchenStations.id, stationId))
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
      try {
        const { restaurantId, name, description } = request.body;

        if (!restaurantId || !name) {
          return reply.status(400).send({ 
            message: "Missing required fields: restaurantId and name are required" 
          });
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
      try {
        const stationId = parseInt(request.params.id, 10);
        if (isNaN(stationId)) {
          return reply.status(400).send({ message: "Invalid station ID" });
        }

        const { name, description, restaurantId } = request.body;

        const [updatedStation] = await db
          .update(kitchenStations)
          .set({
            ...(name !== undefined && { name }),
            ...(description !== undefined && { description }),
            ...(restaurantId !== undefined && { restaurantId }),
          })
          .where(eq(kitchenStations.id, stationId))
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
      try {
        const stationId = parseInt(request.params.id, 10);
        if (isNaN(stationId)) {
          return reply.status(400).send({ message: "Invalid station ID" });
        }

        const [deletedStation] = await db
          .delete(kitchenStations)
          .where(eq(kitchenStations.id, stationId))
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