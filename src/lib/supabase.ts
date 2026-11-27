import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function cleanEnvValue(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.trim().replace(/^['"]|['"]$/g, '').trim();
}

function getSupabaseConfigDiagnostic(url: string, key: string): string {
  if (!url || !key) {
    return 'Supabase 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)가 설정되지 않았습니다.';
  }

  const upperUrl = url.toUpperCase();
  if (
    upperUrl.includes('YOUR_PROJECT_ID') ||
    upperUrl.includes('YOUR_SUPABASE') ||
    upperUrl.includes('MY_SUPABASE') ||
    upperUrl.includes('MY_VITE_SUPABASE')
  ) {
    return 'Supabase 환경변수(VITE_SUPABASE_URL)에 기본 예시 값이 들어 있습니다. 실제 Project URL을 입력해 주세요.';
  }

  const upperKey = key.toUpperCase();
  if (
    upperKey.includes('YOUR_SUPABASE_ANON_KEY') ||
    upperKey.includes('MY_SUPABASE_ANON_KEY') ||
    upperKey.includes('MY_VITE_SUPABASE_ANON_KEY')
  ) {
    return 'Supabase 환경변수(VITE_SUPABASE_ANON_KEY)에 기본 예시 값이 들어 있습니다. 실제 API 키를 입력해 주세요.';
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'VITE_SUPABASE_URL은 반드시 http:// 또는 https://로 시작해야 합니다.';
    }
    if (!parsed.hostname) {
      return 'VITE_SUPABASE_URL 호스트 이름이 비어 있습니다. (예: https://프로젝트ID.supabase.co)';
    }
    if (parsed.hostname !== 'localhost' && !parsed.hostname.includes('.')) {
      return 'VITE_SUPABASE_URL에 도메인(.supabase.co)이 누락되었습니다. (예: https://프로젝트ID.supabase.co)';
    }
  } catch {
    return 'VITE_SUPABASE_URL 형식이 올바르지 않습니다. (예: https://프로젝트ID.supabase.co)';
  }

  return '';
}

const rawUrl = cleanEnvValue(import.meta.env.VITE_SUPABASE_URL);
const rawKey = cleanEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;
let configError = getSupabaseConfigDiagnostic(rawUrl, rawKey);

if (!configError) {
  try {
    client = createClient(rawUrl, rawKey);
  } catch (err: unknown) {
    client = null;
    configError =
      err instanceof Error ? err.message : 'Supabase 클라이언트 초기화에 실패했습니다.';
  }
}

export const supabase: SupabaseClient | null = client;
export const isSupabaseConfigured: boolean = Boolean(client);
export const supabaseConfigError: string = configError;
