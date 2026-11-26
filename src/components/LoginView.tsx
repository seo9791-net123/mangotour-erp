import React, { useState } from 'react';
import { ArrowRight, Lock, ShieldCheck, User } from 'lucide-react';
import type { AuthUser, StaffAccount } from '../types/erp';

interface LoginViewProps {
  staffAccounts: StaffAccount[];
  onLogin: (user: AuthUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ staffAccounts, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedId = username.trim();
    if (trimmedId === 'admin' && password === 'Rlathdud1~') {
      onLogin({
        username: 'admin',
        role: 'admin',
        displayName: '총괄 관리자',
      });
      return;
    }

    const matchedStaff = staffAccounts.find(
      (acc) => acc.username === trimmedId && acc.password === password
    );
    if (matchedStaff) {
      onLogin({
        username: matchedStaff.username,
        role: 'staff',
        displayName: matchedStaff.displayName,
      });
      return;
    }

    setError('아이디 또는 비밀번호가 올바르지 않습니다.');
  };

  const handleQuickStaffLogin = () => {
    const demoStaff = staffAccounts[0];
    onLogin({
      username: demoStaff?.username || 'staff',
      role: 'staff',
      displayName: demoStaff?.displayName || '오퍼레이터',
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
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#065F46] hover:bg-[#054e3a] text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              <span>로그인</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <button
              type="button"
              onClick={handleQuickStaffLogin}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-sm font-semibold transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-[#D97706]" />
              <span>직원 계정 빠른 체험 (staff)</span>
            </button>
            <p className="mt-3 text-xs text-slate-500 text-center leading-relaxed">
              직원 계정은 자금/정산 메뉴 및 금액 정보가 제한되며<br />
              월간 스케줄·티오프 시간·차량/가이드 배정만 관리할 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
