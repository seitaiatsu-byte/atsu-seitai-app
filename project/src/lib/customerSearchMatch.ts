import { isPlaceholderCustomerNumber, compareCustomersForSearchDisplay } from './customerNumber';
import { readPhoneFromCustomerRow } from './customerPhoneFields';
import { normalizePersonSearchText } from './personSearchText';

export const CUSTOMER_PHONE_SEARCH_MIN_DIGITS = 4;

export type CustomerSearchable = {
  name?: string | null;
  name_kana?: string | null;
  kana?: string | null;
  customer_number?: string | null;
  town?: string | null;
  city?: string | null;
};

export function scoreCustomerSearchMatch(customer: CustomerSearchable, rawQuery: string): number | null {
  const nq = normalizePersonSearchText(rawQuery);
  if (!nq) return null;

  const stripped = nq.replace(/\s/g, '');
  const digits = stripped.replace(/\D/g, '');
  const isPureNumeric = stripped.length > 0 && /^\d+$/.test(stripped);

  const name = normalizePersonSearchText(customer.name || '');
  const kana = normalizePersonSearchText(customer.name_kana || customer.kana || '');
  const numberRaw = normalizePersonSearchText(customer.customer_number || '');
  const numberDigits = numberRaw.replace(/\D/g, '');
  const phoneDigits = readPhoneFromCustomerRow(customer as Record<string, unknown>);
  const town = normalizePersonSearchText(String(customer.town || ''));
  const city = normalizePersonSearchText(String(customer.city || ''));
  const addressBlob = `${city}${town}`;

  let tier: number | null = null;

  if (digits.length > 0) {
    if (digits.length >= CUSTOMER_PHONE_SEARCH_MIN_DIGITS && phoneDigits.length > 0) {
      if (phoneDigits === digits) tier = 0;
      else if (phoneDigits.endsWith(digits)) tier = 1;
      else if (phoneDigits.includes(digits)) tier = 3;
    }
    if (numberDigits === digits) tier = tier === null ? 0 : Math.min(tier, 0);
    else if (numberDigits.startsWith(digits)) tier = tier === null ? 2 : Math.min(tier, 2);
    else if (numberDigits.includes(digits)) tier = tier === null ? 4 : Math.min(tier, 4);
  }

  if (!isPureNumeric || digits.length < CUSTOMER_PHONE_SEARCH_MIN_DIGITS) {
    if (kana.includes(nq) || name.includes(nq)) {
      tier = tier === null ? 10 : Math.min(tier, 10);
    }
    if (town.includes(nq) || city.includes(nq) || addressBlob.includes(nq)) {
      tier = tier === null ? 12 : Math.min(tier, 12);
    }
    if (nq.length > 0) {
      if (numberRaw === nq) tier = tier === null ? 0 : Math.min(tier, 0);
      else if (numberRaw.startsWith(nq)) tier = tier === null ? 5 : Math.min(tier, 5);
    }
  }

  return tier;
}

export function searchCustomersSorted<T extends CustomerSearchable>(
  customers: T[],
  rawQuery: string,
  options?: { maxResults?: number; deprioritizePlaceholder?: boolean }
): T[] {
  const q = rawQuery.trim();
  if (!q) return [];

  const max = options?.maxResults ?? 200;
  const scored: { row: T; tier: number }[] = [];

  for (const c of customers) {
    const tier = scoreCustomerSearchMatch(c, q);
    if (tier === null) continue;
    let adj = tier;
    if (options?.deprioritizePlaceholder && isPlaceholderCustomerNumber(c.customer_number)) {
      adj += 1000;
    }
    scored.push({ row: c, tier: adj });
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return compareCustomersForSearchDisplay(a.row, b.row);
  });

  return scored.slice(0, max).map((s) => s.row);
}
