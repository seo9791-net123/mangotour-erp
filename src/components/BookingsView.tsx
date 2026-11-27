import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  FileText,
  Loader2,
  Lock,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { BookingStatus, ParsedQuoteResult, Reservation, UserRole } from '../types/erp';
import {
  analyzePdfQuoteWithGemini,
  buildReservationFromParsedQuote,
  classifyScheduleType,
  RenderedPdfPage,
  renderPdfToImages,
} from '../utils/pdfParser';
import { SAMPLE_PDF_QUOTE } from '../utils/sampleData';
import { formatKrw, formatUsd } from '../utils/storage';

interface BookingsViewProps {
  reservations: Reservation[];
  role: UserRole;
  onAddReservation: (reservation: Reservation) => void;
  onOpenReservationDetail: (reservationId: string) => void;
}

export const BookingsView: React.FC<BookingsViewProps> = ({
  reservations,
  role,
  onAddReservation,
  onOpenReservationDetail,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [statusStep, setStatusStep] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [renderedPages, setRenderedPages] = useState<RenderedPdfPage[]>([]);
  const [previewQuote, setPreviewQuote] = useState<ParsedQuoteResult | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BookingStatus>('ALL');

  const processPdfFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMsg('PDF 파일(.pdf)만 업로드할 수 있습니다.');
      return;
    }

    setErrorMsg('');
    setPreviewQuote(null);
    setRenderedPages([]);
    setIsAnalyzing(true);

    try {
      setStatusStep('PDF 페이지를 고해상도 이미지로 변환 중...');
      const pages = await renderPdfToImages(file);
      setRenderedPages(pages);

      setStatusStep(`Gemini AI가 견적서 표와 일정을 인식 중 (${pages.length}페이지)...`);
      const parsed = await analyzePdfQuoteWithGemini(pages, file.name);
      setPreviewQuote(parsed);
      setStatusStep('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'PDF 분석 중 오류가 발생했습니다.';
      setErrorMsg(msg);
      setStatusStep('');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processPdfFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processPdfFile(file);
    }
  };

  const handleLoadSampleQuote = () => {
    setErrorMsg('');
    setRenderedPages([]);
    setPreviewQuote(structuredClone(SAMPLE_PDF_QUOTE));
  };

  const handleSavePreview = () => {
    if (!previewQuote) return;
    const newReservation = buildReservationFromParsedQuote(previewQuote);
    onAddReservation(newReservation);
    setPreviewQuote(null);
    setRenderedPages([]);
  };

  const safeReservations = Array.isArray(reservations) ? reservations : [];
  const safeRenderedPages = Array.isArray(renderedPages) ? renderedPages : [];
  const previewSchedules = Array.isArray(previewQuote?.scheduleItems)
    ? previewQuote.scheduleItems
    : [];
  const previewIncludedCosts = Array.isArray(previewQuote?.includedCostItems)
    ? previewQuote.includedCostItems
    : [];

  const filteredReservations = useMemo(() => {
    return safeReservations.filter((r) => {
      if (!r) return false;
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        (r.customerName || '').toLowerCase().includes(q) ||
        (r.productName || '').toLowerCase().includes(q) ||
        (r.bookingCode || '').toLowerCase().includes(q) ||
        (r.destination || '').toLowerCase().includes(q)
      );
    });
  }, [safeReservations, statusFilter, searchQuery]);

  const statusColorClass = (status: BookingStatus) => {
    switch (status) {
      case '예약확정':
        return 'text-[#065F46] bg-emerald-50 border-emerald-200';
      case '진행중':
        return 'text-amber-800 bg-amber-50 border-amber-200';
      case '완료':
        return 'text-slate-700 bg-slate-100 border-slate-200';
      case '취소':
        return 'text-red-700 bg-red-50 border-red-200';
      default:
        return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-8">
      {/* Top: PDF Upload & AI Extraction Box */}
      <section className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-5">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              PDF 견적서 AI 자동 등록
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              망고투어 이미지형 PDF 견적서를 올리면 고객 정보, 골프/투어 일정, 포함 원가 체크리스트를 자동으로 분류합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLoadSampleQuote}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#D97706]" />
            <span>테스트용 샘플 PDF 데이터 즉시 불러오기</span>
          </button>
        </div>

        {/* Dropzone */}
        {!previewQuote && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !isAnalyzing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl px-6 py-10 text-center transition-colors cursor-pointer ${
              isDragging
                ? 'border-[#065F46] bg-emerald-50/40'
                : 'border-slate-200 hover:border-[#F59E0B] hover:bg-amber-50/20'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            {isAnalyzing ? (
              <div className="flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-[#065F46] animate-spin" />
                <p className="text-sm font-semibold text-slate-800">{statusStep}</p>
                {safeRenderedPages.length > 0 && (
                  <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
                    {safeRenderedPages.map((p) => (
                      <img
                        key={p.pageNumber}
                        src={p.dataUrl}
                        alt={`PDF 페이지 ${p.pageNumber}`}
                        className="w-16 h-22 object-cover rounded-lg border border-slate-200 shadow-xs"
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 mb-3">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  여기에 PDF 견적서를 드래그하거나 클릭하여 선택하세요
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  여행 견적 및 일정 안내서 PDF (최대 6페이지 이미지 자동 판독)
                </p>
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-center justify-between gap-3">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              className="text-red-500 hover:text-red-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* AI Extraction Preview & Confirm Panel */}
        {previewQuote && (
          <div className="border border-[#065F46]/30 bg-emerald-50/20 rounded-2xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-[#065F46]" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    견적서 자동 인식 미리보기
                  </h3>
                  <p className="text-xs text-slate-500">
                    추출된 내용을 확인한 후 [저장 및 등록]을 누르면 월간 스케줄과 정산 체크리스트에 즉시 반영됩니다.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewQuote(null);
                    setRenderedPages([]);
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSavePreview}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#065F46] hover:bg-[#054e3a] rounded-xl transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>저장 및 등록</span>
                </button>
              </div>
            </div>

            {/* Editable Basic Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">고객 대표자명</label>
                <input
                  type="text"
                  value={previewQuote.customerName}
                  onChange={(e) =>
                    setPreviewQuote({ ...previewQuote, customerName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">총 인원 (명)</label>
                <input
                  type="number"
                  min={1}
                  value={previewQuote.customerCount}
                  onChange={(e) =>
                    setPreviewQuote({
                      ...previewQuote,
                      customerCount: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">출발일</label>
                <input
                  type="date"
                  value={previewQuote.startDate}
                  onChange={(e) =>
                    setPreviewQuote({ ...previewQuote, startDate: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">종료일</label>
                <input
                  type="date"
                  value={previewQuote.endDate}
                  onChange={(e) =>
                    setPreviewQuote({ ...previewQuote, endDate: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">상품명</label>
                <input
                  type="text"
                  value={previewQuote.productName}
                  onChange={(e) =>
                    setPreviewQuote({ ...previewQuote, productName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">여행지</label>
                  <input
                    type="text"
                    value={previewQuote.destination}
                    onChange={(e) =>
                      setPreviewQuote({ ...previewQuote, destination: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">담당자</label>
                  <input
                    type="text"
                    value={previewQuote.managerName}
                    onChange={(e) =>
                      setPreviewQuote({ ...previewQuote, managerName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                  />
                </div>
              </div>
            </div>

            {/* Schedule Split & Cost/Revenue Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Auto-classified Schedules */}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-800">
                    일정 자동 분류 미리보기 ({previewSchedules.length}건)
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    골프(초록) · 일반투어(주황)
                  </span>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {previewSchedules.map((item, idx) => {
                    const resolved = classifyScheduleType(item.title || '', item.detail || '', item.type);
                    const isGolf = resolved === 'GOLF';
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-slate-500">
                            <span
                              className={`font-semibold ${
                                isGolf ? 'text-[#065F46]' : 'text-[#B45309]'
                              }`}
                            >
                              {isGolf ? '골프 부킹' : '일반 투어'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{item.date}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{item.teeOffTime || item.time}</span>
                          </div>
                          <p className="mt-0.5 font-medium text-slate-800 truncate">
                            {item.title}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Financial & Included Items Preview */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                {role === 'admin' ? (
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 mb-2">
                      선택 결제 금액 (매출 연동)
                    </h4>
                    <div className="flex items-baseline gap-3">
                      <span className="text-xl font-bold text-slate-900 font-mono">
                        {formatUsd(previewQuote.totalPriceUsd)}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        ({formatKrw(previewQuote.totalPriceKrw)})
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                    <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>금액 및 매출 정보는 관리자 계정에서만 열람할 수 있습니다.</span>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-bold text-slate-800 mb-2">
                    &lsquo;포함&rsquo; 항목 → 원가 체크리스트 자동 연동 ({previewIncludedCosts.length}건)
                  </h4>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {previewIncludedCosts.map((c, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 text-xs py-1.5 px-2.5 rounded-lg bg-slate-50 border border-slate-100"
                      >
                        <span className="text-slate-800 truncate">{c.title}</span>
                        <span className="text-[11px] font-medium text-[#065F46] shrink-0">
                          {c.category} · 포함
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Bottom: Reservations Table */}
      <section className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">전체 예약 목록</h2>
            <span className="text-xs font-medium text-slate-500 font-mono">
              총 {filteredReservations.length}건
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="고객명, 상품명, 예약코드 검색"
                className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl w-full sm:w-56 focus:outline-none focus:bg-white focus:border-[#065F46]"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              {(['ALL', '예약확정', '진행중', '완료'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st === 'ALL' ? '전체' : st}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-semibold text-slate-500">
                <th className="py-3.5 px-6 whitespace-nowrap">여행기간</th>
                <th className="py-3.5 px-4 whitespace-nowrap">고객명 · 인원</th>
                <th className="py-3.5 px-4 whitespace-nowrap">상품명 / 여행지</th>
                <th className="py-3.5 px-4 whitespace-nowrap">진행상태</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-right">
                  {role === 'admin' ? '총 견적액' : '금액 열람'}
                </th>
                <th className="py-3.5 px-6 whitespace-nowrap text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-sm text-slate-500">
                    조건에 맞는 예약 내역이 없습니다. 상단에서 PDF 견적서를 업로드해 주세요.
                  </td>
                </tr>
              ) : (
                filteredReservations.map((res) => (
                  <tr
                    key={res.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="py-4 px-6 whitespace-nowrap">
                      <div className="font-mono text-xs font-medium text-slate-900">
                        {res.startDate || '-'} ~ {(res.endDate || '').slice(5) || '-'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {res.bookingCode}
                      </div>
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {res.customerName}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        총 {res.customerCount || 1}인 · 담당 {res.managerName || '-'}
                      </div>
                    </td>
                    <td className="py-4 px-4 max-w-xs">
                      <div className="font-medium text-slate-900 truncate">
                        {res.productName}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {res.destination || '-'} · 일정 {(Array.isArray(res.scheduleItems) ? res.scheduleItems : []).length}건
                      </div>
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-lg border ${statusColorClass(
                          res.status
                        )}`}
                      >
                        {res.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap text-right">
                      {role === 'admin' ? (
                        <div>
                          <div className="font-mono font-semibold text-slate-900">
                            {formatUsd(res.totalPriceUsd)}
                          </div>
                          <div className="font-mono text-xs text-slate-400 mt-0.5">
                            {formatKrw(res.totalPriceKrw)}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <Lock className="w-3.5 h-3.5" />
                          권한 제한
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => onOpenReservationDetail(res.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-[#065F46] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        상세보기 / 일정수정
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
