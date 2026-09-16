import React, { useState } from 'react';

// 우측 하단 세로 플로팅 빠른 실행 바
export default function FloatingQuickBar({ items, onSelect }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed right-4 bottom-20 md:bottom-6 z-40 flex flex-col items-end gap-2">
      {open && items.map((it) => (
        <button
          key={it.id}
          onClick={() => { onSelect(it); setOpen(false); }}
          className="flex items-center gap-2 bg-white border border-stone-200 shadow-md rounded-full pl-3 pr-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
        >
          <span className="text-teal-600">{it.icon}</span>
          {it.label}
        </button>
      ))}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-12 h-12 rounded-full bg-teal-600 text-white shadow-lg flex items-center justify-center hover:bg-teal-700 transition-colors"
        aria-label="빠른 실행"
      >
        {open ? (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        )}
      </button>
    </div>
  );
}
