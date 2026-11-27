import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, Plus, Search, Trash2 } from 'lucide-react';
import type { BookingStatus, ExcelSheetRow, Reservation } from '../types/erp';
import {
  calculateReservationFinance,
  exportCustomSheetToCsv,
  exportReservationsToCsv,
  formatKrw,
  formatUsd,
} from '../utils/storage';
import { generateUuid } from '../utils/pdfParser';

interface ExcelSheetViewProps {
  reservations: Reservation[];
  excelRows: ExcelSheetRow[];
  onUpdateReservation: (id: string, updates: Partial<Reservation>) => void;
  onAddReservationRow: (reservation: Reservation) => void;
  onDeleteReservation: (id: string) => void;
  onUpdateExcelRows: (rows: ExcelSheetRow[]) => void;
}

type SheetTab = 'master' | 'ledger';

export const ExcelSheetView: React.FC<ExcelSheetViewProps> = ({
  reservations,
  excelRows,
  onUpdateReservation,
  onAddReservationRow,
  onDeleteReservation,
  onUpdateExcelRows,
}) => {
  const [activeSheet, setActiveSheet] = useState<SheetTab>('master');
  const [searchQuery, setSearchQuery] = useState('');

  const safeReservations = Array.isArray(reservations) ? reservations : [];
  const safeExcelRows = Array.isArray(excelRows) ? excelRows : [];

  // Master sheet computations
  const filteredReservations = useMemo(() => {
    if (!searchQuery.trim()) return safeReservations;
    const q = searchQuery.trim().toLowerCase();
    return safeReservations.filter(
      (r) =>
        Boolean(r) &&
        ((r.customerName || '').toLowerCase().includes(q) ||
          (r.productName || '').toLowerCase().includes(q) ||
          (r.bookingCode || '').toLowerCase().includes(q) ||
          (r.managerName || '').toLowerCase().includes(q))
    );
  }, [safeReservations, searchQuery]);

  const masterTotals = useMemo(() => {
    let revenueUsd = 0;
    let costUsd = 0;
    let profitUsd = 0;
    filteredReservations.forEach((r) => {
      if (!r || r.status === '취소') return;
      const fin = calculateReservationFinance(r);
      revenueUsd += Number(r.totalPriceUsd) || 0;
      costUsd += fin.totalCostUsd;
      profitUsd += fin.netProfitUsd;
    });
    return { revenueUsd, costUsd, profitUsd };
  }, [filteredReservations]);

  // Custom Ledger sheet computations
  const filteredExcelRows = useMemo(() => {
    if (!searchQuery.trim()) return safeExcelRows;
    const q = searchQuery.trim().toLowerCase();
    return safeExcelRows.filter(
      (row) =>
        Boolean(row) &&
        ((row.category || '').toLowerCase().includes(q) ||
          (row.customerOrVendor || '').toLowerCase().includes(q) ||
          (row.description || '').toLowerCase().includes(q) ||
          (row.note || '').toLowerCase().includes(q))
    );
  }, [safeExcelRows, searchQuery]);

  const ledgerTotals = useMemo(() => {
    const income = filteredExcelRows.reduce((s, r) => s + (Number(r?.incomeUsd) || 0), 0);
    const expense = filteredExcelRows.reduce((s, r) => s + (Number(r?.expenseUsd) || 0), 0);
    return { income, expense, net: income - expense };
  }, [filteredExcelRows]);

  const handleAddMasterRow = () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const id = generateUuid();
    onAddReservationRow({
      id,
      bookingCode: `MT-${dateStr.slice(2, 4)}${dateStr.slice(5, 7)}-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: now.toISOString(),
      customerName: '신규 고객',
      customerCount: 2,
      rawCustomerText: '신규 고객님 외 1인',
      destination: '베트남 호치민',
      productName: '호치민 골프 & 투어',
      startDate: dateStr,
      endDate: dateStr,
      managerName: '박지훈 팀장',
      status: '상담중',
      totalPriceUsd: 0,
      totalPriceKrw: 0,
      exchangeRate: 1400,
      depositPaid: false,
      depositAmountUsd: 0,
      balancePaid: false,
      balanceAmountUsd: 0,
      revenueItems: [],
      costItems: [],
      scheduleItems: [],
      memo: '',
    });
  };

  const handleAddLedgerRow = () => {
    const newRow: ExcelSheetRow = {
      id: `xl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      date: new Date().toISOString().slice(0, 10),
      category: '기타 정산',
      customerOrVendor: '',
      description: '',
      incomeUsd: 0,
      expenseUsd: 0,
      paymentMethod: '계좌이체',
      status: '대기',
      note: '',
    };
    onUpdateExcelRows([...safeExcelRows, newRow]);
  };

  const handleUpdateLedgerCell = (id: string, updates: Partial<ExcelSheetRow>) => {
    onUpdateExcelRows(safeExcelRows.map((row) => (row.id === id ? { ...row, ...updates } : row)));
  };

  const handleDeleteLedgerRow = (id: string) => {
    onUpdateExcelRows(safeExcelRows.filter((row) => row.id !== id));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Toolbar Card */}
      <div className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Sheet Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveSheet('master')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                activeSheet === 'master'
                  ? 'bg-white text-[#065F46] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              시트 1 · 예약·정산 마스터
            </button>
            <button
              type="button"
              onClick={() => setActiveSheet('ledger')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                activeSheet === 'ledger'
                  ? 'bg-white text-[#065F46] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              시트 2 · 관리자 자유 장부
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="시트 내 검색..."
              className="pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl w-52 focus:outline-none focus:bg-white focus:border-[#065F46]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={activeSheet === 'master' ? handleAddMasterRow : handleAddLedgerRow}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#065F46] hover:bg-[#054e3a] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>행 추가</span>
          </button>

          <button
            type="button"
            onClick={() =>
              activeSheet === 'master'
                ? exportReservationsToCsv(filteredReservations, 'admin')
                : exportCustomSheetToCsv(filteredExcelRows)
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#D97706]" />
            <span>현재 시트 CSV 저장</span>
          </button>
        </div>
      </div>

      {/* Sheet 1: Live Reservation Master Spreadsheet */}
      {activeSheet === 'master' && (
        <div className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>셀을 클릭하여 바로 수정하면 전체 ERP 예약·정산에 즉시 반영됩니다. (관리자 전용)</span>
            <span className="font-mono">총 {filteredReservations.length}행</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-2.5 border-r border-slate-200 w-10 text-center">#</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">예약코드</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">고객명</th>
                  <th className="py-2.5 px-2.5 border-r border-slate-200 whitespace-nowrap text-center">인원</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">상품명</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">출발일</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">종료일</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">담당자</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">상태</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-right">총매출($)</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-right">총원가($)</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-right">순수익($)</th>
                  <th className="py-2.5 px-2.5 border-r border-slate-200 whitespace-nowrap text-center">계약금</th>
                  <th className="py-2.5 px-2.5 border-r border-slate-200 whitespace-nowrap text-center">잔금</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">관리자 메모</th>
                  <th className="py-2.5 px-2.5 w-10 text-center">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredReservations.map((res, idx) => {
                  const fin = calculateReservationFinance(res);
                  return (
                    <tr key={res.id} className="hover:bg-amber-50/20">
                      <td className="py-1.5 px-2.5 border-r border-slate-200 text-center font-mono text-slate-400 bg-slate-50/50">
                        {idx + 1}
                      </td>
                      <td className="py-1.5 px-3 border-r border-slate-200 font-mono text-[#065F46] whitespace-nowrap bg-slate-50/30">
                        {res.bookingCode}
                      </td>
                      <td className="p-0 border-r border-slate-200">
                        <input
                          type="text"
                          value={res.customerName}
                          onChange={(e) =>
                            onUpdateReservation(res.id, { customerName: e.target.value })
                          }
                          className="w-24 px-2.5 py-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46] font-medium text-slate-900"
                        />
                      </td>
                      <td className="p-0 border-r border-slate-200">
                        <input
                          type="number"
                          min={1}
                          value={res.customerCount}
                          onChange={(e) =>
                            onUpdateReservation(res.id, {
                              customerCount: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-14 px-2 py-2 text-center font-mono bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                        />
                      </td>
                      <td className="p-0 border-r border-slate-200">
                        <input
                          type="text"
                          value={res.productName}
                          onChange={(e) =>
                            onUpdateReservation(res.id, { productName: e.target.value })
                          }
                          className="w-52 px-2.5 py-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                        />
                      </td>
                      <td className="p-0 border-r border-slate-200">
                        <input
                          type="date"
                          value={res.startDate}
                          onChange={(e) =>
                            onUpdateReservation(res.id, { startDate: e.target.value })
                          }
                          className="px-2 py-2 font-mono bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                        />
                      </td>
                      <td className="p-0 border-r border-slate-200">
                        <input
                          type="date"
                          value={res.endDate}
                          onChange={(e) =>
                            onUpdateReservation(res.id, { endDate: e.target.value })
                          }
                          className="px-2 py-2 font-mono bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                        />
                      </td>
                      <td className="p-0 border-r border-slate-200">
                        <input
                          type="text"
                          value={res.managerName}
                          onChange={(e) =>
                            onUpdateReservation(res.id, { managerName: e.target.value })
                          }
                          className="w-24 px-2.5 py-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                        />
                      </td>
                      <td className="p-0 border-r border-slate-200">
                        <select
                          value={res.status}
                          onChange={(e) =>
                            onUpdateReservation(res.id, {
                              status: e.target.value as BookingStatus,
                            })
                          }
                          className="px-2 py-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46] font-medium"
                        >
                          {(['상담중', '예약확정', '진행중', '완료', '취소'] as BookingStatus[]).map(
                            (st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            )
                          )}
                        </select>
                      </td>
                      <td className="p-0 border-r border-slate-200">
                        <input
                          type="number"
                          value={res.totalPriceUsd || 0}
                          onChange={(e) => {
                            const usd = Number(e.target.value) || 0;
                            const rate = res.exchangeRate || 1400;
                            onUpdateReservation(res.id, {
                              totalPriceUsd: usd,
                              totalPriceKrw: Math.round(usd * rate),
                            });
                          }}
                          className="w-24 px-2.5 py-2 text-right font-mono font-semibold text-slate-900 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                        />
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200 text-right font-mono text-slate-500 bg-slate-50/40 whitespace-nowrap">
                        {formatUsd(fin.totalCostUsd)}
                      </td>
                      <td
                        className={`py-2 px-3 border-r border-slate-200 text-right font-mono font-semibold bg-slate-50/40 whitespace-nowrap ${
                          fin.netProfitUsd >= 0 ? 'text-[#065F46]' : 'text-red-600'
                        }`}
                      >
                        {formatUsd(fin.netProfitUsd)}
                      </td>
                      <td className="py-2 px-2.5 border-r border-slate-200 text-center">
                        <input
                          type="checkbox"
                          checked={res.depositPaid}
                          onChange={(e) =>
                            onUpdateReservation(res.id, { depositPaid: e.target.checked })
                          }
                          className="w-3.5 h-3.5 accent-[#065F46] cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-2.5 border-r border-slate-200 text-center">
                        <input
                          type="checkbox"
                          checked={res.balancePaid}
                          onChange={(e) =>
                            onUpdateReservation(res.id, { balancePaid: e.target.checked })
                          }
                          className="w-3.5 h-3.5 accent-[#065F46] cursor-pointer"
                        />
                      </td>
                      <td className="p-0 border-r border-slate-200">
                        <input
                          type="text"
                          value={res.memo || ''}
                          placeholder="메모 입력"
                          onChange={(e) =>
                            onUpdateReservation(res.id, { memo: e.target.value })
                          }
                          className="w-40 px-2.5 py-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => onDeleteReservation(res.id)}
                          aria-label="행 삭제"
                          className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100/90 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td colSpan={9} className="py-3 px-4 text-right border-r border-slate-200">
                    합계 (취소 제외)
                  </td>
                  <td className="py-3 px-3 text-right font-mono border-r border-slate-200 whitespace-nowrap">
                    {formatUsd(masterTotals.revenueUsd)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono border-r border-slate-200 whitespace-nowrap">
                    {formatUsd(masterTotals.costUsd)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-[#065F46] border-r border-slate-200 whitespace-nowrap">
                    {formatUsd(masterTotals.profitUsd)}
                  </td>
                  <td colSpan={4} className="py-3 px-3 font-mono text-slate-500">
                    {formatKrw(masterTotals.profitUsd * 1400)} 상당
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Sheet 2: Freeform Admin Ledger Spreadsheet */}
      {activeSheet === 'ledger' && (
        <div className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>현지 선납금, 차량/가이드 정산, 추가 옵션 내역을 자유롭게 입력·수정하는 관리자 전용 시트입니다.</span>
            <span className="font-mono">총 {filteredExcelRows.length}행</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-2.5 border-r border-slate-200 w-10 text-center">#</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">날짜</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">구분</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">거래처 / 고객</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">세부 내역</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-right">수입(USD)</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-right">지출(USD)</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">결제수단</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">상태</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">비고</th>
                  <th className="py-2.5 px-2.5 w-10 text-center">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredExcelRows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-amber-50/20">
                    <td className="py-1.5 px-2.5 border-r border-slate-200 text-center font-mono text-slate-400 bg-slate-50/50">
                      {idx + 1}
                    </td>
                    <td className="p-0 border-r border-slate-200">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => handleUpdateLedgerCell(row.id, { date: e.target.value })}
                        className="px-2 py-2 font-mono bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                      />
                    </td>
                    <td className="p-0 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.category}
                        onChange={(e) =>
                          handleUpdateLedgerCell(row.id, { category: e.target.value })
                        }
                        className="w-28 px-2.5 py-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46] font-medium"
                      />
                    </td>
                    <td className="p-0 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.customerOrVendor}
                        placeholder="거래처/고객"
                        onChange={(e) =>
                          handleUpdateLedgerCell(row.id, { customerOrVendor: e.target.value })
                        }
                        className="w-36 px-2.5 py-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                      />
                    </td>
                    <td className="p-0 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.description}
                        placeholder="내용 입력"
                        onChange={(e) =>
                          handleUpdateLedgerCell(row.id, { description: e.target.value })
                        }
                        className="w-56 px-2.5 py-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                      />
                    </td>
                    <td className="p-0 border-r border-slate-200">
                      <input
                        type="number"
                        min={0}
                        value={row.incomeUsd}
                        onChange={(e) =>
                          handleUpdateLedgerCell(row.id, {
                            incomeUsd: Number(e.target.value) || 0,
                          })
                        }
                        className="w-24 px-2.5 py-2 text-right font-mono font-semibold text-[#065F46] bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                      />
                    </td>
                    <td className="p-0 border-r border-slate-200">
                      <input
                        type="number"
                        min={0}
                        value={row.expenseUsd}
                        onChange={(e) =>
                          handleUpdateLedgerCell(row.id, {
                            expenseUsd: Number(e.target.value) || 0,
                          })
                        }
                        className="w-24 px-2.5 py-2 text-right font-mono font-semibold text-red-700 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                      />
                    </td>
                    <td className="p-0 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.paymentMethod}
                        onChange={(e) =>
                          handleUpdateLedgerCell(row.id, { paymentMethod: e.target.value })
                        }
                        className="w-28 px-2.5 py-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                      />
                    </td>
                    <td className="p-0 border-r border-slate-200">
                      <select
                        value={row.status}
                        onChange={(e) =>
                          handleUpdateLedgerCell(row.id, {
                            status: e.target.value as ExcelSheetRow['status'],
                          })
                        }
                        className="px-2 py-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46] font-medium"
                      >
                        <option value="완료">완료</option>
                        <option value="대기">대기</option>
                        <option value="보류">보류</option>
                      </select>
                    </td>
                    <td className="p-0 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.note}
                        placeholder="비고"
                        onChange={(e) =>
                          handleUpdateLedgerCell(row.id, { note: e.target.value })
                        }
                        className="w-40 px-2.5 py-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#065F46]"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteLedgerRow(row.id)}
                        aria-label="행 삭제"
                        className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100/90 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td colSpan={5} className="py-3 px-4 text-right border-r border-slate-200">
                    장부 합계
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-[#065F46] border-r border-slate-200 whitespace-nowrap">
                    {formatUsd(ledgerTotals.income)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-red-700 border-r border-slate-200 whitespace-nowrap">
                    {formatUsd(ledgerTotals.expense)}
                  </td>
                  <td colSpan={4} className="py-3 px-3 font-mono text-slate-700">
                    차액 {formatUsd(ledgerTotals.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
