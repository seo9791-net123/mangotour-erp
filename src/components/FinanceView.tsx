import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import type { CostCategory, CostItem, Reservation } from '../types/erp';
import { calculateReservationFinance, formatKrw, formatUsd } from '../utils/storage';

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

export const FinanceView: React.FC<FinanceViewProps> = ({
  reservations,
  onUpdateReservation,
}) => {
  const safeReservations = Array.isArray(reservations) ? reservations : [];

  const activeReservations = useMemo(
    () => safeReservations.filter((r) => r && r.status !== '취소'),
    [safeReservations]
  );

  const [selectedId, setSelectedId] = useState<string>(
    () => activeReservations[0]?.id || ''
  );

  const selectedReservation =
    activeReservations.find((r) => r.id === selectedId) || activeReservations[0] || null;

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
    const marginPercent = totalRevenueUsd > 0 ? (netProfitUsd / totalRevenueUsd) * 100 : 0;

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
    <div className="space-y-4 sm:space-y-8">
      {/* Top 4 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 px-3 sm:px-0">
        <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">총 매출액</p>
          <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold text-slate-900 font-mono">
            {formatUsd(overallStats.totalRevenueUsd)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 font-mono">
            {formatKrw(overallStats.totalRevenueKrw)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">총 원가 지출</p>
          <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold text-slate-900 font-mono">
            {formatUsd(overallStats.totalCostUsd)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 font-mono">
            {formatKrw(overallStats.totalCostKrw)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">순수익 합계</p>
          <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold text-[#065F46] font-mono">
            {formatUsd(overallStats.netProfitUsd)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 font-mono">
            {formatKrw(overallStats.netProfitKrw)}
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
                        매출 {formatUsd(res.totalPriceUsd)}
                      </span>
                      <span className="font-semibold text-[#065F46]">
                        순익 {formatUsd(fin.netProfitUsd)} ({fin.marginPercent.toFixed(1)}%)
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
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-[#065F46]">
                    {selectedReservation.bookingCode}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">
                    {selectedReservation.startDate} ~ {selectedReservation.endDate}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>환율 {(selectedReservation.exchangeRate || 1400).toLocaleString()}원/$</span>
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
                      const rate = selectedReservation.exchangeRate || 1400;
                      onUpdateReservation(selectedReservation.id, {
                        totalPriceUsd: usd,
                        totalPriceKrw: Math.round(usd * rate),
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
                  {formatUsd(selectedFinance.totalCostUsd)}
                </p>
                <p className="mt-1 text-xs font-mono text-slate-500">
                  {formatKrw(selectedFinance.totalCostKrw)}
                </p>
              </div>

              <div className="p-5">
                <span className="block text-xs font-medium text-slate-500">
                  건별 순수익 · 마진율
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span
                    className={`text-xl font-bold font-mono ${
                      selectedFinance.netProfitUsd >= 0 ? 'text-[#065F46]' : 'text-red-600'
                    }`}
                  >
                    {formatUsd(selectedFinance.netProfitUsd)}
                  </span>
                  <span className="text-sm font-bold font-mono text-[#D97706]">
                    ({selectedFinance.marginPercent.toFixed(1)}%)
                  </span>
                </div>
                <p className="mt-1 text-xs font-mono text-slate-500">
                  {formatKrw(selectedFinance.netProfitKrw)}
                </p>
              </div>
            </div>

            {/* Cost Payment Checklist (2-Row Compact Layout, Zero Horizontal Scroll) */}
            <div className="p-3 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    원가 지불 체크리스트 (매입가 입력)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    견적서에서 &lsquo;포함&rsquo;으로 추출된 항목과 골프장 원가가 자동 생성됩니다. USD 원가를 입력하면 원화가 자동 환산됩니다.
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
                    <span className="whitespace-nowrap">원가(USD) / 원화 환산</span>
                  </div>
                </div>

                {/* 2-Row Cost Item List */}
                <div className="divide-y divide-slate-100">
                  {selectedCostItems.length === 0 ? (
                    <div className="py-10 px-4 text-center text-xs text-slate-400">
                      등록된 원가 항목이 없습니다. 상단 버튼으로 추가해 주세요.
                    </div>
                  ) : (
                    selectedCostItems.map((cost) => (
                      <div
                        key={cost.id}
                        className={`px-3 sm:px-4 py-3 space-y-2 transition-colors ${
                          cost.paid ? 'bg-emerald-50/25' : 'bg-white'
                        }`}
                      >
                        {/* 1행 (윗줄): [지불 체크박스] + [구분 드롭다운] + [원가 항목명(말줄임 없이 넓게)] + [삭제 버튼] */}
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
                            value={cost.category}
                            onChange={(e) =>
                              handleCostChange(selectedReservation, cost.id, {
                                category: e.target.value as CostCategory,
                              })
                            }
                            className="px-2 py-1 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#065F46] whitespace-nowrap shrink-0"
                          >
                            {(['숙박', '차량', '가이드', '마사지', '골프장', '식사', '기타'] as CostCategory[]).map(
                              (cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              )
                            )}
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

                        {/* 2행 (아랫줄): [원가(USD) 입력칸] + [원화 환산 금액(가로 한 줄 표시)] */}
                        <div className="flex items-center justify-between gap-3 pl-0 sm:pl-8 pt-1">
                          <div className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
                            <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                              원가(USD)
                            </span>
                            <div className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg focus-within:bg-white focus-within:border-[#065F46]">
                              <span className="text-xs text-slate-400 font-mono">$</span>
                              <input
                                type="number"
                                min={0}
                                value={cost.costUsd || 0}
                                onChange={(e) => {
                                  const usd = Number(e.target.value) || 0;
                                  const rate = selectedReservation.exchangeRate || 1400;
                                  handleCostChange(selectedReservation, cost.id, {
                                    costUsd: usd,
                                    costKrw: Math.round(usd * rate),
                                  });
                                }}
                                className="w-20 text-right text-xs font-mono font-semibold text-slate-900 bg-transparent focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="text-right font-mono text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0">
                            {formatKrw(cost.costKrw)}
                          </div>
                        </div>
                      </div>
                    ))
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
