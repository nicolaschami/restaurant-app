// src/routes/accounts.ts
//
// The CHART OF ACCOUNTS of the restaurant (asked 2026-10-28, like the user's tblaccount):
// a tree 4 → 40 → 401 → 4011 → 40110001. Managers read it, only the owner changes it
// (roles.ts). Tables and rules: sql/2026-10-28_chart_of_accounts.sql.
//   - A GROUP account only adds up the accounts under it; the journal posts to the others.
//   - A new account goes under a group, and its code starts with the group's code
//     (under 61 → 612, 6125…), so the chart reads in order.
//   - Supplier accounts (under 4011) are made by the database when the supplier is
//     created, and renamed with it.
//   - The standard accounts (is_system) can be renamed but not deleted. An account can
//     be deleted only if nothing was booked on it and nothing is under it; otherwise
//     it can be made inactive.
//
// GET    /api/accounts                    → the whole chart (with what is linked and used)
// GET    /api/accounts/next-code?parent=  → a free code under a group (for the form)
// POST   /api/accounts                    → { code, name, parentCode, isGroup?, description? }
// PUT    /api/accounts/:code              → { name?, description?, isActive?, isGroup? }
// DELETE /api/accounts/:code

import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { getRestaurantId } from '../lib/tenant.js';

const isCode = (v: unknown): v is string => typeof v === 'string' && /^\d{1,20}$/.test(v);

// One account of the restaurant, with what is linked to it and how much it is used.
async function findAccount(restaurantId: number, code: string) {
  const [a] = (await db.execute(sql`
    SELECT a.code, a.name, a.kind, a.parent_code AS "parentCode", a.is_group AS "isGroup",
           a.is_system AS "isSystem", a.is_active AS "isActive", a.supplier_id AS "supplierId",
           (SELECT COUNT(*) FROM journal_lines l WHERE l.restaurant_id = a.restaurant_id AND l.account_code = a.code)::int AS lines,
           (SELECT COUNT(*) FROM accounts c WHERE c.restaurant_id = a.restaurant_id AND c.parent_code = a.code)::int AS children
    FROM accounts a WHERE a.restaurant_id = ${restaurantId} AND a.code = ${code}
  `)) as any[];
  return a ?? null;
}

