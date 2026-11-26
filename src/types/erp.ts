export type UserRole = 'admin' | 'staff';

export interface AuthUser {
  username: string;
  role: UserRole;
  displayName: string;
}

export type ScheduleType = 'GOLF' | 'TOUR';
export type GolfBookingStatus = '대기' | '확정';
export type BookingStatus = '상담중' | '예약확정' | '진행중' | '완료' | '취소';
export type CostCategory = '숙박' | '차량' | '가이드' | '마사지' | '골프장' | '식사' | '기타';

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

