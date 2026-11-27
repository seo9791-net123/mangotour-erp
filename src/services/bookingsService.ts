import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type {
  BookingStatus,
  CostCategory,
  CostItem,
  Reservation,
  RevenueItem,
  ScheduleItem,
  ScheduleType,
} from '../types/erp';

export interface SupabaseBookingRow {
  id: string;
  created_at?: string | null;
  customer_name?: string | null;
  headcount?: number | null;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration?: string | null;
  manager?: string | null;
  product_name?: string | null;
  total_usd?: number | null;
  total_krw?: number | null;
  deposit_paid?: boolean | null;
  balance_paid?: boolean | null;
  included_items?: unknown;
  cost_items?: unknown;
  schedules?: unknown;
  inclusions?: string | null;
  exclusions?: string | null;
  status?: string | null;
}

interface IncludedMetaPayload {
  bookingCode?: string;
  rawCustomerText?: string;
  exchangeRate?: number;
  depositAmountUsd?: number;
  balanceAmountUsd?: number;
  revenueItems?: RevenueItem[];
  memo?: string;
  items?: Array<{ title: string; category?: string; note?: string }>;
}

function parseArrayField<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseObjectField<T extends object>(val: unknown): Partial<T> {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return val as Partial<T>;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Partial<T>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function computeDurationText(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return '';
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (!Number.isFinite(diffDays) || diffDays < 0) return '';
  if (diffDays === 0) return '당일';
  return `${diffDays}박 ${diffDays + 1}일`;
}

function normalizeScheduleItem(raw: Partial<ScheduleItem>, idx: number, fallbackDate: string): ScheduleItem {
  const type: ScheduleType = raw?.type === 'GOLF' ? 'GOLF' : 'TOUR';
  return {
    id: raw?.id || `sch-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`,
    date: raw?.date || fallbackDate,
    dayNumber: Number(raw?.dayNumber) || idx + 1,
    time: raw?.time || (type === 'GOLF' ? '07:30' : '10:00'),
    title: raw?.title || '일정',
    detail: raw?.detail || '',
    type,
    golfCourseName: raw?.golfCourseName,
    teeOffTime: raw?.teeOffTime,
    golfBookingStatus: raw?.golfBookingStatus || (type === 'GOLF' ? '대기' : undefined),
    vehicleGuideNote: raw?.vehicleGuideNote || '',
  };
}

function normalizeCostItem(raw: Partial<CostItem>, idx: number): CostItem {
  const validCategories: CostCategory[] = ['숙박', '차량', '가이드', '마사지', '골프장', '식사', '기타'];
  const category = validCategories.includes(raw?.category as CostCategory)
    ? (raw.category as CostCategory)
    : '기타';
  return {
    id: raw?.id || `cost-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`,
    title: raw?.title || '원가 항목',
    category,
    source: raw?.source || 'PDF포함',
    costUsd: Number(raw?.costUsd) || 0,
    costKrw: Number(raw?.costKrw) || 0,
    paid: Boolean(raw?.paid),
    note: raw?.note || '',
  };
}

export function mapBookingRowToReservation(row: SupabaseBookingRow): Reservation {
  const rowId = String(row?.id || '');
  const startDate = String(row?.start_date || new Date().toISOString().slice(0, 10));
  const endDate = String(row?.end_date || startDate);
  const customerName = String(row?.customer_name || '고객');
  const headcount = Number(row?.headcount) || 1;
  const totalUsd = Number(row?.total_usd) || 0;
  const totalKrw = Number(row?.total_krw) || 0;

  let meta: IncludedMetaPayload = {};
  const parsedIncludedArray = parseArrayField<{ title: string; category?: string; note?: string }>(
    row?.included_items
  );
  if (parsedIncludedArray.length > 0) {
    meta = { items: parsedIncludedArray };
  } else {
    meta = parseObjectField<IncludedMetaPayload>(row?.included_items);
  }

  const exchangeRate = Number(meta?.exchangeRate) || 1400;
  const dateCode = startDate.replace(/-/g, '').slice(2, 6) || '2601';
  const fallbackCode = `MT-${dateCode}-${(rowId.slice(0, 3) || '000').toUpperCase()}`;

  const rawSchedules = parseArrayField<Partial<ScheduleItem>>(row?.schedules).map((s, idx) =>
    normalizeScheduleItem(s, idx, startDate)
  );
  const rawCosts = parseArrayField<Partial<CostItem>>(row?.cost_items).map((c, idx) =>
    normalizeCostItem(c, idx)
  );
  const rawRevenue = parseArrayField<RevenueItem>(meta?.revenueItems);

  return {
    id: rowId,
    bookingCode: meta?.bookingCode || fallbackCode,
    createdAt: row?.created_at || new Date().toISOString(),
    customerName,
    customerCount: headcount,
    rawCustomerText:
      meta?.rawCustomerText ||
      `${customerName} 고객님 외 ${Math.max(0, headcount - 1)}인`,
    destination: row?.destination || '베트남 호치민',
    productName: row?.product_name || '호치민 골프 & 투어',
    startDate,
    endDate,
    duration: row?.duration || computeDurationText(startDate, endDate),
    managerName: row?.manager || '담당자 미지정',
    status: (row?.status as BookingStatus) || '예약확정',
    totalPriceUsd: totalUsd,
    totalPriceKrw: totalKrw || Math.round(totalUsd * exchangeRate),
    exchangeRate,
    depositPaid: Boolean(row?.deposit_paid),
    depositAmountUsd:
      typeof meta?.depositAmountUsd === 'number'
        ? meta.depositAmountUsd
        : Math.round(totalUsd * 0.3),
    balancePaid: Boolean(row?.balance_paid),
    balanceAmountUsd:
      typeof meta?.balanceAmountUsd === 'number'
        ? meta.balanceAmountUsd
        : totalUsd - Math.round(totalUsd * 0.3),
    revenueItems: rawRevenue,
    costItems: rawCosts,
    scheduleItems: rawSchedules,
    inclusions: row?.inclusions || '',
    exclusions: row?.exclusions || '',
    memo: meta?.memo ?? row?.exclusions ?? '',
  };
}

export function mapReservationToBookingRow(res: Reservation): SupabaseBookingRow {
  const safeCostItems = Array.isArray(res?.costItems) ? res.costItems : [];
  const safeScheduleItems = Array.isArray(res?.scheduleItems) ? res.scheduleItems : [];
  const safeRevenueItems = Array.isArray(res?.revenueItems) ? res.revenueItems : [];

  const duration = res.duration || computeDurationText(res.startDate, res.endDate);
  const inclusionsText =
    res.inclusions ||
    safeCostItems
      .filter((c) => c.source === 'PDF포함')
      .map((c) => c.title)
      .join(', ');

  const includedMeta: IncludedMetaPayload = {
    bookingCode: res.bookingCode,
    rawCustomerText: res.rawCustomerText,
    exchangeRate: res.exchangeRate,
    depositAmountUsd: res.depositAmountUsd,
    balanceAmountUsd: res.balanceAmountUsd,
    revenueItems: safeRevenueItems,
    memo: res.memo || '',
    items: safeCostItems
      .filter((c) => c.source === 'PDF포함')
      .map((c) => ({ title: c.title, category: c.category, note: c.note })),
  };

  return {
    id: res.id,
    created_at: res.createdAt || new Date().toISOString(),
    customer_name: res.customerName,
    headcount: Number(res.customerCount) || 1,
    destination: res.destination,
    start_date: res.startDate,
    end_date: res.endDate,
    duration,
    manager: res.managerName,
    product_name: res.productName,
    total_usd: Number(res.totalPriceUsd) || 0,
    total_krw: Number(res.totalPriceKrw) || 0,
    deposit_paid: Boolean(res.depositPaid),
    balance_paid: Boolean(res.balancePaid),
    included_items: includedMeta,
    cost_items: safeCostItems,
    schedules: safeScheduleItems,
    inclusions: inclusionsText,
    exclusions: res.exclusions || res.memo || '',
    status: res.status,
  };
}

function assertSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      'Supabase 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)가 설정되지 않았습니다.'
    );
  }
  return supabase;
}

