import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { Reservation } from '../types/erp';
import { formatKrw } from '../utils/storage';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

interface CancelPenaltyModalProps {
  reservation: Reservation;
  hideOriginalPrice?: boolean;
  onConfirm: (cancelFeeRevenueKrw: number, cancelPenaltyCostKrw: number) => void;
  onCancel: () => void;
}

export const CancelPenaltyModal: React.FC<CancelPenaltyModalProps> = ({
  reservation,
  hideOriginalPrice = false,
  onConfirm,
  onCancel,
}) => {
  const [feeRevenue, setFeeRevenue] = useState<string>(() =>
    String(Math.max(0, Number(reservation.cancelFeeRevenueKrw) || 0))
  );
  const [penaltyCost, setPenaltyCost] = useState<string>(() =>
    String(Math.max(0, Number(reservation.cancelPenaltyCostKrw) || 0))
  );

  useBodyScrollLock(true);

  const parsedRevenue = Math.max(0, Math.round(Number(feeRevenue) || 0));
  const parsedCost = Math.max(0, Math.round(Number(penaltyCost) || 0));
  const netCancelProfit = parsedRevenue - parsedCost;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(parsedRevenue, parsedCost);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px] p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#D97706]">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">예약취소 · 위약금 정산 입력</h3>
              <p className="text-[11px] text-slate-500 font-mono">
                {reservation.bookingCode} · {reservation.customerName} ({reservation.customerCount}인)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 leading-relaxed">
            <strong>예약취소</strong> 처리 시{' '}
            {hideOriginalPrice
              ? '기존 견적 매출과 예정 원가는 '
              : `기존 견적 매출(${formatKrw(reservation.totalPriceKrw)})과 예정 원가는 `}
            재무제표·일자별 지출관리에서 제외되며, 아래 입력한 취소 수수료·위약금만 해당 월 손익에 반영됩니다.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              고객에게 받은 취소 수수료 매출 (KRW)
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                step={10000}
                value={feeRevenue}
                onChange={(e) => setFeeRevenue(e.target.value)}
                placeholder="0"
                className="w-full px-3.5 py-2.5 pr-10 text-sm font-mono font-bold text-right bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                원
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              거래처에 지불한 위약금 원가 (KRW)
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                step={10000}
                value={penaltyCost}
                onChange={(e) => setPenaltyCost(e.target.value)}
                placeholder="0"
                className="w-full px-3.5 py-2.5 pr-10 text-sm font-mono font-bold text-right bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                원
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              발생한 위약금이 없으면 0원으로 그대로 저장하세요.
            </p>
          </div>

          <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200/70 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600">취소 정산 순손익</span>
            <span
              className={`font-mono font-bold ${
                netCancelProfit >= 0 ? 'text-[#065F46]' : 'text-red-600'
              }`}
            >
              {formatKrw(netCancelProfit)}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl whitespace-nowrap cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl whitespace-nowrap cursor-pointer"
            >
              예약취소 확정
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
