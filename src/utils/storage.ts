import type { AuthUser, ExcelSheetRow, Reservation, StaffAccount, UserRole } from '../types/erp';
import { INITIAL_RESERVATIONS } from './sampleData';

const RESERVATIONS_KEY = 'mango_tour_erp_reservations_v1';
const AUTH_KEY = 'mango_tour_erp_auth_v1';
const STAFF_ACCOUNTS_KEY = 'mango_tour_erp_staff_v1';
const EXCEL_SHEET_KEY = 'mango_tour_erp_excel_sheet_v1';

export const DEFAULT_STAFF_ACCOUNTS: StaffAccount[] = [
  {
    id: 'staff-default-1',
    username: 'staff',
    password: '1234',
    displayName: '오퍼레이터',
    position: '일정 오퍼레이터',
    phone: '010-2345-6789',
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];

export const INITIAL_EXCEL_SHEET_ROWS: ExcelSheetRow[] = [
  {
    id: 'xl-1',
    date: '2026-11-26',
    category: '골프장 선납',
    customerOrVendor: '떤선녓 CC',
    description: '11~12월 티타임 디파짓 예치금',
    incomeUsd: 0,
    expenseUsd: 1500,
    paymentMethod: '현지 계좌이체',
    status: '완료',
    note: '바우처 정산 시 차감',
  },
  {
    id: 'xl-2',
    date: '2026-11-26',
    category: '차량 계약',
    customerOrVendor: '사이공 VIP 리무진',
    description: '9인승 솔라티 11월 3주차 정산',
    incomeUsd: 0,
    expenseUsd: 680,
    paymentMethod: '현금(VND 환산)',
    status: '완료',
    note: '기사 팁 별도',
  },
  {
    id: 'xl-3',
    date: '2026-11-27',
    category: '추가 옵션',
    customerOrVendor: '이정민 고객님',
    description: '현지 시내 디너 크루즈 추가 결제',
    incomeUsd: 320,
    expenseUsd: 210,
    paymentMethod: '신용카드',
    status: '완료',
    note: '4인 기준',
  },
  {
    id: 'xl-4',
    date: '2026-11-28',
    category: '가이드비',
    customerOrVendor: '김도현 가이드',
    description: '최성우팀 4박5일 전담 가이드 선지급',
    incomeUsd: 0,
    expenseUsd: 250,
    paymentMethod: '현지 계좌이체',
    status: '대기',
    note: '투어 종료 후 잔액 정산',
  },
];

export function loadReservations(): Reservation[] {
  try {
    const raw = localStorage.getItem(RESERVATIONS_KEY);
    if (!raw) {
      localStorage.setItem(RESERVATIONS_KEY, JSON.stringify(INITIAL_RESERVATIONS));
      return INITIAL_RESERVATIONS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_RESERVATIONS;
  } catch {
    return INITIAL_RESERVATIONS;
  }
}

export function saveReservations(reservations: Reservation[]): void {
  localStorage.setItem(RESERVATIONS_KEY, JSON.stringify(reservations));
}

export function loadStaffAccounts(): StaffAccount[] {
  try {
    const raw = localStorage.getItem(STAFF_ACCOUNTS_KEY);
    if (!raw) {
      localStorage.setItem(STAFF_ACCOUNTS_KEY, JSON.stringify(DEFAULT_STAFF_ACCOUNTS));
      return DEFAULT_STAFF_ACCOUNTS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_STAFF_ACCOUNTS;
  } catch {
    return DEFAULT_STAFF_ACCOUNTS;
  }
}

export function saveStaffAccounts(accounts: StaffAccount[]): void {
  localStorage.setItem(STAFF_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function loadExcelSheetRows(): ExcelSheetRow[] {
  try {
    const raw = localStorage.getItem(EXCEL_SHEET_KEY);
    if (!raw) {
      localStorage.setItem(EXCEL_SHEET_KEY, JSON.stringify(INITIAL_EXCEL_SHEET_ROWS));
      return INITIAL_EXCEL_SHEET_ROWS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_EXCEL_SHEET_ROWS;
  } catch {
    return INITIAL_EXCEL_SHEET_ROWS;
  }
}

export function saveExcelSheetRows(rows: ExcelSheetRow[]): void {
  localStorage.setItem(EXCEL_SHEET_KEY, JSON.stringify(rows));
}

export function loadAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function saveAuthUser(user: AuthUser | null): void {
  if (!user) {
    localStorage.removeItem(AUTH_KEY);
  } else {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  }
}

export function formatUsd(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(safe);
}

export function formatKrw(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${new Intl.NumberFormat('ko-KR').format(Math.round(safe))}원`;
}

export function calculateReservationFinance(res: Reservation) {
  const costItems = Array.isArray(res?.costItems) ? res.costItems : [];
  const totalCostUsd = costItems.reduce((sum, item) => sum + (Number(item?.costUsd) || 0), 0);
  const totalCostKrw = costItems.reduce((sum, item) => sum + (Number(item?.costKrw) || 0), 0);
  const netProfitUsd = (Number(res?.totalPriceUsd) || 0) - totalCostUsd;
  const netProfitKrw = (Number(res?.totalPriceKrw) || 0) - totalCostKrw;
  const marginPercent = (Number(res?.totalPriceUsd) || 0) > 0 ? (netProfitUsd / Number(res.totalPriceUsd)) * 100 : 0;
  const isUnpaid = !res?.depositPaid || !res?.balancePaid;
  const paidCostCount = costItems.filter((c) => Boolean(c?.paid)).length;

  return {
    totalCostUsd,
    totalCostKrw,
    netProfitUsd,
    netProfitKrw,
    marginPercent,
    isUnpaid,
    paidCostCount,
    totalCostCount: costItems.length,
  };
}

function escapeCsvCell(value: string | number | boolean): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportReservationsToCsv(reservations: Reservation[], role: UserRole): void {
  const isAdmin = role === 'admin';
  const safeReservations = Array.isArray(reservations) ? reservations : [];
  const headers = isAdmin
    ? [
        '예약코드',
        '진행상태',
        '고객명',
        '총인원',
        '여행지',
        '상품명',
        '출발일',
        '종료일',
        '담당자',
        '총매출(USD)',
        '총매출(KRW)',
        '총원가(USD)',
        '순수익(USD)',
        '마진율(%)',
        '계약금입금',
        '잔금입금',
      ]
    : ['예약코드', '진행상태', '고객명', '총인원', '여행지', '상품명', '출발일', '종료일', '담당자', '일정수'];

  const rows = safeReservations.map((r) => {
    const scheduleCount = Array.isArray(r?.scheduleItems) ? r.scheduleItems.length : 0;
    if (!isAdmin) {
      return [
        r.bookingCode || '',
        r.status || '',
        r.customerName || '',
        r.customerCount || 0,
        r.destination || '',
        r.productName || '',
        r.startDate || '',
        r.endDate || '',
        r.managerName || '',
        scheduleCount,
      ];
    }
    const fin = calculateReservationFinance(r);
    return [
      r.bookingCode || '',
      r.status || '',
      r.customerName || '',
      r.customerCount || 0,
      r.destination || '',
      r.productName || '',
      r.startDate || '',
      r.endDate || '',
      r.managerName || '',
      r.totalPriceUsd || 0,
      r.totalPriceKrw || 0,
      fin.totalCostUsd,
      fin.netProfitUsd,
      fin.marginPercent.toFixed(1),
      r.depositPaid ? '완료' : '미입금',
      r.balancePaid ? '완료' : '미입금',
    ];
  });

  const csvContent =
    '\uFEFF' +
    [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MANGOTOUR_ERP_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportCustomSheetToCsv(rows: ExcelSheetRow[]): void {
  const headers = ['날짜', '구분', '거래처/고객', '세부내역', '수입(USD)', '지출(USD)', '결제수단', '상태', '비고'];
  const csvRows = rows.map((r) => [
    r.date,
    r.category,
    r.customerOrVendor,
    r.description,
    r.incomeUsd,
    r.expenseUsd,
    r.paymentMethod,
    r.status,
    r.note,
  ]);
  const csvContent =
    '\uFEFF' +
    [headers, ...csvRows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MANGOTOUR_SHEET_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportBackupJson(reservations: Reservation[]): void {
  const payload = {
    app: 'MANGO TOUR ERP',
    exportedAt: new Date().toISOString(),
    version: 1,
    reservations,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MANGOTOUR_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
