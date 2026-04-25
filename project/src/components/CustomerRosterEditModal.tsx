import { useState, useEffect, useCallback } from 'react';
import { X, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { normalizePhoneDigitsForDb } from '../lib/customerImportHelpers';

type Customer = Database['public']['Tables']['customers']['Row'];

const OPTIONAL_KEYS: string[] = [
  'kana',
  'main_source',
  'complaint_1',
  'complaint_2',
  'complaint_3',
  'referral_source_id',
];

type Props = {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function CustomerRosterEditModal({ customer, open, onClose, onSaved }: Props) {
  const [nameKana, setNameKana] = useState('');
  const [phone, setPhone] = useState('');
  const [inflow1, setInflow1] = useState('');
  const [inflow2, setInflow2] = useState('');
  const [c1, setC1] = useState('');
  const [c2, setC2] = useState('');
  const [c3, setC3] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resetFrom = useCallback(() => {
    if (!customer) return;
    const r = customer as Customer & Record<string, unknown>;
    setNameKana(String(r.name_kana ?? r.kana ?? '').trim());
    setPhone(String(r.phone_number ?? '').trim());
    setInflow1(String(r.main_source ?? r.referral_source ?? '').trim());
    setInflow2(String(r.referral_source_2 ?? '').trim());
    setC1(
      String(r.chief_complaint_1 ?? r.complaint_1 ?? r.chief_complaint ?? '')
        .trim()
    );
    setC2(String(r.chief_complaint_2 ?? r.complaint_2 ?? '').trim());
    setC3(String(r.chief_complaint_3 ?? r.complaint_3 ?? '').trim());
    setMemo(String(r.memo ?? '').trim());
    setErr(null);
  }, [customer]);

  useEffect(() => {
    if (open && customer) resetFrom();
  }, [open, customer, resetFrom]);

  if (!open || !customer) return null;

  const save = async () => {
    setSaving(true);
    setErr(null);
    const phoneNorm = normalizePhoneDigitsForDb(phone) ?? null;

    const base: Record<string, unknown> = {
      name_kana: nameKana.trim() || null,
      kana: nameKana.trim() || null,
      phone_number: phoneNorm,
      referral_source: inflow1.trim() || null,
      main_source: inflow1.trim() || null,
      referral_source_2: inflow2.trim() || null,
      chief_complaint_1: c1.trim() || null,
      chief_complaint_2: c2.trim() || null,
      chief_complaint_3: c3.trim() || null,
      chief_complaint: c1.trim() || null,
      complaint_1: c1.trim() || null,
      complaint_2: c2.trim() || null,
      complaint_3: c3.trim() || null,
      memo: memo.trim() || null,
    };

    let work: Record<string, unknown> = { ...base };
    for (let a = 0; a < 8; a++) {
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
      const notFound = /"([^"]+)"\s+column/i.exec(m);
      if (notFound?.[1]) {
        const key = notFound[1];
        if (key in work) {
          delete work[key];
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
    setErr('列の相違で更新できません。Supabase の customers に kana, main_source 等のマイグレーションを適用してください。');
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto border border-gray-200">
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
          <p className="text-gray-600 text-xs">
            ふりがな・電話・流入（メイン/サブ）・主訴1〜3・メモを修正します。保存すると名簿・個人カルテに即反映されます。
          </p>

          <div>
            <label className="block font-bold text-gray-800 mb-1">ふりがな</label>
            <input
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2"
              value={nameKana}
              onChange={(e) => setNameKana(e.target.value)}
              placeholder="例: やながわあつのり"
            />
          </div>
          <div>
            <label className="block font-bold text-gray-800 mb-1">電話番号（半角推奨）</label>
            <input
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 font-mono"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-800 mb-1">流入（メイン）</label>
              <input
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2"
                value={inflow1}
                onChange={(e) => setInflow1(e.target.value)}
                placeholder="main_source / referral"
              />
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">流入（サブ）</label>
              <input
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2"
                value={inflow2}
                onChange={(e) => setInflow2(e.target.value)}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-gray-800 mb-1">主訴1</label>
              <input
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2"
                value={c1}
                onChange={(e) => setC1(e.target.value)}
              />
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">主訴2</label>
              <input
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2"
                value={c2}
                onChange={(e) => setC2(e.target.value)}
              />
            </div>
            <div>
              <label className="block font-bold text-gray-800 mb-1">主訴3</label>
              <input
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2"
                value={c3}
                onChange={(e) => setC3(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block font-bold text-gray-800 mb-1">メモ</label>
            <textarea
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 min-h-[88px]"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          {err && <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
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
