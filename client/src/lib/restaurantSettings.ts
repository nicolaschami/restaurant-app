// client/src/lib/restaurantSettings.ts
//
// The restaurant's money settings, loaded ONCE after login (App.tsx) and used by
// every screen (agreed 2026-10-25):
//   - currency: one currency per restaurant, no conversion (USD, EUR, GBP…);
//   - tax: rate in %, its name ("VAT"…), and whether menu prices include it.
// money(12) → "$12.00" / "€12.00" / "£12.00" / "AED 12.00" in the restaurant's currency.
// The tax is computed like the server does (src/lib/orderTotals.ts), so the POS shows
// the same total the customer will pay.

import { api } from '../api';

export interface RestaurantSettings {
  currency: string;
  taxRate: number;
  taxName: string;
  pricesIncludeTax: boolean;
  // printed on the receipt
  name: string;
  phone: string;
  address: string;
  taxNumber: string;
  logoUrl: string;
  receiptHeader: string;
  receiptFooter: string;
}

export const settings: RestaurantSettings = {
  currency: 'USD',
  taxRate: 0,
  taxName: 'VAT',
  pricesIncludeTax: false,
  name: '',
  phone: '',
  address: '',
  taxNumber: '',
  logoUrl: '',
  receiptHeader: '',
  receiptFooter: '',
};

let formatter2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function applyCurrency(code: string) {
  try {
    formatter2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' });
    settings.currency = code;
  } catch {
    // unknown code: keep the previous one
  }
}

// Load the settings of the logged-in user's restaurant. Never throws: on an error
// the app keeps the defaults (USD, no tax).
export async function loadRestaurantSettings(): Promise<RestaurantSettings> {
  try {
    const res = await api.get('/restaurant/settings');
    const r = res.data || {};
    applyCurrency(String(r.currency || 'USD').toUpperCase());
    settings.taxRate = Number(r.taxRate) || 0;
    settings.taxName = r.taxName || 'VAT';
    settings.pricesIncludeTax = Boolean(r.pricesIncludeTax);
    settings.name = r.name || '';
    settings.phone = r.phone || '';
    settings.address = r.address || '';
    settings.taxNumber = r.taxNumber || '';
    settings.logoUrl = r.logoUrl || '';
    settings.receiptHeader = r.receiptHeader || '';
    settings.receiptFooter = r.receiptFooter || '';
  } catch {
    /* keep defaults */
  }
  return settings;
}

// "$12.00" in the restaurant's currency. digits = 3 for unit prices like $0.495.
export function money(v: number, digits = 2): string {
  const n = Number(v) || 0;
  if (digits === 2) return formatter2.format(n);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings.currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return formatter2.format(n);
  }
}

// The currency symbol alone ("$", "€", "£", "AED"), for input labels.
export function currencySymbol(): string {
  const part = formatter2.formatToParts(0).find((p) => p.type === 'currency');
  return part?.value ?? settings.currency;
}

// Tax of a basket, like the server: each line uses its item's own rate (null =
// restaurant rate). Returns the tax and the total to pay (delivery fee has no tax).
export function basketTotals(lines: Array<{ amount: number; ownRate?: number | null }>, deliveryFee = 0) {
  let subtotal = 0;
  let tax = 0;
  for (const l of lines) {
    const amount = Number(l.amount) || 0;
    const rate = l.ownRate ?? settings.taxRate;
    subtotal += amount;
    tax += settings.pricesIncludeTax ? (amount * rate) / (100 + rate) : (amount * rate) / 100;
  }
  const cents = (n: number) => Math.round(n * 100) / 100;
  subtotal = cents(subtotal);
  tax = cents(tax);
  const fee = cents(Math.max(0, Number(deliveryFee) || 0));
  const total = cents(settings.pricesIncludeTax ? subtotal + fee : subtotal + tax + fee);
  return { subtotal, tax, deliveryFee: fee, total };
}

// "VAT 11%" / "VAT 11% (included)" for the POS and the receipt.
export function taxLabel(): string {
  const rate = Number.isInteger(settings.taxRate) ? String(settings.taxRate) : settings.taxRate.toFixed(2);
  return `${settings.taxName} ${rate}%${settings.pricesIncludeTax ? ' (included)' : ''}`;
}
