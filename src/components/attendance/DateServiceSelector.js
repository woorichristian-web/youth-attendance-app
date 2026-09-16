import React from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getThisSunday } from '../../utils/dateUtils';

export default function DateServiceSelector({ date, service, onDateChange, onServiceChange }) {
  const thisSunday = getThisSunday();

  function handleDateChange(e) {
    onDateChange(e.target.value);
  }

  const parsedDate = date ? parseISO(date) : null;
  const formattedDate =
    parsedDate && isValid(parsedDate)
      ? format(parsedDate, 'yyyy년 M월 d일 (EEEE)', { locale: ko })
      : null;

  return (
    <div className="card mb-4">
      <h2 className="text-lg font-bold text-gray-800 mb-4">📅 날짜 및 예배 선택</h2>

      <div className="mb-4">
        <label className="label">날짜 선택</label>
        <input
          type="date"
          value={date}
          onChange={handleDateChange}
          className="input"
        />
        {formattedDate && (
          <p className="text-blue-600 text-sm mt-1 font-medium">{formattedDate}</p>
        )}
        <button
          onClick={() => onDateChange(thisSunday)}
          className="mt-2 text-sm text-blue-600 underline"
        >
          이번 주일로 설정
        </button>
      </div>

      <div>
        <label className="label">예배 선택</label>
        <div className="flex gap-3">
          {['1부', '2부'].map((s) => (
            <button
              key={s}
              onClick={() => onServiceChange(s)}
              className={`flex-1 py-3 rounded-xl font-bold text-lg border-2 transition-all ${
                service === s
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
              }`}
            >
              {s} 예배
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
