import React, { useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { RED_FLAG_THRESHOLD, isRedFlagRate, calcAvgMonthlyRate } from '../../utils/redFlag';

export default function RedFlagList({ attendanceList, students, classes }) {
  const today = new Date().toISOString().slice(0, 10);

  const flagged = students
    .map((s) => {
      const avg = calcAvgMonthlyRate(s, attendanceList);
      return {
        ...s,
        avgRate: avg,
        classObj: classes.find((c) => c.id === s.classId),
      };
    })
    .filter((s) => isRedFlagRate(s.avgRate))
    .sort((a, b) => a.avgRate - b.avgRate);

  // 적신호 학생 중 status='active'인 학생 자동으로 long_absent로 변경
  useEffect(() => {
    const toConvert = flagged.filter(
      (s) => !s.status || s.status === 'active'
    );
    if (toConvert.length === 0) return;
    toConvert.forEach((s) => {
      updateDoc(doc(db, 'students', s.id), {
        status: 'long_absent',
        active: true,
      }).catch((err) => console.error('자동 장결자 변경 실패:', s.name, err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flagged.map((s) => s.id).join(',')]);

  // 부서 → 반 → 학생 그룹핑 (가나다순)
  const services = ['1부', '2부'];
  const grouped = services.map((svc) => {
    const inService = flagged.filter((s) => s.service === svc);
    const classGroups = {};
    const noClass = [];
    inService.forEach((s) => {
      if (s.classObj) {
        const k = s.classObj.id;
        if (!classGroups[k]) classGroups[k] = { cls: s.classObj, students: [] };
        classGroups[k].students.push(s);
      } else {
        noClass.push(s);
      }
    });
    const classList = Object.values(classGroups)
      .map((g) => ({
        ...g,
        students: g.students.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')),
      }))
      .sort((a, b) => (a.cls.teacherName || '').localeCompare(b.cls.teacherName || '', 'ko'));
    if (noClass.length > 0) {
      noClass.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      classList.push({ cls: { id: '_none', teacherName: '반 미정' }, students: noClass });
    }
    return { service: svc, classList, total: inService.length };
  }).filter((g) => g.total > 0);

  // 부서 미배정 학생 그룹 추가
  const noService = flagged
    .filter((s) => s.service !== '1부' && s.service !== '2부')
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  if (noService.length > 0) {
    grouped.push({
      service: '부서 미배정',
      classList: [{ cls: { id: '_no_service', teacherName: '반/부서 미정' }, students: noService }],
      total: noService.length,
    });
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-gray-800">🚩 적신호 학생 ({flagged.length}명)</h3>
          <span className="text-xs text-gray-400">
            2026년 1월 ~ 현재 · 월평균 {RED_FLAG_THRESHOLD}% 미만
          </span>
        </div>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2">
          ⚠️ <strong>장결자 기준</strong>: 1월부터 현재까지 월평균 출석률 {RED_FLAG_THRESHOLD}% 미만인 학생. 적신호로 잡힌 학생은 자동으로 장결자(재적) 상태로 전환됩니다.
        </p>
      </div>

      {flagged.length === 0 ? (
        <div className="card text-center py-6 text-gray-400 text-sm">
          적신호 학생이 없습니다. 👍
        </div>
      ) : (
        grouped.map((g) => (
          <div key={g.service} className="card">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
              <span className="text-sm font-bold text-blue-700">{g.service}</span>
              <span className="text-xs text-gray-400">{g.total}명</span>
            </div>
            <div className="space-y-4">
              {g.classList.map(({ cls, students: stuList }) => (
                <div key={cls.id}>
                  <div className="text-sm font-semibold text-gray-700 mb-2">
                    {cls.teacherName} {cls.id !== '_none' && '선생님반'}
                    <span className="text-xs text-gray-400 ml-2">{stuList.length}명</span>
                  </div>
                  <div className="space-y-2">
                    {stuList.map((s) => (
                      <div key={s.id}
                        className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl">
                        <div>
                          <span className="font-medium text-gray-800">{s.name}</span>
                          <div className="text-xs text-red-500 mt-0.5">
                            월평균 출석율 {s.avgRate}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-red-600 font-bold text-lg">{s.avgRate}%</div>
                          <div className="text-xs text-red-400">🚩 적신호</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
