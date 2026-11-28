import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { StaffAccount, UserRole } from '../types/erp';

const STAFF_ACCOUNTS_LOCAL_KEY = 'mango_tour_erp_staff_v1';

export const USER_ROLE_META: Record<
  UserRole,
  { label: string; badgeClass: string; description: string }
> = {
  admin: {
    label: '관리자',
    badgeClass: 'bg-[#065F46] text-white border-[#065F46]',
    description: '모든 메뉴 및 재무/권한 관리 100% 접근',
  },
  staff: {
    label: '일반 사무',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    description: '견적/예약 관리 · 단가표 관리 · 일자별 지출관리',
  },
  guide: {
    label: '가이드',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
    description: '일자별 지출관리 전용 (매출/손익 숨김)',
  },
  accountant: {
    label: '세무 직원',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
    description: '재무/손익 관리 · 조회용 일자별 지출관리',
  },
};

export const APP_USERS_SETUP_SQL = `-- 직원 권한 관리(app_users) 테이블 생성
CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  username text UNIQUE NOT NULL,
  password text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'guide', 'accountant')),
  is_active boolean NOT NULL DEFAULT true,
  position text DEFAULT '',
  phone text DEFAULT ''
);

-- RLS / anon 권한 허용
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_users TO anon, authenticated;
DROP POLICY IF EXISTS "Allow all on app_users" ON public.app_users;
CREATE POLICY "Allow all on app_users"
  ON public.app_users FOR ALL
  USING (true)
  WITH CHECK (true);`;

export interface SupabaseAppUserRow {
  id: string;
  created_at?: string | null;
  username?: string | null;
  password?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  name?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  position?: string | null;
  phone?: string | null;
}

export function normalizeUserRole(raw: unknown): UserRole {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'admin' || val === 'staff' || val === 'guide' || val === 'accountant') {
    return val;
  }
  return 'staff';
}

export function mapRowToStaffAccount(row: SupabaseAppUserRow): StaffAccount {
  const fullName = String(row?.full_name ?? row?.display_name ?? row?.name ?? '').trim();
  const role = normalizeUserRole(row?.role);
  return {
    id: String(row?.id || ''),
    username: String(row?.username || '').trim(),
    password: String(row?.password || ''),
    displayName: fullName || String(row?.username || '직원'),
    fullName: fullName || String(row?.username || '직원'),
    role,
    isActive: row?.is_active !== false,
    position: String(row?.position || '').trim() || USER_ROLE_META[role].label,
    phone: String(row?.phone || '').trim(),
    createdAt: row?.created_at || new Date().toISOString(),
  };
}

function loadLocalStaffCache(): StaffAccount[] {
  try {
    const raw = localStorage.getItem(STAFF_ACCOUNTS_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StaffAccount[]) : [];
  } catch {
    return [];
  }
}

function saveLocalStaffCache(items: StaffAccount[]): void {
  try {
    localStorage.setItem(STAFF_ACCOUNTS_LOCAL_KEY, JSON.stringify(items));
  } catch {
    // ignore
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

function isTableMissingOrBlocked(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('could not find the table') ||
    code === '42501' ||
    msg.includes('permission denied')
  );
}

export function formatAppUsersSupabaseError(
  action: string,
  error: { code?: string; message?: string }
): string {
  const code = error?.code || '';
  const msg = error?.message || '알 수 없는 오류';
  if (code === '42P01' || code === 'PGRST205' || msg.includes('Could not find the table')) {
    return 'Supabase에 app_users 테이블이 아직 생성되지 않아 임시 로컬 모드로 동작합니다. 아래 SQL로 테이블을 생성하면 DB와 실시간 동기화됩니다.';
  }
  if (code === '42501' || msg.toLowerCase().includes('permission denied')) {
    return 'app_users 테이블 권한 거부(42501): Supabase SQL Editor에서 anon 권한 및 RLS 정책을 허용해 주세요.';
  }
  if (code === '23505' || msg.toLowerCase().includes('duplicate')) {
    return '이미 동일한 로그인 아이디가 등록되어 있습니다.';
  }
  return `직원 계정 ${action} 실패: ${msg}`;
}

export async function fetchAppUsers(): Promise<{
  items: StaffAccount[];
  warning?: string;
}> {
  const cached = loadLocalStaffCache();
  if (!isSupabaseConfigured || !supabase) {
    return { items: cached };
  }

  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return {
      items: cached,
      warning: formatAppUsersSupabaseError('조회', error),
    };
  }

  const mapped = (Array.isArray(data) ? data : []).map((r) =>
    mapRowToStaffAccount(r as SupabaseAppUserRow)
  );
  saveLocalStaffCache(mapped);
  return { items: mapped };
}

export type LoginLookupResult =
  | { status: 'success'; user: StaffAccount }
  | { status: 'inactive' }
  | { status: 'invalid' };

