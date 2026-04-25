import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, Plus, Trash2, Edit2, Check, X, ClipboardList, CreditCard, Clock, Users, LayoutGrid, Megaphone, Repeat, Target, ChevronUp, ChevronDown } from 'lucide-react';

type TableName = 'menu_master' | 'payment_detail_master' | 'payment_method_master' | 'product_master' | 'subscription_master' | 'staff_master' | 'main_complaint_master' | 'referral_source_master';

export default function MasterManagement() {
  const [activeTab, setActiveTab] = useState<TableName>('menu_master');
  const [items, setItems] = useState<any[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 【物理固定】看板とテーブルの紐付け。ここが生命線です。
  const tabs = [
    { id: 'menu_master', label: '実施メニュー', icon: ClipboardList },
    { id: 'payment_method_master', label: '支払方法', icon: CreditCard },
    { id: 'payment_detail_master', label: '種類', icon: Clock },
    { id: 'product_master', label: '物販単価', icon: LayoutGrid },
    { id: 'subscription_master', label: 'サブスク', icon: Repeat },
    { id: 'staff_master', label: 'スタッフ', icon: Users },
    { id: 'main_complaint_master', label: '主訴', icon: Target },
    { id: 'referral_source_master', label: '流入経路', icon: Megaphone },
  ];

  // 切り替え時に前のデータを完全に殺す
  useEffect(() => {
    setItems([]); 
    setEditingId(null);
    setNewItemName('');
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

    const { error } = await supabase
      .from(targetTable)
      .insert([{ name, display_order: maxOrder + 1, is_active: true }]);

    if (!error) {
      setNewItemName('');
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
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('完全に消去しますか？')) return;
    const { error } = await supabase.from(activeTab).delete().eq('id', id);
    if (!error) fetchData(activeTab);
  };

  const handleUpdate = async (id: string) => {
    const { error } = await supabase.from(activeTab).update({ name: editingName }).eq('id', id);
    if (!error) { setEditingId(null); fetchData(activeTab); }
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
            placeholder={`${tabs.find(t => t.id === activeTab)?.label}に新規追加`}
            className="flex-1 p-3 rounded-xl border-none outline-none shadow-sm"
          />
          <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-1 hover:bg-green-700">
            <Plus size={20} /> 追加
          </button>
        </form>
      </div>

      <div className="space-y-2">
        {isLoading ? ( <div className="text-center py-10 font-bold text-gray-400">通信中...</div> ) : (
          items.map((item, index) => (
            <div key={item.id} className="flex items-center justify-between p-4 bg-white border rounded-xl shadow-sm">
              <div className="flex items-center gap-4 flex-1">
                <div className="flex flex-col">
                  <button type="button" onClick={() => moveOrder(index, 'up')} disabled={index === 0} className="disabled:opacity-10 text-gray-400"><ChevronUp size={18} /></button>
                  <button type="button" onClick={() => moveOrder(index, 'down')} disabled={index === items.length - 1} className="disabled:opacity-10 text-gray-400"><ChevronDown size={18} /></button>
                </div>
                {editingId === item.id ? (
                  <div className="flex-1 flex gap-2">
                    <input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="flex-1 p-2 border-2 border-blue-400 rounded-lg outline-none" autoFocus />
                    <button type="button" onClick={() => handleUpdate(item.id)} className="text-green-600"><Check /></button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-red-600"><X /></button>
                  </div>
                ) : (
                  <span className="font-bold text-gray-700">{item.name}</span>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setEditingId(item.id); setEditingName(item.name); }} className="p-2 text-gray-400 hover:text-blue-600"><Edit2 size={16} /></button>
                <button type="button" onClick={() => handleDelete(item.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}