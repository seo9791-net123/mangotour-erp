import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  COST_CATEGORIES,
  type CostCategory,
  type CostCurrency,
  type MasterPrice,
} from '../types/erp';

const MASTER_PRICES_LOCAL_KEY = 'mango_tour_erp_master_prices_v1';

export const MASTER_PRICES_SETUP_SQL = `-- 1) bookings 테이블에 VND 환율 컬럼 추가
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS exchange_rate_vnd numeric DEFAULT 25400;

-- 2) 표준 단가표(master_prices) 테이블 생성
CREATE TABLE IF NOT EXISTS public.master_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  category text NOT NULL DEFAULT '기타',
  keyword text NOT NULL,
  vendor_name text DEFAULT '',
  weekday_price numeric NOT NULL DEFAULT 0,
  weekend_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  note text DEFAULT ''
);

-- 3) RLS / anon 권한 허용
ALTER TABLE public.master_prices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.master_prices TO anon, authenticated;
DROP POLICY IF EXISTS "Allow all on master_prices" ON public.master_prices;
CREATE POLICY "Allow all on master_prices"
  ON public.master_prices FOR ALL
  USING (true)
  WITH CHECK (true);`;

export interface SupabaseMasterPriceRow {
  id: string;
  created_at?: string | null;
  category?: string | null;
  keyword?: string | null;
  item_name?: string | null;
  name?: string | null;
  vendor_name?: string | null;
  vendor?: string | null;
  weekday_price?: number | null;
  weekday_cost?: number | null;
  weekend_price?: number | null;
  weekend_cost?: number | null;
  currency?: string | null;
  note?: string | null;
  memo?: string | null;
}

function normalizeCategory(raw: unknown): CostCategory {
  const str = String(raw || '').trim();
  const mapped = str === '마사지' ? '마사지/옵션' : str;
  return (COST_CATEGORIES as readonly string[]).includes(mapped)
    ? (mapped as CostCategory)
    : '기타';
}

function normalizeCurrency(raw: unknown): CostCurrency {
  const upper = String(raw || '').trim().toUpperCase();
  if (upper === 'VND' || upper === 'KRW') return upper;
  return 'USD';
}

export function mapRowToMasterPrice(row: SupabaseMasterPriceRow): MasterPrice {
  return {
    id: String(row?.id || ''),
    createdAt: row?.created_at || new Date().toISOString(),
    category: normalizeCategory(row?.category),
    keyword: String(row?.keyword ?? row?.item_name ?? row?.name ?? '').trim(),
    vendorName: String(row?.vendor_name ?? row?.vendor ?? '').trim(),
    weekdayPrice: Number(row?.weekday_price ?? row?.weekday_cost ?? 0) || 0,
    weekendPrice: Number(row?.weekend_price ?? row?.weekend_cost ?? 0) || 0,
    currency: normalizeCurrency(row?.currency),
    note: String(row?.note ?? row?.memo ?? '').trim(),
  };
}

