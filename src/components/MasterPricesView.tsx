import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Edit3,
  Plus,
  Search,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import {
  COST_CATEGORIES,
  type CostCategory,
  type CostCurrency,
  type MasterPrice,
} from '../types/erp';
import { generateUuid } from '../utils/pdfParser';
import { formatKrw, formatUsd } from '../utils/storage';
import { MASTER_PRICES_SETUP_SQL } from '../services/masterPricesService';

interface MasterPricesViewProps {
  masterPrices: MasterPrice[];
  tableWarning?: string;
  onAddMasterPrice: (item: MasterPrice) => Promise<void> | void;
  onUpdateMasterPrice: (item: MasterPrice) => Promise<void> | void;
  onDeleteMasterPrice: (id: string) => Promise<void> | void;
}

const CURRENCY_OPTIONS: CostCurrency[] = ['USD', 'VND', 'KRW'];

function formatPriceByCurrency(amount: number, currency: CostCurrency): string {
  const safe = Number(amount) || 0;
  if (currency === 'VND') {
    return `${new Intl.NumberFormat('ko-KR').format(Math.round(safe))} VND`;
  }
  if (currency === 'KRW') {
    return formatKrw(safe);
  }
  return formatUsd(safe);
}

const CATEGORY_BADGE_CLASS: Record<CostCategory, string> = {
  숙박: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  골프장: 'bg-amber-50 text-amber-900 border-amber-200',
  차량: 'bg-sky-50 text-sky-800 border-sky-200',
  가이드: 'bg-emerald-50 text-[#065F46] border-emerald-200',
  식사: 'bg-orange-50 text-orange-800 border-orange-200',
  '마사지/옵션': 'bg-purple-50 text-purple-800 border-purple-200',
  기타: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const MasterPricesView: React.FC<MasterPricesViewProps> = ({
  masterPrices,
  tableWarning,
  onAddMasterPrice,
  onUpdateMasterPrice,
  onDeleteMasterPrice,
}) => {
  const safePrices = Array.isArray(masterPrices) ? masterPrices : [];

  const [categoryFilter, setCategoryFilter] = useState<'전체' | CostCategory>('전체');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSqlBox, setShowSqlBox] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Add form state
  const [newCategory, setNewCategory] = useState<CostCategory>('골프장');
  const [newKeyword, setNewKeyword] = useState('');
  const [newVendor, setNewVendor] = useState('');
  const [newCurrency, setNewCurrency] = useState<CostCurrency>('USD');
  const [newWeekdayPrice, setNewWeekdayPrice] = useState<string>('');
  const [newWeekendPrice, setNewWeekendPrice] = useState<string>('');
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<MasterPrice | null>(null);

  const filteredPrices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return safePrices.filter((item) => {
      if (!item) return false;
      if (categoryFilter !== '전체' && item.category !== categoryFilter) return false;
      if (!q) return true;
      const hay = `${item.keyword} ${item.vendorName || ''} ${item.category} ${item.note || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [safePrices, categoryFilter, searchQuery]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKw = newKeyword.trim();
    if (!trimmedKw) {
      setFormError('자동 매칭 키워드(예: 롱탄 CC, 렉스 호텔)를 입력해 주세요.');
      return;
    }

    const weekday = Math.max(0, Number(newWeekdayPrice) || 0);
    const weekend = Math.max(0, Number(newWeekendPrice) || 0);
    if (weekday === 0 && weekend === 0) {
      setFormError('주중 원가 또는 주말 원가 중 하나 이상을 0보다 크게 입력해 주세요.');
      return;
    }

    setFormError('');
    setSubmitting(true);
    try {
      const item: MasterPrice = {
        id: generateUuid(),
        createdAt: new Date().toISOString(),
        category: newCategory,
        keyword: trimmedKw,
        vendorName: newVendor.trim(),
        weekdayPrice: weekday,
        weekendPrice: weekend > 0 ? weekend : weekday,
        currency: newCurrency,
        note: newNote.trim(),
      };
      await onAddMasterPrice(item);
      setNewKeyword('');
      setNewVendor('');
      setNewWeekdayPrice('');
      setNewWeekendPrice('');
      setNewNote('');
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (item: MasterPrice) => {
    setEditingId(item.id);
    setEditDraft({ ...item });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEditing = async () => {
    if (!editDraft) return;
    if (!editDraft.keyword.trim()) return;
    await onUpdateMasterPrice({
      ...editDraft,
      keyword: editDraft.keyword.trim(),
      vendorName: (editDraft.vendorName || '').trim(),
      weekdayPrice: Math.max(0, Number(editDraft.weekdayPrice) || 0),
      weekendPrice: Math.max(0, Number(editDraft.weekendPrice) || 0),
      note: (editDraft.note || '').trim(),
    });
    setEditingId(null);
    setEditDraft(null);
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(MASTER_PRICES_SETUP_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Optional Supabase Table Notice */}
      {tableWarning && (
        <div className="mx-3 sm:mx-0 bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start gap-2.5 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
              <span>{tableWarning}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowSqlBox((prev) => !prev)}
              className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-xl hover:bg-amber-100/50 transition-colors whitespace-nowrap cursor-pointer"
            >
              {showSqlBox ? 'SQL 닫기' : 'Supabase 테이블 SQL 보기'}
            </button>
          </div>
          {showSqlBox && (
            <div className="relative bg-slate-900 text-slate-100 rounded-xl p-3.5 text-[11px] font-mono overflow-x-auto">
              <button
                type="button"
                onClick={handleCopySql}
                className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-semibold bg-slate-700 hover:bg-slate-600 text-white rounded-lg cursor-pointer"
              >
                {copiedSql ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSql ? '복사됨' : 'SQL 복사'}</span>
              </button>
              <pre className="pr-24 whitespace-pre-wrap">{MASTER_PRICES_SETUP_SQL}</pre>
            </div>
          )}
        </div>
      )}

      {/* Top Info + Add Standard Price Form */}
      <section className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <Tags className="w-4 h-4 text-[#065F46]" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                거래처 · 항목별 표준 단가표 등록 (master_prices)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              견적서 PDF/이미지 업로드 시 원가 항목명이나 골프장 이름에 키워드가 포함되면, 진행일(service_date) 기준 평일(월~목)·주말(금~일) 표준 단가가 $0 대신 자동 입력됩니다.
            </p>
          </div>
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-[#065F46] border border-emerald-200 whitespace-nowrap">
            등록 단가 {safePrices.length}건
          </span>
        </div>

        <form onSubmit={handleCreate} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                카테고리
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as CostCategory)}
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#065F46]"
              >
                {COST_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                매칭 키워드 (쉼표로 복수 지정 가능)
              </label>
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="예: 롱탄 CC, 롱탄 골프"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#065F46]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                거래처명 (선택)
              </label>
              <input
                type="text"
                value={newVendor}
                onChange={(e) => setNewVendor(e.target.value)}
                placeholder="예: 롱탄 골프 리조트"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#065F46]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                통화
              </label>
              <select
                value={newCurrency}
                onChange={(e) => setNewCurrency(e.target.value as CostCurrency)}
                className="w-full px-3 py-2 text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#065F46]"
              >
                {CURRENCY_OPTIONS.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                비고 (선택)
              </label>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="예: 18홀 그린피+카트"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#065F46]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                주중 원가 (월~목 · {newCurrency})
              </label>
              <input
                type="number"
                min={0}
                step={newCurrency === 'USD' ? 'any' : 1000}
                value={newWeekdayPrice}
                onChange={(e) => setNewWeekdayPrice(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-xs font-mono font-semibold text-right bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#065F46]"
              />
            </div>

            <div className="w-40">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                주말 원가 (금~일 · {newCurrency})
              </label>
              <input
                type="number"
                min={0}
                step={newCurrency === 'USD' ? 'any' : 1000}
                value={newWeekendPrice}
                onChange={(e) => setNewWeekendPrice(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-xs font-mono font-semibold text-right bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#065F46]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#065F46] hover:bg-[#054e3a] rounded-xl transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>표준 단가 등록</span>
            </button>
          </div>

          {formError && (
            <p className="text-xs font-medium text-red-600">{formError}</p>
          )}
        </form>
      </section>

      {/* Master Prices Table */}
      <section className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['전체', ...COST_CATEGORIES] as const).map((cat) => {
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#065F46] text-white border-[#065F46]'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="키워드, 거래처, 비고 검색..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl w-full focus:outline-none focus:bg-white focus:border-[#065F46]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                <th className="py-3 px-4 sm:px-6 whitespace-nowrap">카테고리</th>
                <th className="py-3 px-4 whitespace-nowrap">매칭 키워드 · 거래처</th>
                <th className="py-3 px-4 whitespace-nowrap">통화</th>
                <th className="py-3 px-4 whitespace-nowrap text-right">주중 원가 (월~목)</th>
                <th className="py-3 px-4 whitespace-nowrap text-right">주말 원가 (금~일)</th>
                <th className="py-3 px-4 whitespace-nowrap">비고</th>
                <th className="py-3 px-4 sm:px-6 whitespace-nowrap text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredPrices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    등록된 표준 단가가 없습니다. 상단에서 거래처/항목별 단가를 등록해 주세요.
                  </td>
                </tr>
              ) : (
                filteredPrices.map((item) => {
                  const isEditing = editingId === item.id && editDraft;

                  if (isEditing && editDraft) {
                    return (
                      <tr key={item.id} className="bg-emerald-50/30">
                        <td className="py-3 px-4 sm:px-6 whitespace-nowrap">
                          <select
                            value={editDraft.category}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                category: e.target.value as CostCategory,
                              })
                            }
                            className="px-2 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg"
                          >
                            {COST_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4 space-y-1">
                          <input
                            type="text"
                            value={editDraft.keyword}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, keyword: e.target.value })
                            }
                            placeholder="키워드"
                            className="w-full px-2 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg"
                          />
                          <input
                            type="text"
                            value={editDraft.vendorName || ''}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, vendorName: e.target.value })
                            }
                            placeholder="거래처명"
                            className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg"
                          />
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <select
                            value={editDraft.currency}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                currency: e.target.value as CostCurrency,
                              })
                            }
                            className="px-2 py-1 text-xs font-mono font-semibold bg-white border border-slate-200 rounded-lg"
                          >
                            {CURRENCY_OPTIONS.map((cur) => (
                              <option key={cur} value={cur}>
                                {cur}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <input
                            type="number"
                            min={0}
                            step={editDraft.currency === 'USD' ? 'any' : 1000}
                            value={editDraft.weekdayPrice}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                weekdayPrice: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-28 px-2 py-1 text-right font-mono font-semibold bg-white border border-slate-200 rounded-lg"
                          />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <input
                            type="number"
                            min={0}
                            step={editDraft.currency === 'USD' ? 'any' : 1000}
                            value={editDraft.weekendPrice}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                weekendPrice: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-28 px-2 py-1 text-right font-mono font-semibold bg-white border border-slate-200 rounded-lg"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={editDraft.note || ''}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, note: e.target.value })
                            }
                            className="w-full min-w-[120px] px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                          />
                        </td>
                        <td className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={saveEditing}
                              className="p-1.5 text-white bg-[#065F46] hover:bg-[#054e3a] rounded-lg cursor-pointer"
                              aria-label="저장"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditing}
                              className="p-1.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                              aria-label="취소"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-semibold border rounded-md ${
                            CATEGORY_BADGE_CLASS[item.category]
                          }`}
                        >
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{item.keyword}</div>
                        {item.vendorName && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {item.vendorName}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono font-semibold text-slate-700">
                        {item.currency}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-right font-mono font-semibold text-slate-900">
                        {formatPriceByCurrency(item.weekdayPrice, item.currency)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-right font-mono font-semibold text-[#D97706]">
                        {formatPriceByCurrency(item.weekendPrice, item.currency)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 max-w-[200px] truncate">
                        {item.note || '-'}
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditing(item)}
                            className="p-1.5 text-slate-500 hover:text-[#065F46] hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            aria-label="단가 수정"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteMasterPrice(item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            aria-label="단가 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
