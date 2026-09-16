import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getSundaysInMonth, formatDateKo } from '../utils/dateUtils';
import { isExcludedDate } from '../utils/excludedDates';
import { parseISO, isBefore, startOfDay } from 'date-fns';

/**
 * 누락 출석 알림 배너
 * - 선생님: 자신의 반에서 출석 미제출 주일 목록
 * - 관리자: 전체 선생님 중 미제출 현황 요약
 */
export default function MissingAttendanceAlert({ compact = false }) {
  const { userProfile, isAdmin, isTeacher } = useAuth();
  const [missing, setMissing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    loadMissingData();
    // eslint-disable-next-line
  }, [userProfile]);

  async function loadMissingData() {
    setLoading(true);
    try {
      const today = startOfDay(new Date());

      // 2026년 1월 ~ 오늘 이전까지 지나간 일요일만 계산 (오늘 제외)
      const todayStr = today.toISOString().slice(0, 10);
      const allPastSundays = [];
      const startYear = 2026;
      const startMonth = 1;
      const nowYear = today.getFullYear();
      const nowMonth = today.getMonth() + 1;

      for (let y = startYear; y <= nowYear; y++) {
        const mStart = y === startYear ? startMonth : 1;
        const mEnd = y === nowYear ? nowMonth : 12;
        for (let m = mStart; m <= mEnd; m++) {
          const sundays = getSundaysInMonth(y, m);
          sundays.forEach((s) => {
            // 오늘보다 엄격히 이전이고 제외 날짜가 아닌 경우만 포함
            if (s < todayStr && !isExcludedDate(s)) {
              allPastSundays.push(s);
            }
          });
        }
      }

      if (allPastSundays.length === 0) {
        setMissing([]);
        setLoading(false);
        return;
      }

      // 반 목록 가져오기
      let classDocs;
      if (isAdmin) {
        const snap = await getDocs(collection(db, 'classes'));
        classDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else if (isTeacher && userProfile.classId) {
        const snap = await getDocs(
          query(collection(db, 'classes'), where('__name__', '==', userProfile.classId))
        );
        classDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else {
        setMissing([]);
        setLoading(false);
        return;
      }

      // 제출된 출석 기록 가져오기
      const attSnap = await getDocs(collection(db, 'attendance'));
      const submittedKeys = new Set(
        attSnap.docs
          .map((d) => d.data())
          .filter((a) => a.submitted !== false)
          .map((a) => `${a.date}_${a.classId}`)
      );

      // 누락 계산
      const result = [];
      for (const cls of classDocs) {
        const missingDates = allPastSundays.filter(
          (s) => !submittedKeys.has(`${s}_${cls.id}`)
        );
        if (missingDates.length > 0) {
          result.push({
            teacherName: cls.teacherName,
            service: cls.service,
            classId: cls.id,
            missingDates,
          });
        }
      }

      result.sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ko'));
      setMissing(result);
    } catch (err) {
      console.error('누락 출석 로드 오류:', err);
    }
    setLoading(false);
  }

  if (loading || missing.length === 0) return null;

  // 선생님 본인 뷰
  if (isTeacher && missing.length > 0) {
    const myMissing = missing[0];
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-2">
          <span className="text-xl">⚠️</span>
          <div className="flex-1">
            <p className="font-semibold text-amber-800 text-sm">
              미제출 출석이 {myMissing.missingDates.length}개 있습니다
            </p>
            <div className="mt-2 space-y-1">
              {(expanded ? myMissing.missingDates : myMissing.missingDates.slice(0, 3)).map((d) => (
                <div key={d} className="flex items-center gap-2 text-xs text-amber-700">
                  <span className="w-2 h-2 bg-amber-400 rounded-full flex-shrink-0" />
                  {formatDateKo(d)} 출석체크 필요
                </div>
              ))}
              {myMissing.missingDates.length > 3 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-amber-600 underline mt-1"
                >
                  {expanded ? '접기' : `+${myMissing.missingDates.length - 3}개 더 보기`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 관리자 뷰
  const totalMissingCount = missing.reduce((s, m) => s + m.missingDates.length, 0);

  if (compact) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4 flex items-center gap-3">
        <span className="text-lg">⚠️</span>
        <div className="flex-1 text-sm text-amber-800">
          <span className="font-semibold">{missing.length}명</span>의 선생님이 총{' '}
          <span className="font-semibold">{totalMissingCount}개</span>의 주일 출석을 미제출했습니다.
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-amber-600 underline whitespace-nowrap"
        >
          {expanded ? '닫기' : '상세 보기'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-amber-800 text-sm">
              미제출 출석 알림 — {missing.length}명 / {totalMissingCount}건
            </p>
            <p className="text-xs text-amber-600">
              출석체크를 아직 하지 않은 주일이 있는 선생님입니다.
            </p>
          </div>
        </div>
        <span className="text-amber-600 text-lg">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-amber-200 pt-3">
          {missing.map((m) => (
            <div key={m.classId} className="bg-white rounded-lg p-3 border border-amber-100">
              <p className="font-medium text-sm text-gray-800 mb-1">
                {m.teacherName} 선생님 ({m.service})
                <span className="ml-2 text-xs font-normal text-amber-600">
                  {m.missingDates.length}개 미제출
                </span>
              </p>
              <div className="flex flex-wrap gap-1">
                {m.missingDates.map((d) => (
                  <span
                    key={d}
                    className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full"
                  >
                    {d.slice(5).replace('-', '/')}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
