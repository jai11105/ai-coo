"use client";

import React, { useEffect, useRef } from "react";
import { cx } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onToggleVoice: () => void;
  recording: boolean;
  recordingDuration?: number;
  transcribing: boolean;
  micStarting?: boolean;
  micError?: string | null;
  onDismissMicError?: () => void;
  disabled: boolean;
  placeholder?: string;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  onToggleVoice,
  recording,
  recordingDuration = 0,
  transcribing,
  micStarting = false,
  micError = null,
  onDismissMicError,
  disabled,
  placeholder = "Message Copilot…",
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow textarea up to ~6 lines (max 150px)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 150);
    el.style.height = `${Math.max(48, nextHeight)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled && !recording && !transcribing && !micStarting) {
        onSend();
      }
    }
  };

  const isMicBusy = micStarting || recording || transcribing;
  const canSend = Boolean(value.trim()) && !disabled && !isMicBusy;

  // Derive dynamic placeholder based on microphone states
  const dynamicPlaceholder = recording
    ? "Listening…"
    : transcribing
    ? "Transcribing your question…"
    : micStarting
    ? "Starting microphone…"
    : placeholder;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4 pt-1 sm:pb-6">
      {/* Calm Amber/Orange Mic Error Notice (Dismissible, NOT red) */}
      {micError && (
        <div
          role="alert"
          className="mb-2.5 flex items-start justify-between gap-2.5 rounded-2xl border border-amber-300/80 bg-amber-50/95 dark:border-amber-700/60 dark:bg-amber-950/70 p-3 text-[13px] text-amber-900 dark:text-amber-200 shadow-xs animate-fade-in"
        >
          <div className="flex items-start gap-2 min-w-0">
            <svg
              className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="leading-snug break-words">{micError}</p>
          </div>
          {onDismissMicError && (
            <button
              type="button"
              onClick={onDismissMicError}
              aria-label="Dismiss error notice"
              className="shrink-0 rounded-lg p-1 text-amber-700 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100 hover:bg-amber-100/80 dark:hover:bg-amber-900/60 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      <div className="relative flex flex-col rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)] transition-all focus-within:border-brand-500/80 focus-within:ring-2 focus-within:ring-brand-500/20">
        {/* Active Recording Live Timer Bar */}
        {recording && (
          <div className="flex items-center justify-between px-4 pt-2.5 pb-1 text-[13px] font-medium text-rose-600 dark:text-rose-400 select-none animate-fade-in">
            <span className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
              Listening... {formatDuration(recordingDuration)} · tap the mic to stop
            </span>
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || recording || transcribing || micStarting}
          placeholder={dynamicPlaceholder}
          className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[17px] leading-[1.65] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none disabled:opacity-60"
          style={{ minHeight: "48px", maxHeight: "150px" }}
        />

        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          {/* Voice recording button with 4 distinct states */}
          <button
            type="button"
            onClick={onToggleVoice}
            disabled={disabled || transcribing}
            aria-pressed={recording || micStarting}
            aria-label={
              recording
                ? "Stop recording"
                : transcribing
                ? "Transcribing..."
                : micStarting
                ? "Starting microphone..."
                : "Start voice input"
            }
            title={
              recording
                ? "Stop recording"
                : transcribing
                ? "Transcribing..."
                : micStarting
                ? "Starting microphone..."
                : "Start voice input"
            }
            className={cx(
              "flex h-10 w-10 items-center justify-center rounded-full transition-all text-base focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none",
              recording
                ? "bg-rose-600 text-white shadow-md shadow-rose-600/40 ring-4 ring-rose-400/40 animate-pulse active:scale-95"
                : micStarting
                ? "border border-amber-300 dark:border-amber-600 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40"
                : transcribing
                ? "border border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed bg-slate-50 dark:bg-slate-800"
                : "border border-slate-200/90 dark:border-slate-700/80 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            {recording ? (
              /* Stop square icon */
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : micStarting || transcribing ? (
              /* Spinner for starting & transcribing */
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              /* Neutral outlined mic icon for idle */
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            )}
          </button>

          {/* Send button */}
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            className={cx(
              "flex h-10 w-10 items-center justify-center rounded-full transition-all focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none",
              canSend
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm hover:opacity-90 active:scale-95"
                : "bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed"
            )}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-[13px] text-slate-400 dark:text-slate-500 font-normal">
        Copilot computes figures directly from your verified business records.
      </p>
    </div>
  );
}
