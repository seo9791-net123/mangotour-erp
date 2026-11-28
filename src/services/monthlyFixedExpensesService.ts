import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  FIXED_COST_CATEGORIES,
  type CostCurrency,
  type FixedCostCategory,
  type MonthlyFixedCost,
} from '../types/erp';
import { loadMonthlyFixedCosts, saveMonthlyFixedCosts } from '../utils/storage';

export const MONTHLY_FIXED_EXPENSES_SETUP_SQL = `-- 월간 고정비(판관비) 테이블 생성
CREATE TABLE IF NOT EXISTS public.monthly_fixed_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  year_month text NOT NULL,
  category text NOT NULL DEFAULT '기타',
  title text DEFAULT '',
  currency text NOT NULL DEFAULT 'KRW',
  original_amount numeric NOT NULL DEFAULT 0,
  amount_krw numeric NOT NULL DEFAULT 0,
  note text DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_monthly_fixed_expenses_year_month
  ON public.monthly_fixed_expenses (year_month);

-- RLS / anon 권한 허용
ALTER TABLE public.monthly_fixed_expenses ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.monthly_fixed_expenses TO anon, authenticated;
DROP POLICY IF EXISTS "Allow all on monthly_fixed_expenses" ON public.monthly_fixed_expenses;
CREATE POLICY "Allow all on monthly_fixed_expenses"
  ON public.monthly_fixed_expenses FOR ALL
  USING (true)
  WITH CHECK (true);`;

export interface SupabaseFixedExpenseRow {
  id: string;
  created_at?: string | null;
  year_month?: string | null;
  month?: string | null;
  category?: string | null;
  title?: string | null;
  description?: string | null;
  currency?: string | null;
  original_amount?: number | null;
  amount_krw?: number | null;
  amount?: number | null;
  note?: string | null;
  memo?: string | null;
}

export function normalizeFixedCostCategory(raw: unknown): FixedCostCategory {
  const str = String(raw || '').trim();
  if (str === '급여') return '직원 급여';
  if (str === '광고비') return '마케팅/광고비';
  if ((FIXED_COST_CATEGORIES as readonly string[]).includes(str)) {
    return str as FixedCostCategory;
  }
  return '기타';
}

function normalizeCurrency(raw: unknown): CostCurrency {
  const upper = String(raw || '').trim().toUpperCase();
  if (upper === 'USD' || upper === 'VND') return upper;
  return 'KRW';
}

