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

function normalizeLooseText(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function scoreCustomerSearchMatch(customer: CustomerSearchable, rawQuery: string): number | null {
  const rawQ = normalizeLooseText(rawQuery);
  const nq = normalizePersonSearchText(rawQuery);
  if (!rawQ && !nq) return null;

  const queryForDigits = rawQ || nq;
  const stripped = queryForDigits.replace(/\s/g, '');
  const digits = stripped.replace(/\D/g, '');
  const isPureNumeric = stripped.length > 0 && /^\d+$/.test(stripped);

  const nameNorm = normalizePersonSearchText(customer.name || '');
  const kanaNorm = normalizePersonSearchText(customer.name_kana || customer.kana || '');
  const nameRaw = normalizeLooseText(customer.name || '');
  const kanaRaw = normalizeLooseText(customer.name_kana || customer.kana || '');
  const numberRaw = normalizeLooseText(customer.customer_number || '');
  const numberDigits = numberRaw.replace(/\D/g, '');
  const phoneDigits = readPhoneFromCustomerRow(customer as Record<string, unknown>);
  const townRaw = normalizeLooseText(String(customer.town || ''));
  const cityRaw = normalizeLooseText(String(customer.city || ''));
  const townNorm = normalizePersonSearchText(String(customer.town || ''));
  const cityNorm = normalizePersonSearchText(String(customer.city || ''));
  const addressRaw = `${cityRaw}${townRaw}`;
  const addressNorm = `${cityNorm}${townNorm}`;

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
    const nameHit =
      (nq.length > 0 && (kanaNorm.includes(nq) || nameNorm.includes(nq))) ||
      (rawQ.length > 0 && (nameRaw.includes(rawQ) || kanaRaw.includes(rawQ)));
    if (nameHit) {
      tier = tier === null ? 10 : Math.min(tier, 10);
    }

    const addressHit =
      (nq.length > 0 && (townNorm.includes(nq) || cityNorm.includes(nq) || addressNorm.includes(nq))) ||
      (rawQ.length > 0 && (townRaw.includes(rawQ) || cityRaw.includes(rawQ) || addressRaw.includes(rawQ)));
    if (addressHit) {
      tier = tier === null ? 12 : Math.min(tier, 12);
    }

    if (rawQ.length > 0 || nq.length > 0) {
      const numQ = nq || rawQ;
      if (numberRaw === numQ) tier = tier === null ? 0 : Math.min(tier, 0);
      else if (numberRaw.startsWith(numQ)) tier = tier === null ? 5 : Math.min(tier, 5);
      else if (numberRaw.includes(numQ)) tier = tier === null ? 6 : Math.min(tier, 6);
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
