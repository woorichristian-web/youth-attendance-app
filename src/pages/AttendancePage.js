import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import DateServiceSelector from '../components/attendance/DateServiceSelector';
import TeacherSelector from '../components/attendance/TeacherSelector';
import AttendanceSheet from '../components/attendance/AttendanceSheet';
import { getThisSunday } from '../utils/dateUtils';
import MissingAttendanceAlert from '../components/MissingAttendanceAlert';
import { isExcludedDate, getExcludedReason } from '../utils/excludedDates';

export default function AttendancePage() {
  const { userProfile, isAdmin, isTeacher, canRegisterStudents } = useAuth();
  const [date, setDate] = useState(getThisSunday());
  const [service, setService] = useState('');
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [loadingTeachers, setLoadingTeachers] = useState(false);

  // 교사 목록 불러오기
  useEffect(() => {
    if (!service) return;
    async function loadTeachers() {
      setLoadingTeachers(true);
      setSelectedTeacher(null);
      try {
        if (isAdmin) {
          // 관리자: 해당 예배 모든 교사
          const classQ = query(
            collection(db, 'classes'),
            where('service', '==', service)
          );
          const classSnap = await getDocs(classQ);
          const classList = classSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const teacherList = classList.map((cls) => ({
            id: cls.teacherId,
            name: cls.teacherName,
            className: cls.name,
            classId: cls.id,
          }));
          teacherList.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
          setTeachers(teacherList);
        } else if (isTeacher) {
          // 교사: 본인의 반만
          let teacherList = [];
          if (userProfile?.classId) {
            const snap = await getDocs(collection(db, 'classes'));
            const myClass = snap.docs.find((d) => d.id === userProfile.classId);
            if (myClass) {
              const cls = myClass.data();
              if (cls.service === service) {
                teacherList = [{
                  id: cls.teacherId,
                  name: cls.teacherName,
                  className: cls.name,
                  classId: myClass.id,
                }];
              }
            }
          }
          setTeachers(teacherList);
        }
      } catch (err) {
        console.error('교사 목록 로드 오류:', err);
      }
      setLoadingTeachers(false);
    }
    loadTeachers();
  }, [service, isAdmin, isTeacher, userProfile]);

  // 교사가 본인 서비스에 맞는 예배 선택 시 자동 선택
  useEffect(() => {
    if (isTeacher && userProfile?.service && service === userProfile.service && teachers.length === 1) {
      setSelectedTeacher(teachers[0]);
    }
  }, [teachers, isTeacher, userProfile, service]);

  const canProceed = date && service;

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold text-ink">✅ 출석 체크</h1>
        <Link
          to="/my-class"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/85 backdrop-blur border border-ocean-200 text-ocean-600 text-sm font-semibold shadow-sm hover:bg-white hover:shadow-soft transition-all"
        >
          👨‍🎓 학생 관리
        </Link>
      </div>

      <MissingAttendanceAlert />

      <DateServiceSelector
        date={date}
        service={service}
        onDateChange={setDate}
        onServiceChange={(s) => { setService(s); setSelectedTeacher(null); }}
      />

      {isExcludedDate(date) && (
        <div className="card bg-gray-100/70 border-gray-200 text-center py-6 text-gray-500">
          <div className="text-lg font-semibold mb-1">🚫 {getExcludedReason(date)}</div>
          <div className="text-xs">이 날은 예배가 없어 출석 체크가 필요 없습니다. 출석률 계산에서도 제외됩니다.</div>
        </div>
      )}

      {canProceed && !isExcludedDate(date) && (
        <>
          {loadingTeachers ? (
            <div className="card text-center py-6 text-gray-400">교사 목록 불러오는 중...</div>
          ) : (
            <TeacherSelector
              teachers={teachers}
              selectedTeacherId={selectedTeacher?.id}
              onSelect={setSelectedTeacher}
            />
          )}

          {selectedTeacher && (
            <AttendanceSheet
              date={date}
              service={service}
              teacher={selectedTeacher}
              classId={selectedTeacher.classId}
            />
          )}
        </>
      )}

      {!canProceed && (
        <div className="card text-center py-8 text-gray-400 text-sm">
          날짜와 예배를 선택해주세요.
        </div>
      )}
    </div>
  );
}