export function loadLocalMasterPrices(): MasterPrice[] {
  try {
    const raw = localStorage.getItem(MASTER_PRICES_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MasterPrice[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalMasterPrices(items: MasterPrice[]): void {
  try {
    localStorage.setItem(MASTER_PRICES_LOCAL_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

export function formatMasterPriceSupabaseError(
  action: string,
  error: { code?: string; message?: string }
): string {
  const code = error?.code || '';
  const msg = error?.message || '알 수 없는 오류';
  if (code === '42P01' || code === 'PGRST205' || msg.includes('Could not find the table')) {
    return `Supabase에 master_prices 테이블이 아직 생성되지 않아 임시 로컬 모드로 동작합니다. 아래 SQL로 테이블을 생성하면 DB와 실시간 동기화됩니다.`;
  }
  if (code === '42501' || msg.toLowerCase().includes('permission denied')) {
    return `master_prices 테이블 권한 거부(42501): Supabase SQL Editor에서 anon 권한 및 RLS 정책을 허용해 주세요.`;
  }
  return `단가표 ${action} 실패: ${msg}`;
}

export async function fetchMasterPrices(): Promise<{
  items: MasterPrice[];
  warning?: string;
}> {
  const localCached = loadLocalMasterPrices();
  if (!isSupabaseConfigured || !supabase) {
    return { items: localCached };
  }

  const { data, error } = await supabase
    .from('master_prices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return {
      items: localCached,
      warning: formatMasterPriceSupabaseError('조회', error),
    };
  }

  const mapped = (Array.isArray(data) ? data : []).map((r) =>
    mapRowToMasterPrice(r as SupabaseMasterPriceRow)
  );
  saveLocalMasterPrices(mapped);
  return { items: mapped };
}

export async function createMasterPrice(item: MasterPrice): Promise<MasterPrice> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase 미연결');
  }

  const fullPayload = {
    id: item.id,
    created_at: item.createdAt || new Date().toISOString(),
    category: item.category,
    keyword: item.keyword,
    vendor_name: item.vendorName || '',
    weekday_price: Number(item.weekdayPrice) || 0,
    weekend_price: Number(item.weekendPrice) || 0,
    currency: item.currency,
    note: item.note || '',
  };

  const first = await supabase
    .from('master_prices')
    .insert(fullPayload)
    .select('*')
    .single();

  if (!first.error) {
    return mapRowToMasterPrice((first.data || fullPayload) as SupabaseMasterPriceRow);
  }

  if (isMissingColumnError(first.error)) {
    const minimalPayload = {
      id: item.id,
      category: item.category,
      keyword: item.keyword,
      weekday_price: Number(item.weekdayPrice) || 0,
      weekend_price: Number(item.weekendPrice) || 0,
      currency: item.currency,
    };
    const retry = await supabase
      .from('master_prices')
      .insert(minimalPayload)
      .select('*')
      .single();

    if (!retry.error) {
      return mapRowToMasterPrice((retry.data || minimalPayload) as SupabaseMasterPriceRow);
    }
    throw new Error(formatMasterPriceSupabaseError('등록', retry.error));
  }

  throw new Error(formatMasterPriceSupabaseError('등록', first.error));
}

export async function updateMasterPrice(item: MasterPrice): Promise<MasterPrice> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase 미연결');
  }

  const fullPayload = {
    category: item.category,
    keyword: item.keyword,
    vendor_name: item.vendorName || '',
    weekday_price: Number(item.weekdayPrice) || 0,
    weekend_price: Number(item.weekendPrice) || 0,
    currency: item.currency,
    note: item.note || '',
  };

  const first = await supabase
    .from('master_prices')
    .update(fullPayload)
    .eq('id', item.id)
    .select('*')
    .single();

  if (!first.error) {
    return mapRowToMasterPrice((first.data || { ...fullPayload, id: item.id }) as SupabaseMasterPriceRow);
  }

  if (isMissingColumnError(first.error)) {
    const minimalPayload = {
      category: item.category,
      keyword: item.keyword,
      weekday_price: Number(item.weekdayPrice) || 0,
      weekend_price: Number(item.weekendPrice) || 0,
      currency: item.currency,
    };
    const retry = await supabase
      .from('master_prices')
      .update(minimalPayload)
      .eq('id', item.id)
      .select('*')
      .single();

    if (!retry.error) {
      return mapRowToMasterPrice(
        (retry.data || { ...minimalPayload, id: item.id }) as SupabaseMasterPriceRow
      );
    }
    throw new Error(formatMasterPriceSupabaseError('수정', retry.error));
  }

  throw new Error(formatMasterPriceSupabaseError('수정', first.error));
}

export async function deleteMasterPrice(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase 미연결');
  }

  const { error } = await supabase.from('master_prices').delete().eq('id', id);
  if (error) {
    throw new Error(formatMasterPriceSupabaseError('삭제', error));
  }
}
