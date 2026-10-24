import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { restaurants } from '../db/schema.js';
import { getRestaurantId } from '../lib/tenant.js';

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
  tax_rate?: number | string; // restaurant tax rate in % (0–100)
  tax_name?: string; // "VAT", "TVA", "Sales tax"…
  prices_include_tax?: boolean; // true = menu prices already include the tax
  isActive?: boolean;
}

export default async function restaurantRoutes(fastify: FastifyInstance) {
  fastify.put<{ Params: UpdateRestaurantParams; Body: UpdateRestaurantBody }>(
    '/api/restaurant/:id',
    async (request, reply) => {
      // A user may only edit THEIR OWN restaurant (from the login token).
      // Before, any logged-in user could change any restaurant by changing the :id.
      const restaurantId = getRestaurantId(request);
      if (Number(request.params.id) !== restaurantId) {
        return reply.status(404).send({ error: 'Restaurant not found.' });
      }
      try {
        const id = restaurantId;
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
          tax_rate,
          tax_name,
          prices_include_tax,
          isActive,
        } = request.body;

        if (!name || !phone) {
          return reply.status(400).send({ error: 'Name and phone are required.' });
        }
        // One currency per restaurant, as a 3-letter code (USD, EUR, GBP…).
        const currencyCode = currency ? String(currency).trim().toUpperCase() : undefined;
        if (currencyCode !== undefined && !/^[A-Z]{3}$/.test(currencyCode)) {
          return reply.status(400).send({ error: 'The currency must be a 3-letter code, e.g. USD, EUR, GBP.' });
        }
        const rate = tax_rate === undefined || tax_rate === '' ? undefined : Number(tax_rate);
        if (rate !== undefined && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
          return reply.status(400).send({ error: 'The tax rate must be between 0 and 100 %.' });
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
            currency: currencyCode,
            timezone,
            logoUrl,
            receipt_header,
            receipt_footer,
            tax_number,
            tax_rate: rate === undefined ? undefined : rate.toFixed(2),
            tax_name: tax_name === undefined ? undefined : String(tax_name).trim().slice(0, 30) || 'VAT',
            prices_include_tax: prices_include_tax === undefined ? undefined : Boolean(prices_include_tax),
            // isActive is NOT updated here on purpose: switching a restaurant
            // on/off is the platform's decision (e.g. subscription), not the restaurant's.
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



  // GET /api/restaurant/settings — the money settings of the user's restaurant
  // (currency + tax), loaded by every screen after login.
  fastify.get('/api/restaurant/settings', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const r = await db.query.restaurants.findFirst({ where: eq(restaurants.id, restaurantId) });
    if (!r) return reply.status(404).send({ error: 'Restaurant not found.' });
    return reply.send({
      name: r.name,
      currency: r.currency || 'USD',
      taxRate: Number(r.tax_rate ?? 0),
      taxName: r.tax_name || 'VAT',
      pricesIncludeTax: Boolean(r.prices_include_tax),
      taxNumber: r.tax_number || '',
      timezone: r.timezone || 'UTC',
      // for the printed receipt
      phone: r.phone || '',
      address: [r.address_line1, r.address_line2, r.city].filter(Boolean).join(', '),
      logoUrl: r.logoUrl || '',
      receiptHeader: r.receipt_header || '',
      receiptFooter: r.receipt_footer || '',
    });
  });

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