export default async function accountRoutes(fastify: FastifyInstance) {
  fastify.get('/api/accounts', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    try {
      const rows = (await db.execute(sql`
        SELECT a.code, a.name, a.kind, a.parent_code AS "parentCode", a.is_group AS "isGroup", a.description,
               a.is_system AS "isSystem", a.is_active AS "isActive",
               a.supplier_id AS "supplierId",
               CASE WHEN a.supplier_id IS NOT NULL THEN 'supplier' END AS "linkedTo",
               (SELECT COUNT(*) FROM journal_lines l WHERE l.restaurant_id = a.restaurant_id AND l.account_code = a.code)::int AS lines
        FROM accounts a WHERE a.restaurant_id = ${restaurantId}
        ORDER BY a.code
      `)) as any[];
      return reply.send({ accounts: rows });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The chart of accounts could not be loaded.' });
    }
  });

  // A free code under a group: the group's code + the next number (4 digits under a
  // 4-digit group like 4011 → 40110003, otherwise 1 digit: 61 → 616).
  fastify.get('/api/accounts/next-code', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const parent = (request.query as { parent?: string }).parent;
    if (!isCode(parent)) return reply.status(400).send({ error: 'Choose the group.' });
    const width = parent.length >= 4 ? 4 : 1;
    const [row] = (await db.execute(sql`
      SELECT COALESCE(MAX(substr(code, ${parent.length + 1})::bigint), 0) + 1 AS n
      FROM accounts
      WHERE restaurant_id = ${restaurantId} AND parent_code = ${parent}
        AND code ~ ${'^' + parent + '[0-9]{' + width + '}$'}
    `)) as any[];
    const n = Number(row.n);
    return reply.send({ code: n < 10 ** width ? parent + String(n).padStart(width, '0') : '' });
  });

  fastify.post('/api/accounts', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const b = (request.body || {}) as { code?: unknown; name?: unknown; parentCode?: unknown; isGroup?: unknown; description?: unknown };
    const code = String(b.code ?? '').trim();
    const name = String(b.name ?? '').trim().slice(0, 200);
    const parentCode = String(b.parentCode ?? '').trim();
    if (!isCode(code)) return reply.status(400).send({ error: 'The code must be digits only (e.g. 6125).' });
    if (!name) return reply.status(400).send({ error: 'Enter the account name.' });
    if (!isCode(parentCode)) return reply.status(400).send({ error: 'Choose the group the account goes under.' });

    try {
      const parent = await findAccount(restaurantId, parentCode);
      if (!parent) return reply.status(400).send({ error: 'This group does not exist.' });
      if (!parent.isGroup) {
        return reply.status(400).send({ error: `${parent.code} ${parent.name} is not a group: choose a group account.` });
      }
      if (!code.startsWith(parentCode) || code === parentCode) {
        return reply.status(400).send({ error: `The code must start with ${parentCode} (the group's code), e.g. ${parentCode}1.` });
      }
      if (await findAccount(restaurantId, code)) {
        return reply.status(409).send({ error: `The code ${code} is already used.` });
      }
      await db.execute(sql`
        INSERT INTO accounts (restaurant_id, code, name, kind, parent_code, is_group, description)
        VALUES (${restaurantId}, ${code}, ${name}, ${parent.kind}, ${parentCode}, ${b.isGroup === true},
                ${b.description ? String(b.description).slice(0, 1000) : null})
      `);
      return reply.status(201).send({ account: await findAccount(restaurantId, code) });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The account could not be saved.' });
    }
  });

  fastify.put('/api/accounts/:code', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const code = (request.params as { code: string }).code;
    const b = (request.body || {}) as { name?: unknown; description?: unknown; isActive?: unknown; isGroup?: unknown };
    if (!isCode(code)) return reply.status(400).send({ error: 'Invalid account.' });

    try {
      const a = await findAccount(restaurantId, code);
      if (!a) return reply.status(404).send({ error: 'Account not found.' });

      const name = b.name === undefined ? a.name : String(b.name).trim().slice(0, 200);
      if (!name) return reply.status(400).send({ error: 'Enter the account name.' });
      if (name !== a.name && a.supplierId) {
        return reply.status(400).send({ error: 'This account follows its supplier: rename the supplier instead.' });
      }
      const isGroup = b.isGroup === undefined ? a.isGroup : b.isGroup === true;
      if (isGroup !== a.isGroup) {
        if (a.isSystem || a.supplierId) {
          return reply.status(400).send({ error: 'This account cannot change between group and account.' });
        }
        if (isGroup && a.lines > 0) {
          return reply.status(409).send({ error: 'Amounts are booked on this account: it cannot become a group.' });
        }
        if (!isGroup && a.children > 0) {
          return reply.status(409).send({ error: 'Accounts are under this group: it must stay a group.' });
        }
      }
      await db.execute(sql`
        UPDATE accounts SET
          name = ${name},
          is_group = ${isGroup},
          is_active = ${b.isActive === undefined ? a.isActive : b.isActive !== false},
          description = ${b.description === undefined ? sql`description` : b.description ? String(b.description).slice(0, 1000) : null}
        WHERE restaurant_id = ${restaurantId} AND code = ${code}
      `);
      return reply.send({ account: await findAccount(restaurantId, code) });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The account could not be saved.' });
    }
  });

  fastify.delete('/api/accounts/:code', async (request, reply) => {
    const restaurantId = getRestaurantId(request);
    const code = (request.params as { code: string }).code;
    if (!isCode(code)) return reply.status(400).send({ error: 'Invalid account.' });
    try {
      const a = await findAccount(restaurantId, code);
      if (!a) return reply.status(404).send({ error: 'Account not found.' });
      if (a.isSystem) return reply.status(409).send({ error: 'This is a standard account: it cannot be deleted (you can rename it).' });
      if (a.supplierId) {
        return reply.status(409).send({ error: 'This account belongs to a supplier: it goes when the supplier is deleted.' });
      }
      if (a.children > 0) return reply.status(409).send({ error: 'Accounts are under this group: delete or move them first.' });
      if (a.lines > 0) return reply.status(409).send({ error: 'Amounts are booked on this account: make it inactive instead.' });
      await db.execute(sql`DELETE FROM accounts WHERE restaurant_id = ${restaurantId} AND code = ${code}`);
      return reply.send({ deleted: code });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'The account could not be deleted.' });
    }
  });
}
