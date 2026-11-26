import React, { useRef, useState } from 'react';
import { Download, RotateCcw, Upload, X } from 'lucide-react';
import type { Reservation } from '../types/erp';
import { INITIAL_RESERVATIONS } from '../utils/sampleData';
import { exportBackupJson } from '../utils/storage';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

interface BackupModalProps {
  reservations: Reservation[];
  onRestoreReservations: (next: Reservation[]) => void;
  onClose: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  reservations,
  onRestoreReservations,
  onClose,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useBodyScrollLock(true);

  const handleUploadBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed?.reservations;
      if (!Array.isArray(list)) {
        setErrorMsg('올바른 MANGO TOUR ERP 백업 JSON 파일이 아닙니다.');
        return;
      }
      onRestoreReservations(list as Reservation[]);
      onClose();
    } catch {
      setErrorMsg('백업 파일을 읽는 중 오류가 발생했습니다.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-[1px] p-0 sm:p-4 overflow-hidden">
      <div className="bg-white border-0 sm:border border-slate-200 rounded-none sm:rounded-2xl w-full max-w-full sm:max-w-md h-full sm:h-auto sm:max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-slate-900">데이터 백업 및 복원</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            모든 예약·일정·정산 데이터는 Supabase 데이터베이스(<code className="font-mono text-[#065F46]">bookings</code>)에 실시간으로 저장됩니다.
            안전 보관을 위해 JSON 파일로 백업하거나 복원할 수 있습니다.
          </p>

          <button
            type="button"
            onClick={() => exportBackupJson(reservations)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 hover:border-[#065F46] hover:bg-emerald-50/30 transition-colors cursor-pointer"
          >
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-900">
                전체 데이터 백업 다운로드 (JSON)
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                현재 저장된 예약 {reservations.length}건 내보내기
              </div>
            </div>
            <Download className="w-4 h-4 text-[#065F46]" />
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 hover:border-[#F59E0B] hover:bg-amber-50/30 transition-colors cursor-pointer"
          >
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-900">
                백업 파일 불러오기 (복원)
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                기존 데이터를 백업 JSON 파일로 복원
              </div>
            </div>
            <Upload className="w-4 h-4 text-[#D97706]" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleUploadBackup}
            className="hidden"
          />

          {errorMsg && (
            <div className="px-3.5 py-2.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl">
              {errorMsg}
            </div>
          )}

          <div className="pt-3 border-t border-slate-100">
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>초기 샘플 데이터로 되돌리기</span>
              </button>
            ) : (
              <div className="flex items-center justify-between gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                <span className="text-xs font-medium text-red-700">
                  초기 샘플 데이터로 덮어쓸까요?
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onRestoreReservations(INITIAL_RESERVATIONS);
                      onClose();
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 rounded-lg cursor-pointer"
                  >
                    초기화
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg cursor-pointer"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
