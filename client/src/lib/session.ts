// client/src/lib/session.ts
//
// Who is logged in (users & roles, 2026-10-26): name, role, platform owner.
// Loaded after login (App.tsx), refreshed by "Switch user" (PIN) on the POS.
// The screens use it to HIDE what a role cannot use; the server still checks every
// request (src/lib/roles.ts), so hiding is only for comfort, not for security.
//
//   owner   = restaurant admin: everything, incl. Users, Restaurant Info, printers
//   manager = menu, purchases, stock, tables, reports + everything a cashier does
//   cashier = POS, orders, payments, printing, opening cash, Z closing, kitchen

import { api } from '../api';

export type Role = 'owner' | 'manager' | 'cashier';

export interface Me {
  id: number;
  name: string;
  email?: string;
  role: Role;
  isPlatformAdmin: boolean;
  restaurantId: number | null;
}

export let me: Me | null = null;

const RANK: Record<Role, number> = { cashier: 1, manager: 2, owner: 3 };
export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', manager: 'Manager', cashier: 'Cashier' };

export function setMe(u: Partial<Me> | null) {
  me = u && u.id
    ? {
        id: Number(u.id),
        name: u.name || '',
        email: u.email,
        role: (['owner', 'manager', 'cashier'].includes(String(u.role)) ? u.role : 'cashier') as Role,
        isPlatformAdmin: Boolean(u.isPlatformAdmin),
        restaurantId: u.restaurantId ?? null,
      }
    : null;
}

// Ask the server who is logged in (never throws).
export async function loadMe(): Promise<Me | null> {
  try {
    const res = await api.get('/auth/me');
    setMe(res.data);
  } catch {
    /* keep what we have */
  }
  return me;
}

export const hasRole = (needed: Role) => RANK[me?.role ?? 'cashier'] >= RANK[needed];

// Which menu entry / screen each role may open (same rules as the server).
const SCREEN_ROLE: Record<string, Role | 'platform'> = {
  // products, purchases, stock
  categories: 'manager',
  'menu-items': 'manager',
  modifiers: 'manager',
  'raw-materials': 'manager',
  suppliers: 'manager',
  purchase: 'manager',
  purchaselist: 'manager',
  returnpurchase: 'manager',
  returnpurchaselist: 'manager',
  // settings
  tables: 'manager',
  kitchenstations: 'manager',
  'chart-of-accounts': 'manager', // managers look, only the owner changes it
  RestaurantSettings: 'owner',
  printers: 'owner',
  users: 'owner',
  // platform
  platform: 'platform',
  // reports: managers, except the day closing (cashiers too — user's choice)
  'report-z-report': 'cashier',
};

export function canOpen(screenId: string): boolean {
  const need = SCREEN_ROLE[screenId] ?? (screenId.startsWith('report-') ? 'manager' : 'cashier');
  if (need === 'platform') return Boolean(me?.isPlatformAdmin);
  return hasRole(need);
}
