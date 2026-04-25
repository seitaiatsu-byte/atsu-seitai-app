import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { CLINIC_FULL } from '../lib/clinic';
import { ClinicNameDisplay } from './ClinicNameDisplay';
import { fetchAllCustomerNumbers } from '../lib/fetchAllCustomers';
import { normalizePhoneDigitsForDb } from '../lib/customerImportHelpers';

type Customer = Database['public']['Tables']['customers']['Row'];
type ReferralRow = Database['public']['Tables']['referral_source_master']['Row'];
type ChiefRow = Database['public']['Tables']['chief_complaint_master']['Row'];

interface NewCustomerFormProps {
  onClose: () => void;
  onSuccess: (customer: Customer) => void;
}

export default function NewCustomerForm({ onClose, onSuccess }: NewCustomerFormProps) {
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
    const nums = numbers
      .map((s) => parseInt(s.replace(/\D/g, ''), 10))
      .filter((n) => Number.isFinite(n));
    const max = nums.length ? Math.max(...nums) : 0;
    return String(max + 1);
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

    const complaintsFirst = await supabase
      .from('chief_complaint_master')
      .select('*')
      .order('display_order');
    const complaints = complaintsFirst.error
      ? (await supabase.from('chief_complaint_master').select('*')).data
      : complaintsFirst.data;

    if (sources) setReferralSources(sources);
    if (complaints) setChiefComplaints(complaints);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitErrors([]);
    if (!formData.name) {
      alert('氏名は必須です');
      return;
    }
    if (!formData.name_kana) {
      alert('ふりがなは必須です');
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedBirth =
        birthInput.length === 8
          ? `${birthInput.slice(0, 4)}-${birthInput.slice(4, 6)}-${birthInput.slice(6, 8)}`
          : formData.birth_date;
      const birth = normalizedBirth || null;

      if (birth) {
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
      if (issues.length === 0) {
        issues.push(raw || '不明なエラー');
      }
      return issues;
    };

      // 顧客番号未入力時は最大+1を発行。重複時は再採番して最大3回リトライ。
      for (let retry = 0; retry < 3; retry++) {
        let customerNumber = formData.customer_number.trim();
        if (!customerNumber) {
          customerNumber = await resolveAutoCustomerNumber();
        }
        const autoClinic = resolveClinicNameByNumber(customerNumber);

      // optional徹底: 空欄はpayloadに含めない
      const payload: Database['public']['Tables']['customers']['Insert'] = {
        name: formData.name.trim(),
        name_kana: formData.name_kana.trim(),
      };
      if (customerNumber) payload.customer_number = customerNumber;
      const phoneNorm = normalizePhoneDigitsForDb(formData.phone_number);
      if (phoneNorm) payload.phone_number = phoneNorm;
      if (formData.email.trim()) payload.email = formData.email.trim();
      if (formData.address.trim()) payload.address = formData.address.trim();
      if (birth) {
        payload.birth_date = birth;
        payload.birthday = birth;
      }
      if (formData.gender.trim()) payload.gender = formData.gender.trim();
      if (formData.memo.trim()) payload.memo = formData.memo.trim();
      if (autoClinic) payload.clinic_name = autoClinic;
      if (formData.prefecture.trim()) payload.prefecture = formData.prefecture.trim();
      if (formData.city.trim()) payload.city = formData.city.trim();
      if (formData.town.trim()) payload.town = formData.town.trim();
      if (formData.referral_source.trim()) payload.referral_source = formData.referral_source.trim();
      if (formData.referral_source_2.trim()) payload.referral_source_2 = formData.referral_source_2.trim();
      if (formData.chief_complaint_1.trim()) payload.chief_complaint_1 = formData.chief_complaint_1.trim();
      if (formData.chief_complaint_2.trim()) payload.chief_complaint_2 = formData.chief_complaint_2.trim();
      if (formData.chief_complaint_3.trim()) payload.chief_complaint_3 = formData.chief_complaint_3.trim();
      // age列が存在しない環境でも登録できるよう、常時送信しない

        // スキーマキャッシュとフロント差異があっても通せるよう、
        // 「存在しない列」エラー時は当該キーを除外して再試行する。
        let workingPayload: Database['public']['Tables']['customers']['Insert'] = { ...payload };
        let data: Customer | null = null;
        let error: { message?: string; details?: string; hint?: string; code?: string } | null = null;

        for (let sanitizeRetry = 0; sanitizeRetry < 6; sanitizeRetry++) {
          const res = await supabase.from('customers').insert([workingPayload]).select().single();
          if (!res.error) {
            data = res.data;
            error = null;
            break;
          }

          error = res.error;
          const notFoundCol = /'([^']+)'\s+column/i.exec(res.error.message || '');
          if (notFoundCol?.[1]) {
            const key = notFoundCol[1] as keyof Database['public']['Tables']['customers']['Insert'];
            if (key in workingPayload) {
              delete workingPayload[key];
              continue;
            }
          }
          break;
        }

        if (!error && data) {
          window.dispatchEvent(new Event('customers-updated'));
          alert('顧客登録が完了しました');
          onSuccess(data);
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
          <h2 className="text-2xl font-bold text-gray-800">新規顧客登録</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
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
                  <span className="font-bold text-blue-700">5000～7999:</span>
                  <span>
                    自動的に <span className="font-bold text-blue-600">高槻院</span> に設定
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
                required
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
                required
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
                value={formData.phone_number}
                onChange={(e) =>
                  setFormData({ ...formData, phone_number: e.target.value.replace(/\D/g, '') })
                }
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none"
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
              <div className="text-sm font-bold text-red-800 mb-2">登録失敗の原因</div>
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
                {referralSources.map((source) => (
                  <option key={source.id} value={source.name}>
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
                {referralSources.map((source) => (
                  <option key={source.id} value={source.name}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>

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
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white py-3 px-6 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={20} />
              {isSubmitting ? '登録中...' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
