import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  COST_CATEGORIES,
  type CostCategory,
  type CostCurrency,
  type CostItem,
  type Reservation,
} from '../types/erp';
import {
  calculateReservationFinance,
  convertCostAmount,
  DEFAULT_KRW_RATE,
  DEFAULT_VND_RATE,
  formatKrw,
  formatUsd,
  getCostItemCurrency,
  getCostItemOriginalAmount,
  isBookingCancelled,
  recalculateCostItemsWithRates,
} from '../utils/storage';

const AutoSizeTitle: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => {
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
        onChange(e.target.value);
      }}
      className="w-full px-2 py-0.5 text-xs font-semibold text-slate-900 leading-relaxed bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-[#065F46] rounded-lg focus:outline-none resize-none overflow-hidden"
    />
  );
};

interface FinanceViewProps {
  reservations: Reservation[];
  onUpdateReservation: (id: string, updates: Partial<Reservation>) => void;
}

const CURRENCY_OPTIONS: Array<{ value: CostCurrency; label: string; symbol: string }> = [
  { value: 'USD', label: 'USD', symbol: '$' },
  { value: 'VND', label: 'VND', symbol: '₫' },
  { value: 'KRW', label: 'KRW', symbol: '₩' },
];

export const FinanceView: React.FC<FinanceViewProps> = ({
  reservations,
  onUpdateReservation,
}) => {
  const safeReservations = Array.isArray(reservations) ? reservations : [];

  const activeReservations = useMemo(
    () => safeReservations.filter((r) => r && !isBookingCancelled(r)),
    [safeReservations]
  );

  const [selectedId, setSelectedId] = useState<string>(
    () => activeReservations[0]?.id || ''
  );

  const selectedReservation =
    activeReservations.find((r) => r.id === selectedId) || activeReservations[0] || null;

  const currentKrwRate =
    Number(selectedReservation?.exchangeRate) > 0
      ? Number(selectedReservation?.exchangeRate)
      : DEFAULT_KRW_RATE;
  const currentVndRate =
    Number(selectedReservation?.vndExchangeRate) > 0
      ? Number(selectedReservation?.vndExchangeRate)
      : DEFAULT_VND_RATE;

  const overallStats = useMemo(() => {
    let totalRevenueUsd = 0;
    let totalRevenueKrw = 0;
    let totalCostUsd = 0;
    let totalCostKrw = 0;
    let unpaidCount = 0;

    activeReservations.forEach((r) => {
      const fin = calculateReservationFinance(r);
      totalRevenueUsd += Number(r.totalPriceUsd) || 0;
      totalRevenueKrw += Number(r.totalPriceKrw) || 0;
      totalCostUsd += fin.totalCostUsd;
      totalCostKrw += fin.totalCostKrw;
      if (fin.isUnpaid) unpaidCount += 1;
    });

    const netProfitUsd = totalRevenueUsd - totalCostUsd;
    const netProfitKrw = totalRevenueKrw - totalCostKrw;
    const marginPercent = totalRevenueKrw > 0 ? (netProfitKrw / totalRevenueKrw) * 100 : 0;

    return {
      totalRevenueUsd,
      totalRevenueKrw,
      totalCostUsd,
      totalCostKrw,
      netProfitUsd,
      netProfitKrw,
      marginPercent,
      unpaidCount,
    };
  }, [activeReservations]);

  const handleRatesChange = (
    res: Reservation,
    nextKrwRate: number,
    nextVndRate: number
  ) => {
    const safeKrw = nextKrwRate > 0 ? nextKrwRate : DEFAULT_KRW_RATE;
    const safeVnd = nextVndRate > 0 ? nextVndRate : DEFAULT_VND_RATE;
    const updatedCosts = recalculateCostItemsWithRates(res.costItems || [], safeKrw, safeVnd);
    const nextTotalPriceKrw = Math.round((Number(res.totalPriceUsd) || 0) * safeKrw);

    onUpdateReservation(res.id, {
      exchangeRate: safeKrw,
      vndExchangeRate: safeVnd,
      totalPriceKrw: nextTotalPriceKrw,
      costItems: updatedCosts,
    });
  };

  const handleApplyRatesToAll = () => {
    activeReservations.forEach((res) => {
      handleRatesChange(res, currentKrwRate, currentVndRate);
    });
  };

  const handleCostChange = (
    res: Reservation,
    costId: string,
    updates: Partial<CostItem>
  ) => {
    const currentCosts = Array.isArray(res.costItems) ? res.costItems : [];
    const nextCosts = currentCosts.map((item) =>
      item.id === costId ? { ...item, ...updates } : item
    );
    onUpdateReservation(res.id, { costItems: nextCosts });
  };

  const handleAddCostItem = (res: Reservation) => {
    const currentCosts = Array.isArray(res.costItems) ? res.costItems : [];
    const newItem: CostItem = {
      id: `cost-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: '추가 현지 지출 항목',
      category: '기타',
      source: '직접추가',
      serviceDate: res.startDate || new Date().toISOString().slice(0, 10),
      currency: 'USD',
      originalAmount: 0,
      costUsd: 0,
      costKrw: 0,
      paid: false,
      note: '',
    };
    onUpdateReservation(res.id, { costItems: [...currentCosts, newItem] });
  };

  const handleDeleteCostItem = (res: Reservation, costId: string) => {
    const currentCosts = Array.isArray(res.costItems) ? res.costItems : [];
    onUpdateReservation(res.id, {
      costItems: currentCosts.filter((c) => c.id !== costId),
    });
  };

  const selectedFinance = selectedReservation
    ? calculateReservationFinance(selectedReservation)
    : null;
  const selectedCostItems = Array.isArray(selectedReservation?.costItems)
    ? selectedReservation.costItems
    : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Exchange Rate Settings Bar */}
      <div className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
            환율 설정 (원화 자동 환산)
          </span>
          {selectedReservation && (
            <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
              · {selectedReservation.customerName} 고객님 건 적용중
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* KRW Exchange Rate */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl whitespace-nowrap">
            <span className="text-[11px] font-semibold text-slate-500">1 USD =</span>
            <input
              type="number"
              min={1}
              step={10}
              disabled={!selectedReservation}
              value={currentKrwRate}
              onChange={(e) => {
                if (!selectedReservation) return;
                const val = Number(e.target.value);
                handleRatesChange(
                  selectedReservation,
                  val > 0 ? val : DEFAULT_KRW_RATE,
                  currentVndRate
                );
              }}
              aria-label="KRW 환율"
              className="w-20 text-right text-xs font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 focus:outline-none focus:border-[#065F46]"
            />
            <span className="text-[11px] font-semibold text-slate-700">KRW</span>
          </div>

          {/* VND Exchange Rate */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl whitespace-nowrap">
            <span className="text-[11px] font-semibold text-slate-500">1 USD =</span>
            <input
              type="number"
              min={1}
              step={100}
              disabled={!selectedReservation}
              value={currentVndRate}
              onChange={(e) => {
                if (!selectedReservation) return;
                const val = Number(e.target.value);
                handleRatesChange(
                  selectedReservation,
                  currentKrwRate,
                  val > 0 ? val : DEFAULT_VND_RATE
                );
              }}
              aria-label="VND 환율"
              className="w-24 text-right text-xs font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 focus:outline-none focus:border-[#065F46]"
            />
            <span className="text-[11px] font-semibold text-slate-700">VND</span>
          </div>

          <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
            (1만 VND ≈ {Math.round((10000 / currentVndRate) * currentKrwRate).toLocaleString()}원)
          </span>

          {activeReservations.length > 1 && (
            <button
              type="button"
              onClick={handleApplyRatesToAll}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#065F46] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>전체 예약 환율 통일</span>
            </button>
          )}
        </div>
      </div>

      {/* Top 4 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 px-3 sm:px-0">
        <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">총 매출액</p>
          <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold text-slate-900 font-mono">
            {formatKrw(overallStats.totalRevenueKrw)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 font-mono">
            {formatUsd(overallStats.totalRevenueUsd)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">총 원가 지출</p>
          <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold text-slate-900 font-mono">
            {formatKrw(overallStats.totalCostKrw)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 font-mono">
            {formatUsd(overallStats.totalCostUsd)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">순수익 합계</p>
          <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold text-[#065F46] font-mono">
            {formatKrw(overallStats.netProfitKrw)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 font-mono">
            {formatUsd(overallStats.netProfitUsd)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">평균 마진율 · 미수금</p>
          <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold text-[#D97706] font-mono">
            {overallStats.marginPercent.toFixed(1)}%
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500">
            미수금 <span className="font-mono font-semibold text-slate-800">{overallStats.unpaidCount}</span>건
          </p>
        </div>
      </div>

      {/* Main Master-Detail Settlement Workspace */}
      {!selectedReservation || !selectedFinance ? (
        <div className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl p-8 sm:p-12 text-center text-sm text-slate-500">
          정산할 예약 내역이 없습니다. [견적 업로드 & 예약 목록]에서 먼저 견적을 등록해 주세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 items-start">
          {/* Left: Reservation List */}
          <div className="xl:col-span-4 bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">
                예약 건별 정산 선택 ({activeReservations.length}건)
              </h2>
            </div>
            <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
              {activeReservations.map((res) => {
                const fin = calculateReservationFinance(res);
                const isActive = res.id === selectedReservation.id;
                return (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => setSelectedId(res.id)}
                    className={`w-full text-left px-5 py-4 transition-colors cursor-pointer ${
                      isActive ? 'bg-amber-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-semibold text-[#065F46]">
                        {res.bookingCode}
                      </span>
                      <span
                        className={`text-[11px] font-semibold ${
                          fin.isUnpaid ? 'text-[#D97706]' : 'text-[#065F46]'
                        }`}
                      >
                        {fin.isUnpaid ? '미수금 있음' : '입금 완납'}
                      </span>
                    </div>
                    <div className="mt-1 font-bold text-sm text-slate-900">
                      {res.customerName} ({res.customerCount}인)
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">
                      {res.productName}
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-500">
                        매출 {formatKrw(res.totalPriceKrw)}
                      </span>
                      <span className="font-semibold text-[#065F46]">
                        순익 {formatKrw(fin.netProfitKrw)} ({fin.marginPercent.toFixed(1)}%)
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Selected Reservation Settlement Details */}
          <div className="xl:col-span-8 bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-[#065F46]">
                    {selectedReservation.bookingCode}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">
                    {selectedReservation.startDate} ~ {selectedReservation.endDate}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">
                    USD {currentKrwRate.toLocaleString()}원 / VND {currentVndRate.toLocaleString()}₫
                  </span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {selectedReservation.customerName} 고객님 — {selectedReservation.productName}
                </h3>
              </div>

              {/* Payment Status Checkboxes */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedReservation.depositPaid)}
                    onChange={(e) =>
                      onUpdateReservation(selectedReservation.id, {
                        depositPaid: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-[#065F46] rounded shrink-0"
                  />
                  <span className="whitespace-nowrap">계약금 입금 완료</span>
                </label>

                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedReservation.balancePaid)}
                    onChange={(e) =>
                      onUpdateReservation(selectedReservation.id, {
                        balancePaid: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-[#065F46] rounded shrink-0"
                  />
                  <span className="whitespace-nowrap">잔금 입금 완료</span>
                </label>
              </div>
            </div>

            {/* Revenue & Profit Summary Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-b border-slate-200 bg-slate-50/50">
              <div className="p-5">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  총 매출액 (USD 수정 가능)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-slate-400">$</span>
                  <input
                    type="number"
                    value={selectedReservation.totalPriceUsd || 0}
                    onChange={(e) => {
                      const usd = Number(e.target.value) || 0;
                      onUpdateReservation(selectedReservation.id, {
                        totalPriceUsd: usd,
                        totalPriceKrw: Math.round(usd * currentKrwRate),
                      });
                    }}
                    className="w-28 px-2.5 py-1 text-base font-bold font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#065F46]"
                  />
                </div>
                <p className="mt-1 text-xs font-mono text-slate-500">
                  {formatKrw(selectedReservation.totalPriceKrw)}
                </p>
              </div>

              <div className="p-5">
                <span className="block text-xs font-medium text-slate-500">
                  원가 지출 합계 ({selectedFinance.paidCostCount}/{selectedFinance.totalCostCount}건 지불)
                </span>
                <p className="mt-2 text-xl font-bold font-mono text-slate-900">
                  {formatKrw(selectedFinance.totalCostKrw)}
                </p>
                <p className="mt-1 text-xs font-mono text-slate-500">
                  {formatUsd(selectedFinance.totalCostUsd)}
                </p>
              </div>

              <div className="p-5">
                <span className="block text-xs font-medium text-slate-500">
                  건별 순수익 · 마진율
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span
                    className={`text-xl font-bold font-mono ${
                      selectedFinance.netProfitKrw >= 0 ? 'text-[#065F46]' : 'text-red-600'
                    }`}
                  >
                    {formatKrw(selectedFinance.netProfitKrw)}
                  </span>
                  <span className="text-sm font-bold font-mono text-[#D97706]">
                    ({selectedFinance.marginPercent.toFixed(1)}%)
                  </span>
                </div>
                <p className="mt-1 text-xs font-mono text-slate-500">
                  {formatUsd(selectedFinance.netProfitUsd)}
                </p>
              </div>
            </div>

            {/* Cost Payment Checklist (2-Row Compact Layout, Zero Horizontal Scroll) */}
            <div className="p-3 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    원가 지불 체크리스트 (다중 통화 · 원화 자동 합산)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    항목별로 통화(USD / VND / KRW)를 선택하고 금액을 입력하면 상단 환율 기준으로 원화(KRW)가 자동 환산되어 합계에 반영됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddCostItem(selectedReservation)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#065F46] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>원가 항목 추가</span>
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {/* Fixed Single-Line Header */}
                <div className="bg-slate-50 border-b border-slate-200 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                  <div className="flex items-center gap-2.5 whitespace-nowrap">
                    <span className="whitespace-nowrap">지불</span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="whitespace-nowrap">구분</span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="whitespace-nowrap">원가 항목명</span>
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
                    <span className="whitespace-nowrap">통화·금액 / 원화(KRW) 환산</span>
                  </div>
                </div>

                {/* 2-Row Cost Item List */}
                <div className="divide-y divide-slate-100">
                  {selectedCostItems.length === 0 ? (
                    <div className="py-10 px-4 text-center text-xs text-slate-400">
                      등록된 원가 항목이 없습니다. 상단 버튼으로 추가해 주세요.
                    </div>
                  ) : (
                    selectedCostItems.map((cost) => {
                      const itemCurrency = getCostItemCurrency(cost);
                      const originalAmount = getCostItemOriginalAmount(cost);
                      const converted = convertCostAmount(
                        originalAmount,
                        itemCurrency,
                        currentKrwRate,
                        currentVndRate
                      );
                      const normalizedCategory: CostCategory =
                        (cost.category as string) === '마사지'
                          ? '마사지/옵션'
                          : (COST_CATEGORIES as readonly string[]).includes(cost.category)
                            ? cost.category
                            : '기타';
                      const currencyMeta =
                        CURRENCY_OPTIONS.find((opt) => opt.value === itemCurrency) ||
                        CURRENCY_OPTIONS[0];

                      return (
                        <div
                          key={cost.id}
                          className={`px-3 sm:px-4 py-3 space-y-2 transition-colors ${
                            cost.paid ? 'bg-emerald-50/25' : 'bg-white'
                          }`}
                        >
                          {/* 1행 (윗줄): [지불 체크박스] + [구분 드롭다운] + [원가 항목명] + [삭제 버튼] */}
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleCostChange(selectedReservation, cost.id, {
                                  paid: !cost.paid,
                                })
                              }
                              aria-label="지불 완료 토글"
                              className={`mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                cost.paid
                                  ? 'bg-[#065F46] border-[#065F46] text-white'
                                  : 'bg-white border-slate-300 text-transparent hover:border-[#065F46]'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>

                            <select
                              value={normalizedCategory}
                              onChange={(e) =>
                                handleCostChange(selectedReservation, cost.id, {
                                  category: e.target.value as CostCategory,
                                })
                              }
                              className="px-2 py-1 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#065F46] whitespace-nowrap shrink-0"
                            >
                              {COST_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>

                            <div className="flex-1 min-w-0">
                              <AutoSizeTitle
                                value={cost.title || ''}
                                onChange={(nextTitle) =>
                                  handleCostChange(selectedReservation, cost.id, {
                                    title: nextTitle,
                                  })
                                }
                              />
                              <div className="px-2 text-[11px] text-slate-400">
                                <span className="whitespace-nowrap">{cost.source || '기타'}</span>
                                {cost.note ? <span> · {cost.note}</span> : null}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteCostItem(selectedReservation, cost.id)}
                              aria-label="항목 삭제"
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* 2행 (아랫줄): [진행일] + [통화 드롭다운 + 금액 입력칸] + [원화 자동 환산 금액] */}
                          <div className="flex flex-wrap items-center justify-between gap-2.5 pl-0 sm:pl-8 pt-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <input
                                type="date"
                                aria-label="실제 진행 날짜"
                                value={cost.serviceDate || selectedReservation.startDate}
                                onChange={(e) =>
                                  handleCostChange(selectedReservation, cost.id, {
                                    serviceDate: e.target.value,
                                  })
                                }
                                className="px-2 py-1 text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#065F46]"
                              />
                              <select
                                value={itemCurrency}
                                aria-label="원가 통화 선택"
                                onChange={(e) => {
                                  const nextCurrency = e.target.value as CostCurrency;
                                  const nextConverted = convertCostAmount(
                                    originalAmount,
                                    nextCurrency,
                                    currentKrwRate,
                                    currentVndRate
                                  );
                                  handleCostChange(selectedReservation, cost.id, {
                                    currency: nextCurrency,
                                    originalAmount,
                                    costUsd: nextConverted.costUsd,
                                    costKrw: nextConverted.costKrw,
                                  });
                                }}
                                className="px-2 py-1 text-xs font-semibold font-mono text-slate-700 bg-slate-100 border border-slate-200 rounded-lg focus:outline-none focus:border-[#065F46] whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                {CURRENCY_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>

                              <div className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg focus-within:bg-white focus-within:border-[#065F46]">
                                <span className="text-xs text-slate-400 font-mono">
                                  {currencyMeta.symbol}
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step={itemCurrency === 'USD' ? 'any' : 1000}
                                  value={originalAmount}
                                  onChange={(e) => {
                                    const nextAmount = Math.max(0, Number(e.target.value) || 0);
                                    const nextConverted = convertCostAmount(
                                      nextAmount,
                                      itemCurrency,
                                      currentKrwRate,
                                      currentVndRate
                                    );
                                    handleCostChange(selectedReservation, cost.id, {
                                      currency: itemCurrency,
                                      originalAmount: nextAmount,
                                      costUsd: nextConverted.costUsd,
                                      costKrw: nextConverted.costKrw,
                                    });
                                  }}
                                  className="w-24 sm:w-28 text-right text-xs font-mono font-semibold text-slate-900 bg-transparent focus:outline-none"
                                />
                              </div>
                            </div>

                            <div className="text-right font-mono whitespace-nowrap shrink-0">
                              <span className="text-xs font-bold text-slate-800">
                                {formatKrw(converted.costKrw)}
                              </span>
                              {itemCurrency !== 'USD' && (
                                <span className="ml-1.5 text-[11px] text-slate-400">
                                  ({formatUsd(converted.costUsd)})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
