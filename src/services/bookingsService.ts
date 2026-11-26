import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { BookingStatus, CostItem, Reservation, RevenueItem, ScheduleItem } from '../types/erp';

export interface SupabaseBookingRow {
  id: string;
  created_at?: string;
  customer_name: string | null;
  headcount: number | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  duration: string | null;
  manager: string | null;
  product_name: string | null;
  total_usd: number | null;
  total_krw: number | null;
  deposit_paid: boolean | null;
  balance_paid: boolean | null;
  included_items: unknown;
  cost_items: unknown;
  schedules: unknown;
  inclusions: string | null;
  exclusions: string | null;
  status: string | null;
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

function computeDurationText(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return '';
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (!Number.isFinite(diffDays) || diffDays < 0) return '';
  if (diffDays === 0) return '당일';
  return `${diffDays}박 ${diffDays + 1}일`;
}

export function mapBookingRowToReservation(row: SupabaseBookingRow): Reservation {
  const startDate = row.start_date || new Date().toISOString().slice(0, 10);
  const endDate = row.end_date || startDate;
  const customerName = row.customer_name || '고객';
  const headcount = Number(row.headcount) || 1;
  const totalUsd = Number(row.total_usd) || 0;
  const totalKrw = Number(row.total_krw) || 0;

  let meta: IncludedMetaPayload = {};
  if (Array.isArray(row.included_items)) {
    meta = {
      items: row.included_items as IncludedMetaPayload['items'],
    };
  } else if (row.included_items && typeof row.included_items === 'object') {
    meta = row.included_items as IncludedMetaPayload;
  }

  const exchangeRate = Number(meta.exchangeRate) || 1400;
  const dateCode = startDate.replace(/-/g, '').slice(2, 6);
  const fallbackCode = `MT-${dateCode}-${row.id.slice(0, 3).toUpperCase()}`;

  const rawSchedules = Array.isArray(row.schedules) ? (row.schedules as ScheduleItem[]) : [];
  const rawCosts = Array.isArray(row.cost_items) ? (row.cost_items as CostItem[]) : [];
  const rawRevenue = Array.isArray(meta.revenueItems) ? meta.revenueItems : [];

  return {
    id: row.id,
    bookingCode: meta.bookingCode || fallbackCode,
    createdAt: row.created_at || new Date().toISOString(),
    customerName,
    customerCount: headcount,
    rawCustomerText:
      meta.rawCustomerText ||
      `${customerName} 고객님 외 ${Math.max(0, headcount - 1)}인`,
    destination: row.destination || '베트남 호치민',
    productName: row.product_name || '호치민 골프 & 투어',
    startDate,
    endDate,
    duration: row.duration || computeDurationText(startDate, endDate),
    managerName: row.manager || '담당자 미지정',
    status: (row.status as BookingStatus) || '예약확정',
    totalPriceUsd: totalUsd,
    totalPriceKrw: totalKrw || Math.round(totalUsd * exchangeRate),
    exchangeRate,
    depositPaid: Boolean(row.deposit_paid),
    depositAmountUsd:
      typeof meta.depositAmountUsd === 'number'
        ? meta.depositAmountUsd
        : Math.round(totalUsd * 0.3),
    balancePaid: Boolean(row.balance_paid),
    balanceAmountUsd:
      typeof meta.balanceAmountUsd === 'number'
        ? meta.balanceAmountUsd
        : totalUsd - Math.round(totalUsd * 0.3),
    revenueItems: rawRevenue,
    costItems: rawCosts,
    scheduleItems: rawSchedules,
    inclusions: row.inclusions || '',
    exclusions: row.exclusions || '',
    memo: meta.memo ?? row.exclusions ?? '',
  };
}

export function mapReservationToBookingRow(res: Reservation): SupabaseBookingRow {
  const duration = res.duration || computeDurationText(res.startDate, res.endDate);
  const inclusionsText =
    res.inclusions ||
    res.costItems
      .filter((c) => c.source === 'PDF포함')
      .map((c) => c.title)
      .join(', ');

  const includedMeta: IncludedMetaPayload = {
    bookingCode: res.bookingCode,
    rawCustomerText: res.rawCustomerText,
    exchangeRate: res.exchangeRate,
    depositAmountUsd: res.depositAmountUsd,
    balanceAmountUsd: res.balanceAmountUsd,
    revenueItems: res.revenueItems,
    memo: res.memo || '',
    items: res.costItems
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
    cost_items: res.costItems,
    schedules: res.scheduleItems,
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

export async function fetchBookings(): Promise<Reservation[]> {
  const client = assertSupabase();
  const { data, error } = await client
    .from('bookings')
    .select('*')
    .order('start_date', { ascending: true });

  if (error) {
    throw new Error(`Supabase 예약 조회 실패: ${error.message}`);
  }
  return ((data || []) as SupabaseBookingRow[]).map(mapBookingRowToReservation);
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
    throw new Error(`Supabase 예약 저장 실패: ${error.message}`);
  }
  return mapBookingRowToReservation(data as SupabaseBookingRow);
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
    throw new Error(`Supabase 예약 수정 실패: ${error.message}`);
  }
  return mapBookingRowToReservation(data as SupabaseBookingRow);
}

export async function deleteBooking(id: string): Promise<void> {
  const client = assertSupabase();
  const { error } = await client.from('bookings').delete().eq('id', id);

  if (error) {
    throw new Error(`Supabase 예약 삭제 실패: ${error.message}`);
  }
}

export async function upsertBookingsBatch(reservations: Reservation[]): Promise<Reservation[]> {
  const client = assertSupabase();
  const rows = reservations.map(mapReservationToBookingRow);
  const { data, error } = await client
    .from('bookings')
    .upsert(rows, { onConflict: 'id' })
    .select('*');

  if (error) {
    throw new Error(`Supabase 일괄 저장 실패: ${error.message}`);
  }
  return ((data || []) as SupabaseBookingRow[]).map(mapBookingRowToReservation);
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
          const mapped = mapBookingRowToReservation(payload.new as SupabaseBookingRow);
          handlers.onInsertOrUpdate(mapped);
        } else if (payload.eventType === 'DELETE') {
          const deletedId = (payload.old as { id?: string })?.id;
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
