import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  Database,
  FileSpreadsheet,
  FileUp,
  Loader2,
  LogOut,
  Menu,
  Sheet,
  Tags,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { BackupModal } from './components/BackupModal';
import { BookingDetailModal } from './components/BookingDetailModal';
import { BookingsView } from './components/BookingsView';
import { DailyExpenseView } from './components/DailyExpenseView';
import { ExcelSheetView } from './components/ExcelSheetView';
import { FinanceView } from './components/FinanceView';
import { LoginView } from './components/LoginView';
import { MasterPricesView } from './components/MasterPricesView';
import { ProfitLossView } from './components/ProfitLossView';
import { ScheduleView } from './components/ScheduleView';
import { StaffManageView } from './components/StaffManageView';
import { isSupabaseConfigured, supabaseConfigError } from './lib/supabase';
import {
  createBooking,
  deleteBooking,
  fetchBookings,
  subscribeToBookingsRealtime,
  updateBooking,
  upsertBookingsBatch,
} from './services/bookingsService';
import {
  createMasterPrice,
  deleteMasterPrice,
  fetchMasterPrices,
  loadLocalMasterPrices,
  saveLocalMasterPrices,
  updateMasterPrice,
} from './services/masterPricesService';
import {
  createMonthlyFixedExpense,
  deleteMonthlyFixedExpense,
  fetchMonthlyFixedExpenses,
  updateMonthlyFixedExpense,
} from './services/monthlyFixedExpensesService';
import type {
  AuthUser,
  ExcelSheetRow,
  MasterPrice,
  MonthlyFixedCost,
  Reservation,
  ScheduleItem,
  StaffAccount,
} from './types/erp';
import {
  exportReservationsToCsv,
  loadAuthUser,
  loadExcelSheetRows,
  loadMonthlyFixedCosts,
  loadStaffAccounts,
  saveAuthUser,
  saveExcelSheetRows,
  saveMonthlyFixedCosts,
  saveStaffAccounts,
} from './utils/storage';
import { useBodyScrollLock } from './utils/useBodyScrollLock';

