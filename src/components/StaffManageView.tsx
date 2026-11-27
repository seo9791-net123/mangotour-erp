import React, { useState } from 'react';
import { Eye, EyeOff, Trash2, UserPlus } from 'lucide-react';
import type { StaffAccount } from '../types/erp';

interface StaffManageViewProps {
  staffAccounts: StaffAccount[];
  onAddStaff: (staff: StaffAccount) => void;
  onDeleteStaff: (id: string) => void;
}

export const StaffManageView: React.FC<StaffManageViewProps> = ({
  staffAccounts,
  onAddStaff,
  onDeleteStaff,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [position, setPosition] = useState('일정 오퍼레이터');
  const [phone, setPhone] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const safeStaffAccounts = Array.isArray(staffAccounts) ? staffAccounts : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanId = username.trim();
    const cleanPw = password.trim();
    const cleanName = displayName.trim();

    if (!cleanId || !cleanPw || !cleanName) {
      setErrorMsg('아이디, 비밀번호, 직원 이름을 모두 입력해 주세요.');
      return;
    }

    if (cleanId.toLowerCase() === 'admin') {
      setErrorMsg('admin 아이디는 관리자 전용으로 사용할 수 없습니다.');
      return;
    }

    if (safeStaffAccounts.some((acc) => (acc.username || '').toLowerCase() === cleanId.toLowerCase())) {
      setErrorMsg('이미 등록된 직원 아이디입니다.');
      return;
    }

    onAddStaff({
      id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      username: cleanId,
      password: cleanPw,
      displayName: cleanName,
      position: position.trim() || '오퍼레이터',
      phone: phone.trim(),
      createdAt: new Date().toISOString(),
    });

    setUsername('');
    setPassword('');
    setDisplayName('');
    setPosition('일정 오퍼레이터');
    setPhone('');
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-4 sm:space-y-8">
      {/* Staff Registration Form Card */}
      <section className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl p-4 sm:p-6">
        <div className="mb-4 sm:mb-5">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">신규 직원 등록</h2>
          <p className="mt-1 text-xs text-slate-500">
            등록된 직원 계정은 월간 스케줄, 티오프 시간 및 차량/가이드 배정만 수정 가능하며 정산·금액·관리자 메뉴는 노출되지 않습니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                직원 이름
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="예: 김민준"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                로그인 아이디
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="예: staff_min"
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                비밀번호
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                직책 / 담당
              </label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="예: 골프 부킹 담당"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                연락처 (선택)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46]"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="px-4 py-2.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl">
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#065F46] hover:bg-[#054e3a] rounded-xl transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>직원 계정 등록</span>
            </button>
          </div>
        </form>
      </section>

      {/* Registered Staff List Table */}
      <section className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 whitespace-nowrap">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">등록된 직원 목록</h2>
            <span className="text-xs font-medium text-slate-500 font-mono">
              총 {safeStaffAccounts.length}명
            </span>
          </div>
          <span className="text-xs text-slate-400 whitespace-nowrap">
            관리자(admin) 전용 관리 영역
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                <th className="py-3 px-4 sm:px-6 whitespace-nowrap">이름</th>
                <th className="py-3 px-3 sm:px-4 whitespace-nowrap">아이디</th>
                <th className="py-3 px-3 sm:px-4 whitespace-nowrap">비밀번호</th>
                <th className="py-3 px-3 sm:px-4 whitespace-nowrap">직책 / 담당</th>
                <th className="py-3 px-3 sm:px-4 whitespace-nowrap">연락처</th>
                <th className="py-3 px-3 sm:px-4 whitespace-nowrap">등록일</th>
                <th className="py-3 px-4 sm:px-6 whitespace-nowrap text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {safeStaffAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-sm text-slate-500">
                    등록된 직원이 없습니다. 상단에서 신규 직원을 등록해 주세요.
                  </td>
                </tr>
              ) : (
                safeStaffAccounts.map((staff) => {
                  const isVisible = Boolean(visiblePasswords[staff.id]);
                  const isConfirming = confirmDeleteId === staff.id;
                  return (
                    <tr key={staff.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 sm:px-6 font-semibold text-slate-900 whitespace-nowrap">
                        {staff.displayName}
                      </td>
                      <td className="py-3.5 px-3 sm:px-4 font-mono text-xs font-semibold text-[#065F46] whitespace-nowrap">
                        {staff.username}
                      </td>
                      <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 font-mono text-xs text-slate-700">
                          <span>{isVisible ? staff.password : '••••••••'}</span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(staff.id)}
                            aria-label="비밀번호 보기 전환"
                            className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            {isVisible ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 sm:px-4 text-xs text-slate-700 whitespace-nowrap">
                        {staff.position}
                      </td>
                      <td className="py-3.5 px-3 sm:px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {staff.phone || '-'}
                      </td>
                      <td className="py-3.5 px-3 sm:px-4 font-mono text-xs text-slate-400 whitespace-nowrap">
                        {(staff.createdAt || '').slice(0, 10) || '-'}
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                        {!isConfirming ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(staff.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>삭제</span>
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteStaff(staff.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                            >
                              삭제 확인
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg cursor-pointer"
                            >
                              취소
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
