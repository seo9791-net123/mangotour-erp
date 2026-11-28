import React, { useState } from 'react';
import { CheckCircle2, Lock, Trash2, X } from 'lucide-react';
import {
  COST_CATEGORIES,
  type BookingStatus,
  type CostCategory,
  type CostCurrency,
  type CostItem,
  type GolfBookingStatus,
  type Reservation,
  type ScheduleItem,
  type UserRole,
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
  recalculateCostItemsWithRates,
} from '../utils/storage';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

interface BookingDetailModalProps {
  reservation: Reservation;
  role: UserRole;
  onClose: () => void;
  onUpdateReservation: (id: string, updates: Partial<Reservation>) => void;
  onUpdateScheduleItem: (
    reservationId: string,
    scheduleId: string,
    updates: Partial<ScheduleItem>
  ) => void;
  onDeleteReservation: (id: string) => void;
}

export const BookingDetailModal: React.FC<BookingDetailModalProps> = ({
  reservation,
  role,
  onClose,
  onUpdateReservation,
  onUpdateScheduleItem,
  onDeleteReservation,
}) => {
  const isAdmin = role === 'admin';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scheduleItems = Array.isArray(reservation?.scheduleItems) ? reservation.scheduleItems : [];
  const revenueItems = Array.isArray(reservation?.revenueItems) ? reservation.revenueItems : [];
  const costItems = Array.isArray(reservation?.costItems) ? reservation.costItems : [];

  const currentKrwRate =
    Number(reservation?.exchangeRate) > 0 ? Number(reservation.exchangeRate) : DEFAULT_KRW_RATE;
  const currentVndRate =
    Number(reservation?.vndExchangeRate) > 0
      ? Number(reservation.vndExchangeRate)
      : DEFAULT_VND_RATE;
  const finance = calculateReservationFinance(reservation);

  const handleRatesChange = (nextKrwRate: number, nextVndRate: number) => {
    const safeKrw = nextKrwRate > 0 ? nextKrwRate : DEFAULT_KRW_RATE;
    const safeVnd = nextVndRate > 0 ? nextVndRate : DEFAULT_VND_RATE;
    const updatedCosts = recalculateCostItemsWithRates(costItems, safeKrw, safeVnd);
    const nextTotalPriceKrw = Math.round((Number(reservation.totalPriceUsd) || 0) * safeKrw);

    onUpdateReservation(reservation.id, {
      exchangeRate: safeKrw,
      vndExchangeRate: safeVnd,
      totalPriceKrw: nextTotalPriceKrw,
      costItems: updatedCosts,
    });
  };

  const handleCostUpdate = (costId: string, updates: Partial<CostItem>) => {
    const nextCosts = costItems.map((item) =>
      item.id === costId ? { ...item, ...updates } : item
    );
    onUpdateReservation(reservation.id, { costItems: nextCosts });
  };

  useBodyScrollLock(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-[1px] p-0 sm:p-4 overflow-hidden">
      <div className="bg-white border-0 sm:border border-slate-200 rounded-none sm:rounded-2xl w-full max-w-full sm:max-w-3xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-5 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="font-mono font-semibold text-[#065F46] whitespace-nowrap">
                {reservation.bookingCode}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono whitespace-nowrap">
                {reservation.startDate} ~ {reservation.endDate}
              </span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">{reservation.destination}</span>
            </div>
            <h2 className="mt-1 text-base sm:text-xl font-bold text-slate-900">
              {reservation.customerName} 고객님 ({reservation.customerCount}인) — {reservation.productName}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
          {/* Status & Manager Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4">
            <div>
              <span className="block text-xs text-slate-500">고객 표기</span>
              <span className="mt-1 block text-sm font-semibold text-slate-900">
                {reservation.rawCustomerText}
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-500">담당자</span>
              <span className="mt-1 block text-sm font-semibold text-slate-900">
                {reservation.managerName}
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-500">진행상태</span>
              {isAdmin ? (
                <select
                  value={reservation.status}
                  onChange={(e) =>
                    onUpdateReservation(reservation.id, {
                      status: e.target.value as BookingStatus,
                    })
                  }
                  className="mt-1 w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#065F46]"
                >
                  {(['상담중', '예약확정', '진행중', '완료', '취소'] as BookingStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="mt-1 block text-sm font-semibold text-[#065F46]">
                  {reservation.status}
                </span>
              )}
            </div>
          </div>

          {/* Upper Tour Exchange Rate & Live Profit Summary (Admin Only) */}
          {isAdmin && (
            <div className="bg-amber-50/40 border border-amber-200/80 rounded-xl p-3.5 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                  투어 환율 설정 (원화 자동 환산)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg whitespace-nowrap">
                    <span className="text-[11px] font-semibold text-slate-500">1 USD =</span>
                    <input
                      type="number"
                      min={1}
                      step={10}
                      value={currentKrwRate}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        handleRatesChange(val > 0 ? val : DEFAULT_KRW_RATE, currentVndRate);
                      }}
                      aria-label="투어 KRW 환율"
                      className="w-20 text-right text-xs font-mono font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:bg-white focus:border-[#065F46]"
                    />
                    <span className="text-[11px] font-semibold text-slate-700">KRW</span>
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg whitespace-nowrap">
                    <span className="text-[11px] font-semibold text-slate-500">1 USD =</span>
                    <input
                      type="number"
                      min={1}
                      step={100}
                      value={currentVndRate}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        handleRatesChange(currentKrwRate, val > 0 ? val : DEFAULT_VND_RATE);
                      }}
                      aria-label="투어 VND 환율"
                      className="w-24 text-right text-xs font-mono font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:bg-white focus:border-[#065F46]"
                    />
                    <span className="text-[11px] font-semibold text-slate-700">VND</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2 border-t border-amber-200/60 text-xs">
                <div className="bg-white rounded-lg px-3 py-2 border border-slate-200/80">
                  <span className="block text-[11px] text-slate-500">총 견적 매출</span>
                  <span className="mt-0.5 block font-mono font-bold text-slate-900">
                    {formatKrw(reservation.totalPriceKrw)}
                  </span>
                </div>
                <div className="bg-white rounded-lg px-3 py-2 border border-slate-200/80">
                  <span className="block text-[11px] text-slate-500">총 원가 (환산)</span>
                  <span className="mt-0.5 block font-mono font-bold text-slate-900">
                    {formatKrw(finance.totalCostKrw)}
                  </span>
                </div>
                <div className="bg-white rounded-lg px-3 py-2 border border-slate-200/80">
                  <span className="block text-[11px] text-slate-500">
                    순수익 ({finance.marginPercent.toFixed(1)}%)
                  </span>
                  <span
                    className={`mt-0.5 block font-mono font-bold ${
                      finance.netProfitKrw >= 0 ? 'text-[#065F46]' : 'text-red-600'
                    }`}
                  >
                    {formatKrw(finance.netProfitKrw)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Schedule Management Section (Editable by both Admin and Staff) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">
                일정 및 티오프·배정 관리 ({scheduleItems.length}건)
              </h3>
              <span className="text-xs text-slate-500">
                티타임, 부킹 상태, 차량/가이드 메모를 바로 수정할 수 있습니다.
              </span>
            </div>

            <div className="space-y-3">
              {scheduleItems.length === 0 ? (
                <div className="border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-400">
                  등록된 세부 일정이 없습니다.
                </div>
              ) : (
                scheduleItems.map((sch) => {
                const isGolf = sch.type === 'GOLF';
                return (
                  <div
                    key={sch.id}
                    className="border border-slate-200 rounded-xl p-3 sm:p-4 bg-white space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span
                          className={`font-bold whitespace-nowrap ${
                            isGolf ? 'text-[#065F46]' : 'text-[#B45309]'
                          }`}
                        >
                          {isGolf ? '골프 부킹' : '일반 투어'}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="font-mono text-slate-600 whitespace-nowrap">{sch.date}</span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-slate-500 whitespace-nowrap">{sch.dayNumber}일차</span>
                      </div>

                      {isGolf && (
                        <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg shrink-0">
                          {(['대기', '확정'] as GolfBookingStatus[]).map((st) => {
                            const active = (sch.golfBookingStatus || '대기') === st;
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() =>
                                  onUpdateScheduleItem(reservation.id, sch.id, {
                                    golfBookingStatus: st,
                                  })
                                }
                                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                                  active
                                    ? st === '확정'
                                      ? 'bg-[#065F46] text-white'
                                      : 'bg-[#F59E0B] text-white'
                                    : 'text-slate-600'
                                }`}
                              >
                                {st}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-900">{sch.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{sch.detail}</p>
                    </div>

                    <div className="flex flex-wrap sm:grid sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                      <div className="w-full sm:w-auto min-w-[146px]">
                        <label className="block text-[11px] font-medium text-slate-500 mb-1 whitespace-nowrap">
                          {isGolf ? '티오프 시간' : '일정 시간'}
                        </label>
                        <input
                          type="time"
                          value={isGolf ? sch.teeOffTime || sch.time : sch.time}
                          onChange={(e) =>
                            onUpdateScheduleItem(reservation.id, sch.id, {
                              time: e.target.value,
                              ...(isGolf ? { teeOffTime: e.target.value } : {}),
                            })
                          }
                          className="w-full px-2 py-1.5 text-xs sm:text-sm font-mono whitespace-nowrap border border-slate-200 rounded-lg focus:outline-none focus:border-[#065F46]"
                        />
                      </div>
                      <div className="w-full sm:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          차량 / 가이드 / 캐디 배정 상태 메모
                        </label>
                        <input
                          type="text"
                          value={sch.vehicleGuideNote || ''}
                          onChange={(e) =>
                            onUpdateScheduleItem(reservation.id, sch.id, {
                              vehicleGuideNote: e.target.value,
                            })
                          }
                          placeholder="배정 상태를 입력하세요"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#065F46]"
                        />
                      </div>
                    </div>
                  </div>
                );
              })
              )}
            </div>
          </div>

          {/* Financial & Billing Section (Admin Only vs Staff Locked) */}
          <div className="pt-2 border-t border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              견적 금액 · 다중 통화 원가 및 과금 내역
            </h3>

            {isAdmin ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-amber-50/40 border border-amber-200/70 rounded-xl p-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      총 견적액 (USD)
                    </label>
                    <input
                      type="number"
                      value={reservation.totalPriceUsd || 0}
                      onChange={(e) => {
                        const usd = Number(e.target.value) || 0;
                        onUpdateReservation(reservation.id, {
                          totalPriceUsd: usd,
                          totalPriceKrw: Math.round(usd * currentKrwRate),
                        });
                      }}
                      className="w-full px-3 py-2 text-sm font-mono font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      총 견적액 (KRW)
                    </label>
                    <div className="px-3 py-2 text-sm font-mono font-semibold bg-white border border-slate-200 rounded-xl text-slate-800">
                      {formatKrw(reservation.totalPriceKrw)}
                    </div>
                  </div>
                </div>

                {/* Per-item Multi-Currency Cost Items */}
                {costItems.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span>원가 항목 ({costItems.length}건 · 통화별 KRW 자동 환산)</span>
                      <span className="font-mono text-slate-900">
                        합계 {formatKrw(finance.totalCostKrw)}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {costItems.map((cost) => {
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

                        return (
                          <div
                            key={cost.id}
                            className={`px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs ${
                              cost.paid ? 'bg-emerald-50/25' : 'bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => handleCostUpdate(cost.id, { paid: !cost.paid })}
                                aria-label="지불 완료 토글"
                                className={`inline-flex items-center justify-center w-5 h-5 rounded border shrink-0 cursor-pointer ${
                                  cost.paid
                                    ? 'bg-[#065F46] border-[#065F46] text-white'
                                    : 'bg-white border-slate-300 text-transparent hover:border-[#065F46]'
                                }`}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                              </button>
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded whitespace-nowrap shrink-0">
                                {normalizedCategory}
                              </span>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate">{cost.title}</p>
                                <p className="text-[10px] font-mono text-slate-400">
                                  {cost.serviceDate || reservation.startDate}
                                  {cost.note ? ` · ${cost.note}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <select
                                value={itemCurrency}
                                aria-label="원가 통화 선택"
                                onChange={(e) => {
                                  const nextCur = e.target.value as CostCurrency;
                                  const nextConv = convertCostAmount(
                                    originalAmount,
                                    nextCur,
                                    currentKrwRate,
                                    currentVndRate
                                  );
                                  handleCostUpdate(cost.id, {
                                    currency: nextCur,
                                    originalAmount,
                                    costUsd: nextConv.costUsd,
                                    costKrw: nextConv.costKrw,
                                  });
                                }}
                                className="px-1.5 py-1 text-[11px] font-mono font-semibold bg-slate-100 border border-slate-200 rounded-lg focus:outline-none focus:border-[#065F46] cursor-pointer"
                              >
                                <option value="USD">USD</option>
                                <option value="VND">VND</option>
                                <option value="KRW">KRW</option>
                              </select>
                              <input
                                type="number"
                                min={0}
                                step={itemCurrency === 'USD' ? 'any' : 1000}
                                value={originalAmount}
                                onChange={(e) => {
                                  const nextAmt = Math.max(0, Number(e.target.value) || 0);
                                  const nextConv = convertCostAmount(
                                    nextAmt,
                                    itemCurrency,
                                    currentKrwRate,
                                    currentVndRate
                                  );
                                  handleCostUpdate(cost.id, {
                                    currency: itemCurrency,
                                    originalAmount: nextAmt,
                                    costUsd: nextConv.costUsd,
                                    costKrw: nextConv.costKrw,
                                  });
                                }}
                                className="w-24 px-2 py-1 text-right text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#065F46]"
                              />
                              <span className="w-24 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                                {formatKrw(converted.costKrw)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {revenueItems.length > 0 && (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {revenueItems.map((rev) => (
                      <div
                        key={rev.id}
                        className="px-4 py-2.5 flex items-center justify-between text-xs"
                      >
                        <span className="text-slate-700 font-medium">{rev.title}</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {formatUsd(rev.amountUsd)} ({formatKrw(rev.amountKrw)})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  금액 및 과금 항목 열람·수정·삭제는 관리자(admin) 전용입니다.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          {isAdmin ? (
            <div>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>예약 삭제</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-red-700">
                    정말 삭제하시겠습니까?
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteReservation(reservation.id)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                  >
                    삭제 확인
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg cursor-pointer"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-400">
              오퍼레이터 일정 수정 모드 (자동 저장)
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-white bg-[#065F46] hover:bg-[#054e3a] rounded-xl transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
