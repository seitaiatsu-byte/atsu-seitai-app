import { useState, useEffect, useCallback } from 'react';
import { X, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { normalizePhoneDigitsForDb } from '../lib/customerImportHelpers';
import { extractMissingColumnFromError, isUuidString } from '../lib/supabaseColumnErrors';

type Customer = Database['public']['Tables']['customers']['Row'];
type ReferralRow = Database['public']['Tables']['referral_source_master']['Row'];
type ChiefRow = Database['public']['Tables']['chief_complaint_master']['Row'];

const OPTIONAL_KEYS: string[] = ['kana', 'main_source', 'complaint_1', 'complaint_2', 'complaint_3', 'referral_source_id'];

type Props = {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function CustomerRosterEditModal({ customer, open, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [nameKana, setNameKana] = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [prefecture, setPrefecture] = useState('');
  const [city, setCity] = useState('');
  const [town, setTown] = useState('');
  const [address, setAddress] = useState('');
  const [inflow1, setInflow1] = useState('');
  const [inflow2, setInflow2] = useState('');
  const [c1, setC1] = useState('');
  const [c2, setC2] = useState('');
  const [c3, setC3] = useState('');
  const [memo, setMemo] = useState('');
  const [referralSources, setReferralSources] = useState<ReferralRow[]>([]);
  const [chiefComplaints, setChiefComplaints] = useState<ChiefRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resetFrom = useCallback(() => {
    if (!customer) return;
    const r = customer as Customer & Record<string, unknown>;
    setName(String(r.name ?? '').trim());
    setNameKana(String(r.name_kana ?? r.kana ?? '').trim());
    setCustomerNumber(String(r.customer_number ?? '').trim());
    setPhone(String(r.phone_number ?? '').trim());
    setEmail(String(r.email ?? '').trim());
    setGender(String(r.gender ?? '').trim());
    setBirthDate(String(r.birth_date ?? r.birthday ?? '').trim());
    setClinicName(String(r.clinic_name ?? '').trim());
    setPrefecture(String(r.prefecture ?? '').trim());
    setCity(String(r.city ?? '').trim());
    setTown(String(r.town ?? '').trim());
    setAddress(String(r.address ?? '').trim());
    setInflow1(String(r.main_source ?? r.referral_source ?? '').trim());
    setInflow2(String(r.referral_source_2 ?? '').trim());
    setC1(String(r.chief_complaint_1 ?? r.complaint_1 ?? r.chief_complaint ?? '').trim());
    setC2(String(r.chief_complaint_2 ?? r.complaint_2 ?? '').trim());
    setC3(String(r.chief_complaint_3 ?? r.complaint_3 ?? '').trim());
    setMemo(String(r.memo ?? '').trim());
    setErr(null);
  }, [customer]);

  useEffect(() => {
    if (open && customer) resetFrom();
  }, [open, customer, resetFrom]);

  useEffect(() => {
    if (!open) return;
    const loadMasters = async () => {
      const [refs, chiefs] = await Promise.all([
        supabase.from('referral_source_master').select('*').eq('is_active', true).order('display_order'),
        supabase.from('chief_complaint_master').select('*').eq('is_active', true).order('display_order'),
      ]);
      if (!refs.error) setReferralSources(refs.data || []);
      if (!chiefs.error) setChiefComplaints(chiefs.data || []);
    };
    void loadMasters();
  }, [open]);

  if (!open || !customer) return null;

  const save = async () => {
    setSaving(true);
    setErr(null);

    if (!name.trim()) {
      setErr('氏名は必須です');
      setSaving(false);
      return;
    }
    if (!nameKana.trim()) {
      setErr('ふりがなは必須です');
      setSaving(false);
      return;
    }

    const phoneNorm = normalizePhoneDigitsForDb(phone) ?? null;
    const ref1Name = inflow1.trim() || null;
    const ref2Name = inflow2.trim() || null;
    const c1Text = c1.trim() || null;
    const c2Text = c2.trim() || null;
    const c3Text = c3.trim() || null;
    const matchedReferral = ref1Name ? referralSources.find((r) => r.name === ref1Name) : null;

    const base: Record<string, unknown> = {
      name: name.trim(),
      name_kana: nameKana.trim() || null,
      kana: nameKana.trim() || null,
      customer_number: customerNumber.trim() || null,
      phone_number: phoneNorm,
      email: email.trim() || null,
      gender: gender || null,
      birth_date: birthDate || null,
      birthday: birthDate || null,
      clinic_name: clinicName.trim() || null,
      prefecture: prefecture.trim() || null,
      city: city.trim() || null,
      town: town.trim() || null,
      address: address.trim() || null,
      referral_source: ref1Name,
      main_source: ref1Name,
      referral_source_2: ref2Name,
      referral_source_id: matchedReferral?.id && isUuidString(String(matchedReferral.id)) ? String(matchedReferral.id) : null,
      chief_complaint_1: c1Text,
      chief_complaint_2: c2Text,
      chief_complaint_3: c3Text,
      chief_complaint: c1Text,
      complaint_1: c1Text,
      complaint_2: c2Text,
      complaint_3: c3Text,
      memo: memo.trim() || null,
    };

    let work: Record<string, unknown> = { ...base };
    for (let a = 0; a < 18; a++) {
      const { error } = await supabase
        .from('customers')
        .update(work as Database['public']['Tables']['customers']['Update'])
        .eq('id', customer.id);

      if (!error) {
        window.dispatchEvent(new Event('customers-updated'));
        onSaved();
        onClose();
        setSaving(false);
        return;
      }

      const m = error.message || '';
      const lower = m.toLowerCase();
      if (error.code === '23503' && lower.includes('referral') && 'referral_source_id' in work) {
        delete work.referral_source_id;
        work = { ...work };
        continue;
      }

      const missing = extractMissingColumnFromError(m);
      if (missing) {
        if (missing in work) {
          delete work[missing];
        } else {
          for (const opt of OPTIONAL_KEYS) {
            if (opt in work) {
              delete work[opt];
              break;
            }
          }
        }
        work = { ...work };
        continue;
      }

      setErr(m || '更新に失敗しました');
      setSaving(false);
      return;
    }

    setErr('列の相違で更新できません。Supabase の customers 拡張マイグレーションを適用してください。');
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="bg-white w-full sm:max-w-5xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto border border-gray-200">
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-slate-50 to-blue-50">
          <div>
            <div className="text-sm text-gray-500">顧客名簿の修正</div>
            <div className="text-lg font-bold text-gray-900">
              {customer.name} <span className="text-gray-500 font-mono">#{customer.customer_number}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/80">
            <X size={22} />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <p className="text-gray-600 text-xs">顧客情報をまとめて加筆・修正できます。保存すると名簿・個人カルテに即反映されます。</p>

          <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
            <h3 className="font-bold text-blue-900 text-sm">基本情報</h3>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-gray-800 mb-1">氏名</label>
              <input className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">ふりがな</label>
              <input className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={nameKana} onChange={(e) => setNameKana(e.target.value)} />
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">顧客番号</label>
              <input
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 font-mono"
                value={customerNumber}
                onChange={(e) => setCustomerNumber(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">電話番号</label>
              <input className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">メール</label>
              <input className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">性別</label>
              <select className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">未設定</option>
                <option value="男性">男性</option>
                <option value="女性">女性</option>
                <option value="その他">その他</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">生年月日</label>
              <input className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">院名</label>
              <input className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
            </div>
          </div>

          <div className="bg-orange-50 border-l-4 border-orange-500 p-3 rounded">
            <h3 className="font-bold text-orange-900 text-sm">住所</h3>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block font-bold text-gray-800 mb-1">府県</label>
              <input className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={prefecture} onChange={(e) => setPrefecture(e.target.value)} />
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">市</label>
              <input className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">町</label>
              <input className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={town} onChange={(e) => setTown(e.target.value)} />
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">住所</label>
              <input className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>

          <div className="bg-purple-50 border-l-4 border-purple-500 p-3 rounded">
            <h3 className="font-bold text-purple-900 text-sm">流入・主訴</h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-800 mb-1">流入（メイン）</label>
              <select className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={inflow1} onChange={(e) => setInflow1(e.target.value)}>
                <option value="">未設定</option>
                {referralSources.map((source, idx) => (
                  <option key={`edit-ref-1-${source.id}-${idx}`} value={source.name}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">流入（サブ）</label>
              <select className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={inflow2} onChange={(e) => setInflow2(e.target.value)}>
                <option value="">未設定</option>
                {referralSources.map((source, idx) => (
                  <option key={`edit-ref-2-${source.id}-${idx}`} value={source.name}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-gray-800 mb-1">主訴1</label>
              <select className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={c1} onChange={(e) => setC1(e.target.value)}>
                <option value="">未設定</option>
                {chiefComplaints.map((cc, idx) => (
                  <option key={`edit-c1-${cc.id}-${idx}`} value={cc.name}>
                    {cc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">主訴2</label>
              <select className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={c2} onChange={(e) => setC2(e.target.value)}>
                <option value="">未設定</option>
                {chiefComplaints.map((cc, idx) => (
                  <option key={`edit-c2-${cc.id}-${idx}`} value={cc.name}>
                    {cc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">主訴3</label>
              <select className="w-full border-2 border-gray-200 rounded-lg px-3 py-2" value={c3} onChange={(e) => setC3(e.target.value)}>
                <option value="">未設定</option>
                {chiefComplaints.map((cc, idx) => (
                  <option key={`edit-c3-${cc.id}-${idx}`} value={cc.name}>
                    {cc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-gray-800 mb-1">メモ</label>
            <textarea className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 min-h-[96px]" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>

          {err && <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">{err}</div>}

          <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white/90 py-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 font-bold text-gray-700 bg-white hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="px-4 py-2 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
