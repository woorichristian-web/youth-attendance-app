import React, { useState } from 'react';
import DateServiceSelector from '../attendance/DateServiceSelector';
import TeacherSelector from '../attendance/TeacherSelector';
import AttendanceSheet from '../attendance/AttendanceSheet';
import MissingAttendanceAlert from '../MissingAttendanceAlert';
import PastAttendance from '../dashboard/PastAttendance';
import StudentStats from '../dashboard/StudentStats';
import AttendanceRateDistribution from '../dashboard/AttendanceRateDistribution';
import RegistrationStats from './RegistrationStats';
import StudentManagement from './StudentManagement';
import { getThisSunday } from '../../utils/dateUtils';
import { isExcludedDate, getExcludedReason } from '../../utils/excludedDates';

const SUB_TABS = [
  { id: 'check', label: '출석 체크' },
  { id: 'past', label: '지난 출석' },
  { id: 'byStudent', label: '학생별 현황' },
  { id: 'dist', label: '출석률 분포' },
  { id: 'reg', label: '등록자 현황' },
  { id: 'manage', label: '명단 관리' },
];

// 학생 > 출석관리: 출석 체크부터 명단 관리까지 출석 업무 전체
export default function AdminAttendanceManager({ classes, students, registeredStudents, attendanceList, attLoading }) {
  const [sub, setSub] = useState('check');
  const [date, setDate] = useState(getThisSunday());
  const [service, setService] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState(null);

  const teachers = classes
    .filter((c) => c.service === service)
    .map((c) => ({ id: c.teacherId, name: c.teacherName, className: c.name, classId: c.id }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));

  return (
    <div>
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              sub === t.id
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'check' && (
        <div className="max-w-xl">
          <MissingAttendanceAlert compact />
          <DateServiceSelector
            date={date}
            service={service}
            onDateChange={setDate}
            onServiceChange={(s) => { setService(s); setSelectedTeacher(null); }}
          />
          {isExcludedDate(date) && (
            <div className="card bg-gray-100/70 border-gray-200 text-center py-6 text-gray-500">
              <div className="text-lg font-semibold mb-1">🚫 {getExcludedReason(date)}</div>
              <div className="text-xs">이 날은 예배가 없어 출석 체크가 필요 없습니다.</div>
            </div>
          )}
          {date && service && !isExcludedDate(date) && (
            <>
              <TeacherSelector
                teachers={teachers}
                selectedTeacherId={selectedTeacher?.id}
                onSelect={setSelectedTeacher}
              />
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
          {(!date || !service) && (
            <div className="card text-center py-8 text-gray-400 text-sm">
              날짜와 예배를 선택해주세요.
            </div>
          )}
        </div>
      )}

      {sub === 'past' && (
        <PastAttendance attendanceList={attendanceList} students={registeredStudents} classes={classes} />
      )}
      {sub === 'byStudent' && (
        <StudentStats
          attendanceList={attendanceList}
          students={registeredStudents}
          classes={classes}
          isAdmin={true}
          teacherClassId={null}
        />
      )}
      {sub === 'dist' && (
        <AttendanceRateDistribution
          students={registeredStudents}
          attendanceList={attendanceList}
          loading={attLoading}
        />
      )}
      {sub === 'reg' && <RegistrationStats />}
      {sub === 'manage' && <StudentManagement classes={classes} />}
    </div>
  );
}
