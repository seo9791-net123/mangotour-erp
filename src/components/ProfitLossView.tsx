import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  FIXED_COST_CATEGORIES,
  type CostCurrency,
  type FixedCostCategory,
  type MonthlyFixedCost,
  type Reservation,
} from '../types/erp';
import {
  MONTHLY_FIXED_EXPENSES_SETUP_SQL,
  normalizeFixedCostCategory,
} from '../services/monthlyFixedExpensesService';
import { generateUuid } from '../utils/pdfParser';
import {
  calculateReservationFinance,
  calculateReservationReceivable,
  convertCostAmount,
  DEFAULT_KRW_RATE,
  DEFAULT_VND_RATE,
  exportAnnualPnlToCsv,
  formatKrw,
  formatUsd,
  getCostItemCurrency,
  getCostItemOriginalAmount,
  isBookingCancelled,
} from '../utils/storage';

interface ProfitLossViewProps {
  reservations: Reservation[];
  fixedCosts: MonthlyFixedCost[];
  fixedCostsWarning?: string;
  onAddFixedCost: (item: MonthlyFixedCost) => Promise<void> | void;
  onUpdateFixedCost: (item: MonthlyFixedCost) => Promise<void> | void;
  onDeleteFixedCost: (id: string) => Promise<void> | void;
  onOpenReservationDetail: (id: string) => void;
}

type PnlSubTab = 'monthly' | 'annual';

const CURRENCY_OPTIONS: Array<{ value: CostCurrency; label: string; symbol: string }> = [
  { value: 'KRW', label: 'KRW', symbol: '₩' },
  { value: 'USD', label: 'USD', symbol: '$' },
  { value: 'VND', label: 'VND', symbol: '₫' },
];

interface MonthlyBucket {
  month: number;
  revenueKrw: number;
  revenueUsd: number;
  lodgingKrw: number;
  golfKrw: number;
  vehicleKrw: number;
  guideKrw: number;
  mealKrw: number;
  massageOptionKrw: number;
  otherCostKrw: number;
  totalCostKrw: number;
  grossProfitKrw: number;
  fixedCostKrw: number;
  operatingProfitKrw: number;
  operatingMarginPercent: number;
  tourCount: number;
}

function formatAxisKrw(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 100_000_000) {
    return `${sign}${(abs / 100_000_000).toFixed(1)}억`;
  }
  if (abs >= 10_000) {
    return `${sign}${Math.round(abs / 10_000).toLocaleString()}만`;
  }
  return `${sign}${Math.round(abs).toLocaleString()}`;
}

