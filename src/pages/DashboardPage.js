import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import RedFlagList from '../components/dashboard/RedFlagList';
import StudentStats from '../components/dashboard/StudentStats';
import SchoolStats from '../components/dashboard/SchoolStats';
import PastAttendance from '../components/dashboard/PastAttendance';
import AttendanceRateDistribution from '../components/dashboard/AttendanceRateDistribution';
import MissingAttendanceAlert from '../components/MissingAttendanceAlert';
import { isRegistered } from '../utils/statusUtils';

const TABS = ['지난 출석 확인', '학생별 현황', '적신호 학생', '전체 출석률 분포', '학교별 현황'];

export default function DashboardPage() {
  const { isAdmin, userProfile } = useAuth();
  const [tab, setTab] = useState(0);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendanceList, setAttendanceList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [attLoading, setAttLoading] = useState(true);

  useEffect(() => {
    // 반 + 학생 병렬 로드 (경량) — 이 두 개는 몇백 KB, 순식간에 옴
    (async () => {
      try {
        const [classSnap, studentSnap] = await Promise.all([
          getDocs(collection(db, 'classes')),
          getDocs(collection(db, 'students')),
        ]);
        let classList = classSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        let studentList = studentSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(isRegistered);
        if (!isAdmin && userProfile?.classId) {
          classList = classList.filter((c) => c.id === userProfile.classId);
          studentList = studentList.filter((s) => s.classId === userProfile.classId);
        }
        setClasses(classList);
        setStudents(studentList);
      } catch (err) {
        console.error('반/학생 로드 오류:', err);
      } finally {
        setLoading(false);
      }
    })();

    // 출석 데이터 (600+ docs, 별도 로드 — UI 블로킹 없이 나중에 채움)
    (async () => {
      setAttLoading(true);
      try {
        const attSnap = await getDocs(collection(db, 'attendance'));
        let attList = attSnap.docs.map((d) => d.data());
        if (!isAdmin && userProfile?.classId) {
          attList = attList.filter((a) => a.classId === userProfile.classId);
        }
        setAttendanceList(attList);
      } catch (err) {
        console.error('출석 데이터 로드 오류:', err);
      } finally {
        setAttLoading(false);
      }
    })();
  }, [isAdmin, userProfile]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-ink-muted">
        데이터를 불러오는 중...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">📊 출석 현황</h1>

      <MissingAttendanceAlert />

      {attLoading && (
        <div className="card bg-ocean-50/60 border-ocean-100 text-ocean-700 text-xs mb-3 py-2 text-center">
          📡 출석 데이터 불러오는 중...
        </div>
      )}

      {/* 탭 (한 줄) */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              tab === i ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {tab === 0 && (
        <PastAttendance
          attendanceList={attendanceList}
          students={students}
          classes={classes}
        />
      )}
      {tab === 1 && (
        <StudentStats
          attendanceList={attendanceList}
          students={students}
          classes={classes}
          isAdmin={isAdmin}
          teacherClassId={!isAdmin ? userProfile?.classId : null}
        />
      )}
      {tab === 2 && (
        <RedFlagList
          attendanceList={attendanceList}
          students={students}
          classes={classes}
        />
      )}
      {tab === 3 && (
        <AttendanceRateDistribution
          students={students}
          attendanceList={attendanceList}
          loading={attLoading}
        />
      )}
      {tab === 4 && (
        <SchoolStats
          students={students}
          classes={classes}
        />
      )}
    </div>
  );
}