export async function authenticateAppUser(
  username: string,
  password: string,
  localFallbackAccounts: StaffAccount[]
): Promise<LoginLookupResult> {
  const cleanId = username.trim();

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('username', cleanId)
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      const matched = mapRowToStaffAccount(data[0] as SupabaseAppUserRow);
      if (matched.password !== password) {
        return { status: 'invalid' };
      }
      if (!matched.isActive) {
        return { status: 'inactive' };
      }
      return { status: 'success', user: matched };
    }

    // If table doesn't exist yet, fall back to local accounts; otherwise if query succeeded with 0 rows, also check local fallback
    if (error && !isTableMissingOrBlocked(error)) {
      // Non-table error — still allow fallback check if available
    }
  }

  const matchedLocal = localFallbackAccounts.find(
    (acc) => (acc.username || '').trim().toLowerCase() === cleanId.toLowerCase() && acc.password === password
  );
  if (!matchedLocal) {
    return { status: 'invalid' };
  }
  if (!matchedLocal.isActive) {
    return { status: 'inactive' };
  }
  return {
    status: 'success',
    user: {
      ...matchedLocal,
      role: normalizeUserRole(matchedLocal.role),
      fullName: matchedLocal.fullName || matchedLocal.displayName,
      isActive: true,
    },
  };
}

export async function createAppUser(staff: StaffAccount): Promise<StaffAccount> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase 미연결');
  }

  const fullName = (staff.fullName || staff.displayName || staff.username).trim();
  const fullPayload = {
    id: staff.id,
    created_at: staff.createdAt || new Date().toISOString(),
    username: staff.username.trim(),
    password: staff.password,
    full_name: fullName,
    role: normalizeUserRole(staff.role),
    is_active: staff.isActive !== false,
    position: staff.position || '',
    phone: staff.phone || '',
  };

  const first = await supabase
    .from('app_users')
    .insert(fullPayload)
    .select('*')
    .single();

  if (!first.error) {
    return mapRowToStaffAccount((first.data || fullPayload) as SupabaseAppUserRow);
  }

  if (isMissingColumnError(first.error)) {
    const minimalPayload = {
      id: staff.id,
      created_at: staff.createdAt || new Date().toISOString(),
      username: staff.username.trim(),
      password: staff.password,
      full_name: fullName,
      role: normalizeUserRole(staff.role),
      is_active: staff.isActive !== false,
    };
    const retry = await supabase
      .from('app_users')
      .insert(minimalPayload)
      .select('*')
      .single();

    if (!retry.error) {
      return mapRowToStaffAccount((retry.data || minimalPayload) as SupabaseAppUserRow);
    }
    throw new Error(formatAppUsersSupabaseError('등록', retry.error));
  }

  throw new Error(formatAppUsersSupabaseError('등록', first.error));
}

export async function updateAppUser(
  id: string,
  updates: Partial<Pick<StaffAccount, 'role' | 'password' | 'isActive' | 'fullName' | 'displayName' | 'position' | 'phone'>>
): Promise<StaffAccount> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase 미연결');
  }

  const payload: Record<string, unknown> = {};
  if (updates.role !== undefined) payload.role = normalizeUserRole(updates.role);
  if (updates.password !== undefined) payload.password = updates.password;
  if (updates.isActive !== undefined) payload.is_active = Boolean(updates.isActive);
  if (updates.fullName !== undefined || updates.displayName !== undefined) {
    payload.full_name = (updates.fullName ?? updates.displayName ?? '').trim();
  }
  if (updates.position !== undefined) payload.position = updates.position;
  if (updates.phone !== undefined) payload.phone = updates.phone;

  const first = await supabase
    .from('app_users')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (!first.error) {
    return mapRowToStaffAccount(first.data as SupabaseAppUserRow);
  }

  if (isMissingColumnError(first.error)) {
    const minimalPayload: Record<string, unknown> = {};
    if (updates.role !== undefined) minimalPayload.role = normalizeUserRole(updates.role);
    if (updates.password !== undefined) minimalPayload.password = updates.password;
    if (updates.isActive !== undefined) minimalPayload.is_active = Boolean(updates.isActive);
    if (updates.fullName !== undefined || updates.displayName !== undefined) {
      minimalPayload.full_name = (updates.fullName ?? updates.displayName ?? '').trim();
    }

    const retry = await supabase
      .from('app_users')
      .update(minimalPayload)
      .eq('id', id)
      .select('*')
      .single();

    if (!retry.error) {
      return mapRowToStaffAccount(retry.data as SupabaseAppUserRow);
    }
    throw new Error(formatAppUsersSupabaseError('수정', retry.error));
  }

  throw new Error(formatAppUsersSupabaseError('수정', first.error));
}

export async function deleteAppUser(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase 미연결');
  }

  const { error } = await supabase.from('app_users').delete().eq('id', id);
  if (error) {
    throw new Error(formatAppUsersSupabaseError('삭제', error));
  }
}