type MenuTab =
  | 'schedule'
  | 'bookings'
  | 'daily-expenses'
  | 'finance'
  | 'pnl'
  | 'master-prices'
  | 'excel'
  | 'staff';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => loadAuthUser());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loadingBookings, setLoadingBookings] = useState<boolean>(true);
  const [supabaseError, setSupabaseError] = useState<string>('');
  const [masterPrices, setMasterPrices] = useState<MasterPrice[]>(() => loadLocalMasterPrices());
  const [masterPricesWarning, setMasterPricesWarning] = useState<string>('');
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>(() => loadStaffAccounts());
  const [excelRows, setExcelRows] = useState<ExcelSheetRow[]>(() => loadExcelSheetRows());
  const [fixedCosts, setFixedCosts] = useState<MonthlyFixedCost[]>(() => loadMonthlyFixedCosts());
  const [fixedCostsWarning, setFixedCostsWarning] = useState<string>('');
  const [activeTab, setActiveTab] = useState<MenuTab>('schedule');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [detailReservationId, setDetailReservationId] = useState<string | null>(null);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');

  const safeReservations = Array.isArray(reservations) ? reservations : [];
  const safeStaffAccounts = Array.isArray(staffAccounts) ? staffAccounts : [];
  const safeExcelRows = Array.isArray(excelRows) ? excelRows : [];

  const reservationsRef = useRef<Reservation[]>(safeReservations);
  reservationsRef.current = safeReservations;

  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingFixedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useBodyScrollLock(mobileMenuOpen);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? '' : prev));
    }, 3000);
  }, []);

  // Load initial bookings from Supabase & subscribe to realtime updates
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setReservations([]);
      setLoadingBookings(false);
      setSupabaseError(
        supabaseConfigError ||
          'Supabase 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)가 설정되지 않았습니다.'
      );
      return;
    }

    let cancelled = false;

    const loadInitial = async () => {
      setLoadingBookings(true);
      setSupabaseError('');
      try {
        const [list, priceRes, fixedRes] = await Promise.all([
          fetchBookings(),
          fetchMasterPrices().catch(() => ({ items: loadLocalMasterPrices(), warning: undefined })),
          fetchMonthlyFixedExpenses().catch(() => ({
            items: loadMonthlyFixedCosts(),
            warning: undefined,
          })),
        ]);
        if (!cancelled) {
          setReservations(Array.isArray(list) ? list : []);
          setMasterPrices(Array.isArray(priceRes.items) ? priceRes.items : []);
          setMasterPricesWarning(priceRes.warning || '');
          setFixedCosts(Array.isArray(fixedRes.items) ? fixedRes.items : []);
          setFixedCostsWarning(fixedRes.warning || '');
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setReservations([]);
          const msg = err instanceof Error ? err.message : 'Supabase 데이터를 불러오지 못했습니다.';
          setSupabaseError(msg);
        }
      } finally {
        if (!cancelled) {
          setLoadingBookings(false);
        }
      }
    };

    loadInitial();

    const unsubscribe = subscribeToBookingsRealtime({
      onInsertOrUpdate: (incoming) => {
        if (!incoming?.id) return;
        // Skip echo overwrite while user is actively typing/debouncing on that reservation
        if (pendingTimersRef.current.has(incoming.id)) {
          return;
        }
        setReservations((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          const exists = list.some((r) => r.id === incoming.id);
          if (exists) {
            return list.map((r) => (r.id === incoming.id ? incoming : r));
          }
          return [incoming, ...list];
        });
      },
      onDelete: (deletedId) => {
        if (!deletedId) return;
        setReservations((prev) => (Array.isArray(prev) ? prev.filter((r) => r.id !== deletedId) : []));
        setDetailReservationId((prevId) => (prevId === deletedId ? null : prevId));
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
      pendingTimersRef.current.forEach((timer) => clearTimeout(timer));
      pendingTimersRef.current.clear();
      pendingFixedTimersRef.current.forEach((timer) => clearTimeout(timer));
      pendingFixedTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    saveStaffAccounts(safeStaffAccounts);
  }, [safeStaffAccounts]);

  useEffect(() => {
    saveExcelSheetRows(safeExcelRows);
  }, [safeExcelRows]);

  useEffect(() => {
    saveMonthlyFixedCosts(Array.isArray(fixedCosts) ? fixedCosts : []);
  }, [fixedCosts]);

  useEffect(() => {
    if (
      user?.role === 'staff' &&
      (activeTab === 'daily-expenses' ||
        activeTab === 'finance' ||
        activeTab === 'pnl' ||
        activeTab === 'master-prices' ||
        activeTab === 'excel' ||
        activeTab === 'staff')
    ) {
      setActiveTab('schedule');
    }
  }, [user, activeTab]);

  const scheduleSupabaseUpdate = useCallback(
    (reservationId: string, updatedReservation: Reservation) => {
      if (!isSupabaseConfigured) return;

      const existingTimer = pendingTimersRef.current.get(reservationId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(async () => {
        pendingTimersRef.current.delete(reservationId);
        try {
          await updateBooking(updatedReservation);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Supabase 저장 중 오류가 발생했습니다.';
          showToast(msg);
        }
      }, 300);

      pendingTimersRef.current.set(reservationId, timer);
    },
    [showToast]
  );

  const handleLogin = (authUser: AuthUser) => {
    setUser(authUser);
    saveAuthUser(authUser);
    setActiveTab('schedule');
  };

  const handleLogout = () => {
    setUser(null);
    saveAuthUser(null);
    setDetailReservationId(null);
  };

  const handleAddReservation = async (newRes: Reservation) => {
    setReservations((prev) => [newRes, ...(Array.isArray(prev) ? prev : [])]);

    if (!isSupabaseConfigured) {
      showToast('Supabase가 연결되지 않아 임시로 화면에만 표시됩니다.');
      return;
    }

    try {
      const saved = await createBooking(newRes);
      setReservations((prev) =>
        (Array.isArray(prev) ? prev : []).map((r) => (r.id === newRes.id ? saved : r))
      );
      showToast(`${saved.customerName || newRes.customerName} 고객님 예약이 Supabase에 저장되었습니다.`);
    } catch (err: unknown) {
      setReservations((prev) =>
        (Array.isArray(prev) ? prev : []).filter((r) => r.id !== newRes.id)
      );
      const msg = err instanceof Error ? err.message : '예약 저장 실패';
      showToast(msg);
    }
  };

  const handleUpdateReservation = (id: string, updates: Partial<Reservation>) => {
    const current = (reservationsRef.current || []).find((r) => r.id === id);
    if (!current) return;

    const nextReservation: Reservation = { ...current, ...updates };
    setReservations((prev) =>
      (Array.isArray(prev) ? prev : []).map((r) => (r.id === id ? nextReservation : r))
    );
    scheduleSupabaseUpdate(id, nextReservation);
  };

  const handleUpdateScheduleItem = (
    reservationId: string,
    scheduleId: string,
    updates: Partial<ScheduleItem>
  ) => {
    const current = (reservationsRef.current || []).find((r) => r.id === reservationId);
    if (!current) return;

    const currentSchedules = Array.isArray(current.scheduleItems) ? current.scheduleItems : [];
    const nextReservation: Reservation = {
      ...current,
      scheduleItems: currentSchedules.map((s) =>
        s.id === scheduleId ? { ...s, ...updates } : s
      ),
    };
    setReservations((prev) =>
      (Array.isArray(prev) ? prev : []).map((r) => (r.id === reservationId ? nextReservation : r))
    );
    scheduleSupabaseUpdate(reservationId, nextReservation);
  };

  const handleDeleteReservation = async (id: string) => {
    if (user?.role !== 'admin') return;

    const pendingTimer = pendingTimersRef.current.get(id);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimersRef.current.delete(id);
    }

    const backupTarget = (reservationsRef.current || []).find((r) => r.id === id);
    setReservations((prev) => (Array.isArray(prev) ? prev.filter((r) => r.id !== id) : []));
    setDetailReservationId(null);

    if (!isSupabaseConfigured) {
      showToast('예약이 삭제되었습니다.');
      return;
    }

    try {
      await deleteBooking(id);
      showToast('Supabase에서 예약 내역이 삭제되었습니다.');
    } catch (err: unknown) {
      if (backupTarget) {
        setReservations((prev) => [backupTarget, ...(Array.isArray(prev) ? prev : [])]);
      }
      const msg = err instanceof Error ? err.message : '예약 삭제 실패';
      showToast(msg);
    }
  };

  const handleRestoreReservations = async (nextList: Reservation[]) => {
    const safeList = Array.isArray(nextList) ? nextList : [];
    if (!isSupabaseConfigured) {
      setReservations(safeList);
      showToast(`총 ${safeList.length}건의 예약 데이터가 화면에 복원되었습니다.`);
      return;
    }

    try {
      const savedList = await upsertBookingsBatch(safeList);
      const safeSaved = Array.isArray(savedList) ? savedList : [];
      setReservations(safeSaved);
      showToast(`총 ${safeSaved.length}건이 Supabase에 반영되었습니다.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '데이터 복원 실패';
      showToast(msg);
    }
  };

  const handleAddMasterPrice = async (item: MasterPrice) => {
    setMasterPrices((prev) => {
      const next = [item, ...(Array.isArray(prev) ? prev : [])];
      saveLocalMasterPrices(next);
      return next;
    });

    if (!isSupabaseConfigured || masterPricesWarning) {
      showToast(`'${item.keyword}' 표준 단가가 등록되었습니다.`);
      return;
    }

    try {
      const saved = await createMasterPrice(item);
      setMasterPrices((prev) => {
        const next = (Array.isArray(prev) ? prev : []).map((p) =>
          p.id === item.id ? saved : p
        );
        saveLocalMasterPrices(next);
        return next;
      });
      showToast(`'${saved.keyword}' 표준 단가가 Supabase에 저장되었습니다.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '단가표 저장 실패';
      setMasterPricesWarning(msg);
      showToast('로컬 단가표에 저장되었습니다. (Supabase 테이블 설정을 확인해 주세요)');
    }
  };

  const handleUpdateMasterPrice = async (item: MasterPrice) => {
    setMasterPrices((prev) => {
      const next = (Array.isArray(prev) ? prev : []).map((p) =>
        p.id === item.id ? item : p
      );
      saveLocalMasterPrices(next);
      return next;
    });

    if (!isSupabaseConfigured || masterPricesWarning) {
      showToast(`'${item.keyword}' 표준 단가가 수정되었습니다.`);
      return;
    }

    try {
      const saved = await updateMasterPrice(item);
      setMasterPrices((prev) => {
        const next = (Array.isArray(prev) ? prev : []).map((p) =>
          p.id === item.id ? saved : p
        );
        saveLocalMasterPrices(next);
        return next;
      });
      showToast(`'${saved.keyword}' 표준 단가가 수정되었습니다.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '단가표 수정 실패';
      setMasterPricesWarning(msg);
      showToast('로컬 단가표가 수정되었습니다.');
    }
  };

  const handleDeleteMasterPrice = async (id: string) => {
    setMasterPrices((prev) => {
      const next = (Array.isArray(prev) ? prev : []).filter((p) => p.id !== id);
      saveLocalMasterPrices(next);
      return next;
    });

    if (!isSupabaseConfigured || masterPricesWarning) {
      showToast('표준 단가가 삭제되었습니다.');
      return;
    }

    try {
      await deleteMasterPrice(id);
      showToast('Supabase에서 표준 단가가 삭제되었습니다.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '단가표 삭제 실패';
      setMasterPricesWarning(msg);
      showToast('로컬 단가표에서 삭제되었습니다.');
    }
  };

  const handleAddFixedCost = async (item: MonthlyFixedCost) => {
    setFixedCosts((prev) => [item, ...(Array.isArray(prev) ? prev : [])]);

    if (!isSupabaseConfigured || fixedCostsWarning) {
      showToast(`'${item.title}' 고정비가 등록되었습니다.`);
      return;
    }

    try {
      const saved = await createMonthlyFixedExpense(item);
      setFixedCosts((prev) =>
        (Array.isArray(prev) ? prev : []).map((f) => (f.id === item.id ? saved : f))
      );
      showToast(`'${saved.title}' 고정비가 Supabase에 저장되었습니다.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '월간 고정비 저장 실패';
      setFixedCostsWarning(msg);
      showToast('로컬에 저장되었습니다. (Supabase monthly_fixed_expenses 테이블을 확인해 주세요)');
    }
  };

  const handleUpdateFixedCost = (item: MonthlyFixedCost) => {
    setFixedCosts((prev) =>
      (Array.isArray(prev) ? prev : []).map((f) => (f.id === item.id ? item : f))
    );

    if (!isSupabaseConfigured || fixedCostsWarning) return;

    const existingTimer = pendingFixedTimersRef.current.get(item.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(async () => {
      pendingFixedTimersRef.current.delete(item.id);
      try {
        await updateMonthlyFixedExpense(item);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '월간 고정비 수정 실패';
        setFixedCostsWarning(msg);
      }
    }, 350);
    pendingFixedTimersRef.current.set(item.id, timer);
  };

  const handleDeleteFixedCost = async (id: string) => {
    const existingTimer = pendingFixedTimersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      pendingFixedTimersRef.current.delete(id);
    }

    setFixedCosts((prev) => (Array.isArray(prev) ? prev.filter((f) => f.id !== id) : []));

    if (!isSupabaseConfigured || fixedCostsWarning) {
      showToast('고정비 항목이 삭제되었습니다.');
      return;
    }

    try {
      await deleteMonthlyFixedExpense(id);
      showToast('Supabase에서 고정비가 삭제되었습니다.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '월간 고정비 삭제 실패';
      setFixedCostsWarning(msg);
      showToast('로컬에서 삭제되었습니다.');
    }
  };

  const handleAddStaff = (staff: StaffAccount) => {
    if (user?.role !== 'admin') return;
    setStaffAccounts((prev) => [...(Array.isArray(prev) ? prev : []), staff]);
    showToast(`${staff.displayName} (${staff.username}) 직원이 등록되었습니다.`);
  };

  const handleDeleteStaff = (id: string) => {
    if (user?.role !== 'admin') return;
    setStaffAccounts((prev) => (Array.isArray(prev) ? prev.filter((s) => s.id !== id) : []));
    showToast('직원 계정이 삭제되었습니다.');
  };

  if (!user) {
    return <LoginView staffAccounts={safeStaffAccounts} onLogin={handleLogin} />;
  }

  const isAdmin = user.role === 'admin';
  const menuItems: Array<{
    id: MenuTab;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'schedule', label: '월간 통합 스케줄', icon: CalendarDays },
    { id: 'bookings', label: '견적 업로드 & 예약 목록', icon: FileUp },
    ...(isAdmin
      ? [
          { id: 'daily-expenses' as const, label: '일자별 지출관리', icon: CalendarCheck },
          { id: 'finance' as const, label: '자금 및 정산 관리', icon: Wallet },
          { id: 'pnl' as const, label: '재무/손익 관리', icon: BarChart3 },
          { id: 'master-prices' as const, label: '단가표 관리', icon: Tags },
          { id: 'excel' as const, label: '엑셀 시트', icon: Sheet },
          { id: 'staff' as const, label: '직원 관리', icon: Users },
        ]
      : []),
  ];

  const activeReservation = detailReservationId
    ? safeReservations.find((r) => r.id === detailReservationId) || null
    : null;

  const pageTitleMap: Record<MenuTab, string> = {
    schedule: '월간 통합 스케줄',
    bookings: '견적 업로드 & 예약 목록',
    'daily-expenses': '일자별 지출관리',
    finance: '자금 및 정산 관리',
    pnl: '재무/손익 관리',
    'master-prices': '단가표 관리 (표준 원가)',
    excel: '엑셀 시트 (관리자 전용)',
    staff: '직원 관리 (등록 · 삭제)',
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Left Sidebar (Desktop) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-slate-200">
        <div className="px-6 py-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#065F46] flex items-center justify-center shrink-0">
              <span className="text-base font-bold text-[#F59E0B]">M</span>
            </div>
            <div>
              <span className="block text-base font-bold tracking-tight text-slate-900">
                MANGO TOUR
              </span>
              <span className="block text-[11px] text-slate-400">
                호치민 통합 ERP
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#065F46] text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#F59E0B]' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Account Footer */}
        <div className="p-4 border-t border-slate-100">
          <div className="px-3.5 py-3 rounded-xl bg-slate-50 border border-slate-200/80 mb-2.5">
            <div className="text-xs font-bold text-slate-900">
              {user.displayName}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
              @{user.username} · {isAdmin ? '전체 권한' : '일정 관리 전용'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden bg-slate-900/35">
          <aside className="w-64 bg-white h-full border-r border-slate-200 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <span className="text-base font-bold text-slate-900">MANGO TOUR</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1.5">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                      active ? 'bg-[#065F46] text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>로그아웃 ({user.username})</span>
              </button>
            </div>
          </aside>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Utility Header */}
        <header className="bg-white border-b border-slate-200 px-3 sm:px-6 lg:px-10 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="메뉴 열기"
              className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              {pageTitleMap[activeTab]}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                exportReservationsToCsv(reservations, user.role);
                showToast('CSV 파일이 다운로드되었습니다.');
              }}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#065F46]" />
              <span className="hidden sm:inline">엑셀(CSV) 내보내기</span>
              <span className="sm:hidden">CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setBackupModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-[#D97706]" />
              <span className="hidden sm:inline">데이터 백업/복원</span>
              <span className="sm:hidden">백업</span>
            </button>
          </div>
        </header>

        {/* Viewport Content: Edge-to-edge on mobile, generous whitespace on desktop */}
        <main className="flex-1 px-0 py-3 sm:p-6 lg:p-10 max-w-[1380px] w-full mx-auto">
          {supabaseError && (
            <div className="mb-4 mx-3 sm:mx-0 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0" />
              <span>{supabaseError}</span>
            </div>
          )}

          {loadingBookings ? (
            <div className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-6 h-6 text-[#065F46] animate-spin" />
              <span className="text-xs font-medium">Supabase 예약 데이터를 불러오는 중...</span>
            </div>
          ) : (
            <>
              {activeTab === 'schedule' && (
                <ScheduleView
                  reservations={reservations}
                  role={user.role}
                  onUpdateScheduleItem={handleUpdateScheduleItem}
                  onOpenReservationDetail={(id) => setDetailReservationId(id)}
                />
              )}

              {activeTab === 'bookings' && (
                <BookingsView
                  reservations={reservations}
                  masterPrices={masterPrices}
                  role={user.role}
                  onAddReservation={handleAddReservation}
                  onOpenReservationDetail={(id) => setDetailReservationId(id)}
                />
              )}

              {activeTab === 'daily-expenses' && isAdmin && (
                <DailyExpenseView
                  reservations={reservations}
                  onUpdateReservation={handleUpdateReservation}
                  onOpenReservationDetail={(id) => setDetailReservationId(id)}
                />
              )}

              {activeTab === 'finance' && isAdmin && (
                <FinanceView
                  reservations={reservations}
                  onUpdateReservation={handleUpdateReservation}
                />
              )}

              {activeTab === 'pnl' && isAdmin && (
                <ProfitLossView
                  reservations={reservations}
                  fixedCosts={fixedCosts}
                  fixedCostsWarning={fixedCostsWarning}
                  onAddFixedCost={handleAddFixedCost}
                  onUpdateFixedCost={handleUpdateFixedCost}
                  onDeleteFixedCost={handleDeleteFixedCost}
                  onOpenReservationDetail={(id) => setDetailReservationId(id)}
                />
              )}

              {activeTab === 'master-prices' && isAdmin && (
                <MasterPricesView
                  masterPrices={masterPrices}
                  tableWarning={masterPricesWarning}
                  onAddMasterPrice={handleAddMasterPrice}
                  onUpdateMasterPrice={handleUpdateMasterPrice}
                  onDeleteMasterPrice={handleDeleteMasterPrice}
                />
              )}

              {activeTab === 'excel' && isAdmin && (
                <ExcelSheetView
                  reservations={reservations}
                  excelRows={excelRows}
                  onUpdateReservation={handleUpdateReservation}
                  onAddReservationRow={handleAddReservation}
                  onDeleteReservation={handleDeleteReservation}
                  onUpdateExcelRows={setExcelRows}
                />
              )}

              {activeTab === 'staff' && isAdmin && (
                <StaffManageView
                  staffAccounts={staffAccounts}
                  onAddStaff={handleAddStaff}
                  onDeleteStaff={handleDeleteStaff}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Reservation Detail Modal */}
      {activeReservation && (
        <BookingDetailModal
          reservation={activeReservation}
          role={user.role}
          onClose={() => setDetailReservationId(null)}
          onUpdateReservation={handleUpdateReservation}
          onUpdateScheduleItem={handleUpdateScheduleItem}
          onDeleteReservation={handleDeleteReservation}
        />
      )}

      {/* Backup & Restore Modal */}
      {backupModalOpen && (
        <BackupModal
          reservations={reservations}
          onRestoreReservations={handleRestoreReservations}
          onClose={() => setBackupModalOpen(false)}
        />
      )}

      {/* Subtle Bottom-Right Feedback Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-lg">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