function formatSupabaseError(action: string, error: { code?: string; message: string }): Error {
  if (error.code === '42501' || error.message.toLowerCase().includes('permission denied')) {
    return new Error(
      `Supabase ${action} 실패 (권한 거부 42501): Supabase SQL Editor에서 bookings 테이블의 anon 권한(GRANT) 및 RLS 정책을 허용해 주세요.`
    );
  }
  return new Error(`Supabase ${action} 실패: ${error.message}`);
}

export async function fetchBookings(): Promise<Reservation[]> {
  const client = assertSupabase();
  const { data, error } = await client
    .from('bookings')
    .select('*')
    .order('start_date', { ascending: true });

  if (error) {
    throw formatSupabaseError('예약 조회', error);
  }
  const rows = Array.isArray(data) ? data : [];
  return (rows as SupabaseBookingRow[]).map(mapBookingRowToReservation);
}

export async function createBooking(reservation: Reservation): Promise<Reservation> {
  const client = assertSupabase();
  const row = mapReservationToBookingRow(reservation);
  const { data, error } = await client
    .from('bookings')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    throw formatSupabaseError('예약 저장', error);
  }
  return mapBookingRowToReservation((data || row) as SupabaseBookingRow);
}

export async function updateBooking(reservation: Reservation): Promise<Reservation> {
  const client = assertSupabase();
  const row = mapReservationToBookingRow(reservation);
  const { id, created_at: _createdAt, ...updatePayload } = row;

  const { data, error } = await client
    .from('bookings')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw formatSupabaseError('예약 수정', error);
  }
  return mapBookingRowToReservation((data || row) as SupabaseBookingRow);
}

