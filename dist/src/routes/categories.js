"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = categoryRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const index_js_1 = require("../db/index.js");
const schema_js_1 = require("../db/schema.js");
async function categoryRoutes(fastify) {
    // CREATE CATEGORY
    fastify.post('/api/categories', async (request, reply) => {
        const body = request.body;
        if (!body?.restaurantId || !body?.name) {
            return reply.status(400).send({ error: 'restaurantId and name are required.' });
        }
        // 1. Check if category already exists for this restaurant
        const existingCategory = await index_js_1.db.query.categories.findFirst({
            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_js_1.categories.restaurantId, body.restaurantId), (0, drizzle_orm_1.eq)(schema_js_1.categories.name, body.name)),
        });
        if (existingCategory) {
            return reply.status(409).send({ error: 'A category with this name already exists for this restaurant.' });
        }
        // 2. Insert if clear
        const [newCategory] = await index_js_1.db
            .insert(schema_js_1.categories)
            .values({
            restaurantId: body.restaurantId,
            name: body.name,
        })
            .returning();
        return reply.status(201).send({ category: newCategory });
    });
    // GET ALL CATEGORIES
    fastify.get('/api/categories', async (request, reply) => {
        const { restaurantId } = request.query;
        const result = await index_js_1.db
            .select()
            .from(schema_js_1.categories)
            .where(restaurantId ? (0, drizzle_orm_1.eq)(schema_js_1.categories.restaurantId, parseInt(restaurantId)) : undefined);
        return reply.send({ categories: result });
    });
}
