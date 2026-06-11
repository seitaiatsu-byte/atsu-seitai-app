import { useState, useEffect, useRef, useCallback } from 'react';
import { Search } from 'lucide-react';
import type { Database } from '../lib/database.types';
import { fetchAllCustomersByCreatedDesc } from '../lib/fetchAllCustomers';
import { ClinicNameFromCustomer } from './ClinicNameDisplay';
import { isPlaceholderCustomerNumber } from '../lib/customerNumber';
import { normalizePersonSearchText } from '../lib/personSearchText';
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
    const nq = normalizePersonSearchText(q);
    const nqHira = nq;
    const stripped = nq.replace(/\s/g, '');
    const digits = stripped.replace(/\D/g, '');
    const isPureNumeric = stripped.length > 0 && /^\d+$/.test(stripped);

    type Scored = { row: CustomerRow; tier: number };
    const scored: Scored[] = [];

    for (const c of allCustomers) {
      const name = normalizePersonSearchText(c.name || '');
      const kana = normalizePersonSearchText(c.name_kana || c.kana || '');
      const nameHira = name;
      const kanaHira = kana;
      const numberRaw = normalizePersonSearchText(c.customer_number || '');
      const numberDigits = numberRaw.replace(/\D/g, '');

      let tier: number | null = null;

      if (digits.length > 0) {
        if (numberDigits === digits) tier = 0;
        else if (numberDigits.startsWith(digits)) tier = 1;
        else if (numberDigits.includes(digits)) tier = 2;
      }

      if (!isPureNumeric) {
        if (tier === null && nq.length > 0) {
          if (numberRaw === nq) tier = 0;
          else if (numberRaw.startsWith(nq)) tier = 2;
        }
        if (name.includes(nq) || kana.includes(nq) || nameHira.includes(nqHira) || kanaHira.includes(nqHira)) {
          tier = tier === null ? 10 : Math.min(tier, 10);
        }
      }

      if (tier !== null) {
        const placeholder = isPlaceholderCustomerNumber(c.customer_number);
        scored.push({ row: c, tier: placeholder ? tier + 1000 : tier });
      }
    }

    scored.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const an = normalizePersonSearchText(a.row.customer_number || '').replace(/\D/g, '') || '';
      const bn = normalizePersonSearchText(b.row.customer_number || '').replace(/\D/g, '') || '';
      if (an !== bn) return an.localeCompare(bn, undefined, { numeric: true });
      return (a.row.name || '').localeCompare(b.row.name || '');
    });

    const maxResults = 200;
    setSearchResults(scored.slice(0, maxResults).map((s) => s.row));
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
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${highlightIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, searchResults]);

  useEffect(() => {
    if (selectedCustomer) return;
    focusCustomerSearchInput(searchInputRef.current);
  }, [selectedCustomer]);

  useEffect(() => {
    if (!focusSearchSignal || selectedCustomer) return;
    focusCustomerSearchInput(searchInputRef.current);
  }, [focusSearchSignal, selectedCustomer]);

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
            <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-1">
              <span>顧客番号: {selectedCustomer.customer_number} |</span>
              <ClinicNameFromCustomer customer={selectedCustomer} />
            </div>
            {typeof selectedCustomer.points === 'number' && (
              <div className="text-sm font-bold text-blue-600 mt-2">保有ポイント: {selectedCustomer.points || 0} pt</div>
            )}
          </div>
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
    );
  }

  return (
    <div className="mb-6">
      <label className="block text-sm font-bold text-gray-700 mb-2">
        <Search className="inline mr-2" size={16} />
        顧客を検索（氏名・ふりがな・顧客番号）
      </label>
      <div className="relative">
        <PersonSearchInput
          ref={searchInputRef}
          value={searchQuery}
          onChange={setSearchQuery}
          onKeyDown={onSearchKeyDown}
          placeholder="ふりがなで検索（例: たなか）"
          className={`w-full px-4 py-3 border-2 rounded-lg outline-none ${border[accent]}`}
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
          className={`mt-2 bg-white border-2 rounded-lg shadow-lg max-h-80 overflow-y-auto ${listBorder[accent]}`}
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
              className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 transition-colors ${hoverBg[accent]} ${
                idx === highlightIndex ? ringHighlight[accent] : ''
              }`}
            >
              <div className="font-bold text-gray-800 flex items-center gap-2 flex-wrap">
                {customer.name}
                {isPlaceholderCustomerNumber(customer.customer_number) && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">仮予約</span>
                )}
              </div>
              <div className="text-sm text-gray-600">{customer.name_kana}</div>
              <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-1">
                <span>顧客番号: {customer.customer_number} |</span>
                <ClinicNameFromCustomer customer={customer} />
              </div>
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
