import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { restaurants } from '../db/schema.js';

// Define request param & body types
interface UpdateRestaurantParams {
  id: string;
}

interface UpdateRestaurantBody {
  name: string;
  phone: string;
  email?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  currency?: string;
  timezone?: string;
  logoUrl?: string;
  receipt_header?: string;
  receipt_footer?: string;
  tax_number?: string;
  isActive?: boolean;
}

export default async function restaurantRoutes(fastify: FastifyInstance) {
  fastify.put<{ Params: UpdateRestaurantParams; Body: UpdateRestaurantBody }>(
    '/api/restaurant/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;
        const {
          name,
          phone,
          email,
          address_line1,
          address_line2,
          city,
          state_province,
          postal_code,
          country,
          currency,
          timezone,
          logoUrl,
          receipt_header,
          receipt_footer,
          tax_number,
          isActive,
        } = request.body;

        if (!name || !phone) {
          return reply.status(400).send({ error: 'Name and phone are required.' });
        }

        const [updatedRestaurant] = await db
          .update(restaurants)
          .set({
            name,
            phone,
            email,
            address_line1,
            address_line2,
            city,
            state_province,
            postal_code,
            country,
            currency,
            timezone,
            logoUrl,
            receipt_header,
            receipt_footer,
            tax_number,
            isActive,
            updatedAt: new Date(),
          })
          .where(eq(restaurants.id, Number(id)))
          .returning();

        if (!updatedRestaurant) {
          return reply.status(404).send({ error: 'Restaurant not found.' });
        }

        return reply.status(200).send({
          message: 'Restaurant updated successfully',
          restaurant: updatedRestaurant,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

//   fastify.post('/api/restaurant', async (request, reply) => {
//     const { name, phone } = request.body as { name: string; phone?: string };
  
//     if (!name || name.trim() === '') {
//       return reply.status(400).send({ error: 'Restaurant name is required' });
//     }
  
//     const existingRestaurant = await db
//       .select()
//       .from(restaurants)
//       .where(eq(restaurants.name, name.trim()))
//       .limit(1);
  
//     if (existingRestaurant.length > 0) {
//       return reply.status(409).send({
//         error: `A restaurant with the name '${name}' already exists.`,
//       });
//     }
  
//     const [newRestaurant] = await db
//       .insert(restaurants)
//       .values({ name: name.trim(), phone })
//       .returning();
  
//     return reply.status(201).send({ restaurant: newRestaurant });
//   });



 fastify.get(
      '/api/restaurant/:id',
      { onRequest: [fastify.authenticate] },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const categoryId = parseInt(id, 10);
        const { restaurantId } = request.user;
  
        if (isNaN(categoryId)) {
          return reply.status(400).send({ error: 'Invalid category ID.' });
        }
  
        if (!restaurantId) {
          return reply.status(403).send({ error: 'User is not associated with a restaurant.' });
        }
  
      const restaurant = await db.query.restaurants.findFirst({
  where: eq(restaurants.id, restaurantId),
});
  
        if (!restaurant) {
          return reply.status(404).send({ error: 'Category not found.' });
        }
  
        return reply.send({ restaurant });
      }
    );


}