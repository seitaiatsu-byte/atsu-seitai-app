import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import ModalCloseButton from './ModalCloseButton';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { CLINIC_FULL } from '../lib/clinic';
import { ClinicNameDisplay } from './ClinicNameDisplay';
import { fetchAllCustomerNumbers } from '../lib/fetchAllCustomers';
import {
  PLACEHOLDER_CUSTOMER_NAME,
  PLACEHOLDER_CUSTOMER_NUMBER,
  resolveNextRealCustomerNumber,
} from '../lib/customerNumber';
import { applyPhoneToCustomerPayload, readPhoneFromCustomerRow } from '../lib/customerPhoneFields';
import { extractMissingColumnFromError, isUuidString } from '../lib/supabaseColumnErrors';
import { loadChiefComplaintMaster, type ChiefComplaintMasterRow } from '../lib/loadChiefComplaintMaster';
import { blockEnterFormSubmit, swallowFormSubmit } from '../lib/formSubmitGuard';
import { hasCustomerNumber } from '../lib/registrationValidation';

type Customer = Database['public']['Tables']['customers']['Row'];
type ReferralRow = Database['public']['Tables']['referral_source_master']['Row'];
type ChiefRow = ChiefComplaintMasterRow;

const EMPTY_CREATE_FORM = {
  name: '',
  name_kana: '',
  phone_number: '',
  customer_number: '',
  email: '',
  address: '',
  birth_date: '',
  gender: '',
  memo: '',
  clinic_name: '',
  prefecture: '',
  city: '',
  town: '',
  postal_code: '',
  referral_source: '',
  referral_source_2: '',
  referral_source_3: '',
  chief_complaint_1: '',
  chief_complaint_2: '',
  chief_complaint_3: '',
};

interface NewCustomerFormProps {
  onClose: () => void;
  /** 修正モード完了時のみ（新規登録後は画面を閉じずフォームをクリア） */
  onSuccess?: (customer: Customer) => void;
  mode?: 'create' | 'edit';
  initialCustomer?: Customer | null;
}

