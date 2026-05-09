import { useState, useRef, useEffect } from 'react';
import { Upload, Download, CheckCircle, AlertCircle, FileText, Users, Pencil } from 'lucide-react';
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
import NewCustomerForm from './NewCustomerForm';
import { ClinicNameFromCustomer } from './ClinicNameDisplay';

type Customer = Database['public']['Tables']['customers']['Row'];

const LIST_ROWS_PER_PAGE = 200;

/** 見出し行に当該列があったか（既存行の部分更新に使用） */
type ImportColumnPresence = {
  phone: boolean;
  gender: boolean;
  birth: boolean;
  referral1: boolean;
  referral2: boolean;
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
  if (present.gender) u.gender = d.gender as string | null;
  if (present.birth) {
    u.birth_date = d.birth_date as string | null;
    u.birthday = d.birthday as string | null;
    u.age = d.age as number | null;
  }
  if (present.phone) u.phone_number = d.phone_number as string | null;
  if (present.referral1) u.referral_source = d.referral_source as string | null;
  if (present.referral2) u.referral_source_2 = d.referral_source_2 as string | null;
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

export default function CustomerImport() {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    error: number;
    messages: string[];
    allBlocked: boolean;
  } | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [dbTotalCount, setDbTotalCount] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [rosterEdit, setRosterEdit] = useState<Customer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length === 0) {
        setResult({ success: 0, error: 0, messages: ['ファイルが空です'], allBlocked: true });
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
        setResult({
          success: 0,
          error: 0,
          messages: ['エラー: 「customer_number」または「顧客番号」列が必須です'],
          allBlocked: true,
        });
        setImporting(false);
        return;
      }

      if (nameIndex === -1) {
        setResult({
          success: 0,
          error: 0,
          messages: ['エラー: 「name」または「氏名」列が見つかりません'],
          allBlocked: true,
        });
        setImporting(false);
        return;
      }

      if (kanaIndex === -1) {
        setResult({
          success: 0,
          error: 0,
          messages: ['エラー: 「name_kana」または「ふりがな」列が見つかりません'],
          allBlocked: true,
        });
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
          gender: genderIndex !== -1 ? row[genderIndex]?.trim() || null : null,
          birth_date: birthDate,
          birthday: birthDate,
          age: age,
          phone_number: phoneIndex !== -1 ? normalizePhoneDigitsForDb(row[phoneIndex]) : null,
          referral_source: referralIndex !== -1 ? row[referralIndex]?.trim() || null : null,
          referral_source_2: referral2Index !== -1 ? row[referral2Index]?.trim() || null : null,
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

      let existingNameBirth: Set<string> = new Set();
      if (candidates.length > 0) {
        try {
          existingNameBirth = await fetchExistingCustomerNameBirthKeySet();
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          setResult({
            success: 0,
            error: 0,
            messages: [`名簿照合用データの取得に失敗: ${m}`],
            allBlocked: true,
          });
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
      }

      const idByCustomerNumber = new Map<string, string>();
      if (candidates.length > 0) {
        const uniqueNums = [...new Set(candidates.map((c) => String(c.customerData.customer_number)))];
        const { data: numberHits, error: numQErr } = await supabase
          .from('customers')
          .select('id, customer_number')
          .in('customer_number', uniqueNums);
        if (numQErr) {
          moreErrors.push(`顧客番号の一括照合に失敗: ${numQErr.message}`);
        } else {
          for (const r of numberHits || []) {
            if (r.customer_number) idByCustomerNumber.set(String(r.customer_number), r.id);
          }
        }

        for (const c of candidates) {
          const num = String(c.customerData.customer_number);
          if (idByCustomerNumber.has(num)) continue;
          const b = c.customerData.birth_date;
          if (b && c.customerData.name) {
            const k = `${String(c.customerData.name).trim()}\t${b}`;
            if (existingNameBirth.has(k)) {
              moreErrors.push(
                `行${c.line}: 同じ氏名（${c.name}）・生年月日の顧客が既に名簿に存在します（別の顧客番号で登録済み）`
              );
            }
          }
        }
      }

      const allErr = [...rowErrors, ...moreErrors];
      if (allErr.length > 0) {
        setResult({
          success: 0,
          error: allErr.length,
          messages: allErr,
          allBlocked: true,
        });
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      if (candidates.length === 0) {
        setResult({
          success: 0,
          error: 0,
          messages: ['有効なデータ行がありません'],
          allBlocked: true,
        });
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const toInsert: Cand[] = [];
      const toUpdate: { line: number; id: string; customerData: Record<string, unknown> }[] = [];
      for (const c of candidates) {
        const num = String(c.customerData.customer_number);
        const id = idByCustomerNumber.get(num);
        if (id) toUpdate.push({ line: c.line, id, customerData: c.customerData });
        else toInsert.push(c);
      }

      const chunkSize = 200;
      for (let start = 0; start < toInsert.length; start += chunkSize) {
        const chunk = toInsert.slice(start, start + chunkSize);
        const { error: insErr } = await supabase
          .from('customers')
          .insert(
            chunk.map(
              (c) => c.customerData as Database['public']['Tables']['customers']['Insert']
            )
          );
        if (insErr) {
          setResult({
            success: 0,
            error: toInsert.length,
            messages: [
              `新規登録に失敗（${start + 1}件目〜一括挿入）。修正後に再アップロード: ${insErr.message}`,
            ],
            allBlocked: true,
          });
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
      }

      for (let start = 0; start < toUpdate.length; start += chunkSize) {
        const chunk = toUpdate.slice(start, start + chunkSize);
        const results = await Promise.all(
          chunk.map((u) =>
            supabase
              .from('customers')
              .update(buildCustomerUpdateFromImport(u.customerData, present))
              .eq('id', u.id)
          )
        );
        const fail = results.find((r) => r.error);
        if (fail?.error) {
          setResult({
            success: 0,
            error: toUpdate.length,
            messages: [
              `既存顧客の更新に失敗（${start + 1}件目付近）: ${fail.error.message}`,
            ],
            allBlocked: true,
          });
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
      }

      const info: string[] = [];
      if (toUpdate.length > 0) {
        info.push(
          `同じ顧客番号の行は上書き更新されました（${toUpdate.length}件）。新規: ${toInsert.length}件。`
        );
      }
      setResult({
        success: toInsert.length + toUpdate.length,
        error: 0,
        messages: info,
        allBlocked: false,
      });

      await loadCustomers();
      window.dispatchEvent(new Event('customers-updated'));

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setResult({ success: 0, error: 0, messages: [`ファイル読み込みエラー: ${msg}`], allBlocked: true });
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
                <div>• 1行でもエラー（同一CSV内の顧客番号重複・氏名+生年月日重複［新規のみ］）があると、全行とも処理されません</div>
                <div>• <span className="font-bold">既存の顧客番号</span>の行は再取込で上書き更新（CSVに列がある項目のみ）されます</div>
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
            result.allBlocked || result.error > 0 ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'
          }`}
        >
          <div className="flex items-center gap-3 mb-4">
            {result.error === 0 && !result.allBlocked ? (
              <CheckCircle className="text-green-600" size={32} />
            ) : (
              <AlertCircle className="text-red-600" size={32} />
            )}
            <div>
              <div className="text-xl font-bold text-gray-800">インポート完了</div>
              <div className="text-sm text-gray-600 mt-1">
                成功: <span className="font-bold text-green-600">{result.success}件</span>
                {result.error > 0 && (
                  <span className="ml-4">
                    エラー/中止: <span className="font-bold text-red-800">{result.error}件</span>
                    <span className="text-xs text-red-700 block mt-1">
                      1件でもエラーがあれば全行登録をしません。Excelを修正して再アップロードしてください。
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {result.messages.length > 0 && (
            <div className="mt-4">
              <div className="font-bold text-red-800 mb-2">詳細: ({result.messages.length}件のメッセージ)</div>
              <div className="bg-white rounded-lg p-3 max-h-64 overflow-y-auto space-y-1 text-sm border border-red-200">
                {result.messages.map((msg, idx) => (
                  <div key={idx} className="text-red-800 py-1 border-b border-red-100 last:border-0">
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
            <div className="max-h-96 overflow-y-auto">
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
                    <th className="px-4 py-3 text-left text-sm font-bold sticky right-0 bg-gradient-to-r from-indigo-500 to-indigo-600 min-w-[88px]">
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
                        <button
                          type="button"
                          onClick={() => setRosterEdit(customer)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-bold text-indigo-700 border border-indigo-300 rounded-lg bg-white hover:bg-indigo-50"
                        >
                          <Pencil size={14} />
                          修正
                        </button>
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
