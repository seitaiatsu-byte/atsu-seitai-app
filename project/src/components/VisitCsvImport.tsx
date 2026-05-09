import { useRef, useState } from 'react';
import { Upload, Download, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { looksLikeUuid } from '../lib/paymentDisplay';
import { parseLocalVisitDateToYmd } from '../lib/visitDateParse';
import { normalizeCellText, resolvePaymentMethodMasterIdForVisitImport } from '../lib/visitImportRules';
import {
  VISIT_CSV_DATA_START_ROW_1_BASED,
  VISIT_CSV_DATE_RECOMMEND,
  VISIT_CSV_HEADER_LINE,
  VISIT_CSV_PAYMENT_RECOMMEND,
  idx,
} from '../lib/visitCsvTemplate';
import { assignVisitNumbersInBatch, fetchMaxVisitNumberByCustomer } from '../lib/visitNumber';
import { toErrorMessage } from '../lib/toErrorMessage';
import {
  isMissingImportKindTextColumnError,
  visitInsertOmittingImportKindText,
} from '../lib/visitRecordKindCompat';
import {
  parseDelimitedFile,
  readCsvFileAsString,
  resolveVisitDataRowsForImport,
} from '../lib/visitCsvFileRead';

type VisitInsert = Database['public']['Tables']['visit_records']['Insert'];
type CustomerRow = Pick<
  Database['public']['Tables']['customers']['Row'],
  'id' | 'name' | 'customer_number'
>;

type ImportResult = {
  success: number;
  /** 取り込まなかった行（日付/顧客/重複など。マスタ未解決だけではカウントしない） */
  skipped: number;
  /** 5列目がマスタ未解決のまま挿入した行数（payment_method = null。インポートは成功扱い） */
  mismatchCount: number;
  messages: string[];
  /** 顧客取得等の致命エラーで1件も挿入できないとき */
  allBlocked: boolean;
  /** スキップ行の内訳（先頭200件） */
  skippedDetail?: string[];
  /** 支払未解決行の内訳（先頭200件。任意） */
  mismatchDetail?: string[];
  /** DBに import_kind_text 列が無く、種類をメモ先頭へ入れた */
  usedMemoFallbackForKind?: boolean;
};

const kawanishiClinic = '川西あつ整体院';
const takatsukiClinic = '高槻あつ整体院';

const toDigits = (v: string) => v.replace(/\D/g, '');

/** 顧客番号の照合用キー（全角→半角、末尾 .0 除去、ゼロ埋め吸収） */
const normalizeCustomerNumberKey = (v: string): string => {
  const s = String(v ?? '')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .trim()
    .replace(/\.0+$/, '');
  const digits = toDigits(s);
  if (!digits) return '';
  const normalized = digits.replace(/^0+/, '');
  return normalized || '0';
};

const parseAmount = (raw: string): number | null => {
  const n = Number(raw.replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return null;
  return n;
};

const pickClinicByCustomerNumber = (customerNumberDigits: string): string | null => {
  const num = Number(customerNumberDigits);
  if (!Number.isFinite(num)) return null;
  if (num <= 4999) return kawanishiClinic;
  return takatsukiClinic;
};

/** 回数券: 生文字列＋、数として points_used（例 13/16 → 先頭の 13） */
const parseTicketCell = (raw: string): { raw: string; points: number } => {
  const rawTrim = raw.trim();
  if (!rawTrim) return { raw: '', points: 0 };
  if (rawTrim.includes('/')) {
    const a = rawTrim.split('/')[0] || '';
    const p = Number(a.replace(/\D/g, ''));
    return { raw: rawTrim, points: Number.isFinite(p) ? p : 0 };
  }
  const p = Number(rawTrim.replace(/,/g, ''));
  return { raw: rawTrim, points: Number.isFinite(p) ? p : 0 };
};

const parseBeOptional = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) return null;
  const n = parseInt(t.replace(/,/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  return n;
};

type ValidatedRow = {
  line: number;
  customerId: string;
  visitDate: string;
  numberDigits: string;
  /** 5列目に文字があるが支払マスタに合わない（挿入はするが payment_method = null） */
  payMismatch: boolean;
  insert: Omit<VisitInsert, 'visit_number'>;
};

export default function VisitCsvImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const downloadTemplate = () => {
    const example = [
      '2026/4/23,2470,山田太郎,6500,カード,事前精算,プログラムAコース,15,12,13/16,首肩の違和感',
      '2026/4/3,5001,鈴木花子,8000,現金,当日精算,都度,5,4,2,次回予約済み',
    ].join('\n');
    const csv = [VISIT_CSV_HEADER_LINE, example].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '来院記録インポート（テンプレ11列）.csv';
    a.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setProgressText('CSVを読み込み中...');
    setResult(null);

    try {
      const text = await readCsvFileAsString(file);
      const { rows, delimiter: fileDelimiter } = parseDelimitedFile(text);
      const { dataRows, infoMessages: rowInfo, rawLineCount, firstDataLine1Based } = resolveVisitDataRowsForImport({
        rows,
      });
      const fileParseNotes: string[] = [...rowInfo];
      if (fileDelimiter !== ',') {
        fileParseNotes.push(
          `区切り: ${fileDelimiter === '\t' ? 'タブ' : 'セミコロン（;）'} として解析しました。`
        );
      }

      if (rows.length === 0) {
        setResult({
          success: 0,
          skipped: 0,
          mismatchCount: 0,
          messages: [
            'ファイルに空でない行がありませんでした。',
            'Excel からの場合: 「CSV UTF-8 (コンマ区切り)(*.csv)」で保存し、文字化けが無いか確認してください。',
          ],
          allBlocked: true,
        });
        setImporting(false);
        return;
      }
      if (dataRows.length === 0) {
        setResult({
          success: 0,
          skipped: 0,
          mismatchCount: 0,
          messages: [
            '取り込むデータ行が0件です。',
            'よくある原因: (1) 1行目だけ「日付,顧客,…」の見出しで2行目以降が空、または (2) 1列=日付・2列=顧客番号/ID の形式に見えていない行だけがある。',
            '対処: 1行目に見出し、2行目以降に実データを入れる。もしくはデータが1行だけのとき、1行目に「2026/4/23」のような日付（A列）と顧客番号（B列）を入れる。',
            `今回解析した行数: ${rawLineCount} 行。`,
            `${VISIT_CSV_DATA_START_ROW_1_BASED} 行目以降がデータ、${VISIT_CSV_DATA_START_ROW_1_BASED - 1} 行目は枠用でスキップ（1行＝目安+データの2行目から、というテンプレにしてください）。`,
            '区切りが1つも検出されない: Excel の区切りが「;」の国設定なら、今のファイルでは区切りを「;」として読めているか上にメッセージが出ます。テンプレ取込の CSV を上書きして試してください。',
            'まだ1列に潰れている: Excel で「UTF-8 CSV」ではなく誤った形式で保存している、または UTF-16 バイナリの可能性があります。アプリ上の「テンプレ取込」で出した file を再編集してください。',
          ],
          allBlocked: true,
        });
        setImporting(false);
        return;
      }

      setProgressText('顧客と支払マスタを読み込み中...');
      const { data: customers, error: customerError } = await supabase
        .from('customers')
        .select('id, customer_number, name');
      if (customerError) {
        setResult({
          success: 0,
          skipped: 0,
          mismatchCount: 0,
          messages: [`顧客一覧の取得に失敗しました: ${toErrorMessage(customerError)}`],
          allBlocked: true,
        });
        setProgressText('');
        setImporting(false);
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
      const customerMap = new Map<string, CustomerRow>();
      const customerById = new Map<string, CustomerRow>();
      (customers || []).forEach((c) => {
        customerById.set(c.id, c as CustomerRow);
        const num = normalizeCustomerNumberKey(c.customer_number || '');
        if (num) customerMap.set(num, c as CustomerRow);
      });

      // インポート照合は is_active を見ない。非表示にした行だけ DB に残ると、true 絞りだと「事前精算」等が配列に載らず正しく解決できない。
      const { data: methodRows, error: methodMasterError } = await supabase
        .from('payment_method_master')
        .select('id,name')
        .order('display_order');
      const methods = methodRows || [];
      const infoMessages: string[] = [];
      if (methodMasterError) {
        infoMessages.push(
          `支払方法マスタの取得に失敗しました: ${toErrorMessage(methodMasterError)}（5列目はすべて空欄で登録し続行します。）`
        );
      }

      const messages: string[] = [];
      const skippedDetail: string[] = [];
      const valid: ValidatedRow[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const line = firstDataLine1Based + i;
        const row = dataRows[i] || [];
        if (row.every((c) => !c.trim())) continue;

        const c2 = (row[idx.customer] || '').trim();
        const visitDate = parseLocalVisitDateToYmd(row[idx.date] || '');
        const amount = parseAmount(row[idx.amount] || '');

        if (!visitDate) {
          skippedDetail.push(`行${line}: 日付の形式が不正（1列目=日付）— スキップ`);
          continue;
        }
        if (amount == null) {
          skippedDetail.push(`行${line}: 売上金額が不正（4列目=売上）— スキップ`);
          continue;
        }
        if (!c2) {
          skippedDetail.push(`行${line}: 2列目（顧客：番号 or 顧客ID）が空— スキップ`);
          continue;
        }

        let customer: CustomerRow | undefined;
        if (looksLikeUuid(c2)) {
          customer = customerById.get(c2);
          if (!customer) {
            skippedDetail.push(`行${line}: 2列目の顧客ID ${c2} は未登録— スキップ`);
            continue;
          }
        } else {
          const number = normalizeCustomerNumberKey(c2);
          if (!number) {
            skippedDetail.push(`行${line}: 2列目の顧客番号が解釈できない— スキップ`);
            continue;
          }
          customer = customerMap.get(number);
          if (!customer) {
            skippedDetail.push(
              `行${line}: 顧客番号 ${number} は未登録（先に顧客登録/インポート）— スキップ`
            );
            continue;
          }
        }

        const nameCell = (row[idx.name] || '').trim();
        if (nameCell && customer.name && nameCell !== customer.name) {
          messages.push(
            `行${line}: 氏名（CSV: ${nameCell} / 登録: ${customer.name}）→ CSV 値を import_customer_name に保存。`
          );
        }

        const rawMethod = normalizeCellText(row[idx.paymentMethod] || '');
        const rawKind = (row[idx.kind] || '').replace(/\u3000/g, ' ');

        // 5列目: マスタ未解決は null（種類6列目は生保存のため照合しない）
        const methodResolved =
          rawMethod && !methodMasterError
            ? resolvePaymentMethodMasterIdForVisitImport(row[idx.paymentMethod] || '', methods)
            : null;
        const methodId: string | null = methodResolved?.id ?? null;
        const payMismatch = Boolean(rawMethod && !methodId);

        // 6列目（種類）: マスタ照合なし
        const importKindText = rawKind.replace(/\u3000/g, ' ').trim() || null;

        const menuCell = (row[idx.menu] || '').trim();
        const importCsvVisitCount = (row[idx.csvVisitCount] || '').trim() || null;
        const be = parseBeOptional(row[idx.beCount] || '');
        const ticket = parseTicketCell(row[idx.ticket] || '');
        const memo = (row[idx.memo] || '').trim() || null;

        const numberDigits =
          normalizeCustomerNumberKey(c2) || normalizeCustomerNumberKey(customer.customer_number || '5000');
        const clinic = pickClinicByCustomerNumber(numberDigits);
        if (!clinic) {
          skippedDetail.push(
            `行${line}: 顧客番号から院を判別できない— スキップ。2列目/顧客の番号に数字を。`
          );
          continue;
        }

        const insert: Omit<VisitInsert, 'visit_number'> = {
          customer_id: customer.id,
          visit_date: visitDate,
          amount,
          payment_method: methodId ?? null,
          payment_detail_id: null,
          import_kind_text: importKindText,
          menu_name: menuCell || null,
          points_used: ticket.points,
          import_customer_name: nameCell || null,
          import_csv_visit_count: importCsvVisitCount,
          import_ticket_count_raw: ticket.raw || null,
          be_equivalent_count: be,
          memo,
          clinic_name: clinic,
        };
        valid.push({
          line,
          customerId: customer.id,
          visitDate,
          numberDigits: numberDigits || c2,
          payMismatch,
          insert,
        });
      }

      const allInfo = [...fileParseNotes, ...infoMessages, ...messages].slice(0, 200);

      if (valid.length === 0) {
        const skipList = skippedDetail.slice(0, 200);
        setResult({
          success: 0,
          skipped: skipList.length,
          mismatchCount: 0,
          messages: allInfo.length
            ? [
                ...allInfo,
                skipList.length
                  ? '上記に加え、下の「スキップの内訳」に行ごとの理由を出しています。'
                  : '有効行が0件でした。',
              ]
            : skipList.length
              ? ['有効行が0件でした。理由は下の「スキップの内訳」を確認してください。']
              : ['取り込める有効な行がありません'],
          allBlocked: false,
          skippedDetail: skipList.length ? skipList : undefined,
        });
        setImporting(false);
        return;
      }

      setProgressText('重複（同日来院）を解決中...');
      const seenInCsv = new Set<string>();
      const afterCsvDedup: ValidatedRow[] = [];
      for (const v of valid) {
        const k = `${v.customerId}\t${v.visitDate}`;
        if (seenInCsv.has(k)) {
          skippedDetail.push(
            `行${v.line}: 同じ顧客・同じ来院日がこのCSV内で重複。先の行を残しスキップ。`
          );
          continue;
        }
        seenInCsv.add(k);
        afterCsvDedup.push(v);
      }

      const distIds = [...new Set(afterCsvDedup.map((v) => v.customerId))];
      setProgressText('登録済みの来院日と比較中...');
      const { data: existingVisits, error: exErr } = await supabase
        .from('visit_records')
        .select('customer_id, visit_date')
        .in('customer_id', distIds);
      if (exErr) {
        setResult({
          success: 0,
          skipped: skippedDetail.length,
          mismatchCount: 0,
          messages: [
            `既存来院の取得に失敗しました: ${toErrorMessage(exErr)}。登録を中止します。`,
            ...allInfo,
            ...skippedDetail.slice(0, 50),
          ],
          allBlocked: true,
        });
        setProgressText('');
        setImporting(false);
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
      const existingSet = new Set(
        (existingVisits || []).map((r) => `${r.customer_id}\t${r.visit_date}`)
      );
      const toInsert: ValidatedRow[] = [];
      for (const v of afterCsvDedup) {
        const k = `${v.customerId}\t${v.visitDate}`;
        if (existingSet.has(k)) {
          skippedDetail.push(`行${v.line}: 同一顧客・${v.visitDate} の来院は既に登録済— スキップ`);
        } else {
          toInsert.push(v);
        }
      }

      if (toInsert.length === 0) {
        const skipList = skippedDetail.slice(0, 200);
        setResult({
          success: 0,
          skipped: skipList.length,
          mismatchCount: 0,
          messages: [
            '有効行は通りましたが、CSV内重複の整理・既存来院日との重複ののち、登録する行が0件でした。理由は下の「スキップの内訳」に表示します。',
            ...allInfo,
          ],
          allBlocked: false,
          skippedDetail: skipList,
        });
        setImporting(false);
        return;
      }

      const mismatchCount = toInsert.filter((r) => r.payMismatch).length;
      const mismatchDetail = toInsert
        .filter((r) => r.payMismatch)
        .map(
          (r) =>
            `行${r.line}: 5列目はマスタ未解決のため payment_method を空欄で登録。`
        )
        .slice(0, 200);

      setProgressText('通院回数（当院採番）を計算中...');
      const insertDistIds = [...new Set(toInsert.map((v) => v.customerId))];
      const maxRes = await fetchMaxVisitNumberByCustomer(supabase, insertDistIds);
      if (!maxRes.ok) {
        setResult({
          success: 0,
          skipped: skippedDetail.length,
          mismatchCount: 0,
          messages: [
            `通院採番の取得に失敗: ${maxRes.message}。登録を中止します。`,
            ...allInfo.slice(0, 20),
            ...skippedDetail.slice(0, 30),
          ],
          allBlocked: true,
          skippedDetail: skippedDetail.slice(0, 200),
        });
        setProgressText('');
        setImporting(false);
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
      const maxMap = maxRes.map;
      const visitNumbers = assignVisitNumbersInBatch(
        maxMap,
        toInsert.map((r, j) => ({
          customerId: r.customerId,
          visitDate: r.visitDate,
          orderKey: j,
        }))
      );

      const insertRows: VisitInsert[] = toInsert.map((r, j) => ({
        ...r.insert,
        visit_number: visitNumbers[j] ?? j + 1,
      }));

      const chunkSize = 200;
      let success = 0;
      let usedMemoFallbackForKind = false;
      for (let start = 0; start < insertRows.length; start += chunkSize) {
        const chunk = insertRows.slice(start, start + chunkSize);
        setProgressText(
          `取り込み中... ${Math.min(start + chunk.length, insertRows.length)} / ${insertRows.length}`
        );
        const tryInsert = await supabase.from('visit_records').insert(chunk);
        if (tryInsert.error && isMissingImportKindTextColumnError(tryInsert.error)) {
          const chunk2 = chunk.map(visitInsertOmittingImportKindText);
          const r2 = await supabase.from('visit_records').insert(chunk2);
          if (r2.error) {
            setResult({
              success: 0,
              skipped: skippedDetail.length,
              mismatchCount: 0,
              messages: [
                `登録中に失敗: ${toErrorMessage(r2.error)}（種類列なし用の再試行後も失敗）`,
                ...allInfo.slice(0, 10),
              ],
              allBlocked: true,
              skippedDetail: skippedDetail.slice(0, 200),
            });
            setProgressText('');
            setImporting(false);
            if (fileRef.current) fileRef.current.value = '';
            return;
          }
          usedMemoFallbackForKind = true;
        } else if (tryInsert.error) {
          setResult({
            success: 0,
            skipped: skippedDetail.length,
            mismatchCount: 0,
            messages: [`登録中に失敗: ${toErrorMessage(tryInsert.error)}`, ...allInfo.slice(0, 10)],
            allBlocked: true,
            skippedDetail: skippedDetail.slice(0, 200),
          });
          setProgressText('');
          setImporting(false);
          if (fileRef.current) fileRef.current.value = '';
          return;
        }
        success += chunk.length;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const compatNote: string[] = usedMemoFallbackForKind
        ? [
            'DB に import_kind_text 列が無いため、F 列（種類）を memo 先頭の「［種類:…］」に退避して登録しました（一覧の種類欄は表示されます）。あとで Supabase の SQL エディタで migrations の import_kind_text マイグレを流すと専用列に移行できます。',
          ]
        : [];

      setResult({
        success,
        skipped: skippedDetail.length,
        mismatchCount,
        messages: [...allInfo, ...compatNote],
        allBlocked: false,
        skippedDetail: skippedDetail.length > 0 ? skippedDetail.slice(0, 200) : undefined,
        mismatchDetail: mismatchDetail.length > 0 ? mismatchDetail : undefined,
        usedMemoFallbackForKind,
      });
      if (success > 0) window.dispatchEvent(new Event('records-updated'));
      setProgressText('');
    } catch (err) {
      setResult({
        success: 0,
        skipped: 0,
        mismatchCount: 0,
        messages: [`取り込み失敗: ${toErrorMessage(err)}`],
        allBlocked: true,
      });
      setProgressText('');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const isFatal = Boolean(result?.allBlocked);
  const isOk = (result?.success ?? 0) > 0;
  const resultBoxClass = result
    ? isFatal
      ? 'bg-red-50 border-red-300'
      : isOk
        ? 'bg-green-50 border-green-200'
        : 'bg-amber-50 border-amber-200'
    : '';
  const resultIcon = result ? (
    isFatal ? (
      <AlertCircle className="text-red-600" size={20} />
    ) : isOk ? (
      <CheckCircle className="text-green-600" size={20} />
    ) : (
      <AlertCircle className="text-amber-700" size={20} />
    )
  ) : null;
  const messageClass = isFatal ? 'text-red-800' : 'text-gray-700';

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <Upload className="text-blue-600" size={30} />
        <h2 className="text-2xl font-bold text-gray-800">CSV 来院記録（テンプレ 11 列）</h2>
      </div>

      <div className="mb-5 bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <FileText className="text-blue-600 mt-1" size={20} />
          <div className="text-sm text-blue-800 space-y-2">
            <div className="font-bold">
              <strong>1 行目は取り込みません</strong>（何を書いても可）。データは{VISIT_CSV_DATA_START_ROW_1_BASED}行目から。値の解釈は
              <strong>列の位置</strong>のみ（A=1列目=日付 … K=11列目=メモ）。列見出しの表記に依存しません。
            </div>
            <div className="text-amber-900 text-xs">
              読まないとき: Excel は「CSV UTF-8(コンマ区切り)」を保存。2 行目以降に日付+顧客。1
              行だけのときは A=日付・B=顧客番号。セミコロン / タブ / UTF-16
              も本文から自動で読めます。テンプレ取込のファイルの利用を推奨します。
            </div>
            <div className="text-xs break-all font-mono bg-white/60 p-2 rounded border">
              推奨1行目（目安）: {VISIT_CSV_HEADER_LINE}
            </div>
            <div>
              必須: <strong>1 列目（日付）/ 2 列目（顧客：顧客番号または顧客ID）/ 4 列目（売上金額）</strong>。
              5列目は可能な範囲で支払マスタ照合。6列目（種類）は<strong>照合なし</strong>で
              <code>import_kind_text</code> に生文字列保存。7 列目=実施メニュー、8〜11 列目=通院count / 実質BE / 回数券 / メモ。
            </div>
            <div>
              <strong>当院通算</strong>（<code>visit_number</code>）はDB＋同じCSV内で採番。8 列目
              <code>import_csv_visit_count</code> には生値（空欄可）。
            </div>
            <div>
              院（<code>visit_records.clinic_name</code>）: 2 列目（または紐づく顧客）の
              <strong>顧客番号</strong>のみで 4999 以下=
              <span className="font-bold text-orange-600">川西</span> / 5000 以上=
              <span className="font-bold text-blue-600">高槻院</span>（登録値は従来どおり DB 用の正式名）。顧客表の院名列は不要です。
            </div>
            <div>
              <strong>5列目（支払）</strong>はマスタに合わなければ
              <code>payment_method</code>を空欄のまま登録し、<strong>他の有効行の取り込みは止めません</strong>。日付/顧客/売上が
              足りない行、CSV内重複、既存と同日は<strong>行だけスキップ</strong>。6列目（種類）は
              常に生文字列を取り込みます。
            </div>
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-950 text-xs space-y-1.5">
              <div className="font-bold">表記</div>
              <div>
                <span className="font-bold">A 日付</span>: 例 {VISIT_CSV_DATE_RECOMMEND} または 2026-04-23
              </div>
              <div>
                <span className="font-bold">E 支払方法</span>（例）: {VISIT_CSV_PAYMENT_RECOMMEND.join(' / ')} など。
                <code>カード</code> 単独は <code>クレジットカード</code> に読み替えてマスタ照合。その他は
                マスタ管理の支払方法名に合わせる。
              </div>
              <div>
                <span className="font-bold">F 種類</span>: Excelのセル文をそのまま DB の{' '}
                <code>import_kind_text</code> に保存（<code>payment_detail_id</code> には入れません）。
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <button
          type="button"
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold shadow"
        >
          <Download size={18} />
          テンプレ取込
        </button>
        <label className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold shadow cursor-pointer">
          <Upload size={18} />
          CSV を選ぶ
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleUpload}
            className="hidden"
            disabled={importing}
          />
        </label>
      </div>

      {importing && (
        <div className="mb-4 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <div className="font-bold text-blue-800">{progressText || '処理中...'}</div>
        </div>
      )}

      {result && (
        <div className={`rounded-xl border-2 p-4 ${resultBoxClass}`}>
          <div className="flex items-center gap-2 mb-2">
            {resultIcon}
            <div className="font-bold text-gray-800">結果</div>
          </div>
          <div className="text-sm text-gray-700">
            {isOk && <span className="font-bold text-green-700">取り込み: {result.success} 行</span>}
            {!isOk && !isFatal && (
              <span className="font-bold text-amber-900">取り込み: 0 行（下記の理由で登録しませんでした）</span>
            )}
            {isFatal && result.success === 0 && (
              <span className="font-bold text-red-800">取り込みを完了できませんでした</span>
            )}
            {result.skipped > 0 && (
              <span className="ml-3 font-bold text-amber-900">スキップ: {result.skipped} 行</span>
            )}
          </div>
          {isOk && (result.mismatchCount > 0 || result.skipped > 0) && (
            <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <div className="font-bold">取り込みは完了しました。</div>
              {result.mismatchCount > 0 && (
                <div className="mt-1">
                  5列目（支払方法）がマスタに一致せず、空欄（null）で入れた行は
                  <span className="font-bold"> {result.mismatchCount} 行</span>あります。来院記録で必要なら修正してください。
                </div>
              )}
              {result.skipped > 0 && (
                <div className="mt-1">
                  日付・顧客・重複などの理由で取り込まなかった行は
                  <span className="font-bold"> {result.skipped} 行</span>あります。詳細は下に一覧します。
                </div>
              )}
            </div>
          )}
          {!isOk && result.success === 0 && (result.mismatchCount > 0 || result.skipped > 0) && (
            <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <div className="font-bold">
                登録0件: 有効行が無いか、すべてスキップ/重複でした。下の「スキップの内訳」に理由を出します。
              </div>
            </div>
          )}
          {(result.mismatchDetail?.length || result.skippedDetail?.length) ? (
            <div className="mt-2 max-h-72 min-h-0 overflow-y-auto rounded-lg border-2 border-amber-300 bg-white p-3 text-xs text-gray-800 shadow-inner">
              {result.mismatchDetail && result.mismatchDetail.length > 0 && (
                <div className="font-bold text-amber-950 mb-1">支払欄（参考）</div>
              )}
              {result.mismatchDetail?.map((m, i) => (
                <div key={`m-${i}`} className="whitespace-pre-wrap py-0.5">
                  {m}
                </div>
              ))}
              {result.skippedDetail && result.skippedDetail.length > 0 && (
                <div className="font-bold text-amber-950 mt-2 mb-1">スキップの内訳（{result.skipped} 件）</div>
              )}
              {result.skippedDetail?.map((m, i) => (
                <div key={`s-${i}`} className="whitespace-pre-wrap py-0.5 text-gray-800">
                  {m}
                </div>
              ))}
            </div>
          ) : null}
          {result.messages.length > 0 && (
            <div
              className={`mt-3 max-h-48 overflow-y-auto rounded-lg border p-2 text-xs space-y-1 ${
                isFatal ? 'bg-white border-red-200' : 'bg-white'
              }`}
            >
              {result.messages.map((m, i) => (
                <div key={i} className={`whitespace-pre-wrap ${messageClass}`}>
                  {m}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