export const ProfitLossView: React.FC<ProfitLossViewProps> = ({
  reservations,
  fixedCosts,
  fixedCostsWarning,
  onAddFixedCost,
  onUpdateFixedCost,
  onDeleteFixedCost,
  onOpenReservationDetail,
}) => {
  const now = new Date();
  const [subTab, setSubTab] = useState<PnlSubTab>('monthly');
  const [selectedYear, setSelectedYear] = useState<number>(() => now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(() => now.getMonth() + 1);
  const [showSqlBox, setShowSqlBox] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [hoveredChartMonth, setHoveredChartMonth] = useState<number | null>(null);

  // New Fixed Expense Input Form State
  const [newCategory, setNewCategory] = useState<FixedCostCategory>('직원 급여');
  const [newTitle, setNewTitle] = useState('');
  const [newAmountKrw, setNewAmountKrw] = useState('');
  const [newNote, setNewNote] = useState('');
  const [formError, setFormError] = useState('');

  const safeReservations = Array.isArray(reservations) ? reservations : [];
  const safeFixedCosts = Array.isArray(fixedCosts) ? fixedCosts : [];

  const yearOptions = useMemo(() => {
    const set = new Set<number>([now.getFullYear(), now.getFullYear() - 1, now.getFullYear() + 1]);
    safeReservations.forEach((r) => {
      const y = Number((r?.startDate || '').slice(0, 4));
      if (y >= 2020 && y <= 2035) set.add(y);
    });
    safeFixedCosts.forEach((f) => {
      const y = Number((f?.yearMonth || '').slice(0, 4));
      if (y >= 2020 && y <= 2035) set.add(y);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [safeReservations, safeFixedCosts, now]);

  const selectedYearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  // 1. Monthly P&L Data (aggregated by start_date YYYY-MM)
  // 취소된 투어도 취소수수료/위약금 정산 내역 확인 및 월 손익 반영을 위해 포함 (단, 원 견적·예정 원가는 제외)
  const monthlyTours = useMemo(
    () =>
      safeReservations
        .filter(
          (r) =>
            r &&
            typeof r.startDate === 'string' &&
            r.startDate.startsWith(selectedYearMonth)
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [safeReservations, selectedYearMonth]
  );

  const monthlyFixedItems = useMemo(
    () => safeFixedCosts.filter((f) => f && f.yearMonth === selectedYearMonth),
    [safeFixedCosts, selectedYearMonth]
  );

  const monthlySummary = useMemo(() => {
    let totalRevenueKrw = 0;
    let totalRevenueUsd = 0;
    let totalCostKrw = 0;
    let totalCostUsd = 0;
    let unpaidReceivableKrw = 0;
    let unpaidReceivableUsd = 0;
    let unpaidReceivableCount = 0;
    let unpaidPayableKrw = 0;
    let unpaidPayableUsd = 0;
    let unpaidPayableCount = 0;

    monthlyTours.forEach((res) => {
      const krwRate = Number(res.exchangeRate) > 0 ? Number(res.exchangeRate) : DEFAULT_KRW_RATE;
      const vndRate =
        Number(res.vndExchangeRate) > 0 ? Number(res.vndExchangeRate) : DEFAULT_VND_RATE;

      // 예약취소 건: 원래 total_krw와 cost_items(미수금/미지급 포함) 완전 제외, 취소 수수료 매출 & 위약금 원가만 합산
      if (isBookingCancelled(res)) {
        const cancelFeeKrw = Math.max(0, Number(res.cancelFeeRevenueKrw) || 0);
        const penaltyCostKrw = Math.max(0, Number(res.cancelPenaltyCostKrw) || 0);
        totalRevenueKrw += cancelFeeKrw;
        totalRevenueUsd += Number((cancelFeeKrw / krwRate).toFixed(2));
        totalCostKrw += penaltyCostKrw;
        totalCostUsd += Number((penaltyCostKrw / krwRate).toFixed(2));
        return;
      }

      const revUsd = Number(res.totalPriceUsd) || 0;
      const revKrw = Number(res.totalPriceKrw) || Math.round(revUsd * krwRate);
      totalRevenueUsd += revUsd;
      totalRevenueKrw += revKrw;

      const fin = calculateReservationFinance(res);
      totalCostUsd += fin.totalCostUsd;
      totalCostKrw += fin.totalCostKrw;

      const rec = calculateReservationReceivable(res);
      if (rec.unpaidKrw > 0 || rec.unpaidUsd > 0) {
        unpaidReceivableKrw += rec.unpaidKrw;
        unpaidReceivableUsd += rec.unpaidUsd;
        unpaidReceivableCount += 1;
      }

      const costs = Array.isArray(res.costItems) ? res.costItems : [];
      costs.forEach((cost) => {
        if (!cost || cost.paid) return;
        const currency = getCostItemCurrency(cost);
        const orig = getCostItemOriginalAmount(cost);
        const conv = convertCostAmount(orig, currency, krwRate, vndRate);
        unpaidPayableKrw += conv.costKrw;
        unpaidPayableUsd += conv.costUsd;
        unpaidPayableCount += 1;
      });
    });

    const totalFixedCostKrw = monthlyFixedItems.reduce(
      (sum, item) => sum + (Number(item?.amountKrw) || 0),
      0
    );
    const grossProfitKrw = totalRevenueKrw - totalCostKrw;
    const operatingProfitKrw = grossProfitKrw - totalFixedCostKrw;
    const netMarginPercent =
      totalRevenueKrw > 0 ? (operatingProfitKrw / totalRevenueKrw) * 100 : 0;

    return {
      totalRevenueKrw,
      totalRevenueUsd,
      totalCostKrw,
      totalCostUsd,
      grossProfitKrw,
      totalFixedCostKrw,
      operatingProfitKrw,
      netMarginPercent,
      unpaidReceivableKrw,
      unpaidReceivableUsd,
      unpaidReceivableCount,
      unpaidPayableKrw,
      unpaidPayableUsd,
      unpaidPayableCount,
    };
  }, [monthlyTours, monthlyFixedItems]);

  const handleCreateFixedExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountKrw = Math.max(0, Number(newAmountKrw) || 0);
    if (amountKrw <= 0) {
      setFormError('원화 금액(KRW)을 0보다 크게 입력해 주세요.');
      return;
    }

    setFormError('');
    const item: MonthlyFixedCost = {
      id: generateUuid(),
      yearMonth: selectedYearMonth,
      category: newCategory,
      title: newTitle.trim() || newCategory,
      currency: 'KRW',
      originalAmount: amountKrw,
      amountKrw,
      note: newNote.trim(),
    };
    await onAddFixedCost(item);
    setNewTitle('');
    setNewAmountKrw('');
    setNewNote('');
  };

  // 2. Annual Financial Statement Data (12 months for selectedYear, 7 cost categories)
  const annualData = useMemo(() => {
    const buckets: MonthlyBucket[] = Array.from({ length: 12 }, (_, idx) => ({
      month: idx + 1,
      revenueKrw: 0,
      revenueUsd: 0,
      lodgingKrw: 0,
      golfKrw: 0,
      vehicleKrw: 0,
      guideKrw: 0,
      mealKrw: 0,
      massageOptionKrw: 0,
      otherCostKrw: 0,
      totalCostKrw: 0,
      grossProfitKrw: 0,
      fixedCostKrw: 0,
      operatingProfitKrw: 0,
      operatingMarginPercent: 0,
      tourCount: 0,
    }));

    safeReservations.forEach((res) => {
      if (!res || typeof res.startDate !== 'string') return;
      const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(res.startDate);
      if (!match) return;
      const y = Number(match[1]);
      const m = Number(match[2]);
      if (y !== selectedYear || m < 1 || m > 12) return;

      const bucket = buckets[m - 1];
      const krwRate = Number(res.exchangeRate) > 0 ? Number(res.exchangeRate) : DEFAULT_KRW_RATE;
      const vndRate =
        Number(res.vndExchangeRate) > 0 ? Number(res.vndExchangeRate) : DEFAULT_VND_RATE;

      // 예약취소 건: 원래 total_krw & cost_items 완전 제외, 취소 수수료 매출 & 위약금 원가만 합산
      if (isBookingCancelled(res)) {
        const cancelFeeKrw = Math.max(0, Number(res.cancelFeeRevenueKrw) || 0);
        const penaltyCostKrw = Math.max(0, Number(res.cancelPenaltyCostKrw) || 0);
        bucket.revenueKrw += cancelFeeKrw;
        bucket.revenueUsd += Number((cancelFeeKrw / krwRate).toFixed(2));
        bucket.totalCostKrw += penaltyCostKrw;
        bucket.otherCostKrw += penaltyCostKrw;
        return;
      }

      const revUsd = Number(res.totalPriceUsd) || 0;
      const revKrw = Number(res.totalPriceKrw) || Math.round(revUsd * krwRate);

      bucket.revenueUsd += revUsd;
      bucket.revenueKrw += revKrw;
      bucket.tourCount += 1;

      const costs = Array.isArray(res.costItems) ? res.costItems : [];
      costs.forEach((cost) => {
        if (!cost) return;
        const currency = getCostItemCurrency(cost);
        const orig = getCostItemOriginalAmount(cost);
        const conv = convertCostAmount(orig, currency, krwRate, vndRate);
        const krw = conv.costKrw;
        bucket.totalCostKrw += krw;

        const cat = String(cost.category || '');
        if (cat === '숙박') bucket.lodgingKrw += krw;
        else if (cat === '골프장') bucket.golfKrw += krw;
        else if (cat === '차량') bucket.vehicleKrw += krw;
        else if (cat === '가이드') bucket.guideKrw += krw;
        else if (cat === '식사') bucket.mealKrw += krw;
        else if (cat === '마사지/옵션' || cat === '마사지') bucket.massageOptionKrw += krw;
        else bucket.otherCostKrw += krw;
      });
    });

    safeFixedCosts.forEach((fc) => {
      if (!fc || typeof fc.yearMonth !== 'string') return;
      const match = /^(\d{4})-(\d{2})$/.exec(fc.yearMonth);
      if (!match) return;
      const y = Number(match[1]);
      const m = Number(match[2]);
      if (y !== selectedYear || m < 1 || m > 12) return;
      buckets[m - 1].fixedCostKrw += Number(fc.amountKrw) || 0;
    });

    const totals: MonthlyBucket = {
      month: 0,
      revenueKrw: 0,
      revenueUsd: 0,
      lodgingKrw: 0,
      golfKrw: 0,
      vehicleKrw: 0,
      guideKrw: 0,
      mealKrw: 0,
      massageOptionKrw: 0,
      otherCostKrw: 0,
      totalCostKrw: 0,
      grossProfitKrw: 0,
      fixedCostKrw: 0,
      operatingProfitKrw: 0,
      operatingMarginPercent: 0,
      tourCount: 0,
    };

    buckets.forEach((b) => {
      b.grossProfitKrw = b.revenueKrw - b.totalCostKrw;
      b.operatingProfitKrw = b.grossProfitKrw - b.fixedCostKrw;
      b.operatingMarginPercent =
        b.revenueKrw > 0 ? (b.operatingProfitKrw / b.revenueKrw) * 100 : 0;

      totals.revenueKrw += b.revenueKrw;
      totals.revenueUsd += b.revenueUsd;
      totals.lodgingKrw += b.lodgingKrw;
      totals.golfKrw += b.golfKrw;
      totals.vehicleKrw += b.vehicleKrw;
      totals.guideKrw += b.guideKrw;
      totals.mealKrw += b.mealKrw;
      totals.massageOptionKrw += b.massageOptionKrw;
      totals.otherCostKrw += b.otherCostKrw;
      totals.totalCostKrw += b.totalCostKrw;
      totals.grossProfitKrw += b.grossProfitKrw;
      totals.fixedCostKrw += b.fixedCostKrw;
      totals.operatingProfitKrw += b.operatingProfitKrw;
      totals.tourCount += b.tourCount;
    });

    totals.operatingMarginPercent =
      totals.revenueKrw > 0 ? (totals.operatingProfitKrw / totals.revenueKrw) * 100 : 0;

    return { buckets, totals };
  }, [safeReservations, safeFixedCosts, selectedYear]);

  // Combo Chart geometry (Revenue Bars + Operating Profit Line)
  const chartGeometry = useMemo(() => {
    const svgWidth = 880;
    const svgHeight = 250;
    const padLeft = 64;
    const padRight = 24;
    const padTop = 24;
    const padBottom = 34;
    const plotWidth = svgWidth - padLeft - padRight;
    const plotHeight = svgHeight - padTop - padBottom;

    const values = annualData.buckets.flatMap((b) => [b.revenueKrw, b.operatingProfitKrw]);
    const rawMax = Math.max(0, ...values);
    const rawMin = Math.min(0, ...values);
    const span = rawMax - rawMin || 1_000_000;
    const maxVal = rawMax > 0 ? rawMax * 1.12 : 1_000_000;
    const minVal = rawMin < 0 ? rawMin * 1.15 : 0;
    const totalRange = maxVal - minVal || span;

    const valueToY = (v: number) => padTop + ((maxVal - v) / totalRange) * plotHeight;
    const zeroY = valueToY(0);
    const slotWidth = plotWidth / 12;
    const barWidth = Math.min(34, slotWidth * 0.48);

    const points = annualData.buckets.map((b, idx) => {
      const cx = padLeft + slotWidth * idx + slotWidth / 2;
      const revY = valueToY(b.revenueKrw);
      const profitY = valueToY(b.operatingProfitKrw);
      return {
        month: b.month,
        cx,
        barX: cx - barWidth / 2,
        barY: Math.min(revY, zeroY),
        barHeight: Math.max(2, Math.abs(zeroY - revY)),
        profitY,
        bucket: b,
      };
    });

    const linePath = points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.cx.toFixed(1)} ${p.profitY.toFixed(1)}`)
      .join(' ');

    const yTicks = [maxVal, maxVal * 0.5, 0, ...(minVal < 0 ? [minVal] : [])];

    return {
      svgWidth,
      svgHeight,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotWidth,
      zeroY,
      barWidth,
      points,
      linePath,
      yTicks,
      valueToY,
    };
  }, [annualData]);

  const handleExportAnnualCsv = () => {
    const { buckets, totals } = annualData;
    const rows = [
      {
        label: '매출액 (KRW)',
        values: buckets.map((b) => b.revenueKrw),
        annual: totals.revenueKrw,
      },
      {
        label: '투어 매입원가 소계 (KRW)',
        values: buckets.map((b) => b.totalCostKrw),
        annual: totals.totalCostKrw,
      },
      {
        label: '  - 숙박',
        values: buckets.map((b) => b.lodgingKrw),
        annual: totals.lodgingKrw,
      },
      {
        label: '  - 골프장',
        values: buckets.map((b) => b.golfKrw),
        annual: totals.golfKrw,
      },
      {
        label: '  - 차량',
        values: buckets.map((b) => b.vehicleKrw),
        annual: totals.vehicleKrw,
      },
      {
        label: '  - 가이드',
        values: buckets.map((b) => b.guideKrw),
        annual: totals.guideKrw,
      },
      {
        label: '  - 식사',
        values: buckets.map((b) => b.mealKrw),
        annual: totals.mealKrw,
      },
      {
        label: '  - 마사지/옵션',
        values: buckets.map((b) => b.massageOptionKrw),
        annual: totals.massageOptionKrw,
      },
      {
        label: '  - 기타(위약금 포함)',
        values: buckets.map((b) => b.otherCostKrw),
        annual: totals.otherCostKrw,
      },
      {
        label: '매출총이익 (KRW)',
        values: buckets.map((b) => b.grossProfitKrw),
        annual: totals.grossProfitKrw,
      },
      {
        label: '월간 고정비 합계 (KRW)',
        values: buckets.map((b) => b.fixedCostKrw),
        annual: totals.fixedCostKrw,
      },
      {
        label: '최종 영업이익 (KRW)',
        values: buckets.map((b) => b.operatingProfitKrw),
        annual: totals.operatingProfitKrw,
      },
      {
        label: '영업이익률 (%)',
        values: buckets.map((b) => `${b.operatingMarginPercent.toFixed(1)}%`),
        annual: `${totals.operatingMarginPercent.toFixed(1)}%`,
      },
    ];
    exportAnnualPnlToCsv(selectedYear, rows);
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(MONTHLY_FIXED_EXPENSES_SETUP_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      // ignore
    }
  };

  const activeHoveredBucket =
    hoveredChartMonth !== null
      ? annualData.buckets.find((b) => b.month === hoveredChartMonth) || null
      : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Optional monthly_fixed_expenses Supabase setup banner */}
      {fixedCostsWarning && (
        <div className="mx-3 sm:mx-0 bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start gap-2.5 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
              <span>{fixedCostsWarning}</span>
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
              <pre className="pr-24 whitespace-pre-wrap">{MONTHLY_FIXED_EXPENSES_SETUP_SQL}</pre>
            </div>
          )}
        </div>
      )}

      {/* Top Sub-Tab Switcher & Period Picker */}
      <div className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('monthly')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'monthly'
                ? 'bg-white text-[#065F46] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. 월간 매입·매출 관리
          </button>
          <button
            type="button"
            onClick={() => setSubTab('annual')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'annual'
                ? 'bg-white text-[#065F46] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. 연간 재무제표 (손익계산서)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            aria-label="연도 선택"
            className="px-3 py-1.5 text-xs font-mono font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46] cursor-pointer"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>

          {subTab === 'monthly' ? (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              aria-label="월 선택"
              className="px-3 py-1.5 text-xs font-mono font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46] cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={handleExportAnnualCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#D97706]" />
              <span>연간 손익표 CSV 저장</span>
            </button>
          )}
        </div>
      </div>

      {/* View 1: Monthly Sales, Cost, Fixed Cost, Operating Profit, Receivables & Payables */}
      {subTab === 'monthly' && (
        <div className="space-y-4 sm:space-y-6">
          {/* 5 KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 px-3 sm:px-0">
            {/* 1. 총 매출액 */}
            <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500">
                {selectedYear}년 {selectedMonth}월 총 매출액
              </p>
              <p className="mt-1.5 text-lg sm:text-xl font-bold text-slate-900 font-mono">
                {formatKrw(monthlySummary.totalRevenueKrw)}
              </p>
              <p className="mt-1 text-[11px] text-slate-400 font-mono">
                {formatUsd(monthlySummary.totalRevenueUsd)} · {monthlyTours.length}건
              </p>
            </div>

            {/* 2. 총 투어 매입원가 */}
            <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500">총 투어 매입원가</p>
              <p className="mt-1.5 text-lg sm:text-xl font-bold text-slate-900 font-mono">
                {formatKrw(monthlySummary.totalCostKrw)}
              </p>
              <p className="mt-1 text-[11px] text-slate-400 font-mono">
                {formatUsd(monthlySummary.totalCostUsd)} · 총이익 {formatKrw(monthlySummary.grossProfitKrw)}
              </p>
            </div>

            {/* 3. 월간 고정비 합계 */}
            <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500">월간 고정비 합계</p>
              <p className="mt-1.5 text-lg sm:text-xl font-bold text-slate-900 font-mono">
                {formatKrw(monthlySummary.totalFixedCostKrw)}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                판관비 등록{' '}
                <span className="font-mono font-semibold text-slate-700">
                  {monthlyFixedItems.length}
                </span>
                건
              </p>
            </div>

            {/* 4. 최종 영업이익 및 영업이익률 */}
            <div className="bg-white border border-emerald-200 rounded-xl sm:rounded-2xl p-4 sm:p-5">
              <p className="text-xs font-medium text-[#065F46]">최종 영업이익 · 이익률</p>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
                <span
                  className={`text-lg sm:text-xl font-bold font-mono ${
                    monthlySummary.operatingProfitKrw >= 0 ? 'text-[#065F46]' : 'text-red-600'
                  }`}
                >
                  {formatKrw(monthlySummary.operatingProfitKrw)}
                </span>
                <span className="text-xs font-bold font-mono text-[#D97706]">
                  ({monthlySummary.netMarginPercent.toFixed(1)}%)
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">매출 − 매입원가 − 고정비</p>
            </div>

            {/* 5. 미수금 & 미지급 원가 합계 */}
            <div className="bg-white border border-amber-200/80 rounded-xl sm:rounded-2xl p-4 sm:p-5 sm:col-span-2 lg:col-span-1">
              <p className="text-xs font-medium text-amber-900">미수금 · 미지급 원가</p>
              <div className="mt-1.5 space-y-1 text-xs font-mono">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-sans text-[11px] text-slate-500">
                    미수금({monthlySummary.unpaidReceivableCount}건)
                  </span>
                  <span className="font-bold text-[#D97706]">
                    {formatKrw(monthlySummary.unpaidReceivableKrw)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-sans text-[11px] text-slate-500">
                    미지급({monthlySummary.unpaidPayableCount}항목)
                  </span>
                  <span className="font-bold text-red-600">
                    {formatKrw(monthlySummary.unpaidPayableKrw)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Section: Monthly Tour P&L Table */}
          <section className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  {selectedYear}년 {selectedMonth}월 투어별 손익 내역 ({monthlyTours.length}건)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  여행 시작일(start_date) 기준 집계 · 행을 클릭하면 예약 상세를 확인·수정할 수 있습니다.
                </p>
              </div>
            </div>

            {monthlyTours.length === 0 ? (
              <div className="py-12 px-4 text-center text-xs text-slate-400">
                {selectedYear}년 {selectedMonth}월에 출발하는 투어 예약이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-3 px-4 sm:px-6 whitespace-nowrap">고객명 · 상품명</th>
                      <th className="py-3 px-4 whitespace-nowrap">여행일</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">매출 (KRW)</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">원가 (KRW)</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">건별 순수익</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">마진율</th>
                      <th className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">수금상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthlyTours.map((res) => {
                      const cancelled = isBookingCancelled(res);
                      const krwRate =
                        Number(res.exchangeRate) > 0 ? Number(res.exchangeRate) : DEFAULT_KRW_RATE;

                      if (cancelled) {
                        const cancelFee = Math.max(0, Number(res.cancelFeeRevenueKrw) || 0);
                        const penaltyCost = Math.max(0, Number(res.cancelPenaltyCostKrw) || 0);
                        const cancelProfit = cancelFee - penaltyCost;
                        const cancelMargin = cancelFee > 0 ? (cancelProfit / cancelFee) * 100 : 0;

                        return (
                          <tr
                            key={res.id}
                            onClick={() => onOpenReservationDetail(res.id)}
                            className="bg-slate-50/80 hover:bg-slate-100/70 transition-colors cursor-pointer"
                          >
                            <td className="py-3.5 px-4 sm:px-6 max-w-xs">
                              <div className="flex items-center gap-1.5 font-bold text-slate-400 line-through">
                                <span>
                                  {res.customerName} ({res.customerCount}인)
                                </span>
                                <ExternalLink className="w-3 h-3 text-slate-300 shrink-0" />
                              </div>
                              <div className="text-[11px] text-slate-400 truncate mt-0.5 line-through">
                                {res.productName}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                              <div className="line-through">
                                {res.startDate} ~ {(res.endDate || '').slice(5) || '-'}
                              </div>
                              <div className="text-[11px] text-slate-400">{res.bookingCode}</div>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-700 whitespace-nowrap">
                              <div>{formatKrw(cancelFee)}</div>
                              <div className="text-[10px] text-slate-400">취소수수료</div>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-slate-600 whitespace-nowrap">
                              <div>{formatKrw(penaltyCost)}</div>
                              <div className="text-[10px] text-slate-400">위약금 원가</div>
                            </td>
                            <td
                              className={`py-3.5 px-4 text-right font-mono font-bold whitespace-nowrap ${
                                cancelProfit >= 0 ? 'text-[#065F46]' : 'text-red-600'
                              }`}
                            >
                              {formatKrw(cancelProfit)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-500 whitespace-nowrap">
                              {cancelFee > 0 ? `${cancelMargin.toFixed(1)}%` : '-'}
                            </td>
                            <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                              <span className="inline-block px-2 py-0.5 text-[11px] font-semibold border rounded-md text-slate-500 bg-slate-100 border-slate-300">
                                예약취소
                              </span>
                            </td>
                          </tr>
                        );
                      }

                      const fin = calculateReservationFinance(res);
                      const rec = calculateReservationReceivable(res);
                      const revKrw =
                        Number(res.totalPriceKrw) ||
                        Math.round((Number(res.totalPriceUsd) || 0) * krwRate);

                      let paymentBadge = {
                        label: '완납',
                        cls: 'text-[#065F46] bg-emerald-50 border-emerald-200',
                      };
                      if (!res.depositPaid && !res.balancePaid) {
                        paymentBadge = {
                          label: '전액 미수금',
                          cls: 'text-red-700 bg-red-50 border-red-200',
                        };
                      } else if (!res.balancePaid || !res.depositPaid) {
                        paymentBadge = {
                          label: '잔금 미입금',
                          cls: 'text-amber-800 bg-amber-50 border-amber-200',
                        };
                      }

                      return (
                        <tr
                          key={res.id}
                          onClick={() => onOpenReservationDetail(res.id)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-4 sm:px-6 max-w-xs">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              <span>
                                {res.customerName} ({res.customerCount}인)
                              </span>
                              <ExternalLink className="w-3 h-3 text-slate-300 shrink-0" />
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              {res.productName}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                            <div>
                              {res.startDate} ~ {(res.endDate || '').slice(5) || '-'}
                            </div>
                            <div className="text-[11px] text-slate-400">{res.bookingCode}</div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {formatKrw(revKrw)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-600 whitespace-nowrap">
                            {formatKrw(fin.totalCostKrw)}
                          </td>
                          <td
                            className={`py-3.5 px-4 text-right font-mono font-bold whitespace-nowrap ${
                              fin.netProfitKrw >= 0 ? 'text-[#065F46]' : 'text-red-600'
                            }`}
                          >
                            {formatKrw(fin.netProfitKrw)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#D97706] whitespace-nowrap">
                            {fin.marginPercent.toFixed(1)}%
                          </td>
                          <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 text-[11px] font-semibold border rounded-md ${paymentBadge.cls}`}
                            >
                              {paymentBadge.label}
                            </span>
                            {rec.unpaidKrw > 0 && (
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                미수 {formatKrw(rec.unpaidKrw)}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Bottom Section: Monthly Fixed Costs (monthly_fixed_expenses) Input Form & List */}
          <section className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  {selectedYear}년 {selectedMonth}월 월간 고정비(판관비) 관리
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  직원 급여, 사무실 임대료, 마케팅/광고비, 통신/운영비 등을 입력하면 상단 최종 영업이익에 즉시 반영됩니다.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-800 whitespace-nowrap">
                월 합계 {formatKrw(monthlySummary.totalFixedCostKrw)}
              </span>
            </div>

            {/* Add Fixed Expense Form */}
            <form
              onSubmit={handleCreateFixedExpense}
              className="px-4 sm:px-6 py-4 bg-slate-50/70 border-b border-slate-200 space-y-2.5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    항목 구분
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as FixedCostCategory)}
                    className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                  >
                    {FIXED_COST_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    세부 항목명 (미입력 시 구분명 사용)
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={`예: ${newCategory} 정산`}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    원화 금액 (KRW)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    value={newAmountKrw}
                    onChange={(e) => setNewAmountKrw(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-xs font-mono font-semibold text-right bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    메모
                  </label>
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="지급처, 내역 메모 등"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                  />
                </div>

                <div className="lg:col-span-2">
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#065F46] hover:bg-[#054e3a] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>고정비 추가</span>
                  </button>
                </div>
              </div>
              {formError && <p className="text-xs font-medium text-red-600">{formError}</p>}
            </form>

            {/* Fixed Expenses List */}
            <div className="divide-y divide-slate-100">
              {monthlyFixedItems.length === 0 ? (
                <div className="py-10 px-4 text-center text-xs text-slate-400">
                  등록된 {selectedYear}년 {selectedMonth}월 고정비가 없습니다. 상단 폼에서 추가해 주세요.
                </div>
              ) : (
                monthlyFixedItems.map((fc) => {
                  const normalizedCategory = normalizeFixedCostCategory(fc.category);
                  const currMeta =
                    CURRENCY_OPTIONS.find((c) => c.value === fc.currency) || CURRENCY_OPTIONS[0];
                  return (
                    <div
                      key={fc.id}
                      className="px-4 sm:px-6 py-3 grid grid-cols-1 lg:grid-cols-12 lg:items-center gap-2.5"
                    >
                      <div className="lg:col-span-2">
                        <select
                          value={normalizedCategory}
                          onChange={(e) =>
                            onUpdateFixedCost({
                              ...fc,
                              category: e.target.value as FixedCostCategory,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#065F46]"
                        >
                          {FIXED_COST_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="lg:col-span-3">
                        <input
                          type="text"
                          value={fc.title}
                          onChange={(e) =>
                            onUpdateFixedCost({ ...fc, title: e.target.value })
                          }
                          placeholder="항목명"
                          className="w-full px-2.5 py-1.5 text-xs font-semibold text-slate-900 bg-transparent border border-slate-200/70 hover:border-slate-300 focus:bg-white focus:border-[#065F46] rounded-lg focus:outline-none"
                        />
                      </div>

                      <div className="lg:col-span-3">
                        <input
                          type="text"
                          value={fc.note || ''}
                          onChange={(e) =>
                            onUpdateFixedCost({ ...fc, note: e.target.value })
                          }
                          placeholder="메모 입력..."
                          className="w-full px-2.5 py-1.5 text-xs text-slate-600 bg-transparent border border-slate-200/70 hover:border-slate-300 focus:bg-white focus:border-[#065F46] rounded-lg focus:outline-none"
                        />
                      </div>

                      <div className="lg:col-span-3 flex items-center justify-between lg:justify-end gap-2">
                        <select
                          value={fc.currency}
                          aria-label="고정비 통화"
                          onChange={(e) => {
                            const nextCurrency = e.target.value as CostCurrency;
                            const conv = convertCostAmount(
                              fc.originalAmount,
                              nextCurrency,
                              DEFAULT_KRW_RATE,
                              DEFAULT_VND_RATE
                            );
                            onUpdateFixedCost({
                              ...fc,
                              currency: nextCurrency,
                              amountKrw: conv.costKrw,
                            });
                          }}
                          className="px-2 py-1.5 text-xs font-mono font-semibold bg-slate-100 border border-slate-200 rounded-lg focus:outline-none focus:border-[#065F46]"
                        >
                          {CURRENCY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>

                        <div className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus-within:bg-white focus-within:border-[#065F46]">
                          <span className="text-xs text-slate-400 font-mono">
                            {currMeta.symbol}
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={fc.currency === 'USD' ? 'any' : 10000}
                            value={fc.originalAmount}
                            onChange={(e) => {
                              const nextAmt = Math.max(0, Number(e.target.value) || 0);
                              const conv = convertCostAmount(
                                nextAmt,
                                fc.currency,
                                DEFAULT_KRW_RATE,
                                DEFAULT_VND_RATE
                              );
                              onUpdateFixedCost({
                                ...fc,
                                originalAmount: nextAmt,
                                amountKrw: conv.costKrw,
                              });
                            }}
                            className="w-28 text-right text-xs font-mono font-semibold text-slate-900 bg-transparent focus:outline-none"
                          />
                        </div>

                        <span className="text-xs font-mono font-bold text-slate-800 whitespace-nowrap min-w-[92px] text-right">
                          {formatKrw(fc.amountKrw)}
                        </span>
                      </div>

                      <div className="lg:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => onDeleteFixedCost(fc.id)}
                          aria-label="고정비 삭제"
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}

      {/* View 2: Annual Financial Statement (Combo Chart + 12-Month Matrix Table) */}
      {subTab === 'annual' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Combo Chart: Monthly Revenue (Bar) & Operating Profit (Line) */}
          <section className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  {selectedYear}년 월별 매출액 · 최종 영업이익 추이
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  막대(매출액)와 선(최종 영업이익)을 월별로 비교합니다. 월에 마우스를 올리면 상세 수치를 확인할 수 있습니다.
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-[#065F46] inline-block" />
                  <span className="font-semibold text-slate-700">매출액</span>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#D97706] inline-block" />
                  <span className="w-2 h-2 rounded-full bg-[#D97706] inline-block -ml-2" />
                  <span className="font-semibold text-slate-700">최종 영업이익</span>
                </div>
              </div>
            </div>

            {/* Hover Summary Strip */}
            <div className="mb-3 min-h-[32px] px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              {activeHoveredBucket ? (
                <>
                  <span className="font-bold text-slate-900 font-mono">
                    {selectedYear}년 {activeHoveredBucket.month}월 ({activeHoveredBucket.tourCount}건)
                  </span>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono">
                    <span className="text-slate-700">
                      매출 <strong className="text-[#065F46]">{formatKrw(activeHoveredBucket.revenueKrw)}</strong>
                    </span>
                    <span className="text-slate-600">
                      매입원가 <strong>{formatKrw(activeHoveredBucket.totalCostKrw)}</strong>
                    </span>
                    <span className="text-slate-600">
                      고정비 <strong>{formatKrw(activeHoveredBucket.fixedCostKrw)}</strong>
                    </span>
                    <span className="text-slate-900">
                      영업이익{' '}
                      <strong
                        className={
                          activeHoveredBucket.operatingProfitKrw >= 0
                            ? 'text-[#D97706]'
                            : 'text-red-600'
                        }
                      >
                        {formatKrw(activeHoveredBucket.operatingProfitKrw)} (
                        {activeHoveredBucket.operatingMarginPercent.toFixed(1)}%)
                      </strong>
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <span className="font-semibold text-slate-600">
                    {selectedYear}년 연간 누적 요약 ({annualData.totals.tourCount}건)
                  </span>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono">
                    <span>
                      연 매출 <strong className="text-[#065F46]">{formatKrw(annualData.totals.revenueKrw)}</strong>
                    </span>
                    <span>
                      연 영업이익{' '}
                      <strong
                        className={
                          annualData.totals.operatingProfitKrw >= 0
                            ? 'text-[#D97706]'
                            : 'text-red-600'
                        }
                      >
                        {formatKrw(annualData.totals.operatingProfitKrw)} (
                        {annualData.totals.operatingMarginPercent.toFixed(1)}%)
                      </strong>
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${chartGeometry.svgWidth} ${chartGeometry.svgHeight}`}
                className="w-full min-w-[640px] h-56 select-none"
                role="img"
                aria-label={`${selectedYear}년 월별 매출액 및 최종 영업이익 추이 차트`}
              >
                {/* Horizontal Grid Lines */}
                {chartGeometry.yTicks.map((tick, idx) => {
                  const y = chartGeometry.valueToY(tick);
                  const isZero = Math.abs(tick) < 1;
                  return (
                    <g key={idx}>
                      <line
                        x1={chartGeometry.padLeft}
                        x2={chartGeometry.svgWidth - chartGeometry.padRight}
                        y1={y}
                        y2={y}
                        stroke={isZero ? '#94A3B8' : '#E2E8F0'}
                        strokeWidth={isZero ? 1.2 : 1}
                        strokeDasharray={isZero ? undefined : '3 3'}
                      />
                      <text
                        x={chartGeometry.padLeft - 8}
                        y={y + 3.5}
                        textAnchor="end"
                        className="fill-slate-400 text-[10px] font-mono"
                      >
                        {formatAxisKrw(tick)}
                      </text>
                    </g>
                  );
                })}

                {/* Revenue Bars */}
                {chartGeometry.points.map((pt) => {
                  const isHovered = hoveredChartMonth === pt.month;
                  return (
                    <g
                      key={pt.month}
                      onMouseEnter={() => setHoveredChartMonth(pt.month)}
                      onMouseLeave={() => setHoveredChartMonth(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={pt.cx - 28}
                        y={chartGeometry.padTop}
                        width={56}
                        height={chartGeometry.svgHeight - chartGeometry.padTop - chartGeometry.padBottom}
                        fill={isHovered ? '#F8FAFC' : 'transparent'}
                        rx={6}
                      />
                      <rect
                        x={pt.barX}
                        y={pt.barY}
                        width={chartGeometry.barWidth}
                        height={pt.barHeight}
                        rx={4}
                        fill={isHovered ? '#047857' : '#065F46'}
                        opacity={pt.bucket.revenueKrw === 0 ? 0.2 : 0.9}
                      />
                      <text
                        x={pt.cx}
                        y={chartGeometry.svgHeight - 10}
                        textAnchor="middle"
                        className={`text-[11px] font-mono ${
                          isHovered ? 'fill-slate-900 font-bold' : 'fill-slate-500'
                        }`}
                      >
                        {pt.month}월
                      </text>
                    </g>
                  );
                })}

                {/* Operating Profit Line */}
                <path
                  d={chartGeometry.linePath}
                  fill="none"
                  stroke="#D97706"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* Operating Profit Nodes */}
                {chartGeometry.points.map((pt) => {
                  const isHovered = hoveredChartMonth === pt.month;
                  const isNegative = pt.bucket.operatingProfitKrw < 0;
                  return (
                    <circle
                      key={`dot-${pt.month}`}
                      cx={pt.cx}
                      cy={pt.profitY}
                      r={isHovered ? 5.5 : 4}
                      fill={isNegative ? '#DC2626' : '#D97706'}
                      stroke="#FFFFFF"
                      strokeWidth={2}
                      onMouseEnter={() => setHoveredChartMonth(pt.month)}
                      onMouseLeave={() => setHoveredChartMonth(null)}
                      className="cursor-pointer"
                    />
                  );
                })}
              </svg>
            </div>
          </section>

          {/* 12-Month Horizontal Financial Statement Matrix */}
          <section className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  {selectedYear}년 연간 손익계산서 (단위: 원 / KRW)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  여행 시작일(start_date) 기준으로 1~12월 매출, 7대 카테고리 매입원가, 고정비, 영업이익을 집계합니다.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500">
                연간 출발 투어 {annualData.totals.tourCount}건
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="py-3 px-4 text-left border-r border-slate-200 sticky left-0 bg-slate-100 z-10 min-w-[180px] whitespace-nowrap">
                      손익 항목
                    </th>
                    {annualData.buckets.map((b) => (
                      <th
                        key={b.month}
                        className="py-3 px-3 border-r border-slate-200 min-w-[105px] whitespace-nowrap font-mono"
                      >
                        {b.month}월
                      </th>
                    ))}
                    <th className="py-3 px-4 bg-emerald-50 text-[#065F46] min-w-[130px] whitespace-nowrap font-mono">
                      연간 누적 합계
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 font-mono">
                  {/* 1) 매출액 */}
                  <tr className="bg-white hover:bg-slate-50/70 font-bold text-slate-900">
                    <td className="py-3 px-4 text-left font-sans border-r border-slate-200 sticky left-0 bg-white z-10 whitespace-nowrap">
                      1. 매출액
                    </td>
                    {annualData.buckets.map((b) => (
                      <td key={b.month} className="py-3 px-3 border-r border-slate-100 whitespace-nowrap">
                        {b.revenueKrw !== 0 ? b.revenueKrw.toLocaleString() : '-'}
                      </td>
                    ))}
                    <td className="py-3 px-4 bg-emerald-50/40 font-bold text-slate-900 whitespace-nowrap">
                      {annualData.totals.revenueKrw.toLocaleString()}
                    </td>
                  </tr>

                  {/* 2) 투어 매입원가 소계 */}
                  <tr className="bg-slate-50/60 hover:bg-slate-100/60 font-semibold text-slate-800">
                    <td className="py-2.5 px-4 text-left font-sans border-r border-slate-200 sticky left-0 bg-slate-50 z-10 whitespace-nowrap">
                      2. 투어 매입원가 소계
                    </td>
                    {annualData.buckets.map((b) => (
                      <td key={b.month} className="py-2.5 px-3 border-r border-slate-100 whitespace-nowrap">
                        {b.totalCostKrw !== 0 ? b.totalCostKrw.toLocaleString() : '-'}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 bg-emerald-50/30 font-bold whitespace-nowrap">
                      {annualData.totals.totalCostKrw.toLocaleString()}
                    </td>
                  </tr>

                  {/* 7대 카테고리별 원가 내역 */}
                  {(
                    [
                      { key: 'lodgingKrw', label: '└ 숙박' },
                      { key: 'golfKrw', label: '└ 골프장' },
                      { key: 'vehicleKrw', label: '└ 차량' },
                      { key: 'guideKrw', label: '└ 가이드' },
                      { key: 'mealKrw', label: '└ 식사' },
                      { key: 'massageOptionKrw', label: '└ 마사지/옵션' },
                      { key: 'otherCostKrw', label: '└ 기타 (위약금 포함)' },
                    ] as const
                  ).map((costRow) => (
                    <tr key={costRow.key} className="bg-white hover:bg-slate-50/50 text-slate-500">
                      <td className="py-2 px-4 pl-6 text-left font-sans border-r border-slate-200 sticky left-0 bg-white z-10 whitespace-nowrap">
                        {costRow.label}
                      </td>
                      {annualData.buckets.map((b) => {
                        const val = b[costRow.key];
                        return (
                          <td
                            key={b.month}
                            className="py-2 px-3 border-r border-slate-100 whitespace-nowrap"
                          >
                            {val !== 0 ? val.toLocaleString() : '-'}
                          </td>
                        );
                      })}
                      <td className="py-2 px-4 bg-emerald-50/20 font-semibold text-slate-700 whitespace-nowrap">
                        {annualData.totals[costRow.key].toLocaleString()}
                      </td>
                    </tr>
                  ))}

                  {/* 3) 매출총이익 */}
                  <tr className="bg-amber-50/30 hover:bg-amber-50/50 font-bold text-slate-900">
                    <td className="py-3 px-4 text-left font-sans border-r border-slate-200 sticky left-0 bg-amber-50/50 z-10 whitespace-nowrap">
                      3. 매출총이익 (매출 − 원가)
                    </td>
                    {annualData.buckets.map((b) => (
                      <td
                        key={b.month}
                        className={`py-3 px-3 border-r border-slate-100 whitespace-nowrap ${
                          b.grossProfitKrw < 0 ? 'text-red-600' : ''
                        }`}
                      >
                        {b.grossProfitKrw !== 0 ? b.grossProfitKrw.toLocaleString() : '-'}
                      </td>
                    ))}
                    <td
                      className={`py-3 px-4 bg-emerald-50/50 font-bold whitespace-nowrap ${
                        annualData.totals.grossProfitKrw < 0 ? 'text-red-600' : 'text-slate-900'
                      }`}
                    >
                      {annualData.totals.grossProfitKrw.toLocaleString()}
                    </td>
                  </tr>

                  {/* 4) 월간 고정비(판관비) 합계 */}
                  <tr className="bg-white hover:bg-slate-50/70 text-slate-700">
                    <td className="py-2.5 px-4 text-left font-sans font-semibold border-r border-slate-200 sticky left-0 bg-white z-10 whitespace-nowrap">
                      4. 월간 고정비(판관비) 합계
                    </td>
                    {annualData.buckets.map((b) => (
                      <td key={b.month} className="py-2.5 px-3 border-r border-slate-100 whitespace-nowrap">
                        {b.fixedCostKrw !== 0 ? b.fixedCostKrw.toLocaleString() : '-'}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 bg-emerald-50/30 font-bold text-slate-800 whitespace-nowrap">
                      {annualData.totals.fixedCostKrw.toLocaleString()}
                    </td>
                  </tr>

                  {/* 5) 최종 영업이익 */}
                  <tr className="bg-emerald-50/50 hover:bg-emerald-50/80 font-bold border-t-2 border-slate-300">
                    <td className="py-3.5 px-4 text-left font-sans text-[#065F46] border-r border-slate-200 sticky left-0 bg-emerald-50 z-10 whitespace-nowrap">
                      5. 최종 영업이익
                    </td>
                    {annualData.buckets.map((b) => (
                      <td
                        key={b.month}
                        className={`py-3.5 px-3 border-r border-emerald-100 whitespace-nowrap ${
                          b.operatingProfitKrw > 0
                            ? 'text-[#065F46]'
                            : b.operatingProfitKrw < 0
                              ? 'text-red-600'
                              : 'text-slate-400'
                        }`}
                      >
                        {b.operatingProfitKrw !== 0 ? b.operatingProfitKrw.toLocaleString() : '-'}
                      </td>
                    ))}
                    <td
                      className={`py-3.5 px-4 bg-emerald-100/70 font-bold whitespace-nowrap ${
                        annualData.totals.operatingProfitKrw >= 0
                          ? 'text-[#065F46]'
                          : 'text-red-600'
                      }`}
                    >
                      {annualData.totals.operatingProfitKrw.toLocaleString()}
                    </td>
                  </tr>

                  {/* 6) 영업이익률 (%) */}
                  <tr className="bg-slate-50 font-bold text-[#D97706]">
                    <td className="py-2.5 px-4 text-left font-sans text-slate-700 border-r border-slate-200 sticky left-0 bg-slate-50 z-10 whitespace-nowrap">
                      6. 영업이익률 (%)
                    </td>
                    {annualData.buckets.map((b) => (
                      <td key={b.month} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                        {b.revenueKrw !== 0 ? `${b.operatingMarginPercent.toFixed(1)}%` : '-'}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 bg-emerald-50 font-bold text-[#D97706] whitespace-nowrap">
                      {annualData.totals.revenueKrw !== 0
                        ? `${annualData.totals.operatingMarginPercent.toFixed(1)}%`
                        : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
