import { useState, useRef, useEffect } from 'react';
import { Upload, Download, CheckCircle, AlertCircle, FileText, Users, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { fetchAllCustomersByCreatedDesc, fetchCustomerCountExact } from '../lib/fetchAllCustomers';
import { fetchExistingCustomerNameBirthKeySet } from '../lib/fetchNameBirthKeys';
import { normalizeCsvHeaderLabel, resolveCsvColumnMap, normalizePhoneDigitsForDb } from '../lib/customerImportHelpers';
import {
  getAgeYearsFromCustomer,
  getPhoneWithMemoFallback,
} from '../lib/customerDisplayFields';
import {
  getKanaForRoster,
  getInflowLineFromRoster,
  getComplaint1ForRoster,
  getMemoForRoster,
  type CustomerRowRecord,
} from '../lib/customerRosterFieldResolve';
import { extractMissingColumnFromError } from '../lib/supabaseColumnErrors';
import { toErrorMessage } from '../lib/toErrorMessage';
import NewCustomerForm from './NewCustomerForm';
import { ClinicNameFromCustomer } from './ClinicNameDisplay';

/** name / name_kana / customer_number は誤検知でも除外しない */
const PROTECTED_CUSTOMER_COLUMNS = new Set(['name', 'name_kana', 'customer_number']);

type Customer = Database['public']['Tables']['customers']['Row'];

const LIST_ROWS_PER_PAGE = 200;

/** 見出し行に当該列があったか（既存行の部分更新に使用） */
type ImportColumnPresence = {
  phone: boolean;
  gender: boolean;
  birth: boolean;
  referral1: boolean;
  referral2: boolean;
  referral3: boolean;
  prefecture: boolean;
  city: boolean;
  town: boolean;
  chief1: boolean;
  chief2: boolean;
  chief3: boolean;
  email: boolean;
  memo: boolean;
};

function buildPresenceFromColMap(
  col: ReturnType<typeof resolveCsvColumnMap>
): ImportColumnPresence {
  return {
    phone: (col['phone'] ?? -1) >= 0,
    gender: (col['gender'] ?? -1) >= 0,
    birth: (col['birth_date'] ?? -1) >= 0,
    referral1: (col['referral_1'] ?? -1) >= 0,
    referral2: (col['referral_2'] ?? -1) >= 0,
    referral3: (col['referral_3'] ?? -1) >= 0,
    prefecture: (col['prefecture'] ?? -1) >= 0,
    city: (col['city'] ?? -1) >= 0,
    town: (col['town'] ?? -1) >= 0,
    chief1:
      (col['complaint1'] ?? -1) >= 0 ||
      ((col['complaint_solo'] ?? -1) >= 0 && (col['complaint1'] ?? -1) < 0),
    chief2: (col['complaint2'] ?? -1) >= 0,
    chief3: (col['complaint3'] ?? -1) >= 0,
    email: (col['email'] ?? -1) >= 0,
    memo: (col['memo'] ?? -1) >= 0,
  };
}

function buildCustomerUpdateFromImport(
  d: Record<string, unknown>,
  present: ImportColumnPresence
): Database['public']['Tables']['customers']['Update'] {
  const u: Database['public']['Tables']['customers']['Update'] = {
    name: d.name as string,
    name_kana: d.name_kana as string | null,
  };
  // 別名 kana 列にも書いておく（NewCustomerForm/RosterEditModal と整合）
  if (d.name_kana) (u as Record<string, unknown>).kana = d.name_kana as string;
  if (present.gender) u.gender = d.gender as string | null;
  if (present.birth) {
    u.birth_date = d.birth_date as string | null;
    u.birthday = d.birthday as string | null;
    u.age = d.age as number | null;
  }
  if (present.phone) u.phone_number = d.phone_number as string | null;
  if (present.referral1) u.referral_source = d.referral_source as string | null;
  if (present.referral2) u.referral_source_2 = d.referral_source_2 as string | null;
  if (present.referral3) u.referral_source_3 = d.referral_source_3 as string | null;
  if (present.prefecture) u.prefecture = d.prefecture as string | null;
  if (present.city) u.city = d.city as string | null;
  if (present.town) u.town = d.town as string | null;
  if (present.chief1) {
    u.chief_complaint_1 = d.chief_complaint_1 as string | null;
    u.chief_complaint = d.chief_complaint as string | null;
  }
  if (present.chief2) u.chief_complaint_2 = d.chief_complaint_2 as string | null;
  if (present.chief3) u.chief_complaint_3 = d.chief_complaint_3 as string | null;
  if (present.email) u.email = d.email as string | null;
  if (present.memo) u.memo = d.memo as string | null;
  u.clinic_name = d.clinic_name as string | null;
  return u;
}

type ImportResult = {
  /** 新規 + 上書き更新の合計（実際にDBに反映できた件数） */
  success: number;
  /** 新規登録の件数 */
  inserted: number;
  /** 既存顧客番号と一致したため上書き更新した件数（=「ダブり警告」対象） */
  updated: number;
  /** 取り込みできなかった件数（致命的エラーまたはCSV内重複等） */
  error: number;
  /** 警告のみで取り込みは続行された件数（DB既存と氏名+生年月日が一致など） */
  warned: number;
  /** 致命的エラー（このとき allBlocked=true） */
  errorMessages: string[];
  /** 警告（取り込みは続行） */
  warningMessages: string[];
  /** 任意の補足情報 */
  infoMessages: string[];
  allBlocked: boolean;
};

async function insertCustomersWithSanitize(
  rows: Record<string, unknown>[],
  startNo: number
): Promise<{ ok: true; droppedColumns: string[] } | { ok: false; message: string }> {
  let working = rows.map((r) => ({ ...r }));
  const dropped: string[] = [];
  for (let attempt = 0; attempt < 25; attempt++) {
    const { error } = await supabase
      .from('customers')
      .insert(working as Database['public']['Tables']['customers']['Insert'][]);
    if (!error) return { ok: true, droppedColumns: dropped };
    const msg = error.message || '';
    const lower = msg.toLowerCase();
    if (error.code === '23503' && lower.includes('referral')) {
      working = working.map((r) => {
        const next = { ...r };
        delete next.referral_source_id;
        return next;
      });
      if (!dropped.includes('referral_source_id')) dropped.push('referral_source_id');
      continue;
    }
    const missing = extractMissingColumnFromError(msg);
    if (missing && !PROTECTED_CUSTOMER_COLUMNS.has(missing)) {
      working = working.map((r) => {
        const next = { ...r };
        delete next[missing];
        return next;
      });
      if (!dropped.includes(missing)) dropped.push(missing);
      continue;
    }
    return {
      ok: false,
      message: `新規登録に失敗（${startNo}件目〜）。修正後に再アップロード: ${toErrorMessage(error)}`,
    };
  }
  return {
    ok: false,
    message: '列の差異が解消できず新規登録できません。Supabase の customers 拡張マイグレーションを適用してください。',
  };
}

async function updateCustomersWithSanitize(
  items: { id: string; data: Record<string, unknown> }[],
  startNo: number
): Promise<{ ok: true; droppedColumns: string[] } | { ok: false; message: string }> {
  let working = items.map((it) => ({ id: it.id, data: { ...it.data } }));
  const dropped: string[] = [];
  for (let attempt = 0; attempt < 25; attempt++) {
    const results = await Promise.all(
      working.map((u) =>
        supabase
          .from('customers')
          .update(u.data as Database['public']['Tables']['customers']['Update'])
          .eq('id', u.id)
      )
    );
    const failed = results.find((r) => r.error);
    if (!failed?.error) return { ok: true, droppedColumns: dropped };
    const msg = failed.error.message || '';
    const lower = msg.toLowerCase();
    if (failed.error.code === '23503' && lower.includes('referral')) {
      working = working.map((u) => {
        const next = { id: u.id, data: { ...u.data } };
        delete next.data.referral_source_id;
        return next;
      });
      if (!dropped.includes('referral_source_id')) dropped.push('referral_source_id');
      continue;
    }
    const missing = extractMissingColumnFromError(msg);
    if (missing && !PROTECTED_CUSTOMER_COLUMNS.has(missing)) {
      working = working.map((u) => {
        const next = { id: u.id, data: { ...u.data } };
        delete next.data[missing];
        return next;
      });
      if (!dropped.includes(missing)) dropped.push(missing);
      continue;
    }
    return {
      ok: false,
      message: `既存顧客の更新に失敗（${startNo}件目付近）: ${toErrorMessage(failed.error)}`,
    };
  }
  return {
    ok: false,
    message: '列の差異が解消できず更新できません。Supabase の customers 拡張マイグレーションを適用してください。',
  };
}

export default function CustomerImport() {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [dbTotalCount, setDbTotalCount] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [rosterEdit, setRosterEdit] = useState<Customer | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rosterListScrollRef = useRef<HTMLDivElement>(null);

  /** 顧客削除（関連レコードの件数を見せて確認 → ON DELETE CASCADE で来院/物販/サブスクも一括削除） */
  const handleDeleteCustomer = async (customer: Customer) => {
    if (deletingId) return;

    // 紐づく履歴件数を取得（権限が無くてもエラーにせず 0 件扱い）
    const safeCount = async (
      table: 'visit_records' | 'product_sales' | 'subscription_records'
    ): Promise<number> => {
      try {
        const { count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('customer_id', customer.id);
        return count ?? 0;
      } catch {
        return 0;
      }
    };
    const [visits, products, subs] = await Promise.all([
      safeCount('visit_records'),
      safeCount('product_sales'),
      safeCount('subscription_records'),
    ]);

    const lines = [
      `この顧客を削除します。元に戻せません。`,
      ``,
      `氏名: ${customer.name}`,
      `顧客番号: ${customer.customer_number ?? '（未設定）'}`,
      ``,
      `紐づく履歴も同時に削除されます:`,
      `  来院記録: ${visits} 件`,
      `  物販記録: ${products} 件`,
      `  サブスク記録: ${subs} 件`,
      ``,
      `本当に削除しますか？`,
    ];
    if (!window.confirm(lines.join('\n'))) return;

    setDeletingId(customer.id);
    try {
      const { error } = await supabase.from('customers').delete().eq('id', customer.id);
      if (error) {
        alert(`削除に失敗しました: ${toErrorMessage(error)}`);
        return;
      }
      window.dispatchEvent(new Event('customers-updated'));
      window.dispatchEvent(new Event('records-updated'));
      await loadCustomers();
    } catch (e) {
      alert(`削除中にエラー: ${toErrorMessage(e)}`);
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    loadCustomers();
    const reload = () => {
      loadCustomers();
    };
    window.addEventListener('customers-updated', reload);
    return () => window.removeEventListener('customers-updated', reload);
  }, []);

  useEffect(() => {
    const max = Math.max(1, Math.ceil(customers.length / LIST_ROWS_PER_PAGE));
    setListPage((p) => (p > max ? max : p));
  }, [customers.length]);
  useEffect(() => {
    setListPage(1);
  }, [rosterSearch]);

  const loadCustomers = async () => {
    setLoadingList(true);
    try {
      const [rows, count] = await Promise.all([fetchAllCustomersByCreatedDesc(), fetchCustomerCountExact()]);
      setCustomers(rows as Customer[]);
      setDbTotalCount(count ?? rows.length);
      setListPage(1);
    } catch (error) {
      console.error('顧客リスト読み込みエラー:', error);
    } finally {
      setLoadingList(false);
    }
  };

  const normalizeForSearch = (v: string | null | undefined) =>
    String(v || '')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  const toHiragana = (v: string) => v.replace(/[\u30a1-\u30f6]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0x60));

  const parseCustomerNo = (v: string | null | undefined) => {
    const n = Number(String(v || '').trim());
    return Number.isFinite(n) ? n : Number.NaN;
  };

  const rosterQuery = normalizeForSearch(rosterSearch);
  const filteredCustomers = customers.filter((customer) => {
    if (!rosterQuery) return true;
    const asRow = customer as CustomerRowRecord;
    const kana = getKanaForRoster(asRow);
    const nameNorm = normalizeForSearch(customer.name);
    const kanaNorm = normalizeForSearch(kana);
    const numberNorm = normalizeForSearch(customer.customer_number);
    const qHira = toHiragana(rosterQuery);
    return (
      nameNorm.includes(rosterQuery) ||
      kanaNorm.includes(rosterQuery) ||
      numberNorm.includes(rosterQuery) ||
      toHiragana(nameNorm).includes(qHira) ||
      toHiragana(kanaNorm).includes(qHira)
    );
  });

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    const an = parseCustomerNo(a.customer_number);
    const bn = parseCustomerNo(b.customer_number);
    const aIsKawanishi = Number.isFinite(an) && an >= 1 && an <= 4999;
    const bIsKawanishi = Number.isFinite(bn) && bn >= 1 && bn <= 4999;
    if (aIsKawanishi && !bIsKawanishi) return -1;
    if (!aIsKawanishi && bIsKawanishi) return 1;

    const aIsTakatsuki = Number.isFinite(an) && an >= 5000;
    const bIsTakatsuki = Number.isFinite(bn) && bn >= 5000;
    if (aIsTakatsuki && !bIsTakatsuki) return -1;
    if (!aIsTakatsuki && bIsTakatsuki) return 1;

    if (aIsKawanishi && bIsKawanishi) return an - bn; // 川西は小さい番号順
    if (aIsTakatsuki && bIsTakatsuki) return bn - an; // 高槻は大きい番号順

    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return (a.name || '').localeCompare(b.name || '', 'ja');
  });

  const totalListPages = Math.max(1, Math.ceil(sortedCustomers.length / LIST_ROWS_PER_PAGE));
  const effectiveListPage = Math.min(listPage, totalListPages);
  const listPageStart = (effectiveListPage - 1) * LIST_ROWS_PER_PAGE;
  const displayedCustomers = sortedCustomers.slice(listPageStart, listPageStart + LIST_ROWS_PER_PAGE);
  const listRangeEnd =
    sortedCustomers.length === 0 ? 0 : Math.min(listPageStart + displayedCustomers.length, sortedCustomers.length);

  useEffect(() => {
    rosterListScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [effectiveListPage]);

  const downloadTemplate = () => {
    const csv = 'customer_number,name,name_kana,gender,birth_date,phone_number,referral_source,prefecture,city,town,chief_complaint_1,chief_complaint_2,chief_complaint_3,email,memo\n1001,田中太郎,たなかたろう,男性,1980/01/01,09012345678,ホームページ,大阪府,高槻市,芥川町,腰痛,肩こり,,tanaka@example.com,\n5001,山田花子,やまだはなこ,女性,1990/05/15,08098765432,紹介,兵庫県,川西市,栄町,首の痛み,頭痛,姿勢改善,yamada@example.com,';
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '顧客名簿インポートテンプレート.csv';
    link.click();
  };

  const parseCSV = (text: string): string[][] => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());

    const firstLine = lines[0] || '';
    const hasTab = firstLine.includes('\t');
    const delimiter = hasTab ? '\t' : ',';

    return lines.map(line => {
      if (delimiter === '\t') {
        return line.split('\t').map(v => v.trim());
      }

      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    });
  };

  const buildFatalResult = (messages: string[]): ImportResult => ({
    success: 0,
    inserted: 0,
    updated: 0,
    error: messages.length,
    warned: 0,
    errorMessages: messages,
    warningMessages: [],
    infoMessages: [],
    allBlocked: true,
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length === 0) {
        setResult(buildFatalResult(['ファイルが空です']));
        setImporting(false);
        return;
      }

      const rawHeaders = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
      const normalizedHeaders = rawHeaders.map(normalizeCsvHeaderLabel);
      const col = resolveCsvColumnMap(normalizedHeaders);
      const present = buildPresenceFromColMap(col);
      const dataRows = rows.slice(1);

      const customerNumberIndex = col['customer_number'] ?? -1;
      const nameIndex = col['name'] ?? -1;
      const kanaIndex = col['name_kana'] ?? -1;
      const genderIndex = col['gender'] ?? -1;
      const birthDateIndex = col['birth_date'] ?? -1;
      const phoneIndex = col['phone'] ?? -1;
      const referralIndex = col['referral_1'] ?? -1;
      const referral2Index = col['referral_2'] ?? -1;
      const referral3Index = col['referral_3'] ?? -1;
      const prefectureIndex = col['prefecture'] ?? -1;
      const cityIndex = col['city'] ?? -1;
      const townIndex = col['town'] ?? -1;
      const complaint1Index = col['complaint1'] ?? -1;
      const complaint2Index = col['complaint2'] ?? -1;
      const complaint3Index = col['complaint3'] ?? -1;
      const complaintSoloIndex = col['complaint_solo'] ?? -1;
      const complaint1DataIndex = complaint1Index >= 0 ? complaint1Index : complaintSoloIndex;
      const emailIndex = col['email'] ?? -1;
      const memoIndex = col['memo'] ?? -1;

      if (customerNumberIndex === -1) {
        setResult(buildFatalResult(['エラー: 「customer_number」または「顧客番号」列が必須です']));
        setImporting(false);
        return;
      }

      if (nameIndex === -1) {
        setResult(buildFatalResult(['エラー: 「name」または「氏名」列が見つかりません']));
        setImporting(false);
        return;
      }

      if (kanaIndex === -1) {
        setResult(buildFatalResult(['エラー: 「name_kana」または「ふりがな」列が見つかりません']));
        setImporting(false);
        return;
      }

      const rowErrors: string[] = [];
      type Cand = { line: number; name: string; customerData: Record<string, unknown> };
      const candidates: Cand[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (row.every((c) => !c || !c.trim())) continue;
        const line = i + 2;
        const name = row[nameIndex]?.trim();
        const nameKana = kanaIndex !== -1 ? row[kanaIndex]?.trim() : '';

        if (!name) {
          rowErrors.push(`行${line}: 氏名が空です`);
          continue;
        }
        if (!nameKana) {
          rowErrors.push(`行${line}: ふりがなが空です`);
          continue;
        }
        const customerNumber = row[customerNumberIndex]?.trim();
        if (!customerNumber) {
          rowErrors.push(`行${line}: 顧客番号が空です`);
          continue;
        }

        let clinicName = '';
        const numN = parseInt(customerNumber, 10);
        if (!isNaN(numN)) {
          if (numN >= 1 && numN <= 4999) {
            clinicName = '川西あつ整体院';
          } else if (numN >= 5000) {
            clinicName = '高槻あつ整体院';
          }
        }

        let age: number | null = null;
        let birthDate: string | null = birthDateIndex !== -1 ? row[birthDateIndex]?.trim() : null;
        if (birthDate) {
          const normalized = birthDate.replace(/\//g, '-');
          const birth = new Date(normalized);
          const today = new Date();
          let calculatedAge = today.getFullYear() - birth.getFullYear();
          const monthDiff = today.getMonth() - birth.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            calculatedAge--;
          }
          age = calculatedAge;
          if (!Number.isNaN(birth.getTime())) {
            birthDate = birth.toISOString().split('T')[0];
          } else {
            rowErrors.push(`行${line}: 生年月日の形式が不正です`);
            continue;
          }
        }

        const c1Value =
          complaint1DataIndex !== -1 ? (row[complaint1DataIndex]?.trim() || null) : null;
        const c2 = complaint2Index !== -1 ? (row[complaint2Index]?.trim() || null) : null;
        const c3 = complaint3Index !== -1 ? (row[complaint3Index]?.trim() || null) : null;

        const customerData: Record<string, unknown> = {
          customer_number: customerNumber,
          name,
          name_kana: nameKana,
          // 別名 kana 列（環境差異の救済）
          kana: nameKana || null,
          gender: genderIndex !== -1 ? row[genderIndex]?.trim() || null : null,
          birth_date: birthDate,
          birthday: birthDate,
          age: age,
          phone_number: phoneIndex !== -1 ? normalizePhoneDigitsForDb(row[phoneIndex]) : null,
          referral_source: referralIndex !== -1 ? row[referralIndex]?.trim() || null : null,
          referral_source_2: referral2Index !== -1 ? row[referral2Index]?.trim() || null : null,
          referral_source_3: referral3Index !== -1 ? row[referral3Index]?.trim() || null : null,
          prefecture: prefectureIndex !== -1 ? row[prefectureIndex]?.trim() || null : null,
          city: cityIndex !== -1 ? row[cityIndex]?.trim() || null : null,
          town: townIndex !== -1 ? row[townIndex]?.trim() || null : null,
          chief_complaint_1: c1Value,
          chief_complaint: c1Value,
          chief_complaint_2: c2,
          chief_complaint_3: c3,
          email: emailIndex !== -1 ? row[emailIndex]?.trim() || null : null,
          memo: memoIndex !== -1 ? row[memoIndex]?.trim() || null : null,
          clinic_name: clinicName || null,
        };
        candidates.push({ line, name, customerData });
      }

      const moreErrors: string[] = [];

      const byNum = new Map<string, number[]>();
      for (const c of candidates) {
        const n = String(c.customerData.customer_number);
        const arr = byNum.get(n) || [];
        arr.push(c.line);
        byNum.set(n, arr);
      }
      for (const [num, lines] of byNum) {
        if (lines.length < 2) continue;
        for (const ln of lines) {
          moreErrors.push(
            `行${ln}: CSV内で顧客番号 ${num} が重複しています（行: ${lines.join(', ')}）`
          );
        }
      }

      const byNb = new Map<string, number[]>();
      for (const c of candidates) {
        const n = c.customerData.name;
        const b = c.customerData.birth_date;
        if (b && n) {
          const k = `${String(n).trim()}\t${b}`;
          const arr = byNb.get(k) || [];
          arr.push(c.line);
          byNb.set(k, arr);
        }
      }
      for (const [, lines] of byNb) {
        if (lines.length < 2) continue;
        for (const ln of lines) {
          moreErrors.push(
            `行${ln}: CSV内で同じ氏名・生年月日の行が重複しています（行: ${lines.join(', ')}）`
          );
        }
      }

      // 既存氏名・生年月日の照合用データ取得は「補助機能」。失敗してもインポート全体は止めず、
      // 重複チェックだけスキップして警告として記録する（致命扱いにしないため取り込みを続行）。
      let existingNameBirth: Set<string> = new Set();
      let nameBirthLookupFailed = false;
      let nameBirthLookupErrorText = '';
      if (candidates.length > 0) {
        try {
          existingNameBirth = await fetchExistingCustomerNameBirthKeySet();
        } catch (e) {
          console.error('既存氏名・生年月日の取得に失敗（重複チェックをスキップ）:', e);
          nameBirthLookupFailed = true;
          nameBirthLookupErrorText = toErrorMessage(e);
        }
      }

      const warningMessages: string[] = [];
      const skippedLineSet = new Set<number>();
      const idByCustomerNumber = new Map<string, string>();
      if (candidates.length > 0) {
        const uniqueNums = [...new Set(candidates.map((c) => String(c.customerData.customer_number)))];
        const { data: numberHits, error: numQErr } = await supabase
          .from('customers')
          .select('id, customer_number')
          .in('customer_number', uniqueNums);
        if (numQErr) {
          // 致命的: 既存照合できないと安全な取り込みができない
          moreErrors.push(`顧客番号の一括照合に失敗: ${toErrorMessage(numQErr)}`);
        } else {
          for (const r of numberHits || []) {
            if (r.customer_number) idByCustomerNumber.set(String(r.customer_number), r.id);
          }
        }

        // DB に「別の顧客番号で同氏名・生年月日」が既に居る行は警告＋スキップ（他の行は通す）
        if (!nameBirthLookupFailed) {
          for (const c of candidates) {
            const num = String(c.customerData.customer_number);
            if (idByCustomerNumber.has(num)) continue;
            const b = c.customerData.birth_date;
            if (b && c.customerData.name) {
              const k = `${String(c.customerData.name).trim()}\t${b}`;
              if (existingNameBirth.has(k)) {
                warningMessages.push(
                  `行${c.line}: 同じ氏名（${c.name}）・生年月日の顧客が既に別の顧客番号で名簿に存在します。重複登録を避けるため、この行はスキップしました。`
                );
                skippedLineSet.add(c.line);
              }
            }
          }
        }
      }

      if (nameBirthLookupFailed) {
        warningMessages.unshift(
          `氏名+生年月日の重複チェックは取得失敗のためスキップしました（取り込みは続行）。原因: ${nameBirthLookupErrorText}`
        );
      }

      const allErr = [...rowErrors, ...moreErrors];
      if (allErr.length > 0) {
        setResult({
          success: 0,
          inserted: 0,
          updated: 0,
          error: allErr.length,
          warned: warningMessages.length,
          errorMessages: allErr,
          warningMessages,
          infoMessages: [],
          allBlocked: true,
        });
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      if (candidates.length === 0) {
        setResult(buildFatalResult(['有効なデータ行がありません']));
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const toInsert: Cand[] = [];
      const toUpdate: { line: number; id: string; customerData: Record<string, unknown> }[] = [];
      for (const c of candidates) {
        if (skippedLineSet.has(c.line)) continue;
        const num = String(c.customerData.customer_number);
        const id = idByCustomerNumber.get(num);
        if (id) toUpdate.push({ line: c.line, id, customerData: c.customerData });
        else toInsert.push(c);
      }

      const droppedColumns = new Set<string>();
      const chunkSize = 200;
      for (let start = 0; start < toInsert.length; start += chunkSize) {
        const chunk = toInsert.slice(start, start + chunkSize);
        const res = await insertCustomersWithSanitize(
          chunk.map((c) => c.customerData),
          start + 1
        );
        if (!res.ok) {
          setResult({
            success: 0,
            inserted: 0,
            updated: 0,
            error: toInsert.length,
            warned: warningMessages.length,
            errorMessages: [res.message],
            warningMessages,
            infoMessages: [],
            allBlocked: true,
          });
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        for (const c of res.droppedColumns) droppedColumns.add(c);
      }

      for (let start = 0; start < toUpdate.length; start += chunkSize) {
        const chunk = toUpdate.slice(start, start + chunkSize);
        const res = await updateCustomersWithSanitize(
          chunk.map((u) => ({ id: u.id, data: buildCustomerUpdateFromImport(u.customerData, present) })),
          start + 1
        );
        if (!res.ok) {
          setResult({
            success: 0,
            inserted: 0,
            updated: 0,
            error: toUpdate.length,
            warned: warningMessages.length,
            errorMessages: [res.message],
            warningMessages,
            infoMessages: [],
            allBlocked: true,
          });
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        for (const c of res.droppedColumns) droppedColumns.add(c);
      }

      // 上書き更新は「ダブり」扱いで警告として明示
      if (toUpdate.length > 0) {
        warningMessages.unshift(
          `${toUpdate.length}件は同じ顧客番号が既に名簿にあったため上書き更新しました。意図しない上書きが含まれていないか確認してください。`
        );
        for (const u of toUpdate) {
          warningMessages.push(
            `行${u.line}: 顧客番号 ${String(u.customerData.customer_number)} は既存と一致 → 上書き更新（重複警告）`
          );
        }
      }

      const infoMessages: string[] = [];
      if (droppedColumns.size > 0) {
        infoMessages.push(
          `DB に存在しなかった列を自動的に除外して取り込みました: ${[...droppedColumns].join(', ')}（必要なら customers のマイグレーションを適用してください）`
        );
      }

      setResult({
        success: toInsert.length + toUpdate.length,
        inserted: toInsert.length,
        updated: toUpdate.length,
        error: 0,
        warned: warningMessages.length,
        errorMessages: [],
        warningMessages,
        infoMessages,
        allBlocked: false,
      });

      await loadCustomers();
      window.dispatchEvent(new Event('customers-updated'));

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setResult(buildFatalResult([`ファイル読み込みエラー: ${msg}`]));
    }

    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6">
      {rosterEdit && (
        <NewCustomerForm
          mode="edit"
          initialCustomer={rosterEdit}
          onClose={() => setRosterEdit(null)}
          onSuccess={() => {
            setRosterEdit(null);
            void loadCustomers();
          }}
        />
      )}
      <div className="flex items-center gap-3 mb-6">
        <Upload className="text-teal-600" size={32} />
        <h2 className="text-2xl font-bold text-gray-800">顧客名簿インポート</h2>
      </div>

      <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FileText className="text-blue-600 mt-1" size={24} />
          <div className="w-full">
            <div className="font-bold text-blue-800 mb-3">CSVファイル形式（15列対応）</div>
            <div className="text-sm text-blue-700 space-y-2">
              <div className="font-bold bg-white rounded p-2 border border-blue-300 text-xs">
                A. 顧客番号 | B. 名前 <span className="text-red-600">*</span> | C. ふりがな <span className="text-red-600">*</span> | D. 性別 | E. 生年月日 | F. 電話番号 | G. 流入のメイン | H. 府県 | I. 市・郡 | J. 町 | K. 主訴1 | L. 主訴2 | M. 主訴3 | N. メールアドレス | O. 備考
              </div>
              <div className="space-y-1">
                <div>• <span className="font-bold text-red-600">必須:</span> 名前、ふりがな</div>
                <div>
                  • <span className="font-bold text-orange-600">顧客番号ルール:</span> 1～4999 ={' '}
                  <span className="font-bold text-orange-600">川西</span> / 5000～7999 ={' '}
                  <span className="font-bold text-blue-600">高槻院</span>（自動設定）
                </div>
                <div>• <span className="font-bold text-green-600">生年月日:</span> YYYY/MM/DD形式（例: 1980/01/01）で年齢自動計算</div>
                <div>• <span className="font-bold text-purple-600">電話番号:</span> ハイフンなし（例: 09012345678）</div>
                <div>• <span className="font-bold text-teal-600">コピペルール:</span> Excelからそのままコピペ可能（タブ区切り対応）</div>
                <div>• 列名は日本語でも英語でも自動認識します</div>
                <div>• <span className="font-bold text-red-700">エラー（全行ブロック）:</span> 必須欠落・CSV内の顧客番号重複・CSV内の氏名+生年月日重複</div>
                <div>
                  • <span className="font-bold text-amber-800">警告（重複ダブり・取り込みは続行）:</span>{' '}
                  既存の顧客番号と一致 → <span className="font-bold">上書き更新</span> /
                  別の顧客番号で同氏名・生年月日が登録済 → <span className="font-bold">スキップ</span>
                </div>
                <div>• 取り込み後の結果欄に「新規」「上書き更新」「警告」「エラー」の内訳が表示されます</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl font-bold shadow-lg transition-all"
        >
          <Download size={20} />
          テンプレートをダウンロード
        </button>

        <label className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white rounded-xl font-bold shadow-lg transition-all cursor-pointer">
          <Upload size={20} />
          CSVファイルを選択
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileUpload}
            className="hidden"
            disabled={importing}
          />
        </label>
      </div>

      {importing && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6 text-center">
          <div className="text-lg font-bold text-yellow-800 mb-2">インポート中...</div>
          <div className="text-sm text-yellow-700">数千件のデータでも数秒で完了します</div>
        </div>
      )}

      {result && (
        <div
          className={`border-2 rounded-lg p-6 ${
            result.allBlocked || result.error > 0
              ? 'bg-red-50 border-red-300'
              : result.warningMessages.length > 0
                ? 'bg-amber-50 border-amber-300'
                : 'bg-green-50 border-green-300'
          }`}
        >
          <div className="flex items-center gap-3 mb-4">
            {result.error === 0 && !result.allBlocked ? (
              <CheckCircle
                className={result.warningMessages.length > 0 ? 'text-amber-600' : 'text-green-600'}
                size={32}
              />
            ) : (
              <AlertCircle className="text-red-600" size={32} />
            )}
            <div>
              <div className="text-xl font-bold text-gray-800">
                {result.allBlocked ? 'インポートできませんでした' : 'インポート完了'}
              </div>
              <div className="text-sm text-gray-700 mt-1 space-x-4">
                <span>
                  成功計: <span className="font-bold text-green-700">{result.success}件</span>
                </span>
                <span>
                  新規: <span className="font-bold text-blue-700">{result.inserted}件</span>
                </span>
                <span>
                  上書き更新: <span className="font-bold text-amber-700">{result.updated}件</span>
                </span>
                {result.warningMessages.length > 0 && (
                  <span>
                    警告: <span className="font-bold text-amber-800">{result.warningMessages.length}件</span>
                  </span>
                )}
                {result.error > 0 && (
                  <span>
                    エラー/中止: <span className="font-bold text-red-800">{result.error}件</span>
                  </span>
                )}
              </div>
              {result.error > 0 && (
                <div className="text-xs text-red-700 mt-1">
                  CSV内の重複や必須欠落などのエラーがあると全行登録しません。Excel を修正して再アップロードしてください。
                </div>
              )}
            </div>
          </div>

          {result.errorMessages.length > 0 && (
            <div className="mt-4">
              <div className="font-bold text-red-800 mb-2">エラー（{result.errorMessages.length}件）</div>
              <div className="bg-white rounded-lg p-3 max-h-64 overflow-y-auto space-y-1 text-sm border border-red-200">
                {result.errorMessages.map((msg, idx) => (
                  <div key={`err-${idx}`} className="text-red-800 py-1 border-b border-red-100 last:border-0">
                    {msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.warningMessages.length > 0 && (
            <div className="mt-4">
              <div className="font-bold text-amber-900 mb-2">
                重複・上書きの警告（{result.warningMessages.length}件）
              </div>
              <div className="bg-white rounded-lg p-3 max-h-64 overflow-y-auto space-y-1 text-sm border border-amber-300">
                {result.warningMessages.map((msg, idx) => (
                  <div key={`warn-${idx}`} className="text-amber-900 py-1 border-b border-amber-100 last:border-0">
                    {msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.infoMessages.length > 0 && (
            <div className="mt-4">
              <div className="font-bold text-gray-700 mb-2">補足</div>
              <div className="bg-white rounded-lg p-3 max-h-48 overflow-y-auto space-y-1 text-sm border border-gray-200">
                {result.infoMessages.map((msg, idx) => (
                  <div key={`info-${idx}`} className="text-gray-700 py-1 border-b border-gray-100 last:border-0">
                    {msg}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <div className="text-sm text-gray-700 space-y-2">
          <div className="font-bold text-gray-800">使い方:</div>
          <div>1. 「テンプレートをダウンロード」でCSV形式を確認</div>
          <div>2. Excelで顧客データを開き、CSV形式で保存（UTF-8推奨）</div>
          <div>3. 「CSVファイルを選択」でアップロード</div>
          <div>4. 自動的にデータベースに登録され、入力フォームで即座に検索可能になります</div>
        </div>
      </div>

      <div className="mt-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="text-blue-600" size={28} />
            <h3 className="text-xl font-bold text-gray-800">登録名簿一覧</h3>
          </div>
          <div className="text-sm font-bold text-blue-600 bg-white px-4 py-2 rounded-lg shadow">
            {loadingList ? (
              '登録者数を取得中…'
            ) : (
              <>
                登録者 合計{' '}
                <span className="tabular-nums">{dbTotalCount ?? customers.length}</span> 名
              </>
            )}
          </div>
        </div>
        <div className="mb-4">
          <input
            type="text"
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
            placeholder="検索（かな・番号・名前）"
            className="w-full md:w-[420px] px-4 py-2.5 rounded-lg border border-blue-200 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {loadingList ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        ) : sortedCustomers.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <div className="text-gray-500">
              {customers.length === 0 ? 'まだ顧客が登録されていません' : '検索条件に一致する顧客がいません'}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-inner border border-gray-200">
            <div ref={rosterListScrollRef} className="panel-scrollbar max-h-[44rem] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-bold">顧客番号</th>
                    <th className="px-4 py-3 text-left text-sm font-bold">氏名</th>
                    <th className="px-4 py-3 text-left text-sm font-bold">ふりがな</th>
                    <th className="px-4 py-3 text-left text-sm font-bold">性別</th>
                    <th className="px-4 py-3 text-left text-sm font-bold">年齢</th>
                    <th className="px-4 py-3 text-left text-sm font-bold">電話番号</th>
                    <th className="px-4 py-3 text-left text-sm font-bold max-w-[140px]">流入</th>
                    <th className="px-4 py-3 text-left text-sm font-bold max-w-[120px]">主訴1</th>
                    <th className="px-4 py-3 text-left text-sm font-bold">院</th>
                    <th className="px-4 py-3 text-left text-sm font-bold max-w-[100px]">メモ</th>
                    <th className="px-4 py-3 text-left text-sm font-bold sticky right-0 bg-gradient-to-r from-indigo-500 to-indigo-600 min-w-[170px]">
                      操作
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-bold">登録日</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCustomers.map((customer, idx) => {
                    const asRow = customer as CustomerRowRecord;
                    return (
                    <tr
                      key={customer.id}
                      className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-gray-700">{customer.customer_number}</td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-800">{customer.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {getKanaForRoster(asRow) ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{customer.gender || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {(() => {
                          const y = getAgeYearsFromCustomer(customer);
                          return y != null ? `${y}歳` : '—';
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-600">
                        {getPhoneWithMemoFallback(customer) ?? '—'}
                      </td>
                      <td
                        className="px-4 py-3 text-sm text-gray-600 max-w-[140px] truncate"
                        title={getInflowLineFromRoster(asRow) || ''}
                      >
                        {getInflowLineFromRoster(asRow) ?? '—'}
                      </td>
                      <td
                        className="px-4 py-3 text-sm text-gray-600 max-w-[120px] truncate"
                        title={getComplaint1ForRoster(asRow) || ''}
                      >
                        {getComplaint1ForRoster(asRow) ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <ClinicNameFromCustomer customer={customer} emptyLabel="—" />
                      </td>
                      <td
                        className="px-4 py-3 text-xs text-gray-600 max-w-[100px] align-top"
                        title={getMemoForRoster(asRow) || ''}
                      >
                        {(() => {
                          const m = getMemoForRoster(asRow);
                          if (!m) return '—';
                          return m.length > 32 ? `${m.slice(0, 32)}…` : m;
                        })()}
                      </td>
                      <td className="px-4 py-3 sticky right-0 bg-inherit">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setRosterEdit(customer)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-bold text-indigo-700 border border-indigo-300 rounded-lg bg-white hover:bg-indigo-50"
                          >
                            <Pencil size={14} />
                            修正
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteCustomer(customer)}
                            disabled={deletingId === customer.id}
                            title="この顧客を削除（紐づく来院・物販・サブスクも一括削除）"
                            className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-bold border rounded-lg transition-colors ${
                              deletingId === customer.id
                                ? 'text-gray-400 border-gray-200 bg-gray-50 cursor-wait'
                                : 'text-red-700 border-red-300 bg-white hover:bg-red-50'
                            }`}
                          >
                            <Trash2 size={14} />
                            {deletingId === customer.id ? '削除中…' : '削除'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(customer.created_at).toLocaleDateString('ja-JP')}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sortedCustomers.length > 0 && totalListPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm">
                <span className="text-gray-600">
                  {listPageStart + 1}〜{listRangeEnd} 名を表示（表示対象 {sortedCustomers.length} 名 / 読込 {customers.length} 名 / DB 登録{' '}
                  {dbTotalCount ?? customers.length} 名・{LIST_ROWS_PER_PAGE} 名/ページ）
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={effectiveListPage <= 1}
                    onClick={() => setListPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg font-bold border border-gray-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    前へ
                  </button>
                  <span className="font-mono text-gray-700 px-2">
                    {effectiveListPage} / {totalListPages}
                  </span>
                  <button
                    type="button"
                    disabled={effectiveListPage >= totalListPages}
                    onClick={() => setListPage((p) => Math.min(totalListPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg font-bold border border-gray-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    次へ
                  </button>
                </div>
              </div>
            )}
            {!loadingList && customers.length > 0 && dbTotalCount !== null && (
              <div className="px-4 py-2 border-t border-gray-100 bg-white text-xs text-gray-600 text-center">
                ※データベース上の登録者は <span className="font-bold text-gray-800">{dbTotalCount}</span> 名です。
                {customers.length !== dbTotalCount && (
                  <span className="text-amber-700 font-bold ml-1">
                    （この画面の一覧には {customers.length} 名までしか読み込めていません。ネットワークまたは権限設定を確認してください。）
                  </span>
                )}
                {customers.length === dbTotalCount && totalListPages > 1 && (
                  <span className="ml-1">下のページ送りで全員を確認できます。</span>
                )}
                {customers.length === dbTotalCount && totalListPages === 1 && (
                  <span className="ml-1">この一覧に全員を表示しています。</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
