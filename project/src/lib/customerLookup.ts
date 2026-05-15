import { supabase } from './supabase';

type CustomerRow = Record<string, unknown>;

const BATCH_SIZE = 80;

const toDigits = (v: string) => v.replace(/\D/g, '');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
/** 顧客番号の照合候補（全角・ゼロ埋め・小数表示・記号混在を吸収） */
export function customerNumberCandidates(v: string): string[] {
  const base = String(v ?? '')
    .normalize('NFKC')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .trim()
    .replace(/[, ]/g, '')
    .replace(/^'+/, '')
    .replace(/\.0+$/, '');
  const out = new Set<string>();
  const digits = toDigits(base);
  if (digits) {
    out.add(digits);
    const noZero = digits.replace(/^0+/, '');
    if (noZero) out.add(noZero);
  }
  if (/^\d+(\.\d+)?$/.test(base)) {
    const i = String(Math.trunc(Number(base)));
    if (Number.isFinite(Number(base)) && i !== 'NaN') {
      out.add(i);
      out.add(i.replace(/^0+/, '') || '0');
    }
  }
  if (base) out.add(base);
  return [...out].filter(Boolean);
}

export function registerCustomerInMap(customer: CustomerRow, map: Map<string, CustomerRow>): void {
  const idKey = String(customer.id ?? '').trim();
  if (idKey) map.set(idKey, customer);
  for (const key of customerNumberCandidates(String(customer.customer_number ?? ''))) {
    map.set(key, customer);
  }
}

export function findCustomerByRecordKey(
  recordKey: string,
  map: Map<string, CustomerRow>
): CustomerRow | undefined {
  const trimmed = String(recordKey ?? '').trim();
  if (!trimmed) return undefined;
  const direct = map.get(trimmed);
  if (direct) return direct;
  for (const key of customerNumberCandidates(trimmed)) {
    const hit = map.get(key);
    if (hit) return hit;
  }
  const head = trimmed.includes('-') ? trimmed.split('-')[0]!.trim() : '';
  if (head && head !== trimmed) {
    for (const key of customerNumberCandidates(head)) {
      const hit = map.get(key);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** ランキング等で参照キーに対応する顧客が map に無い場合、DB から追加取得する */
export async function hydrateCustomersByRecordKeys(
  keys: string[],
  map: Map<string, CustomerRow>
): Promise<void> {
  const pending = [...new Set(keys.map((k) => String(k).trim()).filter(Boolean))].filter(
    (k) => !findCustomerByRecordKey(k, map)
  );
  if (pending.length === 0) return;

  const idCandidates = new Set<string>();
  const numberCandidates = new Set<string>();

  for (const key of pending) {
    if (UUID_RE.test(key)) idCandidates.add(key);
    for (const c of customerNumberCandidates(key)) numberCandidates.add(c);
    const head = key.includes('-') ? key.split('-')[0]!.trim() : '';
    if (head && head !== key) {
      for (const c of customerNumberCandidates(head)) numberCandidates.add(c);
    }
  }

  for (const batch of chunk([...idCandidates], BATCH_SIZE)) {
    const { data, error } = await supabase.from('customers').select('*').in('id', batch);
    if (error) {
      console.error('顧客 id 照会エラー:', error);
      continue;
    }
    (data || []).forEach((c) => registerCustomerInMap(c, map));
  }

  const nums = [...numberCandidates];
  for (const batch of chunk(nums, BATCH_SIZE)) {
    const { data, error } = await supabase.from('customers').select('*').in('customer_number', batch);
    if (error) {
      console.error('顧客番号照会エラー:', error);
      continue;
    }
    (data || []).forEach((c) => registerCustomerInMap(c, map));
  }
}

export function legacyNameKeysForRecord(
  recordKey: string,
  customerByKey: Map<string, CustomerRow>
): string[] {
  const keys = new Set<string>();
  const trimmed = String(recordKey ?? '').trim();
  if (trimmed) keys.add(trimmed);
  for (const k of customerNumberCandidates(trimmed)) keys.add(k);
  const customer = findCustomerByRecordKey(trimmed, customerByKey);
  if (customer?.id) keys.add(String(customer.id).trim());
  for (const k of customerNumberCandidates(String(customer?.customer_number ?? ''))) keys.add(k);
  return [...keys].filter(Boolean);
}
