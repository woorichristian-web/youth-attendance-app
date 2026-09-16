import React from 'react';

export default function TeacherSelector({ teachers, selectedTeacherId, onSelect }) {
  if (!teachers || teachers.length === 0) {
    return (
      <div className="card mb-4 text-center text-gray-500 py-8">
        해당 예배에 등록된 교사가 없습니다.
      </div>
    );
  }

  return (
    <div className="card mb-4">
      <h2 className="text-lg font-bold text-gray-800 mb-4">👤 교사 선택</h2>
      <div className="grid grid-cols-2 gap-3">
        {teachers.map((teacher) => (
          <button
            key={teacher.id}
            onClick={() => onSelect(teacher)}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              selectedTeacherId === teacher.id
                ? 'bg-blue-50 border-blue-500 text-blue-800'
                : 'bg-white border-gray-200 hover:border-blue-300 text-gray-700'
            }`}
          >
            <div className="font-bold text-base">{teacher.name}</div>
            <div className="text-sm text-gray-500 mt-1">{teacher.className}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
