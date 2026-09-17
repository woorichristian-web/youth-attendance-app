import React, { useState, useEffect } from 'react';

// 관리자용 우측 하단 플로팅 빠른 실행 바 (세로 · 접힘 가능)
export default function FloatingQuickBar({ items = [], onSelect }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('admin_quickbar_open') !== '0'; } catch { return true; }
  });
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem('admin_quickbar_items');
      if (raw) return JSON.parse(raw);
    } catch {}
    return items.map((i) => i.id); // 기본: 모두 활성
  });

  useEffect(() => {
    try { localStorage.setItem('admin_quickbar_open', open ? '1' : '0'); } catch {}
  }, [open]);
  useEffect(() => {
    try { localStorage.setItem('admin_quickbar_items', JSON.stringify(enabled)); } catch {}
  }, [enabled]);

  const active = items.filter((i) => enabled.includes(i.id));

  const toggleItem = (id) => {
    setEnabled((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <div className="fixed right-4 bottom-20 md:bottom-6 z-30">
      {/* 편집 팝오버 */}
      {editing && (
        <div className="absolute right-full mr-2 bottom-0 bg-white border border-stone-200 rounded-xl shadow-lg p-3 w-52">
          <div className="text-xs font-medium text-stone-500 mb-2 uppercase tracking-wider">표시할 메뉴</div>
          <div className="space-y-1">
            {items.map((it) => (
              <label key={it.id} className="flex items-center gap-2 text-sm text-stone-800 cursor-pointer hover:bg-stone-50 rounded px-1.5 py-1">
                <input
                  type="checkbox"
                  checked={enabled.includes(it.id)}
                  onChange={() => toggleItem(it.id)}
                  className="w-4 h-4 accent-teal-600"
                />
                <span>{it.label}</span>
              </label>
            ))}
          </div>
          <button
            onClick={() => setEditing(false)}
            className="mt-2 w-full text-xs bg-stone-900 text-white py-1.5 rounded-lg hover:bg-stone-800"
          >
            완료
          </button>
        </div>
      )}

      {/* 세로 바 */}
      <div className="flex flex-col items-end gap-2">
        {open && (
          <>
            {active.map((it) => (
              <button
                key={it.id}
                onClick={() => onSelect && onSelect(it)}
                title={it.label}
                className="w-11 h-11 flex items-center justify-center bg-white border border-stone-200 text-stone-700 rounded-full shadow-md hover:border-teal-400 hover:text-teal-700 transition-all"
              >
                {it.icon}
              </button>
            ))}
            <button
              onClick={() => setEditing((e) => !e)}
              title="편집"
              className={`w-9 h-9 flex items-center justify-center rounded-full shadow-sm border transition-all ${
                editing
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white border-stone-200 text-stone-500 hover:text-stone-800'
              }`}
            >
              <IconGear className="w-4 h-4" />
            </button>
          </>
        )}

        {/* 접기·펼치기 토글 */}
        <button
          onClick={() => { setOpen((o) => !o); setEditing(false); }}
          className="w-12 h-12 flex items-center justify-center bg-stone-900 text-white rounded-full shadow-lg hover:bg-stone-800 transition-all"
          title={open ? '접기' : '펼치기'}
        >
          {open ? <IconChevronDown className="w-5 h-5" /> : <IconChevronUp className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

function IconChevronDown(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
}
function IconChevronUp(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>;
}
function IconGear(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}
