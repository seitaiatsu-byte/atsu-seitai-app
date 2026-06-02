import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, Plus, Trash2, Edit2, Check, X, ClipboardList, CreditCard, Clock, Users, LayoutGrid, Megaphone, Repeat, Target, ChevronUp, ChevronDown, Palette } from 'lucide-react';

type TableName = 'menu_master' | 'payment_detail_master' | 'payment_method_master' | 'product_master' | 'subscription_master' | 'staff_master' | 'chief_complaint_master' | 'referral_source_master' | 'calendar_color_master';
type MasterItem = {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  price?: number | null;
  match_text?: string | null;
  color_key?: string | null;
};

const COLOR_OPTIONS = [
  { key: 'red', label: '赤', className: 'bg-red-100 text-red-900 border-red-300' },
  { key: 'blue', label: '青', className: 'bg-blue-100 text-blue-900 border-blue-300' },
  { key: 'green', label: '緑', className: 'bg-green-100 text-green-900 border-green-300' },
  { key: 'purple', label: '紫', className: 'bg-purple-100 text-purple-900 border-purple-300' },
  { key: 'amber', label: '黄', className: 'bg-amber-100 text-amber-950 border-amber-300' },
  { key: 'teal', label: '青緑', className: 'bg-teal-100 text-teal-900 border-teal-300' },
  { key: 'slate', label: '灰', className: 'bg-slate-100 text-slate-700 border-slate-300' },
];

function colorOptionClass(key: string | null | undefined): string {
  return COLOR_OPTIONS.find((c) => c.key === key)?.className || COLOR_OPTIONS[0].className;
}

