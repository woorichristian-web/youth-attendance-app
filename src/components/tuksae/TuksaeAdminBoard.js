import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  getTuksaePeriod, tuksaeDateLabel, tuksaeYears, defaultTuksaeYear, isTuksaeYear,
} from '../../utils/tuksaeConfig';

// 관리자용 특새 출석부
// - 날짜별 목록 → 날짜 클릭 시 1부/2부로 나눠 반별 참석자 이름 표시
// props: showYearPicker(기본 true) — 대시보드에서는 false, 출석 탭에서는 true
export default function TuksaeAdminBoard({ showYearPicker = true, compact = false }) {
  const [year, setYear] = useState(defaultTuksaeYear());
  const [docs, setDocs] = useState([]); // tuksae_attendance 문서들
  const [classes, setClasses] = useState([]);
  const [openDate, setOpenDate] = useState(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'tuksae_attendance'), (snap) => {
      setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const u2 = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { u1(); u2(); };
  }, []);

  const period = getTuksaePeriod(year);
  const dates = period?.dates || [];

  // 해당 연도 문서만
  const yearDocs = useMemo(() => docs.filter((d) => Number(d.year) === Number(year)), [docs, year]);

  // 날짜별 총 참석자 수
  const countByDate = useMemo(() => {
    const m = {};
    dates.forEach((d) => {
      m[d] = yearDocs.reduce((n, doc) => n + ((doc.attendance?.[d] || []).length), 0);
    });
    return m;
  }, [yearDocs, dates]);

  // 선택 날짜의 부서별 반별 참석자
  const detail = useMemo(() => {
    if (!openDate) return null;
    const svc = { '1부': [], '2부': [], 기타: [] };
    yearDocs.forEach((doc) => {
      const present = doc.attendance?.[openDate] || [];
      if (present.length === 0) return;
      const cls = classes.find((c) => c.id === doc.classId);
      const service = doc.service || cls?.service || '기타';
      const teacherName = doc.teacherName || cls?.teacherName || '(반 미상)';
      const key = service === '1부' || service === '2부' ? service : '기타';
      svc[key].push({ teacherName, names: present.map((p) => p.studentName) });
    });
    ['1부', '2부', '기타'].forEach((k) => {
      svc[k].sort((a, b) => (a.teacherName || '').localeCompare(b.teacherName || '', 'ko'));
    });
    return svc;
  }, [openDate, yearDocs, classes]);

  const ServiceBlock = ({ label, groups }) => (
    <div>
      <div className="text-xs font-semibold text-stone-600 mb-1.5">
        {label} · {groups.reduce((n, g) => n + g.names.length, 0)}명
      </div>
      {groups.length === 0 ? (
        <p className="text-[11px] text-stone-400 mb-2">참석 기록 없음</p>
      ) : (
        <div className="space-y-1.5 mb-2">
          {groups.map((g) => (
            <div key={g.teacherName} className="flex items-start gap-2 text-xs">
              <span className="flex-shrink-0 bg-stone-100 text-stone-600 rounded-md px-2 py-0.5 font-medium">
                {g.teacherName}
              </span>
              <span className="pt-0.5 text-stone-800">{g.names.join(', ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-stone-900">🌅 특새 출석부</span>
          {period && <span className="text-[11px] text-teal-700">{period.label}</span>}
        </div>
        {showYearPicker && (
          <select
            value={year}
            onChange={(e) => { setYear(Number(e.target.value)); setOpenDate(null); }}
            className="border border-stone-300 rounded-lg px-2 py-1 text-sm"
          >
            {tuksaeYears().map((y) => (<option key={y} value={y}>{y}년</option>))}
          </select>
        )}
      </div>

      {!isTuksaeYear(year) ? (
        <div className="text-center py-6 text-sm text-stone-400">{year}년은 특새 사용 기간이 아닙니다.</div>
      ) : (
        <>
          {/* 날짜 목록 */}
          <div className="flex flex-wrap gap-1.5">
            {dates.map((d) => (
              <button
                key={d}
                onClick={() => setOpenDate(openDate === d ? null : d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  openDate === d
                    ? 'bg-teal-600 text-white border-teal-700 shadow-sm'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-teal-50'
                }`}
              >
                {tuksaeDateLabel(d)}
                <span className={`ml-1 text-[10px] ${openDate === d ? 'text-teal-100' : 'text-teal-600'}`}>
                  {countByDate[d] || 0}명
                </span>
              </button>
            ))}
          </div>

          {/* 선택 날짜 상세 */}
          {openDate && detail && (
            <div className="mt-3 border-t border-stone-100 pt-3 space-y-2">
              <div className="text-sm font-semibold text-stone-800 mb-1">{tuksaeDateLabel(openDate)} 참석자</div>
              <ServiceBlock label="1부" groups={detail['1부']} />
              <ServiceBlock label="2부" groups={detail['2부']} />
              {detail['기타'].length > 0 && <ServiceBlock label="기타" groups={detail['기타']} />}
            </div>
          )}
          {!openDate && (
            <p className="text-[11px] text-stone-400 mt-2">날짜를 누르면 1부·2부 반별 참석자 명단이 보입니다.</p>
          )}
        </>
      )}
    </div>
  );
}
