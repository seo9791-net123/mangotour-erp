export type UserRole = 'admin' | 'staff';

export interface AuthUser {
  username: string;
  role: UserRole;
  displayName: string;
}

export type ScheduleType = 'GOLF' | 'TOUR';
export type GolfBookingStatus = '대기' | '확정';
export type BookingStatus = '상담중' | '예약확정' | '진행중' | '완료' | '취소';
export const COST_CATEGORIES = [
  '숙박',
  '골프장',
  '차량',
  '가이드',
  '식사',
  '마사지/옵션',
  '기타',
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];
export type CostCurrency = 'USD' | 'VND' | 'KRW';

export interface ScheduleItem {
  id: string;
  date: string; // YYYY-MM-DD
  dayNumber: number;
  time: string;
  title: string;
  detail: string;
  type: ScheduleType;
  golfCourseName?: string;
  teeOffTime?: string;
  golfBookingStatus?: GolfBookingStatus;
  vehicleGuideNote?: string;
}

export interface RevenueItem {
  id: string;
  title: string;
  amountUsd: number;
  amountKrw: number;
  note?: string;
}

export interface CostItem {
  id: string;
  title: string;
  category: CostCategory;
  source: 'PDF포함' | '골프원가' | '직접추가';
  serviceDate?: string; // 실제 진행 날짜 YYYY-MM-DD
  currency?: CostCurrency;
  originalAmount?: number;
  costUsd: number;
  costKrw: number;
  paid: boolean;
  note?: string;
}

export interface Reservation {
  id: string;
  bookingCode: string;
  createdAt: string;
  customerName: string;
  customerCount: number;
  rawCustomerText: string;
  destination: string;
  productName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  managerName: string;
  status: BookingStatus;
  totalPriceUsd: number;
  totalPriceKrw: number;
  exchangeRate: number;
  vndExchangeRate?: number;
  depositPaid: boolean;
  depositAmountUsd: number;
  balancePaid: boolean;
  balanceAmountUsd: number;
  revenueItems: RevenueItem[];
  costItems: CostItem[];
  scheduleItems: ScheduleItem[];
  duration?: string;
  inclusions?: string;
  exclusions?: string;
  memo?: string;
}

export interface ParsedQuoteResult {
  customerName: string;
  customerCount: number;
  rawCustomerText: string;
  destination: string;
  productName: string;
  startDate: string;
  endDate: string;
  managerName: string;
  totalPriceUsd: number;
  totalPriceKrw: number;
  exchangeRate: number;
  revenueItems: Array<{
    title: string;
    amountUsd: number;
    amountKrw: number;
    note?: string;
  }>;
  includedCostItems: Array<{
    title: string;
    category: string;
    serviceDate?: string;
    note?: string;
  }>;
  scheduleItems: Array<{
    date: string;
    dayNumber: number;
    time: string;
    title: string;
    detail: string;
    type: string;
    golfCourseName?: string;
    teeOffTime?: string;
  }>;
}

export interface StaffAccount {
  id: string;
  username: string;
  password: string;
  displayName: string;
  position: string;
  phone?: string;
  createdAt: string;
}

export interface ExcelSheetRow {
  id: string;
  date: string;
  category: string;
  customerOrVendor: string;
  description: string;
  incomeUsd: number;
  expenseUsd: number;
  paymentMethod: string;
  status: '완료' | '대기' | '보류';
  note: string;
}

export const FIXED_COST_CATEGORIES = [
  '직원 급여',
  '사무실 임대료',
  '마케팅/광고비',
  '통신/운영비',
  '기타',
] as const;
export type FixedCostCategory = (typeof FIXED_COST_CATEGORIES)[number];

export interface MonthlyFixedCost {
  id: string;
  yearMonth: string; // YYYY-MM
  category: FixedCostCategory;
  title: string;
  currency: CostCurrency;
  originalAmount: number;
  amountKrw: number;
  note?: string;
}

export interface MasterPrice {
  id: string;
  createdAt?: string;
  category: CostCategory;
  keyword: string;
  vendorName?: string;
  weekdayPrice: number;
  weekendPrice: number;
  currency: CostCurrency;
  note?: string;
}

