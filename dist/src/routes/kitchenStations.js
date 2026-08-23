"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = kitchenStationRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const index_js_1 = require("../db/index.js");
const schema_js_1 = require("../db/schema.js");
async function kitchenStationRoutes(fastify) {
    // CREATE KITCHEN STATION
    fastify.post('/api/kitchen-stations', async (request, reply) => {
        const body = request.body;
        if (!body?.restaurantId || !body?.name) {
            return reply.status(400).send({ error: 'restaurantId and name are required.' });
        }
        const [newStation] = await index_js_1.db
            .insert(schema_js_1.kitchenStations)
            .values({
            restaurantId: body.restaurantId,
            name: body.name,
        })
            .returning();
        return reply.status(201).send({ station: newStation });
    });
    // GET ALL KITCHEN STATIONS
    fastify.get('/api/kitchen-stations', async (request, reply) => {
        const { restaurantId } = request.query;
        const result = await index_js_1.db
            .select()
            .from(schema_js_1.kitchenStations)
            .where(restaurantId ? (0, drizzle_orm_1.eq)(schema_js_1.kitchenStations.restaurantId, parseInt(restaurantId)) : undefined);
        return reply.send({ kitchenStations: result });
    });
}
