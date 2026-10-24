// client/src/lib/countries.ts
//
// Countries for Settings → Restaurant Info (2026-10-25): choosing the country fills in
// the restaurant's CURRENCY and TIME ZONE automatically (both can still be changed).
// One currency per restaurant, no conversion. Lebanon uses USD (the user's choice:
// LBP is not needed). The country is saved as its 2-letter code ("LB", "FR"…).

export interface Country {
  code: string;
  name: string;
  currency: string;
  timezone: string;
}

export const COUNTRIES: Country[] = [
  { code: 'LB', name: 'Lebanon', currency: 'USD', timezone: 'Asia/Beirut' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', timezone: 'Asia/Dubai' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', timezone: 'Asia/Riyadh' },
  { code: 'QA', name: 'Qatar', currency: 'QAR', timezone: 'Asia/Qatar' },
  { code: 'KW', name: 'Kuwait', currency: 'KWD', timezone: 'Asia/Kuwait' },
  { code: 'BH', name: 'Bahrain', currency: 'BHD', timezone: 'Asia/Bahrain' },
  { code: 'OM', name: 'Oman', currency: 'OMR', timezone: 'Asia/Muscat' },
  { code: 'JO', name: 'Jordan', currency: 'JOD', timezone: 'Asia/Amman' },
  { code: 'IQ', name: 'Iraq', currency: 'IQD', timezone: 'Asia/Baghdad' },
  { code: 'EG', name: 'Egypt', currency: 'EGP', timezone: 'Africa/Cairo' },
  { code: 'CY', name: 'Cyprus', currency: 'EUR', timezone: 'Asia/Nicosia' },
  { code: 'TR', name: 'Turkey', currency: 'TRY', timezone: 'Europe/Istanbul' },
  { code: 'FR', name: 'France', currency: 'EUR', timezone: 'Europe/Paris' },
  { code: 'BE', name: 'Belgium', currency: 'EUR', timezone: 'Europe/Brussels' },
  { code: 'DE', name: 'Germany', currency: 'EUR', timezone: 'Europe/Berlin' },
  { code: 'IT', name: 'Italy', currency: 'EUR', timezone: 'Europe/Rome' },
  { code: 'ES', name: 'Spain', currency: 'EUR', timezone: 'Europe/Madrid' },
  { code: 'PT', name: 'Portugal', currency: 'EUR', timezone: 'Europe/Lisbon' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', timezone: 'Europe/Amsterdam' },
  { code: 'GR', name: 'Greece', currency: 'EUR', timezone: 'Europe/Athens' },
  { code: 'IE', name: 'Ireland', currency: 'EUR', timezone: 'Europe/Dublin' },
  { code: 'LU', name: 'Luxembourg', currency: 'EUR', timezone: 'Europe/Luxembourg' },
  { code: 'MC', name: 'Monaco', currency: 'EUR', timezone: 'Europe/Monaco' },
  { code: 'CH', name: 'Switzerland', currency: 'CHF', timezone: 'Europe/Zurich' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', timezone: 'Europe/London' },
  { code: 'US', name: 'United States', currency: 'USD', timezone: 'America/New_York' },
  { code: 'CA', name: 'Canada', currency: 'CAD', timezone: 'America/Toronto' },
  { code: 'MX', name: 'Mexico', currency: 'MXN', timezone: 'America/Mexico_City' },
  { code: 'BR', name: 'Brazil', currency: 'BRL', timezone: 'America/Sao_Paulo' },
  { code: 'AU', name: 'Australia', currency: 'AUD', timezone: 'Australia/Sydney' },
  { code: 'MA', name: 'Morocco', currency: 'MAD', timezone: 'Africa/Casablanca' },
  { code: 'TN', name: 'Tunisia', currency: 'TND', timezone: 'Africa/Tunis' },
  { code: 'DZ', name: 'Algeria', currency: 'DZD', timezone: 'Africa/Algiers' },
  { code: 'SN', name: 'Senegal', currency: 'XOF', timezone: 'Africa/Dakar' },
  { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', timezone: 'Africa/Abidjan' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', timezone: 'Africa/Lagos' },
  { code: 'GH', name: 'Ghana', currency: 'GHS', timezone: 'Africa/Accra' },
  { code: 'KE', name: 'Kenya', currency: 'KES', timezone: 'Africa/Nairobi' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', timezone: 'Africa/Johannesburg' },
].sort((a, b) => a.name.localeCompare(b.name));

// The country of a saved value: a code ("LB") or an older free text ("UK", "Lebanon").
export const findCountry = (value: string | null | undefined): Country | undefined => {
  if (!value) return undefined;
  const v = value.trim().toUpperCase();
  const alias = v === 'UK' ? 'GB' : v;
  return COUNTRIES.find((c) => c.code === alias || c.name.toUpperCase() === v);
};

// Currencies offered in the list (the ones of the countries + a few common ones).
export const CURRENCIES: Array<{ code: string; name: string }> = Array.from(
  new Set([...COUNTRIES.map((c) => c.currency), 'USD', 'EUR', 'GBP'])
)
  .sort()
  .map((code) => {
    let name = code;
    try {
      name = new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) || code;
    } catch {
      /* old browser: code only */
    }
    return { code, name };
  });

// All time zones the browser knows (fallback: the ones of the countries).
export const TIME_ZONES: string[] = (() => {
  try {
    const list = (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined;
    if (list?.length) return list;
  } catch {
    /* ignore */
  }
  return Array.from(new Set(['UTC', ...COUNTRIES.map((c) => c.timezone)])).sort();
})();
