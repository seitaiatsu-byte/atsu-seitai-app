/** referral_source_master.id 等が UUID か（JSON フォールバックの ref-0 は除外） */
export function isUuidString(v: string): boolean {
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * PostgREST / Postgres が返す「その列が無い・スキーマに無い」系メッセージから列名を取り出す。
 * insert/update のリトライで未知列を payload から外すときに使う。
 *
 * 注意: NOT NULL 違反（"null value in column \"X\" of relation ..."）や CHECK 制約違反など
 * 「列は存在するが値が不正」系のメッセージは除外する。誤って列を payload から落とすと
 * かえって正しいデータが消えるため、明確に「存在しない」と分かる文言だけを拾う。
 */
export function extractMissingColumnFromError(message: string): string | null {
  if (!message) return null;

  const lower = message.toLowerCase();
  // NOT NULL / CHECK 制約や FK 違反のメッセージは「列が無い」ではないので明示的に除外
  if (
    lower.includes('not-null') ||
    lower.includes('not null constraint') ||
    lower.includes('violates check constraint') ||
    lower.includes('violates foreign key') ||
    lower.includes('violates unique constraint') ||
    lower.includes('duplicate key value')
  ) {
    return null;
  }

  const patterns: RegExp[] = [
    // PostgREST のスキーマキャッシュ未検出
    /Could not find the '([^']+)' column of '[^']+' in the schema cache/i,
    /Could not find the '([^']+)' column/i,
    // Postgres の素のエラー: column "X" does not exist
    /column\s+"([^"]+)"\s+does not exist/i,
    // 「'X' column of '...' table does not exist」のような英文
    /'([^']+)'\s+column\s+of\s+'[^']+'\s+(?:table|relation)?\s*does not exist/i,
  ];
  for (const re of patterns) {
    const m = re.exec(message);
    if (m?.[1]) return m[1];
  }
  return null;
}
