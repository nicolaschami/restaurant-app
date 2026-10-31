// src/lib/roles.ts
//
// Users & roles (agreed 2026-10-26):
//   owner   = restaurant admin: everything, incl. Users, Restaurant Info, printers
//   manager = menu, purchases, stock, tables, reports + everything a cashier does
//   cashier = POS, orders, payments, printing, opening cash, Z closing, kitchen
//   platform admin (is_platform_admin) = the platform owner: creates restaurants and
//   their owner account (Platform screen).
//
// The SERVER enforces it (not only the screens): app.ts asks requiredRole() for every
// /api request. The user's role and "active" status are read from the database (cached
// a few seconds), so a role change or a deactivation applies at once — even with an
// old login token.

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

export type Role = 'owner' | 'manager' | 'cashier';
export const ROLES: Role[] = ['owner', 'manager', 'cashier'];
const RANK: Record<Role, number> = { cashier: 1, manager: 2, owner: 3 };

export const hasRole = (role: string | undefined, needed: Role) => RANK[(role as Role) ?? 'cashier'] >= RANK[needed];

// What a request needs: a minimum role, or 'platform'. First matching rule wins.
export function requiredRole(method: string, path: string): Role | 'platform' {
  const read = method === 'GET';
  const p = path.toLowerCase();

  if (p.startsWith('/api/platform')) return 'platform';
  if (p.startsWith('/api/users')) return 'owner';
  // registering this PC as a POS terminal (and removing one): owner or manager
  if (p.startsWith('/api/terminals')) return 'manager';
  if (p.startsWith('/api/auth/register')) return 'owner';

  // printing: the POS prints; the printer set-up is the owner's
  if (/^\/api\/printing\/(receipt|drawer|preview|test)$/.test(p)) return 'cashier';
  if (p.startsWith('/api/printing')) return 'owner';

  // restaurant: everyone reads the settings; only the owner changes them
  if (p.startsWith('/api/restaurant')) return read ? 'cashier' : 'owner';

  // the day (Z closing) — cashiers too (user's choice); reports — managers
  if (p.startsWith('/api/z-reports')) return 'cashier';
  if (p.startsWith('/api/reports')) return 'manager';
  // the chart of accounts: managers read it, only the owner changes it
  if (p.startsWith('/api/accounts')) return read ? 'manager' : 'owner';

  // stock and purchases — managers
  if (/^\/api\/(raw-materials|suppliers?|stock-transactions)/.test(p)) return 'manager';
  if (p.startsWith('/api/upload')) return 'manager';

  // the menu and the room: the POS reads them, managers change them
  if (/^\/api\/(categories|menu-items|modifier-groups|modifier-options|menu-item-modifiers|kitchenstations?|kitchen-stations?|tables)/.test(p)) {
    return read ? 'cashier' : 'manager';
  }

  // reservations (2026-10-31): every user books and seats; the 2 settings — managers
  if (p === '/api/reservations/settings') return read ? 'cashier' : 'manager';

  // everything else (orders, payments, customers, kds, dashboard, drawer, reservations…) — any user
  return 'cashier';
}

// The user's CURRENT role / status from the database, cached 10 s.
const cache = new Map<number, { at: number; row: { role: Role; isActive: boolean; isPlatformAdmin: boolean; restaurantId: number | null; name: string } | null }>();

export async function currentUser(userId: number) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 10_000) return hit.row;
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const row = u
    ? {
        role: (ROLES.includes(u.role as Role) ? u.role : 'cashier') as Role,
        isActive: u.isActive !== false,
        isPlatformAdmin: Boolean(u.isPlatformAdmin),
        restaurantId: u.restaurantId ?? null,
        name: u.name,
      }
    : null;
  cache.set(userId, { at: Date.now(), row });
  return row;
}

// After a change on the Users screen: forget the cached copy at once.
export const forgetUser = (userId: number) => cache.delete(userId);