export function mapRowToFixedCost(row: SupabaseFixedExpenseRow): MonthlyFixedCost {
  const category = normalizeFixedCostCategory(row?.category);
  const currency = normalizeCurrency(row?.currency);
  const amountKrw = Number(row?.amount_krw ?? row?.amount ?? 0) || 0;
  const originalAmount =
    typeof row?.original_amount === 'number' && Number.isFinite(row.original_amount)
      ? row.original_amount
      : amountKrw;

  return {
    id: String(row?.id || ''),
    yearMonth: String(row?.year_month ?? row?.month ?? '').trim().slice(0, 7),
    category,
    title: String(row?.title ?? row?.description ?? category).trim() || category,
    currency,
    originalAmount,
    amountKrw,
    note: String(row?.note ?? row?.memo ?? '').trim(),
  };
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

export function formatFixedExpenseSupabaseError(
  action: string,
  error: { code?: string; message?: string }
): string {
  const code = error?.code || '';
  const msg = error?.message || '알 수 없는 오류';
  if (code === '42P01' || code === 'PGRST205' || msg.includes('Could not find the table')) {
    return 'Supabase에 monthly_fixed_expenses 테이블이 아직 생성되지 않아 임시 로컬 모드로 동작합니다. 아래 SQL로 테이블을 생성하면 DB와 동기화됩니다.';
  }
  if (code === '42501' || msg.toLowerCase().includes('permission denied')) {
    return 'monthly_fixed_expenses 테이블 권한 거부(42501): Supabase SQL Editor에서 anon 권한 및 RLS 정책을 허용해 주세요.';
  }
  return `월간 고정비 ${action} 실패: ${msg}`;
}

export async function fetchMonthlyFixedExpenses(): Promise<{
  items: MonthlyFixedCost[];
  warning?: string;
}> {
  const localItems = loadMonthlyFixedCosts().map((item) => ({
    ...item,
    category: normalizeFixedCostCategory(item.category),
  }));

  if (!isSupabaseConfigured || !supabase) {
    return { items: localItems };
  }

  const { data, error } = await supabase
    .from('monthly_fixed_expenses')
    .select('*')
    .order('year_month', { ascending: false });

  if (error) {
    return {
      items: localItems,
      warning: formatFixedExpenseSupabaseError('조회', error),
    };
  }

  const mapped = (Array.isArray(data) ? data : []).map((r) =>
    mapRowToFixedCost(r as SupabaseFixedExpenseRow)
  );
  saveMonthlyFixedCosts(mapped);
  return { items: mapped };
}

export async function createMonthlyFixedExpense(
  item: MonthlyFixedCost
): Promise<MonthlyFixedCost> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase 미연결');
  }

  const fullPayload = {
    id: item.id,
    year_month: item.yearMonth,
    category: item.category,
    title: item.title || item.category,
    currency: item.currency || 'KRW',
    original_amount: Number(item.originalAmount) || 0,
    amount_krw: Number(item.amountKrw) || 0,
    note: item.note || '',
  };

  const first = await supabase
    .from('monthly_fixed_expenses')
    .insert(fullPayload)
    .select('*')
    .single();

  if (!first.error) {
    return mapRowToFixedCost((first.data || fullPayload) as SupabaseFixedExpenseRow);
  }

  if (isMissingColumnError(first.error)) {
    const minimalPayload = {
      id: item.id,
      year_month: item.yearMonth,
      category: item.category,
      amount_krw: Number(item.amountKrw) || 0,
      note: item.note || item.title || '',
    };
    const retry = await supabase
      .from('monthly_fixed_expenses')
      .insert(minimalPayload)
      .select('*')
      .single();

    if (!retry.error) {
      return mapRowToFixedCost((retry.data || minimalPayload) as SupabaseFixedExpenseRow);
    }
    throw new Error(formatFixedExpenseSupabaseError('등록', retry.error));
  }

  throw new Error(formatFixedExpenseSupabaseError('등록', first.error));
}

export async function updateMonthlyFixedExpense(
  item: MonthlyFixedCost
): Promise<MonthlyFixedCost> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase 미연결');
  }

  const fullPayload = {
    year_month: item.yearMonth,
    category: item.category,
    title: item.title || item.category,
    currency: item.currency || 'KRW',
    original_amount: Number(item.originalAmount) || 0,
    amount_krw: Number(item.amountKrw) || 0,
    note: item.note || '',
  };

  const first = await supabase
    .from('monthly_fixed_expenses')
    .update(fullPayload)
    .eq('id', item.id)
    .select('*')
    .single();

  if (!first.error) {
    return mapRowToFixedCost(
      (first.data || { ...fullPayload, id: item.id }) as SupabaseFixedExpenseRow
    );
  }

  if (isMissingColumnError(first.error)) {
    const minimalPayload = {
      year_month: item.yearMonth,
      category: item.category,
      amount_krw: Number(item.amountKrw) || 0,
      note: item.note || item.title || '',
    };
    const retry = await supabase
      .from('monthly_fixed_expenses')
      .update(minimalPayload)
      .eq('id', item.id)
      .select('*')
      .single();

    if (!retry.error) {
      return mapRowToFixedCost(
        (retry.data || { ...minimalPayload, id: item.id }) as SupabaseFixedExpenseRow
      );
    }
    throw new Error(formatFixedExpenseSupabaseError('수정', retry.error));
  }

  throw new Error(formatFixedExpenseSupabaseError('수정', first.error));
}

export async function deleteMonthlyFixedExpense(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase 미연결');
  }

  const { error } = await supabase.from('monthly_fixed_expenses').delete().eq('id', id);
  if (error) {
    throw new Error(formatFixedExpenseSupabaseError('삭제', error));
  }
}
