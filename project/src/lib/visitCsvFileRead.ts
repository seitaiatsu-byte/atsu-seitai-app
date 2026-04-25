/**
 * Excel / Windows で「読まない」原因（UTF-16 保存・; 区切り・1行目だけデータ等）向け
 */
import { parseLocalVisitDateToYmd } from './visitDateParse';

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16_LE_BOM = [0xff, 0xfe];
const UTF16_BE_BOM = [0xfe, 0xff];

/**
 * ブラウザの file.text() は Excel の UTF-16(LE) を想定外にすることがあるため、ArrayBuffer から正しくデコードする
 */
export async function readCsvFileAsString(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  if (u8.length === 0) return '';

  if (u8.length >= 2 && u8[0] === UTF16_LE_BOM[0] && u8[1] === UTF16_LE_BOM[1]) {
    return new TextDecoder('utf-16le').decode(buf);
  }
  if (u8.length >= 2 && u8[0] === UTF16_BE_BOM[0] && u8[1] === UTF16_BE_BOM[1]) {
    return new TextDecoder('utf-16be').decode(buf);
  }
  if (u8.length >= 3 && u8[0] === UTF8_BOM[0] && u8[1] === UTF8_BOM[1] && u8[2] === UTF8_BOM[2]) {
    return new TextDecoder('utf-8').decode(u8.subarray(3));
  }
  // BOM なし UTF-16（ASCII 帯域で 1 文字おきに 0x00、Excel 保存でよくある）
  if (u8.length >= 6) {
    let nulEven = 0;
    for (let i = 0; i < Math.min(64, u8.length - 1); i += 2) {
      if (u8[i] !== 0x0a && u8[i] !== 0x0d && u8[i + 1] === 0) nulEven++;
    }
    if (nulEven >= 3) {
      return new TextDecoder('utf-16le', { fatal: false }).decode(buf);
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

/**
 * 先頭の非空行を見て区切りを推測（Excel ヨーロッパ圏等の `;`、タブ区切り）
 */
export function detectLineDelimiter(line: string): string {
  const t = (line.match(/\t/g) || []).length;
  const c = (line.match(/,/g) || []).length;
  const s = (line.match(/;/g) || []).length;
  if (t >= 5 && t >= c && t >= s) return '\t';
  if (s > c) return ';';
  return ',';
}

export function splitCsvLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') {
    return line.split('\t').map((x) => x.trim());
  }
  const d = delimiter[0] ?? ',';
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === d && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i;
function isCustomerIdCell(s: string): boolean {
  const t = s.replace(/[\s\u3000]/g, '');
  if (!t) return false;
  if (UUID_RE.test(t)) return true;
  return /\d/.test(t) && t.replace(/\D/g, '').length > 0;
}

/** 1 行目が日付+顧客列なら真（ヘッダ行と区別） */
export function rowLooksLikeDataRow11Cols(row: string[] | undefined): boolean {
  if (!row) return false;
  const a = (row[0] || '').trim();
  const b = (row[1] || '').trim();
  if (!a || !b) return false;
  if (!parseLocalVisitDateToYmd(a)) return false;
  return isCustomerIdCell(b);
}

export function parseDelimitedFile(text: string): { rows: string[][]; delimiter: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\uFEFF/, '').trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return { rows: [], delimiter: ',' };
  const delimiter = detectLineDelimiter(lines[0]!);
  return {
    rows: lines.map((line) => splitCsvLine(line, delimiter)),
    delimiter,
  };
}

export type DataRowsResolution = {
  dataRows: string[][];
  infoMessages: string[];
  /** 生の全行数（区切り後） */
  rawLineCount: number;
  /** データ1行目が元ファイル上の何行目か（1 起算。単一行=データのとき 1、通常 2=ヘッダの次） */
  firstDataLine1Based: number;
};

/**
 * 仕様: 通常は 1 行目を飛ばす。ただし「データが 1 行だけ＆日付+顧客に見える」なら 1 行目をデータとみなす
 */
export function resolveVisitDataRowsForImport(parsed: {
  rows: string[][];
}): DataRowsResolution {
  const { rows } = parsed;
  const info: string[] = [];
  if (rows.length === 0) {
    return { dataRows: [], infoMessages: [], rawLineCount: 0, firstDataLine1Based: 0 };
  }
  if (rows.length === 1) {
    if (rowLooksLikeDataRow11Cols(rows[0]!)) {
      info.push(
        '1行目をデータ行とみなしました（ヘッダ行がないCSVです）。2行目以降を付け加えると、1行目は従来どおり飛ばされます。'
      );
      return { dataRows: [rows[0]!], infoMessages: info, rawLineCount: 1, firstDataLine1Based: 1 };
    }
    return { dataRows: [], infoMessages: [], rawLineCount: 1, firstDataLine1Based: 0 };
  }
  if (rowLooksLikeDataRow11Cols(rows[0]!) && rowLooksLikeDataRow11Cols(rows[1]!)) {
    info.push(
      '1行目・2行目の両方が日付+顧客列に見えます。1行目（例: 目安用見出し）は取り込まず、2行目以降をデータ行とします。'
    );
  }
  return {
    dataRows: rows.slice(1),
    infoMessages: info,
    rawLineCount: rows.length,
    firstDataLine1Based: 2,
  };
}
