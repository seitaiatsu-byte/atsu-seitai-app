/** referral_source_master.id 等が UUID か（JSON フォールバックの ref-0 は除外） */
export function isUuidString(v: string): boolean {
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * PostgREST / Postgres が返す「その列が無い・スキーマに無い」系メッセージから列名を取り出す。
 * insert/update のリトライで未知列を payload から外すときに使う。
 */
export function extractMissingColumnFromError(message: string): string | null {
  if (!message) return null;
  const patterns: RegExp[] = [
    /Could not find the '([^']+)' column of '[^']+' in the schema cache/i,
    /Could not find the '([^']+)' column/i,
    /'([^']+)'\s+column\s+of/i,
    /'([^']+)'\s+column/i,
    /column\s+"([^"]+)"\s+of\s+relation/i,
    /column\s+"([^"]+)"\s+does not exist/i,
  ];
  for (const re of patterns) {
    const m = re.exec(message);
    if (m?.[1]) return m[1];
  }
  return null;
}