export default function MasterManagement() {
  const [activeTab, setActiveTab] = useState<TableName>('menu_master');
  const [items, setItems] = useState<MasterItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newColorKey, setNewColorKey] = useState('red');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPrice, setEditingPrice] = useState('');
  const [editingColorKey, setEditingColorKey] = useState('red');
  const [isLoading, setIsLoading] = useState(false);
  const isPriceTab = activeTab === 'product_master' || activeTab === 'subscription_master';
  const isCalendarColorTab = activeTab === 'calendar_color_master';

  // 【物理固定】看板とテーブルの紐付け。ここが生命線です。
  const tabs = [
    { id: 'menu_master', label: '実施メニュー', icon: ClipboardList },
    { id: 'payment_method_master', label: '支払方法', icon: CreditCard },
    { id: 'payment_detail_master', label: '種類', icon: Clock },
    { id: 'product_master', label: '物販単価', icon: LayoutGrid },
    { id: 'subscription_master', label: 'サブスク', icon: Repeat },
    { id: 'staff_master', label: 'スタッフ', icon: Users },
    { id: 'chief_complaint_master', label: '主訴', icon: Target },
    { id: 'referral_source_master', label: '流入経路', icon: Megaphone },
    { id: 'calendar_color_master', label: 'カレンダー色', icon: Palette },
  ];

  // 切り替え時に前のデータを完全に殺す
  useEffect(() => {
    setItems([]); 
    setEditingId(null);
    setNewItemName('');
    setNewItemPrice('');
    setNewColorKey('red');
    fetchData(activeTab);
  }, [activeTab]);

  async function fetchData(tableName: TableName) {
    setIsLoading(true);
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order('display_order', { ascending: true });
    if (!error && data) setItems(data);
    setIsLoading(false);
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newItemName.trim();
    if (!name) return;

    // 現在のタブを「その瞬間」に固定してDBへ投げる
    const targetTable = activeTab;
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.display_order || 0)) : 0;
    if (isPriceTab && (newItemPrice.trim() === '' || Number(newItemPrice) < 0)) {
      alert('価格は0以上の数値を入力してください');
      return;
    }
    const payload: { name: string; display_order: number; is_active: boolean; price?: number; match_text?: string; color_key?: string } = {
      name,
      display_order: maxOrder + 1,
      is_active: true,
    };
    if (isPriceTab) payload.price = Number(newItemPrice || 0);
    if (isCalendarColorTab) {
      payload.match_text = name;
      payload.color_key = newColorKey;
    }

    const { error } = await supabase
      .from(targetTable)
      .insert([payload]);

    if (!error) {
      setNewItemName('');
      setNewItemPrice('');
      setNewColorKey('red');
      fetchData(targetTable);
      window.dispatchEvent(new Event('masters-updated'));
    } else {
      alert(`登録失敗: ${error.message}`);
    }
  };

  const moveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const current = items[index];
    const target = items[targetIndex];

    await supabase.from(activeTab).update({ display_order: target.display_order }).eq('id', current.id);
    await supabase.from(activeTab).update({ display_order: current.display_order }).eq('id', target.id);
    
    fetchData(activeTab);
    window.dispatchEvent(new Event('masters-updated'));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('完全に消去しますか？')) return;
    const { error } = await supabase.from(activeTab).delete().eq('id', id);
    if (!error) {
      fetchData(activeTab);
      window.dispatchEvent(new Event('masters-updated'));
    }
  };

  const handleUpdate = async (id: string) => {
    if (isPriceTab && (editingPrice.trim() === '' || Number(editingPrice) < 0)) {
      alert('価格は0以上の数値を入力してください');
      return;
    }
    const patch: { name: string; price?: number; match_text?: string; color_key?: string } = { name: editingName };
    if (isPriceTab) patch.price = Number(editingPrice || 0);
    if (isCalendarColorTab) {
      patch.match_text = editingName;
      patch.color_key = editingColorKey;
    }
    const { error } = await supabase.from(activeTab).update(patch).eq('id', id);
    if (!error) {
      setEditingId(null);
      fetchData(activeTab);
      window.dispatchEvent(new Event('masters-updated'));
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="text-blue-600" size={24} />
        <h2 className="text-xl font-bold text-gray-800">マスター管理</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as TableName)}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold transition-all ${
              activeTab === tab.id ? 'bg-cyan-500 text-white shadow-md' : 'bg-gray-100 text-gray-500'
            }`}
          >
            <tab.icon size={16} />
            <span className="text-xs">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="border-2 border-green-500 rounded-2xl p-4 bg-green-50 mb-6">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder={isCalendarColorTab ? 'メモに含まれる文字（例: 新規）' : `${tabs.find(t => t.id === activeTab)?.label}に新規追加`}
            className="flex-1 p-3 rounded-xl border-none outline-none shadow-sm"
          />
          {isCalendarColorTab && (
            <>
              <select
                value={newColorKey}
                onChange={(e) => setNewColorKey(e.target.value)}
                className="w-28 p-3 rounded-xl border-none outline-none shadow-sm font-bold"
              >
                {COLOR_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </>
          )}
          {isPriceTab && (
            <input
              type="number"
              min="0"
              step="1"
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              placeholder="価格"
              className="w-32 p-3 rounded-xl border-none outline-none shadow-sm"
            />
          )}
          <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-1 hover:bg-green-700">
            <Plus size={20} /> 追加
          </button>
        </form>
      </div>

      <div className="panel-scrollbar space-y-2 max-h-[42rem] overflow-y-auto pr-1">
        {isLoading ? ( <div className="text-center py-10 font-bold text-gray-400">通信中...</div> ) : (
          items.map((item, index) => (
            <div key={item.id} className="flex items-center justify-between p-4 bg-white border rounded-xl shadow-sm">
              <div className="flex items-center gap-4 flex-1">
                <div className="flex flex-col">
                  <button type="button" onClick={() => moveOrder(index, 'up')} disabled={index === 0} className="disabled:opacity-10 text-gray-400"><ChevronUp size={18} /></button>
                  <button type="button" onClick={() => moveOrder(index, 'down')} disabled={index === items.length - 1} className="disabled:opacity-10 text-gray-400"><ChevronDown size={18} /></button>
                </div>
                {editingId === item.id ? (
                  <div className="flex-1 flex flex-wrap gap-2">
                    <input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="flex-1 p-2 border-2 border-blue-400 rounded-lg outline-none" autoFocus />
                    {isCalendarColorTab && (
                      <>
                        <select
                          value={editingColorKey}
                          onChange={(e) => setEditingColorKey(e.target.value)}
                          className="w-28 p-2 border-2 border-blue-300 rounded-lg outline-none font-bold"
                        >
                          {COLOR_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                      </>
                    )}
                    {isPriceTab && (
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={editingPrice}
                        onChange={(e) => setEditingPrice(e.target.value)}
                        className="w-32 p-2 border-2 border-blue-300 rounded-lg outline-none"
                      />
                    )}
                    <button type="button" onClick={() => handleUpdate(item.id)} className="text-green-600"><Check /></button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-red-600"><X /></button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-bold text-gray-700">{item.name}</span>
                    {isCalendarColorTab && (
                      <>
                        <span className="text-xs text-gray-500">メモ文字: {item.match_text || item.name}</span>
                        <span className={`text-xs font-bold border rounded px-2 py-0.5 ${colorOptionClass(item.color_key)}`}>
                          {COLOR_OPTIONS.find((c) => c.key === item.color_key)?.label || item.color_key || '赤'}
                        </span>
                      </>
                    )}
                    {isPriceTab && (
                      <span className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                        ¥{Number(item.price || 0).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditingName(item.match_text || item.name);
                    setEditingPrice(String(Number(item.price || 0)));
                    setEditingColorKey(item.color_key || 'red');
                  }}
                  className="p-2 text-gray-400 hover:text-blue-600"
                >
                  <Edit2 size={16} />
                </button>
                <button type="button" onClick={() => handleDelete(item.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}