import React, { useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, Search } from 'lucide-react';
import {
  COST_CATEGORIES,
  type CostCategory,
  type CostCurrency,
  type CostItem,
  type Reservation,
} from '../types/erp';
import {
  convertCostAmount,
  DEFAULT_KRW_RATE,
  DEFAULT_VND_RATE,
  formatKrw,
  formatUsd,
  getCostItemCurrency,
  getCostItemOriginalAmount,
  isBookingCancelled,
} from '../utils/storage';

interface DailyExpenseViewProps {
  reservations: Reservation[];
  readOnly?: boolean;
  canOpenTourDetail?: boolean;
  onUpdateReservation: (id: string, updates: Partial<Reservation>) => void;
  onOpenReservationDetail: (id: string) => void;
}

type DateFilterMode = 'all' | 'single' | 'week' | 'month' | 'range';

interface FlattenedExpenseItem {
  reservation: Reservation;
  cost: CostItem;
  serviceDate: string;
  category: CostCategory;
  currency: CostCurrency;
  originalAmount: number;
  convertedUsd: number;
  convertedKrw: number;
}

interface CurrencySummary {
  usdOriginal: number;
  vndOriginal: number;
  krwOriginal: number;
  totalKrw: number;
  count: number;
}

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekBoundsIso(baseIso: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseIso);
  if (!match) return { start: baseIso, end: baseIso };
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + diffToMonday));
  const sunday = new Date(
    Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6)
  );
  const toIso = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')}`;
  return { start: toIso(monday), end: toIso(sunday) };
}

function formatDateWithWeekday(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const weekday = WEEKDAYS_KO[dt.getUTCDay()];
  return `${isoDate} (${weekday})`;
}

function formatShortDateWithWeekday(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const weekday = WEEKDAYS_KO[dt.getUTCDay()];
  return `${match[2]}.${match[3]} (${weekday})`;
}

