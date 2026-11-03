"use client";

import React from "react";

interface Props {
  onSelect: (question: string) => void;
  disabled?: boolean;
}

export const DEFAULT_SUGGESTIONS = [
  "What are my sales for the last 30 days?",
  "Give me an RCA",
  "Give me recommendations",
  "What are my peak hours?",
] as const;

export function SuggestionChips({ onSelect, disabled }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 max-w-xl mx-auto animate-fade-in">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-600 text-white text-xl shadow-md shadow-brand-500/20 mb-4 select-none">
        ✦
      </div>
      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-6">
        How can I help with your business today?
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
        {DEFAULT_SUGGESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(q)}
            className="flex items-center text-left rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-4 py-3.5 text-[15px] font-medium text-slate-800 dark:text-slate-200 shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:shadow-sm active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
