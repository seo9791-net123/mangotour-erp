import React, { useState } from 'react';
import { ArrowRight, Loader2, Lock, ShieldCheck, User } from 'lucide-react';
import { authenticateAppUser } from '../services/appUsersService';
import type { AuthUser, StaffAccount } from '../types/erp';

interface LoginViewProps {
  staffAccounts: StaffAccount[];
  onLogin: (user: AuthUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ staffAccounts, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const safeStaffAccounts = Array.isArray(staffAccounts) ? staffAccounts : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const trimmedId = username.trim();
    if (!trimmedId || !password) {
      setError('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    // 1. 기존 관리자(admin) 계정 로그인 유지 (자동 role = 'admin')
    if (trimmedId === 'admin' && password === 'Rlathdud1~') {
      onLogin({
        username: 'admin',
        role: 'admin',
        displayName: '총괄 관리자',
        fullName: '총괄 관리자',
      });
      return;
    }

    // 2. Supabase app_users 테이블 (및 로컬 폴백) 통합 인증 + is_active 확인
    setSubmitting(true);
    try {
      const result = await authenticateAppUser(trimmedId, password, safeStaffAccounts);
      if (result.status === 'inactive') {
        setError('비활성화(퇴사)된 계정입니다. 관리자에게 문의해 주세요.');
        return;
      }
      if (result.status === 'success') {
        const fullName = result.user.fullName || result.user.displayName || result.user.username;
        onLogin({
          id: result.user.id,
          username: result.user.username,
          role: result.user.role,
          displayName: fullName,
          fullName,
        });
        return;
      }
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
    } catch {
      setError('로그인 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickStaffLogin = () => {
    const demoStaff = safeStaffAccounts.find((acc) => acc.isActive !== false && acc.role === 'staff');
    const name = demoStaff?.fullName || demoStaff?.displayName || '오퍼레이터';
    onLogin({
      id: demoStaff?.id,
      username: demoStaff?.username || 'staff',
      role: 'staff',
      displayName: name,
      fullName: name,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-2 sm:px-6 py-8 sm:py-12">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#065F46] text-white mb-4 shadow-sm">
            <span className="text-xl font-bold tracking-tight text-[#F59E0B]">M</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            MANGO TOUR
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            베트남 호치민 전문 여행사 통합 ERP
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-id" className="block text-sm font-medium text-slate-700 mb-1.5">
                아이디
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-id"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="아이디를 입력하세요"
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#065F46] focus:ring-2 focus:ring-[#065F46]/10 transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-pw" className="block text-sm font-medium text-slate-700 mb-1.5">
                비밀번호
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#065F46] focus:ring-2 focus:ring-[#065F46]/10 transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#065F46] hover:bg-[#054e3a] text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>계정 확인 중...</span>
                </>
              ) : (
                <>
                  <span>로그인</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <button
              type="button"
              onClick={handleQuickStaffLogin}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-sm font-semibold transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-[#D97706]" />
              <span>직원 계정 빠른 체험 (일반 사무)</span>
            </button>
            <p className="mt-3 text-xs text-slate-500 text-center leading-relaxed">
              관리자(admin) 외 직원 계정은 부여된 등급(일반 사무·가이드·세무)에 따라<br />
              허용된 메뉴와 기능만 안전하게 표시됩니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
