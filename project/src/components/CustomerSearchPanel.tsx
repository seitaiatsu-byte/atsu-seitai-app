import { useState, useEffect, useRef, useCallback } from 'react';
import { Search } from 'lucide-react';
import type { Database } from '../lib/database.types';
import { fetchAllCustomersByCreatedDesc } from '../lib/fetchAllCustomers';
import { ClinicNameFromCustomer } from './ClinicNameDisplay';
import { isPlaceholderCustomerNumber } from '../lib/customerNumber';
import { getPhoneWithMemoFallback } from '../lib/customerDisplayFields';
import { searchCustomersSorted } from '../lib/customerSearchMatch';
import { focusWithJapaneseIme } from '../lib/useJapaneseTextInputs';
import PersonSearchInput from './PersonSearchInput';

export type CustomerRow = Database['public']['Tables']['customers']['Row'];

type Accent = 'blue' | 'orange' | 'purple';

interface CustomerSearchPanelProps {
  accent: Accent;
  onSelect: (customer: CustomerRow) => void;
  selectedCustomer: CustomerRow | null;
  onClearSelection: () => void;
  /** 増えるたびに検索欄へフォーカス（来院登録完了後の連続入力など） */
  focusSearchSignal?: number;
  /** select=入力フォーム用 / lookup=ホーム等の照会のみ */
  mode?: 'select' | 'lookup';
  /** lookup 時に個人カルテへ */
  onOpenChart?: (customer: CustomerRow) => void;
  /** ホーム用のコンパクト1行リスト */
  compact?: boolean;
}

function focusCustomerSearchInput(el: HTMLInputElement | null) {
  if (!el) return;
  const run = () => {
    try {
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
    } catch {
      /* ignore */
    }
    focusWithJapaneseIme(el);
  };
  // 登録直後はレイアウト更新を待ってからフォーカス（スマホでキーボードが出やすくする）
  const delay =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 400 : 0;
  if (delay > 0) {
    window.setTimeout(run, delay);
  } else {
    run();
  }
}

const border: Record<Accent, string> = {
  blue: 'border-blue-300 focus:border-blue-500',
  orange: 'border-orange-300 focus:border-orange-500',
  purple: 'border-purple-300 focus:border-purple-500',
};

const listBorder: Record<Accent, string> = {
  blue: 'border-blue-300',
  orange: 'border-orange-300',
  purple: 'border-purple-300',
};

const hoverBg: Record<Accent, string> = {
  blue: 'hover:bg-blue-50',
  orange: 'hover:bg-orange-50',
  purple: 'hover:bg-purple-50',
};

const ringHighlight: Record<Accent, string> = {
  blue: 'ring-2 ring-blue-500 bg-blue-50',
  orange: 'ring-2 ring-orange-500 bg-orange-50',
  purple: 'ring-2 ring-purple-500 bg-purple-50',
};

