import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Shield,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { APP_USERS_SETUP_SQL, USER_ROLE_META } from '../services/appUsersService';
import type { StaffAccount, UserRole } from '../types/erp';
import { generateUuid } from '../utils/pdfParser';

interface StaffManageViewProps {
  staffAccounts: StaffAccount[];
  tableWarning?: string;
  onAddStaff: (staff: StaffAccount) => Promise<void> | void;
  onUpdateStaff: (
    id: string,
    updates: Partial<
      Pick<
        StaffAccount,
        'role' | 'password' | 'isActive' | 'fullName' | 'displayName' | 'position' | 'phone'
      >
    >
  ) => Promise<void> | void;
  onDeleteStaff: (id: string) => Promise<void> | void;
}

const ASSIGNABLE_ROLES: UserRole[] = ['staff', 'guide', 'accountant', 'admin'];

export const StaffManageView: React.FC<StaffManageViewProps> = ({
  staffAccounts,
  tableWarning,
  onAddStaff,
  onUpdateStaff,
  onDeleteStaff,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [editingPwId, setEditingPwId] = useState<string | null>(null);
  const [draftPassword, setDraftPassword] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showSqlBox, setShowSqlBox] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const safeStaffAccounts = Array.isArray(staffAccounts) ? staffAccounts : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanId = username.trim();
    const cleanPw = password.trim();
    const cleanName = fullName.trim();

    if (!cleanId || !cleanPw || !cleanName) {
      setErrorMsg('이름, 로그인 아이디, 비밀번호를 모두 입력해 주세요.');
      return;
    }

    if (cleanId.toLowerCase() === 'admin') {
      setErrorMsg('admin 아이디는 기본 관리자 전용으로 사용할 수 없습니다.');
      return;
    }

    if (
      safeStaffAccounts.some(
        (acc) => (acc.username || '').trim().toLowerCase() === cleanId.toLowerCase()
      )
    ) {
      setErrorMsg('이미 등록된 로그인 아이디입니다.');
      return;
    }

    setSubmitting(true);
    try {
      await onAddStaff({
        id: generateUuid(),
        username: cleanId,
        password: cleanPw,
        displayName: cleanName,
        fullName: cleanName,
        role,
        isActive: true,
        position: position.trim() || USER_ROLE_META[role].label,
        phone: phone.trim(),
        createdAt: new Date().toISOString(),
      });

      setUsername('');
      setPassword('');
      setFullName('');
      setRole('staff');
      setPosition('');
      setPhone('');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const startPasswordEdit = (staff: StaffAccount) => {
    setEditingPwId(staff.id);
    setDraftPassword(staff.password || '');
  };

  const savePasswordEdit = async (id: string) => {
    const cleanPw = draftPassword.trim();
    if (!cleanPw) return;
    await onUpdateStaff(id, { password: cleanPw });
    setEditingPwId(null);
    setDraftPassword('');
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(APP_USERS_SETUP_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Optional Supabase app_users Table Setup Banner */}
      {tableWarning && (
        <div className="mx-3 sm:mx-0 bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start gap-2.5 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
              <span>{tableWarning}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowSqlBox((prev) => !prev)}
              className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-xl hover:bg-amber-100/50 transition-colors whitespace-nowrap cursor-pointer"
            >
              {showSqlBox ? 'SQL 닫기' : 'Supabase 테이블 SQL 보기'}
            </button>
          </div>
          {showSqlBox && (
            <div className="relative bg-slate-900 text-slate-100 rounded-xl p-3.5 text-[11px] font-mono overflow-x-auto">
              <button
                type="button"
                onClick={handleCopySql}
                className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-semibold bg-slate-700 hover:bg-slate-600 text-white rounded-lg cursor-pointer"
              >
                {copiedSql ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSql ? '복사됨' : 'SQL 복사'}</span>
              </button>
              <pre className="pr-24 whitespace-pre-wrap">{APP_USERS_SETUP_SQL}</pre>
            </div>
          )}
        </div>
      )}

      {/* Role Access Summary Matrix */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-3 sm:px-0">
        {(['admin', 'staff', 'guide', 'accountant'] as UserRole[]).map((r) => {
          const meta = USER_ROLE_META[r];
          const count =
            r === 'admin'
              ? safeStaffAccounts.filter((s) => s.role === 'admin' && s.isActive).length + 1
              : safeStaffAccounts.filter((s) => s.role === r && s.isActive).length;
          return (
            <div
              key={r}
              className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold border rounded-md whitespace-nowrap ${meta.badgeClass}`}
                >
                  <Shield className="w-3 h-3" />
                  <span>{meta.label}</span>
                </span>
                <span className="text-xs font-mono font-semibold text-slate-500">
                  활성 {count}명
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">{meta.description}</p>
            </div>
          );
        })}
      </section>

      {/* Staff Registration Form Card */}
      <section className="bg-white border-y sm:border border-slate-200 rounded-none sm:rounded-2xl p-4 sm:p-6">
        <div className="mb-4 sm:mb-5">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            신규 직원 등록 (app_users)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            직원별 권한 등급(일반 사무 · 가이드 · 세무 직원 · 관리자)을 지정하여 Supabase에 계정을 등록합니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                이름 (full_name)
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
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
                placeholder="예: guide_kim"
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
                권한 등급 (role)
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#065F46] cursor-pointer"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {USER_ROLE_META[r].label} ({r})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                직책 / 담당 (선택)
              </label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder={USER_ROLE_META[role].label}
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
              disabled={submitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#065F46] hover:bg-[#054e3a] rounded-xl transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
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
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              등록된 직원 · 권한 목록
            </h2>
            <span className="text-xs font-medium text-slate-500 font-mono">
              총 {safeStaffAccounts.length}명
            </span>
          </div>
          <span className="text-xs text-slate-400 whitespace-nowrap">
            등급 변경 · 비밀번호 수정 · 퇴사자 비활성화 즉시 반영
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                <th className="py-3 px-4 sm:px-6 whitespace-nowrap">이름</th>
                <th className="py-3 px-3 sm:px-4 whitespace-nowrap">아이디</th>
                <th className="py-3 px-3 sm:px-4 whitespace-nowrap">권한 등급</th>
                <th className="py-3 px-3 sm:px-4 whitespace-nowrap">비밀번호</th>
                <th className="py-3 px-3 sm:px-4 whitespace-nowrap">계정 상태</th>
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
                  const isEditingPw = editingPwId === staff.id;
                  const isConfirming = confirmDeleteId === staff.id;
                  const isActive = staff.isActive !== false;
                  const roleMeta = USER_ROLE_META[staff.role] || USER_ROLE_META.staff;

                  return (
                    <tr
                      key={staff.id}
                      className={`transition-colors ${
                        isActive ? 'hover:bg-slate-50/70' : 'bg-slate-50/60 opacity-75'
                      }`}
                    >
                      <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {staff.fullName || staff.displayName}
                        </div>
                        {(staff.position || staff.phone) && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {staff.position || ''}
                            {staff.position && staff.phone ? ' · ' : ''}
                            {staff.phone || ''}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 sm:px-4 font-mono text-xs font-semibold text-[#065F46] whitespace-nowrap">
                        @{staff.username}
                      </td>

                      {/* Role Selector */}
                      <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap">
                        <select
                          value={staff.role}
                          aria-label={`${staff.displayName} 권한 등급`}
                          onChange={(e) =>
                            onUpdateStaff(staff.id, { role: e.target.value as UserRole })
                          }
                          className={`px-2.5 py-1 text-xs font-semibold border rounded-lg focus:outline-none cursor-pointer ${roleMeta.badgeClass}`}
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r} className="bg-white text-slate-900">
                              {USER_ROLE_META[r].label} ({r})
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Password View & Inline Edit */}
                      <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap">
                        {isEditingPw ? (
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="text"
                              value={draftPassword}
                              onChange={(e) => setDraftPassword(e.target.value)}
                              placeholder="새 비밀번호"
                              className="w-28 px-2 py-1 text-xs font-mono bg-white border border-[#065F46] rounded-lg focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => savePasswordEdit(staff.id)}
                              aria-label="비밀번호 저장"
                              className="p-1 text-white bg-[#065F46] hover:bg-[#054e3a] rounded-lg cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPwId(null);
                                setDraftPassword('');
                              }}
                              aria-label="비밀번호 수정 취소"
                              className="p-1 text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-700">
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
                            <button
                              type="button"
                              onClick={() => startPasswordEdit(staff)}
                              aria-label="비밀번호 수정"
                              className="p-1 text-slate-400 hover:text-[#065F46] cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Account Active / Inactive Toggle */}
                      <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isActive}
                          onClick={() => onUpdateStaff(staff.id, { isActive: !isActive })}
                          className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                            isActive
                              ? 'bg-emerald-50 border-emerald-200 text-[#065F46] hover:bg-emerald-100/70'
                              : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100/70'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isActive ? 'bg-[#065F46]' : 'bg-red-500'
                            }`}
                          />
                          <span>{isActive ? '활성' : '비활성(차단)'}</span>
                        </button>
                      </td>

                      <td className="py-3.5 px-3 sm:px-4 font-mono text-xs text-slate-400 whitespace-nowrap">
                        {(staff.createdAt || '').slice(0, 10) || '-'}
                      </td>

                      <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                        {!isConfirming ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(staff.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
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
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg whitespace-nowrap cursor-pointer"
                            >
                              삭제 확인
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg whitespace-nowrap cursor-pointer"
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
