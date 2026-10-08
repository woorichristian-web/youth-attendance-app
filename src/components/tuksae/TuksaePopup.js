import React, { useState, useEffect } from 'react';
import TuksaePanel from './TuksaePanel';
import { activeDashboardYear, getTuksaePeriod } from '../../utils/tuksaeConfig';

// 교사 홈 진입 시 뜨는 특새 출석 팝업 (특새 기간 중에만)
// 세션당 1회만 자동 노출 (닫으면 그 세션에서는 다시 안 뜸)
export default function TuksaePopup({ classId, service, teacherName }) {
  const year = activeDashboardYear();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!year) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(`tuksae_popup_${year}`) === '1'; } catch (e) {}
    if (!dismissed) setOpen(true);
  }, [year]);

  if (!year || !open) return null;
  const period = getTuksaePeriod(year);

  function close() {
    setOpen(false);
    try { sessionStorage.setItem(`tuksae_popup_${year}`, '1'); } catch (e) {}
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={close}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-6 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-lg font-bold text-ink">🌅 특별새벽부흥회 출석</h3>
            <p className="text-xs text-ink-muted mt-0.5">{period?.label}</p>
          </div>
          <button onClick={close} className="text-ink-muted hover:text-ink text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-ocean-700 bg-ocean-50 rounded-lg px-3 py-2 mb-3">
          날짜를 선택하고 참석한 학생을 체크한 뒤 제출해주세요. 닫은 뒤에도 <b>출석 → 특새출석</b> 탭에서 계속 입력·확인할 수 있어요.
        </p>
        <TuksaePanel classId={classId} service={service} teacherName={teacherName} showYearPicker={false} />
        <button onClick={close} className="w-full mt-3 py-2.5 rounded-xl bg-stone-100 text-ink-soft text-sm font-medium hover:bg-stone-200">
          닫기
        </button>
      </div>
    </div>
  );
}