function formatVndAmount(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${new Intl.NumberFormat('ko-KR').format(Math.round(safe))} VND`;
}

function formatOriginalCurrency(amount: number, currency: CostCurrency): string {
  if (currency === 'VND') return formatVndAmount(amount);
  if (currency === 'KRW') return formatKrw(amount);
  return formatUsd(amount);
}

const CATEGORY_BADGE_CLASS: Record<CostCategory, string> = {
  가이드: 'bg-emerald-50 text-[#065F46] border-emerald-200',
  차량: 'bg-sky-50 text-sky-800 border-sky-200',
  골프장: 'bg-amber-50 text-amber-900 border-amber-200',
  숙박: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  식사: 'bg-orange-50 text-orange-800 border-orange-200',
  '마사지/옵션': 'bg-purple-50 text-purple-800 border-purple-200',
  기타: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const DailyExpenseView: React.FC<DailyExpenseViewProps> = ({
  reservations,
  readOnly = false,
  canOpenTourDetail = true,
  onUpdateReservation,
  onOpenReservationDetail,
}) => {
  const todayIso = useMemo(() => getLocalTodayIso(), []);
  const thisWeekBounds = useMemo(() => getWeekBoundsIso(todayIso), [todayIso]);

  const [dateMode, setDateMode] = useState<DateFilterMode>('all');
  const [singleDate, setSingleDate] = useState<string>(todayIso);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => todayIso.slice(0, 7));
  const [rangeStart, setRangeStart] = useState<string>(thisWeekBounds.start);
  const [rangeEnd, setRangeEnd] = useState<string>(thisWeekBounds.end);
  const [onlyUnpaid, setOnlyUnpaid] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<'전체' | CostCategory>('전체');
  const [searchQuery, setSearchQuery] = useState('');

  const safeReservations = Array.isArray(reservations) ? reservations : [];

  // 1. 전체 예약(bookings)의 cost_items를 추출하여 service_date(미지정 시 start_date) 기준 오름차순 정렬
  const allExpenseItems = useMemo<FlattenedExpenseItem[]>(() => {
    const flattened: FlattenedExpenseItem[] = [];

    safeReservations.forEach((res) => {
      if (!res || isBookingCancelled(res)) return;
      const costs = Array.isArray(res.costItems) ? res.costItems : [];
      const krwRate = Number(res.exchangeRate) > 0 ? Number(res.exchangeRate) : DEFAULT_KRW_RATE;
      const vndRate =
        Number(res.vndExchangeRate) > 0 ? Number(res.vndExchangeRate) : DEFAULT_VND_RATE;

      costs.forEach((cost) => {
        if (!cost) return;
        const rawDate = String(
          cost.serviceDate || (cost as CostItem & { service_date?: string }).service_date || ''
        ).trim();
        const serviceDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
          ? rawDate
          : res.startDate || todayIso;

        const rawCategory = String(cost.category || '');
        const mappedCat = rawCategory === '마사지' ? '마사지/옵션' : rawCategory;
        const category: CostCategory = (COST_CATEGORIES as readonly string[]).includes(mappedCat)
          ? (mappedCat as CostCategory)
          : '기타';

        const currency = getCostItemCurrency(cost);
        const originalAmount = getCostItemOriginalAmount(cost);
        const converted = convertCostAmount(originalAmount, currency, krwRate, vndRate);

        flattened.push({
          reservation: res,
          cost,
          serviceDate,
          category,
          currency,
          originalAmount,
          convertedUsd: converted.costUsd,
          convertedKrw: converted.costKrw,
        });
      });
    });

    const categoryOrder: Record<CostCategory, number> = {
      가이드: 1,
      차량: 2,
      골프장: 3,
      숙박: 4,
      식사: 5,
      '마사지/옵션': 6,
      기타: 7,
    };

    return flattened.sort((a, b) => {
      const dateCmp = a.serviceDate.localeCompare(b.serviceDate);
      if (dateCmp !== 0) return dateCmp;
      const catCmp = categoryOrder[a.category] - categoryOrder[b.category];
      if (catCmp !== 0) return catCmp;
      return (a.reservation.customerName || '').localeCompare(b.reservation.customerName || '');
    });
  }, [safeReservations, todayIso]);

  // 2-A. 선택된 기간/카테고리/검색 기준 전체 지출 대상 (요약 카드의 [총 지출 예정액] & [미지급 잔액] 산출용)
  const periodFilteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allExpenseItems.filter((item) => {
      if (dateMode === 'single' && singleDate) {
        if (item.serviceDate !== singleDate) return false;
      } else if (dateMode === 'week') {
        if (item.serviceDate < thisWeekBounds.start || item.serviceDate > thisWeekBounds.end) {
          return false;
        }
      } else if (dateMode === 'month' && selectedMonth) {
        if (!item.serviceDate.startsWith(selectedMonth)) return false;
      } else if (dateMode === 'range') {
        if (rangeStart && item.serviceDate < rangeStart) return false;
        if (rangeEnd && item.serviceDate > rangeEnd) return false;
      }

      if (categoryFilter !== '전체' && item.category !== categoryFilter) return false;

      if (q) {
        const hay = `${item.reservation.customerName} ${item.reservation.bookingCode} ${item.reservation.productName} ${item.cost.title} ${item.cost.note || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    allExpenseItems,
    dateMode,
    singleDate,
    thisWeekBounds,
    selectedMonth,
    rangeStart,
    rangeEnd,
    categoryFilter,
    searchQuery,
  ]);

  // 2-B. '미지급 항목만 보기' 토글 적용 리스트
  const visibleItems = useMemo(() => {
    if (!onlyUnpaid) return periodFilteredItems;
    return periodFilteredItems.filter((item) => !item.cost.paid);
  }, [periodFilteredItems, onlyUnpaid]);

  // 2-C. 상단 요약 카드 집계 ([총 지출 예정액] vs [미지급 잔액] — 통화별 + 원화 환산)
  const summaryStats = useMemo(() => {
    const planned: CurrencySummary = {
      usdOriginal: 0,
      vndOriginal: 0,
      krwOriginal: 0,
      totalKrw: 0,
      count: 0,
    };
    const unpaid: CurrencySummary = {
      usdOriginal: 0,
      vndOriginal: 0,
      krwOriginal: 0,
      totalKrw: 0,
      count: 0,
    };
    let paidTotalKrw = 0;
    let paidCount = 0;

    periodFilteredItems.forEach((item) => {
      planned.count += 1;
      planned.totalKrw += item.convertedKrw;
      if (item.currency === 'USD') planned.usdOriginal += item.originalAmount;
      else if (item.currency === 'VND') planned.vndOriginal += item.originalAmount;
      else planned.krwOriginal += item.originalAmount;

      if (item.cost.paid) {
        paidCount += 1;
        paidTotalKrw += item.convertedKrw;
      } else {
        unpaid.count += 1;
        unpaid.totalKrw += item.convertedKrw;
        if (item.currency === 'USD') unpaid.usdOriginal += item.originalAmount;
        else if (item.currency === 'VND') unpaid.vndOriginal += item.originalAmount;
        else unpaid.krwOriginal += item.originalAmount;
      }
    });

    const paidPercent =
      planned.totalKrw > 0 ? Math.round((paidTotalKrw / planned.totalKrw) * 100) : 0;

    return {
      planned,
      unpaid,
      paidTotalKrw,
      paidCount,
      paidPercent,
    };
  }, [periodFilteredItems]);

  // 날짜별 그룹화 (오름차순 유지)
  const groupedByDate = useMemo(() => {
    const map = new Map<string, FlattenedExpenseItem[]>();
    visibleItems.forEach((item) => {
      const list = map.get(item.serviceDate);
      if (list) {
        list.push(item);
      } else {
        map.set(item.serviceDate, [item]);
      }
    });
    return Array.from(map.entries());
  }, [visibleItems]);

  const handleTogglePaid = (reservation: Reservation, costId: string, nextPaid: boolean) => {
    if (readOnly) return;
    const currentCosts = Array.isArray(reservation.costItems) ? reservation.costItems : [];
    const nextCosts = currentCosts.map((c) => (c.id === costId ? { ...c, paid: nextPaid } : c));
    onUpdateReservation(reservation.id, { costItems: nextCosts });
  };

  const handleChangeServiceDate = (
    reservation: Reservation,
    costId: string,
    nextServiceDate: string
  ) => {
    if (readOnly) return;
    const currentCosts = Array.isArray(reservation.costItems) ? reservation.costItems : [];
    const nextCosts = currentCosts.map((c) =>
      c.id === costId ? { ...c, serviceDate: nextServiceDate } : c
    );
    onUpdateReservation(reservation.id, { costItems: nextCosts });
  };

  const periodDescription = useMemo(() => {
    if (dateMode === 'single') return `${formatDateWithWeekday(singleDate)} 기준`;
    if (dateMode === 'week') return `이번 주 (${thisWeekBounds.start} ~ ${thisWeekBounds.end})`;
    if (dateMode === 'month') return `${selectedMonth} 월간`;
    if (dateMode === 'range') return `${rangeStart || '-'} ~ ${rangeEnd || '-'}`;
    return '전체 기간 기준';
  }, [dateMode, singleDate, thisWeekBounds, selectedMonth, rangeStart, rangeEnd]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Summary Cards: [총 지출 예정액] & [미지급 잔액] + [지불 완료 현황] */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-5 px-3 sm:px-0">
        {/* Card 1: 총 지출 예정액 */}
        <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">총 지출 예정액 (원화 환산)</span>
              <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
                총 {summaryStats.planned.count}건
              </span>
            </div>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold text-slate-900 font-mono">
              {formatKrw(summaryStats.planned.totalKrw)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">{periodDescription}</p>
          </div>

          <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs font-mono">
            <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
              <span className="block text-[10px] font-sans text-slate-400">USD 합계</span>
              <span className="font-semibold text-slate-800">
                {formatUsd(summaryStats.planned.usdOriginal)}
              </span>
            </div>
            <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
              <span className="block text-[10px] font-sans text-slate-400">VND 합계</span>
              <span className="font-semibold text-slate-800 truncate block">
                {new Intl.NumberFormat('ko-KR').format(Math.round(summaryStats.planned.vndOriginal))}₫
              </span>
            </div>
            <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
              <span className="block text-[10px] font-sans text-slate-400">KRW 합계</span>
              <span className="font-semibold text-slate-800 truncate block">
                {formatKrw(summaryStats.planned.krwOriginal)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: 미지급 잔액 (실시간 차감) */}
        <div className="bg-white border border-amber-200/90 rounded-xl sm:rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-amber-900">미지급 잔액 (원화 환산)</span>
              <span className="text-[11px] font-mono font-semibold text-[#D97706] whitespace-nowrap">
                미지급 {summaryStats.unpaid.count}건
              </span>
            </div>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold text-[#D97706] font-mono">
              {formatKrw(summaryStats.unpaid.totalKrw)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {readOnly
                ? '조회 전용 모드 (지불 상태 및 날짜 수정 제한)'
                : '체크 시 즉시 Supabase 저장 및 잔액 차감'}
            </p>
          </div>

          <div className="mt-3.5 pt-3 border-t border-amber-100 grid grid-cols-3 gap-2 text-xs font-mono">
            <div className="bg-amber-50/60 rounded-lg px-2.5 py-1.5">
              <span className="block text-[10px] font-sans text-amber-800/70">USD 미지급</span>
              <span className="font-semibold text-amber-950">
                {formatUsd(summaryStats.unpaid.usdOriginal)}
              </span>
            </div>
            <div className="bg-amber-50/60 rounded-lg px-2.5 py-1.5">
              <span className="block text-[10px] font-sans text-amber-800/70">VND 미지급</span>
              <span className="font-semibold text-amber-950 truncate block">
                {new Intl.NumberFormat('ko-KR').format(Math.round(summaryStats.unpaid.vndOriginal))}₫
              </span>
            </div>
            <div className="bg-amber-50/60 rounded-lg px-2.5 py-1.5">
              <span className="block text-[10px] font-sans text-amber-800/70">KRW 미지급</span>
              <span className="font-semibold text-amber-950 truncate block">
                {formatKrw(summaryStats.unpaid.krwOriginal)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: 지불 완료 현황 */}
        <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">지불 완료 합계</span>
              <span className="text-[11px] font-mono font-semibold text-[#065F46] whitespace-nowrap">
                {summaryStats.paidCount} / {summaryStats.planned.count}건 완료
              </span>
            </div>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold text-[#065F46] font-mono">
              {formatKrw(summaryStats.paidTotalKrw)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              선택 기간 지출 집행률 {summaryStats.paidPercent}%
            </p>
          </div>

          <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-2">
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#065F46] transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, summaryStats.paidPercent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>완료 {summaryStats.paidPercent}%</span>
              <span>잔여 {Math.max(0, 100 - summaryStats.paidPercent)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Toggle Bar */}
      <div className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Date Mode Tabs + Date Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              {(
                [
                  { id: 'all', label: '전체' },
                  { id: 'single', label: '오늘/특정일' },
                  { id: 'week', label: '이번 주' },
                  { id: 'month', label: '특정 월' },
                  { id: 'range', label: '직접 기간' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id === 'single' && dateMode !== 'single') {
                      setSingleDate(todayIso);
                    }
                    setDateMode(tab.id);
                  }}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    dateMode === tab.id
                      ? 'bg-white text-[#065F46] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {dateMode === 'single' && (
              <div className="inline-flex items-center gap-1.5">
                <input
                  type="date"
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
                  aria-label="지출 조회 날짜"
                  className="px-3 py-1.5 text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#065F46]"
                />
                {singleDate !== todayIso && (
                  <button
                    type="button"
                    onClick={() => setSingleDate(todayIso)}
                    className="px-2.5 py-1.5 text-xs font-semibold text-[#065F46] bg-emerald-50 border border-emerald-200 rounded-xl whitespace-nowrap cursor-pointer"
                  >
                    오늘로
                  </button>
                )}
              </div>
            )}

            {dateMode === 'week' && (
              <span className="px-3 py-1.5 text-xs font-mono font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl whitespace-nowrap">
                {thisWeekBounds.start} ~ {thisWeekBounds.end}
              </span>
            )}

            {dateMode === 'month' && (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                aria-label="특정 월 선택"
                className="px-3 py-1.5 text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#065F46]"
              />
            )}

            {dateMode === 'range' && (
              <div className="inline-flex items-center gap-1.5">
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  aria-label="조회 시작일"
                  className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#065F46]"
                />
                <span className="text-xs text-slate-400">~</span>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  aria-label="조회 종료일"
                  className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#065F46]"
                />
              </div>
            )}
          </div>

          {/* Search & '미지급 항목만 보기' Toggle Switch */}
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="고객명, 상품명, 항목명 검색..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl w-full sm:w-52 focus:outline-none focus:bg-white focus:border-[#065F46]"
              />
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={onlyUnpaid}
              onClick={() => setOnlyUnpaid((prev) => !prev)}
              className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  onlyUnpaid ? 'bg-[#065F46]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-xs ${
                    onlyUnpaid ? 'translate-x-4.5' : 'translate-x-1'
                  }`}
                />
              </span>
              <span
                className={`text-xs font-semibold ${
                  onlyUnpaid ? 'text-[#065F46]' : 'text-slate-700'
                }`}
              >
                미지급 항목만 보기
              </span>
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          <span className="text-[11px] font-semibold text-slate-400 mr-1 whitespace-nowrap">
            카테고리:
          </span>
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
      </div>

      {/* Expense List Grouped by Service Date (Ascending) */}
      {groupedByDate.length === 0 ? (
        <div className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl p-10 text-center space-y-2">
          <CalendarDays className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">
            선택한 날짜/조건에 해당하는 지출 항목이 없습니다.
          </p>
          <p className="text-xs text-slate-400">
            상단에서 날짜 범위나 카테고리·미지급 토글을 변경해 보세요.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByDate.map(([dateStr, items]) => {
            const isToday = dateStr === todayIso;
            let dayUnpaidUsd = 0;
            let dayUnpaidVnd = 0;
            let dayUnpaidKrw = 0;
            let dayUnpaidCount = 0;

            items.forEach((it) => {
              if (!it.cost.paid) {
                dayUnpaidCount += 1;
                if (it.currency === 'USD') dayUnpaidUsd += it.originalAmount;
                else if (it.currency === 'VND') dayUnpaidVnd += it.originalAmount;
                else dayUnpaidKrw += it.originalAmount;
              }
            });

            const dayUnpaidParts: string[] = [];
            if (dayUnpaidUsd > 0) dayUnpaidParts.push(formatUsd(dayUnpaidUsd));
            if (dayUnpaidVnd > 0) dayUnpaidParts.push(formatVndAmount(dayUnpaidVnd));
            if (dayUnpaidKrw > 0) dayUnpaidParts.push(formatKrw(dayUnpaidKrw));

            return (
              <div
                key={dateStr}
                className={`bg-white border-y sm:border rounded-none sm:rounded-2xl overflow-hidden ${
                  isToday ? 'border-emerald-300 ring-1 ring-emerald-200/70' : 'border-slate-200'
                }`}
              >
                {/* Date Group Header */}
                <div
                  className={`px-4 sm:px-5 py-3 border-b flex flex-wrap items-center justify-between gap-2 ${
                    isToday
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-mono text-slate-900">
                      {formatDateWithWeekday(dateStr)}
                    </span>
                    {isToday && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-[#065F46] text-white rounded-md whitespace-nowrap">
                        오늘 현장
                      </span>
                    )}
                    <span className="text-xs text-slate-500 font-mono whitespace-nowrap">
                      총 {items.length}건
                    </span>
                  </div>

                  <div className="text-xs font-mono whitespace-nowrap">
                    {dayUnpaidCount === 0 ? (
                      <span className="font-semibold text-[#065F46]">해당일 전액 지불 완료</span>
                    ) : (
                      <span className="font-semibold text-[#D97706]">
                        미지급 {dayUnpaidCount}건
                        {dayUnpaidParts.length > 0 ? ` · ${dayUnpaidParts.join(' + ')}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Desktop Table Columns Header */}
                <div className="hidden md:grid md:grid-cols-12 gap-3 px-5 py-2 bg-slate-50/50 border-b border-slate-100 text-[11px] font-semibold text-slate-400">
                  <div className="col-span-2">진행 날짜(요일)</div>
                  <div className="col-span-3">고객명 / 상품명</div>
                  <div className="col-span-4">카테고리 · 항목명</div>
                  <div className="col-span-2 text-right">금액(통화)</div>
                  <div className="col-span-1 text-right">지불 상태</div>
                </div>

                {/* Items for that date */}
                <div className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const { reservation, cost, category, currency, originalAmount, convertedKrw } =
                      item;
                    return (
                      <div
                        key={`${reservation.id}-${cost.id}`}
                        className={`px-3 sm:px-5 py-3.5 grid grid-cols-1 md:grid-cols-12 md:items-center gap-2.5 md:gap-3 transition-colors ${
                          cost.paid ? 'bg-emerald-50/20' : 'bg-white hover:bg-slate-50/70'
                        }`}
                      >
                        {/* 1. 진행 날짜(요일) */}
                        <div className="md:col-span-2 flex items-center justify-between md:justify-start gap-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-mono font-semibold text-slate-700 whitespace-nowrap">
                              {formatShortDateWithWeekday(item.serviceDate)}
                            </span>
                            {!readOnly && (
                              <input
                                type="date"
                                aria-label="진행 날짜 변경"
                                value={item.serviceDate}
                                onChange={(e) => {
                                  if (!e.target.value) return;
                                  handleChangeServiceDate(reservation, cost.id, e.target.value);
                                }}
                                className="px-1.5 py-0.5 text-[10px] font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:bg-white focus:border-[#065F46] w-28"
                              />
                            )}
                          </div>

                          {/* Mobile quick status badge */}
                          {readOnly ? (
                            <span
                              className={`md:hidden inline-flex items-center px-2.5 py-1 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 ${
                                cost.paid
                                  ? 'bg-emerald-50 border-emerald-200 text-[#065F46]'
                                  : 'bg-slate-50 border-slate-200 text-slate-600'
                              }`}
                            >
                              {cost.paid ? '지불 완료' : '미지급'}
                            </span>
                          ) : (
                            <label className="md:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer select-none whitespace-nowrap shrink-0 bg-white border-slate-200">
                              <input
                                type="checkbox"
                                checked={Boolean(cost.paid)}
                                onChange={(e) =>
                                  handleTogglePaid(reservation, cost.id, e.target.checked)
                                }
                                className="w-4 h-4 accent-[#065F46] rounded cursor-pointer"
                              />
                              <span className={cost.paid ? 'text-[#065F46]' : 'text-slate-600'}>
                                {cost.paid ? '지불 완료' : '미지급'}
                              </span>
                            </label>
                          )}
                        </div>

                        {/* 2. 고객명(또는 상품명) */}
                        <div className="md:col-span-3 min-w-0">
                          {canOpenTourDetail ? (
                            <button
                              type="button"
                              onClick={() => onOpenReservationDetail(reservation.id)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-[#065F46] hover:underline cursor-pointer max-w-full"
                            >
                              <span className="truncate">
                                {reservation.customerName} ({reservation.customerCount}인)
                              </span>
                              <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                            </button>
                          ) : (
                            <span className="block text-xs font-bold text-slate-800 truncate">
                              {reservation.customerName} ({reservation.customerCount}인)
                            </span>
                          )}
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {reservation.productName}
                          </p>
                        </div>

                        {/* 3. 카테고리 · 항목명 */}
                        <div className="md:col-span-4 min-w-0">
                          <div className="flex items-start gap-2">
                            <span
                              className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md whitespace-nowrap shrink-0 mt-0.5 ${CATEGORY_BADGE_CLASS[category]}`}
                            >
                              {category}
                            </span>
                            <div className="min-w-0">
                              <p
                                className={`text-xs sm:text-sm font-semibold leading-snug ${
                                  cost.paid ? 'text-slate-400 line-through' : 'text-slate-900'
                                }`}
                              >
                                {cost.title}
                              </p>
                              {cost.note && (
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {cost.note}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 4. 금액(통화) */}
                        <div className="md:col-span-2 flex items-center justify-between md:block md:text-right font-mono whitespace-nowrap">
                          <span className="md:hidden text-xs text-slate-400 font-sans">금액</span>
                          <div>
                            <div
                              className={`text-sm font-bold ${
                                cost.paid ? 'text-slate-400' : 'text-slate-900'
                              }`}
                            >
                              {formatOriginalCurrency(originalAmount, currency)}
                            </div>
                            {currency !== 'KRW' && (
                              <div className="text-[11px] text-slate-500">
                                환산 {formatKrw(convertedKrw)}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 5. 지불 상태 체크박스 (Desktop) */}
                        <div className="hidden md:flex md:col-span-1 justify-end">
                          {readOnly ? (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 ${
                                cost.paid
                                  ? 'bg-emerald-50 border-emerald-200 text-[#065F46]'
                                  : 'bg-slate-50 border-slate-200 text-slate-500'
                              }`}
                            >
                              {cost.paid ? '지불 완료' : '미지급'}
                            </span>
                          ) : (
                            <label
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer select-none ${
                                cost.paid
                                  ? 'bg-emerald-50 border-emerald-200 text-[#065F46]'
                                  : 'bg-white border-slate-300 text-slate-600 hover:border-[#065F46]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(cost.paid)}
                                onChange={(e) =>
                                  handleTogglePaid(reservation, cost.id, e.target.checked)
                                }
                                className="w-3.5 h-3.5 accent-[#065F46] rounded cursor-pointer"
                              />
                              <span>{cost.paid ? '완료' : '지불'}</span>
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
