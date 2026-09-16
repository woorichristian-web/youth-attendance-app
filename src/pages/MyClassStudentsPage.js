import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import StudentManagement from '../components/admin/StudentManagement';

// 관리자 · 새친구 담당(canRegisterStudents) → 전체 학생 접근 + 추가·삭제 가능
// 반사 교사 → 자기 반 학생만 보임, 수정만 가능 (추가/삭제 불가)
export default function MyClassStudentsPage() {
  const { userProfile, isAdmin, canRegisterStudents } = useAuth();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, 'classes'));
      setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, []);

  const isFullAccess = isAdmin || canRegisterStudents; // 전체 학생 볼 수 있는 계정
  const restrictClassId = isFullAccess ? null : (userProfile?.classId || null);
  const myClass = restrictClassId ? classes.find((c) => c.id === restrictClassId) : null;

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-ink-muted">불러오는 중...</div>;

  if (!isFullAccess && !restrictClassId) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="card bg-amber-50 border-amber-200 text-amber-700 text-center py-6 text-sm">
          담당 반이 배정되지 않아 학생 관리 페이지를 사용할 수 없습니다. 관리자에게 문의해주세요.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-ink">👨‍🎓 학생 관리</h1>
        {isAdmin && (
          <p className="text-xs text-ocean-600 mt-1">관리자 계정 — 전체 반 학생 접근/추가/삭제 가능</p>
        )}
        {!isAdmin && canRegisterStudents && (
          <p className="text-xs text-ocean-600 mt-1">새친구 담당 계정 — 전체 학생 접근/추가/수정 가능</p>
        )}
        {!isFullAccess && myClass && (
          <p className="text-sm text-ink-muted mt-1">
            {myClass.service} · {myClass.teacherName} 선생님반 (본인 반 학생 수정만 가능)
          </p>
        )}
      </div>
      <StudentManagement
        classes={classes}
        restrictClassId={restrictClassId}
        hideSubTabs={true}
        canAdd={isFullAccess}
        canDelete={isAdmin}
      />
    </div>
  );
}