export async function deleteBooking(id: string): Promise<void> {
  const client = assertSupabase();
  const { error } = await client.from('bookings').delete().eq('id', id);

  if (error) {
    throw formatSupabaseError('예약 삭제', error);
  }
}

export async function upsertBookingsBatch(reservations: Reservation[]): Promise<Reservation[]> {
  const client = assertSupabase();
  const safeList = Array.isArray(reservations) ? reservations : [];
  const rows = safeList.map(mapReservationToBookingRow);
  const { data, error } = await client
    .from('bookings')
    .upsert(rows, { onConflict: 'id' })
    .select('*');

  if (error) {
    throw formatSupabaseError('일괄 저장', error);
  }
  const resultRows = Array.isArray(data) ? data : [];
  return (resultRows as SupabaseBookingRow[]).map(mapBookingRowToReservation);
}

export function subscribeToBookingsRealtime(handlers: {
  onInsertOrUpdate: (reservation: Reservation) => void;
  onDelete: (id: string) => void;
  onStatusChange?: (status: string) => void;
}): () => void {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  const client = supabase;
  const channel = client
    .channel('bookings-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bookings' },
      (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const rawNew = payload.new as SupabaseBookingRow | null | undefined;
          if (rawNew && rawNew.id) {
            const mapped = mapBookingRowToReservation(rawNew);
            handlers.onInsertOrUpdate(mapped);
          }
        } else if (payload.eventType === 'DELETE') {
          const deletedId = (payload.old as { id?: string } | null | undefined)?.id;
          if (deletedId) {
            handlers.onDelete(deletedId);
          }
        }
      }
    )
    .subscribe((status) => {
      handlers.onStatusChange?.(status);
    });

  return () => {
    client.removeChannel(channel);
  };
}