export default function NewCustomerForm({
  onClose,
  onSuccess,
  mode = 'create',
  initialCustomer = null,
}: NewCustomerFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    name_kana: '',
    phone_number: '',
    customer_number: '',
    email: '',
    address: '',
    birth_date: '',
    gender: '',
    memo: '',
    clinic_name: '',
    prefecture: '',
    city: '',
    town: '',
    postal_code: '',
    referral_source: '',
    referral_source_2: '',
    referral_source_3: '',
    chief_complaint_1: '',
    chief_complaint_2: '',
    chief_complaint_3: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [age, setAge] = useState<number | null>(null);
  const [referralSources, setReferralSources] = useState<ReferralRow[]>([]);
  const [chiefComplaints, setChiefComplaints] = useState<ChiefRow[]>([]);
  const [birthInput, setBirthInput] = useState('');
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  const resetCreateForm = () => {
    setFormData({ ...EMPTY_CREATE_FORM });
    setBirthInput('');
    setSubmitErrors([]);
    setAge(null);
  };

  const resolveClinicNameByNumber = (value: string): string | null => {
    const num = parseInt(value, 10);
    if (Number.isNaN(num)) return null;
    if (num >= 1 && num <= 4999) return CLINIC_FULL.kawanishi;
    if (num >= 5000) return CLINIC_FULL.takatsuki;
    return null;
  };

  useEffect(() => {
    loadMasters();
    const reloadMasters = () => loadMasters();
    window.addEventListener('masters-updated', reloadMasters);
    return () => window.removeEventListener('masters-updated', reloadMasters);
  }, []);

  useEffect(() => {
    const source = formData.birth_date || (birthInput.length === 8 ? `${birthInput.slice(0, 4)}-${birthInput.slice(4, 6)}-${birthInput.slice(6, 8)}` : '');
    if (source) {
      const birthDate = new Date(source);
      if (Number.isNaN(birthDate.getTime())) {
        setAge(null);
        return;
      }
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
      }
      setAge(calculatedAge);
    } else {
      setAge(null);
    }
  }, [formData.birth_date, birthInput]);

  useEffect(() => {
    if (formData.customer_number) {
      const nextClinic = resolveClinicNameByNumber(formData.customer_number);
      if (nextClinic) setFormData((prev) => ({ ...prev, clinic_name: nextClinic }));
    }
  }, [formData.customer_number]);

  useEffect(() => {
    if (mode !== 'edit' || !initialCustomer) return;
    const row = initialCustomer as Customer & Record<string, unknown>;
    const birth = String(row.birth_date ?? row.birthday ?? '').trim();
    setFormData((prev) => ({
      ...prev,
      name: String(row.name ?? '').trim(),
      name_kana: String(row.name_kana ?? row.kana ?? '').trim(),
      phone_number: readPhoneFromCustomerRow(row),
      customer_number: String(row.customer_number ?? '').replace(/\D/g, ''),
      email: String(row.email ?? '').trim(),
      address: String(row.address ?? '').trim(),
      birth_date: birth,
      gender: String(row.gender ?? '').trim(),
      memo: String(row.memo ?? '').trim(),
      clinic_name: String(row.clinic_name ?? '').trim(),
      prefecture: String(row.prefecture ?? '').trim(),
      city: String(row.city ?? '').trim(),
      town: String(row.town ?? '').trim(),
      referral_source: String(row.main_source ?? row.referral_source ?? '').trim(),
      referral_source_2: String(row.referral_source_2 ?? '').trim(),
      referral_source_3: String(row.referral_source_3 ?? '').trim(),
      chief_complaint_1: String(row.chief_complaint_1 ?? row.complaint_1 ?? row.chief_complaint ?? '').trim(),
      chief_complaint_2: String(row.chief_complaint_2 ?? row.complaint_2 ?? '').trim(),
      chief_complaint_3: String(row.chief_complaint_3 ?? row.complaint_3 ?? '').trim(),
    }));
    setBirthInput(birth ? birth.replace(/-/g, '') : '');
  }, [mode, initialCustomer]);

  useEffect(() => {
    const zip = formData.postal_code.replace(/\D/g, '');
    if (zip.length !== 7) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip}`);
        const json = await res.json();
        const row = json?.results?.[0];
        if (!row) return;
        setFormData((prev) => ({
          ...prev,
          prefecture: row.address1 || prev.prefecture,
          city: row.address2 || prev.city,
          town: row.address3 || prev.town,
        }));
      } catch (e) {
        console.error('郵便番号住所検索エラー:', e);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [formData.postal_code]);

  const resolveAutoCustomerNumber = async (): Promise<string> => {
    const numbers = await fetchAllCustomerNumbers();
    return resolveNextRealCustomerNumber(numbers);
  };

  const loadMasters = async () => {
    const sourcesFirst = await supabase
      .from('referral_source_master')
      .select('*')
      .order('display_order');
    let sources = sourcesFirst.error
      ? (await supabase.from('referral_source_master').select('*')).data
      : sourcesFirst.data;
    if (!sources || sources.length === 0) {
      const rules = await supabase
        .from('business_rules')
        .select('rule_value')
        .eq('rule_key', 'referral_source_options')
        .maybeSingle();
      if (rules.data?.rule_value) {
        try {
          const arr = JSON.parse(rules.data.rule_value) as string[];
          sources = arr.map((name, idx) => ({
            id: `ref-${idx}`,
            name,
            display_order: idx + 1,
            is_active: true,
            created_at: new Date().toISOString(),
          })) as ReferralRow[];
        } catch {
          // ignore parse errors
        }
      }
    }

    const complaints = await loadChiefComplaintMaster(true);

    if (sources) setReferralSources(sources);
    setChiefComplaints(complaints);
  };

  const handleSubmit = async () => {
    setSubmitErrors([]);
    const missing: string[] = [];
    if (!formData.name.trim()) missing.push('氏名');
    if (!formData.name_kana.trim()) missing.push('ふりがな');
    if (missing.length) {
      setSubmitErrors([`必須項目が未入力です: ${missing.join('、')}`]);
      return;
    }
    if (isSubmitting) return;

    const customerNumberInput = formData.customer_number.trim();
    if (customerNumberInput) {
      const n = parseInt(customerNumberInput, 10);
      if (Number.isFinite(n) && n > 9999 && n !== 10000) {
        setSubmitErrors([
          '顧客番号は 1–9999（本番患者）、または仮予約用の 10000 のみ登録できます。',
        ]);
        return;
      }
    }
    if (mode === 'create' && customerNumberInput) {
      if (await hasCustomerNumber(customerNumberInput)) {
        setSubmitErrors([
          `顧客番号 ${customerNumberInput} は既に登録されています。別の番号を指定してください。`,
        ]);
        return;
      }
    }

    if (mode === 'edit' && initialCustomer && customerNumberInput) {
      if (await hasCustomerNumber(customerNumberInput, initialCustomer.id)) {
        setSubmitErrors([
          `顧客番号 ${customerNumberInput} は既に別の顧客に使われています。別の番号を指定してください。`,
        ]);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const normalizedBirth =
        birthInput.length === 8
          ? `${birthInput.slice(0, 4)}-${birthInput.slice(4, 6)}-${birthInput.slice(6, 8)}`
          : formData.birth_date;
      const birth = normalizedBirth || null;

      if (birth && mode === 'create') {
        const { data: dup } = await supabase
          .from('customers')
          .select('id')
          .eq('name', formData.name.trim())
          .eq('birth_date', birth)
          .limit(1)
          .maybeSingle();
        if (dup) {
          setSubmitErrors([
            '同じ氏名・生年月日の顧客が既に登録されています。顧客名簿を確認してください。',
          ]);
          setIsSubmitting(false);
          return;
        }
      }

      const parseErrorDetails = (error: {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      }) => {
        const issues: string[] = [];
        const raw = [error.message, error.details, error.hint].filter(Boolean).join(' | ');
        const lower = raw.toLowerCase();
        if (lower.includes('customer_number') && (lower.includes('unique') || error.code === '23505')) {
          issues.push('顧客番号が重複しています（別の番号を指定するか空欄で再登録してください）');
        }
        if (lower.includes('name_kana')) {
          issues.push('ふりがな（name_kana）の形式または値を確認してください');
        }
        if (lower.includes('name')) {
          issues.push('氏名（name）の形式または値を確認してください');
        }
        if (lower.includes('birth') || lower.includes('date')) {
          issues.push('生年月日の形式が不正です（YYYY-MM-DD または 8桁入力）');
        }
        if (lower.includes('referral') || lower.includes('main_source')) {
          issues.push('流入経路まわりの列（referral_source / main_source / referral_source_id）を確認してください');
        }
        if (lower.includes('referral_source_id') && (lower.includes('foreign') || lower.includes('fkey'))) {
          issues.push('流入経路マスタと整合する id か確認してください');
        }
        if (lower.includes('chief_complaint') || lower.includes('complaint_')) {
          issues.push('主訴まわりの列（chief_complaint_* / complaint_*）を確認してください');
        }
        if (issues.length === 0) {
          issues.push(raw || '不明なエラー');
        }
        return issues;
      };

      const buildPayload = (resolvedCustomerNumber: string): Database['public']['Tables']['customers']['Insert'] => {
        const autoClinic = resolveClinicNameByNumber(resolvedCustomerNumber);
        const kanaTrimmed = formData.name_kana.trim();
        const payload: Database['public']['Tables']['customers']['Insert'] = {
          name: formData.name.trim(),
          name_kana: kanaTrimmed,
        };
        // 別名列 kana にも併記（CustomerRosterEditModal と同じ運用にして表記揺れに強くする）
        if (kanaTrimmed) payload.kana = kanaTrimmed;
        if (resolvedCustomerNumber) payload.customer_number = resolvedCustomerNumber;
        applyPhoneToCustomerPayload(payload as Record<string, unknown>, formData.phone_number);
        if (formData.email.trim()) payload.email = formData.email.trim();
        if (formData.address.trim()) payload.address = formData.address.trim();
        if (birth) {
          payload.birth_date = birth;
          payload.birthday = birth;
        }
        if (formData.gender.trim()) payload.gender = formData.gender.trim();
        if (formData.memo.trim()) payload.memo = formData.memo.trim();
        if (autoClinic) payload.clinic_name = autoClinic;
        else if (formData.clinic_name.trim()) payload.clinic_name = formData.clinic_name.trim();
        if (formData.prefecture.trim()) payload.prefecture = formData.prefecture.trim();
        if (formData.city.trim()) payload.city = formData.city.trim();
        if (formData.town.trim()) payload.town = formData.town.trim();
        const ref1Name = formData.referral_source.trim();
        if (ref1Name) {
          payload.referral_source = ref1Name;
          payload.main_source = ref1Name;
          const m1 = referralSources.find((s) => s.name === ref1Name);
          if (m1?.id != null && isUuidString(String(m1.id))) {
            payload.referral_source_id = String(m1.id);
          }
        }
        const ref2Name = formData.referral_source_2.trim();
        if (ref2Name) payload.referral_source_2 = ref2Name;
        const ref3Name = formData.referral_source_3.trim();
        if (ref3Name) payload.referral_source_3 = ref3Name;
        const cc1 = formData.chief_complaint_1.trim();
        if (cc1) {
          payload.chief_complaint_1 = cc1;
          payload.complaint_1 = cc1;
          payload.chief_complaint = cc1;
        }
        const cc2 = formData.chief_complaint_2.trim();
        if (cc2) {
          payload.chief_complaint_2 = cc2;
          payload.complaint_2 = cc2;
        }
        const cc3 = formData.chief_complaint_3.trim();
        if (cc3) {
          payload.chief_complaint_3 = cc3;
          payload.complaint_3 = cc3;
        }
        return payload;
      };

      // name / name_kana / customer_number は誤検知で除外しない（ふりがな未保存事故の予防）
      const PROTECTED_COLUMNS = new Set([
        'name',
        'name_kana',
        'customer_number',
        'chief_complaint',
        'chief_complaint_1',
        'chief_complaint_2',
        'chief_complaint_3',
        'complaint_1',
        'complaint_2',
        'complaint_3',
        'referral_source',
        'referral_source_2',
        'referral_source_3',
        'main_source',
      ]);

      if (mode === 'edit' && initialCustomer) {
        const base = buildPayload(formData.customer_number.trim());
        let workingUpdate = { ...base } as Database['public']['Tables']['customers']['Update'];
        for (let sanitizeRetry = 0; sanitizeRetry < 15; sanitizeRetry++) {
          const res = await supabase.from('customers').update(workingUpdate).eq('id', initialCustomer.id).select().single();
          if (!res.error && res.data) {
            window.dispatchEvent(new Event('customers-updated'));
            alert('顧客情報を更新しました');
            onSuccess?.(res.data);
            return;
          }
          const error = res.error;
          if (!error) break;
          const msg = error.message || '';
          const lowerMsg = msg.toLowerCase();
          if (error.code === '23503' && lowerMsg.includes('referral') && 'referral_source_id' in workingUpdate) {
            delete workingUpdate.referral_source_id;
            continue;
          }
          const missingCol = extractMissingColumnFromError(msg);
          if (missingCol && !PROTECTED_COLUMNS.has(missingCol) && missingCol in workingUpdate) {
            delete (workingUpdate as Record<string, unknown>)[missingCol];
            continue;
          }
          if (missingCol && PROTECTED_COLUMNS.has(missingCol)) {
            console.error('保護列が除外対象になりました:', missingCol, error);
            const rawDetail = [error.message, error.details, error.hint].filter(Boolean).join(' | ');
            setSubmitErrors([
              `保存に必要な列（${missingCol}）に対する書き込みが拒否されました。`,
              `元のエラー: ${rawDetail || '(詳細不明)'}`,
              'スキーマキャッシュが古い場合は Supabase Dashboard の Database → API → Reload schema を実行してください。',
            ]);
            alert('顧客更新に失敗しました（画面下部に原因を表示中）');
            return;
          }
          console.error('顧客更新に失敗:', error);
          setSubmitErrors(parseErrorDetails(error));
          alert('顧客更新に失敗しました（画面下部に原因を表示中）');
          return;
        }
        setSubmitErrors(['更新に失敗しました。列の差異があるため、Supabase の migration を適用してください。']);
        alert('顧客更新に失敗しました（画面下部に原因を表示中）');
        return;
      }

      // 顧客番号未入力時は最大+1を発行。重複時は再採番して最大3回リトライ。
      for (let retry = 0; retry < 3; retry++) {
        let customerNumber = formData.customer_number.trim();
        if (!customerNumber) {
          customerNumber = await resolveAutoCustomerNumber();
        }
        const payload = buildPayload(customerNumber);
      // age列が存在しない環境でも登録できるよう、常時送信しない

        // スキーマキャッシュとフロント差異があっても通せるよう、
        // 「存在しない列」エラー時は当該キーを除外して再試行する。
        let workingPayload: Database['public']['Tables']['customers']['Insert'] = { ...payload };
        let data: Customer | null = null;
        let error: { message?: string; details?: string; hint?: string; code?: string } | null = null;

        for (let sanitizeRetry = 0; sanitizeRetry < 15; sanitizeRetry++) {
          const res = await supabase.from('customers').insert([workingPayload]).select().single();
          if (!res.error) {
            data = res.data;
            error = null;
            break;
          }

          error = res.error;
          const msg = res.error.message || '';
          const lowerMsg = msg.toLowerCase();
          if (
            res.error.code === '23503' &&
            lowerMsg.includes('referral') &&
            'referral_source_id' in workingPayload
          ) {
            delete workingPayload.referral_source_id;
            continue;
          }
          const missing = extractMissingColumnFromError(msg);
          if (missing && !PROTECTED_COLUMNS.has(missing)) {
            const key = missing as keyof Database['public']['Tables']['customers']['Insert'];
            if (key in workingPayload) {
              delete workingPayload[key];
              continue;
            }
          }
          if (missing && PROTECTED_COLUMNS.has(missing)) {
            console.error('保護列が除外対象になりました:', missing, res.error);
            const rawDetail = [res.error.message, res.error.details, res.error.hint].filter(Boolean).join(' | ');
            error = {
              ...res.error,
              message: `保存に必要な列（${missing}）に対する書き込みが拒否されました。元のエラー: ${rawDetail || '(詳細不明)'} / Reload schema や customers のマイグレーション再適用も試してください。`,
            };
            break;
          }
          break;
        }

        if (!error && data) {
          window.dispatchEvent(new Event('customers-updated'));
          alert('顧客登録が完了しました');
          resetCreateForm();
          return;
        }

        console.error('顧客登録に失敗:', error);
        const details = parseErrorDetails(error || {});
        setSubmitErrors(details);

        const isDuplicateNumber =
          (error?.code === '23505' || error?.message?.toLowerCase().includes('unique')) &&
          (error?.message?.includes('customer_number') || error?.details?.includes('customer_number'));
        if (isDuplicateNumber && !formData.customer_number.trim()) {
          continue;
        }
        break;
      }

      alert('顧客登録に失敗しました（画面下部に原因を表示中）');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明な例外';
      setSubmitErrors([`例外エラー: ${msg}`]);
      alert('顧客登録に失敗しました（画面下部に原因を表示中）');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">{mode === 'edit' ? '顧客情報の修正' : '新規顧客登録'}</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        <form onSubmit={swallowFormSubmit} onKeyDown={blockEnterFormSubmit} noValidate className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
            <h3 className="font-bold text-blue-900 text-sm">基本情報</h3>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
              <label className="block text-sm font-bold text-gray-700 mb-2">顧客番号</label>
              <input
                type="text"
                value={formData.customer_number}
                onChange={(e) => {
                  const num = e.target.value.replace(/\D/g, '');
                  setFormData({ ...formData, customer_number: num });
                }}
                className="w-full px-4 py-2 border-2 border-orange-400 rounded-lg focus:border-orange-500 outline-none font-bold"
                placeholder="未入力なら登録時に最大番号+1を自動発行"
              />
              <div className="mt-2 text-xs text-gray-600 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-orange-600">1～4999:</span>
                  <span>
                    自動的に <span className="font-bold text-orange-600">川西</span> に設定
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-blue-700">5000～9999:</span>
                  <span>
                    自動的に <span className="font-bold text-blue-600">高槻院</span> に設定
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-yellow-200">
                  <span className="font-bold text-slate-700">{PLACEHOLDER_CUSTOMER_NUMBER}:</span>
                  <span>
                    予約カレンダー用 <span className="font-bold">{PLACEHOLDER_CUSTOMER_NAME}</span>（1件だけ・分析対象外）
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                院名 <span className="text-xs text-gray-500">(顧客番号で自動設定可)</span>
              </label>
              <div className="w-full min-h-[42px] px-4 py-2 border-2 border-gray-200 rounded-lg bg-gray-50 flex items-center">
                {formData.clinic_name ? (
                  <ClinicNameDisplay rawClinicName={formData.clinic_name} />
                ) : (
                  <span className="text-gray-500">顧客番号入力で自動設定</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                氏名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none"
                placeholder="山田 太郎"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                ふりがな <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name_kana}
                onChange={(e) => setFormData({ ...formData, name_kana: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none"
                placeholder="やまだ たろう"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                性別
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none"
              >
                <option value="">選択してください</option>
                <option value="男性">男性</option>
                <option value="女性">女性</option>
                <option value="その他">その他</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                生年月日
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={birthInput}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                  setBirthInput(digits);
                  if (digits.length === 8) {
                    const dateStr = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
                    setFormData((prev) => ({ ...prev, birth_date: dateStr }));
                  }
                }}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none"
                placeholder="19710919"
              />
              <input
                type="date"
                value={formData.birth_date}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({ ...formData, birth_date: value });
                  setBirthInput(value ? value.replace(/-/g, '') : '');
                }}
                className="mt-2 w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-400 outline-none text-sm"
              />
            </div>

            {age !== null && (
              <div className="md:col-span-2">
                <div className="bg-green-50 border-2 border-green-400 rounded-lg p-3">
                  <span className="text-sm font-bold text-green-800">現在の年齢: </span>
                  <span className="text-2xl font-bold text-green-900">{age}歳</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                電話番号
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                onBlur={(e) => {
                  const row = readPhoneFromCustomerRow({ phone_number: e.target.value });
                  if (row) setFormData((prev) => ({ ...prev, phone_number: row }));
                }}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none font-mono"
                placeholder="09012345678"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                メールアドレス
              </label>
              <input
                type="text"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none"
                placeholder="example@email.com"
              />
            </div>
          </div>

          {submitErrors.length > 0 && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
              <div className="text-sm font-bold text-red-800 mb-2">
                {mode === 'edit' ? '更新できない理由' : '登録できない理由'}
              </div>
              <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                {submitErrors.map((msg, idx) => (
                  <li key={`${msg}-${idx}`}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-orange-50 border-l-4 border-orange-500 p-3 rounded">
            <h3 className="font-bold text-orange-900 text-sm">住所詳細（地域分析用）</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">郵便番号</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-orange-500 outline-none"
                placeholder="5691123"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                府県
              </label>
              <input
                type="text"
                value={formData.prefecture}
                onChange={(e) => setFormData({ ...formData, prefecture: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-orange-500 outline-none"
                placeholder="大阪府"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                市
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-orange-500 outline-none"
                placeholder="高槻市"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                町
              </label>
              <input
                type="text"
                value={formData.town}
                onChange={(e) => setFormData({ ...formData, town: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-orange-500 outline-none"
                placeholder="○○町"
              />
            </div>
          </div>

          <div className="bg-purple-50 border-l-4 border-purple-500 p-3 rounded">
            <h3 className="font-bold text-purple-900 text-sm">来院情報</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                流入経路1
              </label>
              <select
                value={formData.referral_source}
                onChange={(e) => setFormData({ ...formData, referral_source: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 outline-none"
              >
                <option value="">選択してください</option>
                {referralSources.map((source, idx) => (
                  <option key={`r1-${source.id}-${idx}`} value={source.name}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">流入経路2</label>
              <select
                value={formData.referral_source_2}
                onChange={(e) => setFormData({ ...formData, referral_source_2: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 outline-none"
              >
                <option value="">選択してください</option>
                {referralSources.map((source, idx) => (
                  <option key={`r2-${source.id}-${idx}`} value={source.name}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">流入経路3</label>
              <select
                value={formData.referral_source_3}
                onChange={(e) => setFormData({ ...formData, referral_source_3: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 outline-none"
              >
                <option value="">選択してください</option>
                {referralSources.map((source, idx) => (
                  <option key={`r3-${source.id}-${idx}`} value={source.name}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                主訴1
              </label>
              <select
                value={formData.chief_complaint_1}
                onChange={(e) => setFormData({ ...formData, chief_complaint_1: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 outline-none"
              >
                <option value="">選択してください</option>
                {chiefComplaints.map((complaint) => (
                  <option key={complaint.id} value={complaint.name}>
                    {complaint.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                主訴2
              </label>
              <select
                value={formData.chief_complaint_2}
                onChange={(e) => setFormData({ ...formData, chief_complaint_2: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 outline-none"
              >
                <option value="">選択してください</option>
                {chiefComplaints.map((complaint) => (
                  <option key={complaint.id} value={complaint.name}>
                    {complaint.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                主訴3
              </label>
              <select
                value={formData.chief_complaint_3}
                onChange={(e) => setFormData({ ...formData, chief_complaint_3: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 outline-none"
              >
                <option value="">選択してください</option>
                {chiefComplaints.map((complaint) => (
                  <option key={complaint.id} value={complaint.name}>
                    {complaint.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              備考・特記事項
            </label>
            <textarea
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none"
              rows={3}
              placeholder="特記事項があれば記入..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
              className={`flex-1 flex items-center justify-center gap-2 text-white py-3 px-6 rounded-xl font-bold transition-colors ${
                isSubmitting ? 'bg-blue-400 cursor-wait' : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              <Save size={20} />
              {isSubmitting ? (mode === 'edit' ? '更新中...' : '登録中...') : mode === 'edit' ? '更新する' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