export default function CustomerSearchPanel({
  accent,
  onSelect,
  selectedCustomer,
  onClearSelection,
  focusSearchSignal = 0,
  mode = 'select',
  onOpenChart,
  compact = false,
}: CustomerSearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [allCustomers, setAllCustomers] = useState<CustomerRow[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadCustomers = useCallback(async () => {
    try {
      const rows = await fetchAllCustomersByCreatedDesc();
      setAllCustomers(rows);
    } catch (error) {
      console.error('顧客一覧の取得エラー:', error);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
    const onCustomersUpdated = () => {
      void loadCustomers();
    };
    window.addEventListener('customers-updated', onCustomersUpdated);
    return () => window.removeEventListener('customers-updated', onCustomersUpdated);
  }, [loadCustomers]);

  const searchCustomers = useCallback((q: string) => {
    setIsSearching(true);
    setSearchResults(searchCustomersSorted(allCustomers, q, { deprioritizePlaceholder: true }));
    setHighlightIndex(0);
    setIsSearching(false);
  }, [allCustomers]);

  useEffect(() => {
    if (searchQuery.length >= 1) {
      const t = setTimeout(() => searchCustomers(searchQuery), 200);
      return () => clearTimeout(t);
    }
    setSearchResults([]);
    return undefined;
  }, [searchQuery, searchCustomers]);

  const selectCustomer = (customer: CustomerRow) => {
    onSelect(customer);
    setSearchQuery('');
    setSearchResults([]);
    setHighlightIndex(0);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = searchResults[highlightIndex];
      if (row) selectCustomer(row);
    } else if (e.key === 'Escape') {
      setSearchResults([]);
      setHighlightIndex(0);
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${highlightIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, searchResults]);

  useEffect(() => {
    if (mode === 'lookup') return;
    if (selectedCustomer) return;
    focusCustomerSearchInput(searchInputRef.current);
  }, [selectedCustomer, mode]);

  useEffect(() => {
    if (mode === 'lookup') return;
    if (!focusSearchSignal || selectedCustomer) return;
    focusCustomerSearchInput(searchInputRef.current);
  }, [focusSearchSignal, selectedCustomer, mode]);

  const formatTown = (customer: CustomerRow) => {
    const city = String(customer.city || '').trim();
    const town = String(customer.town || '').trim();
    if (city && town) return `${city}${town}`;
    return city || town || '';
  };

  const renderResultMeta = (customer: CustomerRow) => {
    const phone = getPhoneWithMemoFallback(customer) || '—';
    const town = formatTown(customer) || '—';
    if (compact) {
      return (
        <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-600 mt-0.5 flex-wrap">
          <span className="shrink-0 font-mono text-blue-700 tabular-nums">
            顧客番号: {customer.customer_number ?? '—'}
          </span>
          <span className="truncate">{customer.name_kana || customer.kana || '—'}</span>
          <span className="shrink-0">{phone}</span>
          <span className="shrink-0 max-w-[5rem] truncate">{town}</span>
        </div>
      );
    }
    return (
      <>
        <div className="text-sm text-gray-600">{customer.name_kana || customer.kana}</div>
        <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>顧客番号: {customer.customer_number}</span>
          <span>電話: {phone}</span>
          {town !== '—' && <span>住所: {town}</span>}
          <ClinicNameFromCustomer customer={customer} />
        </div>
      </>
    );
  };

  if (selectedCustomer) {
    return (
      <div
        className={`mb-6 rounded-lg p-4 border-2 ${
          accent === 'blue'
            ? 'bg-gradient-to-r from-blue-50 to-green-50 border-blue-200'
            : accent === 'orange'
              ? 'bg-gradient-to-r from-orange-50 to-yellow-50 border-orange-200'
              : 'bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-gray-800 flex items-center gap-2 flex-wrap">
              {selectedCustomer.name}
              {isPlaceholderCustomerNumber(selectedCustomer.customer_number) && (
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">仮予約</span>
              )}
            </div>
            <div className="text-sm text-gray-600">{selectedCustomer.name_kana}</div>
            <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>顧客番号: {selectedCustomer.customer_number}</span>
              <span>電話: {getPhoneWithMemoFallback(selectedCustomer) || '—'}</span>
              {formatTown(selectedCustomer) && <span>住所: {formatTown(selectedCustomer)}</span>}
              <ClinicNameFromCustomer customer={selectedCustomer} />
            </div>
            {typeof selectedCustomer.points === 'number' && (
              <div className="text-sm font-bold text-blue-600 mt-2">保有ポイント: {selectedCustomer.points || 0} pt</div>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {mode === 'lookup' && onOpenChart && (
              <button
                type="button"
                onClick={() => onOpenChart(selectedCustomer)}
                className="px-3 py-2 rounded-lg font-bold border transition-colors bg-blue-600 text-white border-blue-600 hover:bg-blue-700 text-sm"
              >
                個人カルテ
              </button>
            )}
            <button
              type="button"
              onClick={onClearSelection}
              className={`px-4 py-2 rounded-lg font-bold border transition-colors bg-white ${
                accent === 'blue'
                  ? 'text-blue-600 border-blue-300 hover:bg-blue-50'
                  : accent === 'orange'
                    ? 'text-orange-600 border-orange-300 hover:bg-orange-50'
                    : 'text-purple-600 border-purple-300 hover:bg-purple-50'
              }`}
            >
              変更
            </button>
          </div>
        </div>
      </div>
    );
  }

  const searchLabel =
    mode === 'lookup' ? '顧客を探す（氏名・かな・電話・町名）' : '顧客を検索（氏名・かな・電話・町名）';
  const searchPlaceholder =
    mode === 'lookup' ? '氏名・かな・電話4桁以上・町名' : '氏名・かな・電話・町名で検索';

  return (
    <div className={compact ? 'mb-0' : 'mb-6'}>
      <label className={`block font-bold text-gray-700 mb-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
        <Search className="inline mr-1.5" size={compact ? 14 : 16} />
        {searchLabel}
      </label>
      <div className="relative">
        <PersonSearchInput
          ref={searchInputRef}
          value={searchQuery}
          onChange={setSearchQuery}
          onKeyDown={onSearchKeyDown}
          placeholder={searchPlaceholder}
          className={`w-full border-2 rounded-lg outline-none ${compact ? 'px-3 py-2 text-sm' : 'px-4 py-3'} ${border[accent]}`}
          role="combobox"
          aria-expanded={searchResults.length > 0}
          aria-activedescendant={searchResults.length ? `cust-opt-${highlightIndex}` : undefined}
        />
        {isSearching && <div className="absolute right-3 top-3 text-gray-400 text-sm">検索中...</div>}
      </div>

      {searchResults.length > 0 && (
        <div
          ref={listRef}
          role="listbox"
          className={`mt-1.5 bg-white border-2 rounded-lg shadow-lg overflow-y-auto ${listBorder[accent]} ${
            compact ? 'max-h-52' : 'max-h-80'
          }`}
        >
          {searchResults.map((customer, idx) => (
            <button
              key={customer.id}
              type="button"
              role="option"
              id={`cust-opt-${idx}`}
              data-idx={idx}
              aria-selected={idx === highlightIndex}
              onClick={() => selectCustomer(customer)}
              onMouseEnter={() => setHighlightIndex(idx)}
              className={`w-full text-left border-b border-gray-100 last:border-0 transition-colors ${hoverBg[accent]} ${
                compact ? 'px-2.5 py-1.5' : 'px-4 py-3'
              } ${idx === highlightIndex ? ringHighlight[accent] : ''}`}
            >
              <div className={`font-bold text-gray-800 flex items-center gap-2 flex-wrap ${compact ? 'text-xs' : ''}`}>
                {customer.name}
                {isPlaceholderCustomerNumber(customer.customer_number) && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">仮予約</span>
                )}
              </div>
              {renderResultMeta(customer)}
            </button>
          ))}
        </div>
      )}

      {searchQuery.length >= 1 && !isSearching && searchResults.length === 0 && (
        <div className="mt-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-gray-700">
          該当する顧客が見つかりません
        </div>
      )}
    </div>
  );
}
