import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Flag, MapPin, X } from 'lucide-react';
import type { GolfBookingStatus, Reservation, ScheduleItem, UserRole } from '../types/erp';
import { calculateReservationFinance, isBookingCancelled } from '../utils/storage';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

interface ScheduleViewProps {
  reservations: Reservation[];
  role: UserRole;
  onUpdateScheduleItem: (
    reservationId: string,
    scheduleId: string,
    updates: Partial<ScheduleItem>
  ) => void;
  onOpenReservationDetail: (reservationId: string) => void;
}

interface CalendarEntry {
  reservation: Reservation;
  schedule: ScheduleItem;
}

function getLocalTodayParts() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { year: y, month: m, dateStr };
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  reservations,
  role,
  onUpdateScheduleItem,
  onOpenReservationDetail,
}) => {
  const [currentDate, setCurrentDate] = useState(() => {
    const { year: y, month: m } = getLocalTodayParts();
    return new Date(y, m, 1);
  });
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'GOLF' | 'TOUR'>('ALL');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [focusedScheduleId, setFocusedScheduleId] = useState<string | null>(null);

  useBodyScrollLock(Boolean(selectedDay));

  const { dateStr: todayStr } = getLocalTodayParts();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  // Build calendar cells for current month
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startWeekday = firstDayOfMonth.getDay();
    const totalDays = lastDayOfMonth.getDate();

    const cells: Array<{ dateStr: string | null; dayNumber: number | null }> = [];
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ dateStr: null, dayNumber: null });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateStr, dayNumber: d });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ dateStr: null, dayNumber: null });
    }
    return cells;
  }, [year, month]);

  const safeReservations = Array.isArray(reservations) ? reservations : [];

  // Map dateStr -> entries
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    safeReservations.forEach((res) => {
      if (!res || isBookingCancelled(res)) return;
      const items = Array.isArray(res.scheduleItems) ? res.scheduleItems : [];
      items.forEach((sch) => {
        if (!sch || !sch.date) return;
        if (typeFilter !== 'ALL' && sch.type !== typeFilter) return;
        const list = map.get(sch.date) || [];
        list.push({ reservation: res, schedule: sch });
        map.set(sch.date, list);
      });
    });
    // Sort each day's entries by time
    map.forEach((list) => {
      list.sort((a, b) => (a.schedule.time || '').localeCompare(b.schedule.time || ''));
    });
    return map;
  }, [safeReservations, typeFilter]);

  // Top 3 KPI stats
  const kpis = useMemo(() => {
    const activeToursThisMonth = safeReservations.filter((r) => {
      if (!r || isBookingCancelled(r)) return false;
      const items = Array.isArray(r.scheduleItems) ? r.scheduleItems : [];
      return (
        (r.startDate || '').startsWith(monthPrefix) ||
        (r.endDate || '').startsWith(monthPrefix) ||
        items.some((s) => (s?.date || '').startsWith(monthPrefix))
      );
    }).length;

    let pendingGolfCount = 0;
    safeReservations.forEach((r) => {
      if (!r || isBookingCancelled(r)) return;
      const items = Array.isArray(r.scheduleItems) ? r.scheduleItems : [];
      items.forEach((s) => {
        if (s && s.type === 'GOLF' && (s.golfBookingStatus || '대기') === '대기') {
          pendingGolfCount += 1;
        }
      });
    });

    const unpaidCount = safeReservations.filter((r) => {
      if (!r || isBookingCancelled(r)) return false;
      return calculateReservationFinance(r).isUnpaid;
    }).length;

    return {
      activeToursThisMonth,
      pendingGolfCount,
      unpaidCount,
    };
  }, [safeReservations, monthPrefix]);

  const selectedEntries = useMemo(() => {
    if (!selectedDay) return [];
    const list: CalendarEntry[] = [];
    safeReservations.forEach((res) => {
      if (!res || isBookingCancelled(res)) return;
      const items = Array.isArray(res.scheduleItems) ? res.scheduleItems : [];
      items.forEach((sch) => {
        if (sch && sch.date === selectedDay) {
          list.push({ reservation: res, schedule: sch });
        }
      });
    });
    list.sort((a, b) => (a.schedule.time || '').localeCompare(b.schedule.time || ''));
    return list;
  }, [safeReservations, selectedDay]);

  const moveMonth = (delta: number) => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    setSelectedDay(null);
    setFocusedScheduleId(null);
  };

  const goToday = () => {
    const { year: y, month: m } = getLocalTodayParts();
    setCurrentDate(new Date(y, m, 1));
    setSelectedDay(null);
    setFocusedScheduleId(null);
  };

  const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="space-y-4 sm:space-y-8">
      {/* Top KPI Summary Row (3 cards for admin, 2 for staff) */}
      <div className={`grid gap-3 sm:gap-5 px-3 sm:px-0 ${role === 'admin' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
        <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <p className="text-sm font-medium text-slate-500">이번 달 진행 투어</p>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
              {kpis.activeToursThisMonth}
            </span>
            <span className="text-sm text-slate-500">건</span>
          </div>
          <p className="mt-1.5 sm:mt-2 text-xs text-slate-400">
            {year}년 {month + 1}월 일정 포함 예약 기준
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <p className="text-sm font-medium text-slate-500">확정 대기 골프 부킹</p>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#065F46] tabular-nums">
              {kpis.pendingGolfCount}
            </span>
            <span className="text-sm text-slate-500">팀</span>
          </div>
          <p className="mt-1.5 sm:mt-2 text-xs text-slate-400">
            티오프 시간·부킹 확정 확인 필요
          </p>
        </div>

        {role === 'admin' && (
          <div className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-6">
            <p className="text-sm font-medium text-slate-500">미수금 건수</p>
            <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-[#D97706] tabular-nums">
                {kpis.unpaidCount}
              </span>
              <span className="text-sm text-slate-500">건</span>
            </div>
            <p className="mt-1.5 sm:mt-2 text-xs text-slate-400">
              계약금 또는 잔금 미입금 예약 (관리자 전용)
            </p>
          </div>
        )}
      </div>

      {/* Main Monthly Calendar Card */}
      <div className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl overflow-hidden">
        {/* Calendar Header Toolbar */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                aria-label="이전 달"
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="px-3 text-lg font-bold text-slate-900 tabular-nums whitespace-nowrap">
                {year}년 {month + 1}월
              </h2>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                aria-label="다음 달"
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={goToday}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              이번 달
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Color Legend (clean unboxed squares + text) */}
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#065F46]" />
                골프 라운딩
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B]" />
                투어 · 픽업 · 체크인
              </span>
            </div>

            {/* Segmented Filter */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  typeFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                전체 일정
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('GOLF')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  typeFilter === 'GOLF'
                    ? 'bg-white text-[#065F46] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                골프 부킹
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('TOUR')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  typeFilter === 'TOUR'
                    ? 'bg-white text-[#B45309] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                일반 투어
              </button>
            </div>
          </div>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70">
          {weekdayLabels.map((label, idx) => (
            <div
              key={label}
              className={`py-2.5 px-3 text-center text-xs font-semibold ${
                idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
          {calendarDays.map((cell, idx) => {
            if (!cell.dateStr || cell.dayNumber === null) {
              return <div key={`empty-${idx}`} className="min-h-[82px] sm:min-h-[126px] bg-slate-50/40" />;
            }

            const dayEntries = entriesByDate.get(cell.dateStr) || [];
            const isSelected = selectedDay === cell.dateStr;
            const isToday = cell.dateStr === todayStr;
            const dayOfWeek = idx % 7;

            return (
              <div
                key={cell.dateStr}
                onClick={() => {
                  setSelectedDay(cell.dateStr);
                  setFocusedScheduleId(dayEntries[0]?.schedule.id || null);
                }}
                className={`min-h-[82px] sm:min-h-[126px] p-1 sm:p-2.5 text-left transition-colors cursor-pointer flex flex-col ${
                  isSelected
                    ? 'bg-amber-50/70 ring-2 ring-inset ring-[#F59E0B]'
                    : isToday
                    ? 'bg-emerald-50/80 ring-1 ring-inset ring-[#065F46]/50 hover:bg-emerald-100/60'
                    : 'bg-white hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5 gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 text-xs font-semibold tabular-nums rounded-lg shrink-0 ${
                        isToday
                          ? 'bg-[#065F46] text-white font-bold shadow-xs'
                          : dayOfWeek === 0
                          ? 'text-red-500'
                          : dayOfWeek === 6
                          ? 'text-blue-600'
                          : 'text-slate-700'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {isToday && (
                      <span className="hidden sm:inline text-[11px] font-bold text-[#065F46] whitespace-nowrap">
                        오늘
                      </span>
                    )}
                  </div>
                  {dayEntries.length > 0 && (
                    <span className="text-[11px] text-slate-400 tabular-nums whitespace-nowrap">
                      {dayEntries.length}건
                    </span>
                  )}
                </div>

                <div className="space-y-1 flex-1 overflow-hidden">
                  {dayEntries.slice(0, 3).map(({ reservation, schedule }) => {
                    const isGolf = schedule.type === 'GOLF';
                    return (
                      <button
                        key={schedule.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDay(cell.dateStr);
                          setFocusedScheduleId(schedule.id);
                        }}
                        className={`w-full text-left px-2 py-1 rounded-lg text-[11px] sm:text-xs font-semibold leading-tight transition-colors cursor-pointer block truncate ${
                          isGolf
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-[#065F46] border border-emerald-200/80'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80'
                        }`}
                      >
                        {reservation.customerName}
                      </button>
                    );
                  })}
                  {dayEntries.length > 3 && (
                    <div className="text-[11px] font-medium text-slate-500 pl-1">
                      + {dayEntries.length - 3}건 더보기
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Slide-Over Drawer for Schedule Editing */}
      {selectedDay && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/35 backdrop-blur-[1px] overflow-hidden">
          <div
            className="hidden sm:block sm:flex-1"
            onClick={() => {
              setSelectedDay(null);
              setFocusedScheduleId(null);
            }}
          />
          <aside className="w-full max-w-full sm:max-w-[460px] bg-white h-full sm:border-l border-slate-200 shadow-xl flex flex-col overflow-hidden">
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-[#065F46] whitespace-nowrap">
                  <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-mono whitespace-nowrap">{selectedDay}</span>
                </div>
                <h3 className="mt-1 text-base sm:text-lg font-bold text-slate-900">
                  일정 상세 및 배정 관리
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedDay(null);
                  setFocusedScheduleId(null);
                }}
                aria-label="패널 닫기"
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-6 py-4 sm:py-5 space-y-4">
              {selectedEntries.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-slate-600">
                    선택한 날짜에 등록된 일정이 없습니다.
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    견적서 PDF를 업로드하면 일정이 자동으로 등록됩니다.
                  </p>
                </div>
              ) : (
                selectedEntries.map(({ reservation, schedule }) => {
                  const isGolf = schedule.type === 'GOLF';
                  const isFocused = focusedScheduleId === schedule.id;

                  return (
                    <div
                      key={schedule.id}
                      className={`rounded-xl sm:rounded-2xl border p-3.5 sm:p-5 transition-colors ${
                        isFocused
                          ? 'border-[#065F46] bg-white'
                          : 'border-slate-200 bg-slate-50/40'
                      }`}
                    >
                      {/* Header line */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
                            <span
                              className={`font-semibold whitespace-nowrap ${
                                isGolf ? 'text-[#065F46]' : 'text-[#B45309]'
                              }`}
                            >
                              {isGolf ? '골프 부킹' : '일반 투어'}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="font-mono whitespace-nowrap">{reservation.bookingCode}</span>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="whitespace-nowrap">
                              {reservation.customerName} ({reservation.customerCount}인)
                            </span>
                          </div>
                          <h4 className="mt-1.5 text-sm sm:text-base font-bold text-slate-900">
                            {isGolf ? schedule.golfCourseName || schedule.title : schedule.title}
                          </h4>
                          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                            {schedule.detail}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenReservationDetail(reservation.id)}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          예약 상세
                        </button>
                      </div>

                      {/* Editable Controls */}
                      <div className="mt-3.5 pt-3.5 border-t border-slate-100 space-y-3">
                        <div className="flex flex-wrap sm:grid sm:grid-cols-2 gap-2.5">
                          <div className="flex-1 min-w-[146px]">
                            <label className="block text-xs font-medium text-slate-600 mb-1 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {isGolf ? '티오프 시간' : '일정 시간'}
                              </span>
                            </label>
                            <input
                              type="time"
                              value={isGolf ? schedule.teeOffTime || schedule.time || '07:30' : schedule.time || '10:00'}
                              onChange={(e) =>
                                onUpdateScheduleItem(reservation.id, schedule.id, {
                                  time: e.target.value,
                                  ...(isGolf ? { teeOffTime: e.target.value } : {}),
                                })
                              }
                              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-mono whitespace-nowrap bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
                            />
                          </div>

                          {isGolf ? (
                            <div className="flex-1 min-w-[120px]">
                              <label className="block text-xs font-medium text-slate-600 mb-1 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                  <Flag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  부킹 상태
                                </span>
                              </label>
                              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                                {(['대기', '확정'] as GolfBookingStatus[]).map((st) => {
                                  const active = (schedule.golfBookingStatus || '대기') === st;
                                  return (
                                    <button
                                      key={st}
                                      type="button"
                                      onClick={() =>
                                        onUpdateScheduleItem(reservation.id, schedule.id, {
                                          golfBookingStatus: st,
                                        })
                                      }
                                      className={`py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                                        active
                                          ? st === '확정'
                                            ? 'bg-[#065F46] text-white'
                                            : 'bg-[#F59E0B] text-white'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      {st}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="flex-1 min-w-[130px]">
                              <label className="block text-xs font-medium text-slate-600 mb-1 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  일차 / 담당자
                                </span>
                              </label>
                              <div className="px-2.5 py-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl whitespace-nowrap truncate">
                                {schedule.dayNumber}일차 · {reservation.managerName}
                              </div>
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            차량 / 가이드 / 캐디 배정 메모
                          </label>
                          <textarea
                            rows={2}
                            value={schedule.vehicleGuideNote || ''}
                            onChange={(e) =>
                              onUpdateScheduleItem(reservation.id, schedule.id, {
                                vehicleGuideNote: e.target.value,
                              })
                            }
                            placeholder="예: 9인승 솔라티 리무진 · 김가이드 배정 완료"
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#065F46] resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-slate-500">
                변경 사항은 즉시 자동 저장됩니다.
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedDay(null);
                  setFocusedScheduleId(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#065F46] hover:bg-[#054e3a] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                확인 완료
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
