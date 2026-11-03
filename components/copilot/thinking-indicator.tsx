"use client";

import React from "react";

export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1 text-slate-400 dark:text-slate-500" aria-label="Thinking">
      <span className="text-xs font-medium">Thinking</span>
      <span className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-[bounce_1.4s_infinite_0ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-[bounce_1.4s_infinite_200ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-[bounce_1.4s_infinite_400ms]" />
      </span>
    </div>
  );
}

