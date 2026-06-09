import { toHiragana } from 'wanakana';

/** 入力中は n を即「ん」にしない（na の na 待ち。IME と同じ） */
const ROMAJI_TO_HIRA_OPTIONS = {
  convertLongVowelMark: true,
  IMEMode: true,
} as const;

/** カタカナ → ひらがな */
export function katakanaToHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/**
 * ヒト検索欄の入力値を整形。
 * IME が英字のままでも tanaka → たなか に変換して表示・検索する。
 */
export function formatPersonSearchInput(raw: string): string {
  if (!raw) return raw;
  return toHiragana(raw, ROMAJI_TO_HIRA_OPTIONS);
}

/** 欄から離れたとき：末尾の n も「ん」に確定 */
export function finalizePersonSearchInput(raw: string): string {
  if (!raw) return raw;
  return toHiragana(raw, { convertLongVowelMark: true });
}

/** 検索マッチ用の正規化（ローマ字→ひらがな、カタカナ→ひらがな、空白除去） */
export function normalizePersonSearchText(raw: unknown): string {
  const base = String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '');
  if (!base) return '';
  const hira = katakanaToHiragana(toHiragana(base, ROMAJI_TO_HIRA_OPTIONS));
  return hira;
}
