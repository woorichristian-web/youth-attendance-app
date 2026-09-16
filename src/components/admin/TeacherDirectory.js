import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

// 선생님: 부서별 탭 아래 선생님 이름 카드, 클릭 시 개인 정보 확인
export default function TeacherDirectory({ classes, students }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState('1부');
  const [selected, setSelected] = useState(null); // 선택된 교사 (모달)

  useEffect(() => {
    getDocs(collection(db, 'users')).then((snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  // 반 정보 기준으로 교사 카드 구성 (users에 없는 교사도 반이 있으면 표시)
  const cards = useMemo(() => {
    const byService = classes.filter((c) => c.service === service);
    return byService
      .map((cls) => {
        const user = users.find((u) => u.classId === cls.id) ||
          users.find((u) => u.name === cls.teacherName && u.role === 'teacher');
        const classStudents = students
          .filter((s) => s.classId === cls.id)
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
        return { cls, user, classStudents };
      })
      .sort((a, b) => (a.cls.teacherName || '').localeCompare(b.cls.teacherName || '', 'ko'));
  }, [classes, users, students, service]);

  // 반이 없는 교사/관리자 (참고용)
  const unassigned = useMemo(
    () => users.filter((u) => (u.role === 'teacher' || u.role === 'admin') &&
      !classes.some((c) => c.id === u.classId && c.service)),
    [users, classes]
  );

  if (loading) {
    return <div className="text-center text-slate-400 py-8 text-sm">불러오는 중...</div>;
  }

  const initials = (name) => (name || '?').slice(0, 1);

  return (
    <div>
      <div className="flex gap-1.5 mb-4">
        {['1부', '2부'].map((svc) => (
          <button
            key={svc}
            onClick={() => setService(svc)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              service === svc
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            {svc}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map(({ cls, user, classStudents }) => (
          <button
            key={cls.id}
            onClick={() => setSelected({ cls, user, classStudents })}
            className="text-left bg-white border border-slate-200 rounded-2xl p-4 hover:border-slate-400 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
                {initials(cls.teacherName)}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-800 truncate">{cls.teacherName}</div>
                <div className="text-xs text-slate-400 mt-0.5 truncate">
                  {cls.service} · 학생 {classStudents.length}명
                </div>
              </div>
            </div>
          </button>
        ))}
        {cards.length === 0 && (
          <div className="col-span-2 md:col-span-3 text-center text-slate-400 py-8 text-sm">
            {service} 반 선생님이 없습니다.
          </div>
        )}
      </div>

      {unassigned.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">반 미배정 · 관리자 계정</h4>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((u) => (
              <button
                key={u.uid}
                onClick={() => setSelected({ cls: null, user: u, classStudents: [] })}
                className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-colors"
              >
                {u.name || u.email} {u.role === 'admin' ? '· 관리자' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 상세 모달 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xl flex-shrink-0">
                {initials(selected.cls?.teacherName || selected.user?.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800 text-lg">
                  {selected.cls?.teacherName || selected.user?.name || '이름 없음'}
                </div>
                <div className="text-xs text-slate-400">
                  {selected.user?.role === 'admin' ? '관리자' : '교사'}
                  {selected.cls?.service ? ` · ${selected.cls.service}` : selected.user?.service ? ` · ${selected.user.service}` : ''}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-300 hover:text-slate-500 text-xl leading-none px-1"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <InfoRow label="이메일" value={selected.user?.email || '-'} />
              <InfoRow label="담당 반" value={selected.cls ? `${selected.cls.teacherName} 선생님반` : '미배정'} />
              <InfoRow label="담당 학생" value={selected.cls ? `${selected.classStudents.length}명` : '-'} />
              {selected.user?.canRegisterStudents && (
                <InfoRow label="권한" value="학생 등록 가능" />
              )}
              {selected.classStudents.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-400 mb-1.5">학생 명단</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.classStudents.map((s) => (
                      <span key={s.id} className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs">
                        {s.name}{s.grade ? ` · ${s.grade}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-slate-700 text-right break-all">{value}</span>
    </div>
  );
}
