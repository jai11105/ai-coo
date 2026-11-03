"use client";

import React, { useState } from "react";
import { Markdown } from "./markdown";
import { cleanCopilotText } from "./clean-text";
import { ThinkingIndicator } from "./thinking-indicator";
import { Attribution, VoiceInputAttribution, type AttributionData } from "./attribution";
import { cx } from "@/lib/utils";

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  assistantMessageId?: string | null;
  sessionId?: string | null;
  meta?: AttributionData | null;
  failed?: boolean;
  isVoiceInput?: boolean;
}

interface Props {
  message: ChatMessageItem;
  speakingId: string | null;
  hasPlayedTts?: boolean;
  onSpeak: (id: string, text: string, trusted?: { assistantMessageId?: string | null; sessionId?: string | null }) => void;
  onRetry?: () => void;
  isLatestAssistant?: boolean;
}

export function ChatMessage({
  message,
  speakingId,
  hasPlayedTts,
  onSpeak,
  onRetry,
  isLatestAssistant,
}: Props) {
  const isUser = message.role === "user";
  const isThinking = message.content === "Thinking…" || message.content === "Creating your image…";
  const [copied, setCopied] = useState(false);

  // Check if content is an image response
  const isImage = message.content.startsWith("![generated creative](");
  const imageUrl = isImage ? message.content.slice(22, -1) : null;

  // Clean assistant text for display and copy
  const cleanedText = !isUser && !isImage && !isThinking && !message.failed
    ? cleanCopilotText(message.content)
    : message.content;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore clipboard error */
    }
  };

  const handleDownloadImage = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `coo-creative-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // User Message: right-aligned, soft rounded bubble
  if (isUser) {
    return (
      <div className="flex justify-end w-full group py-1.5 animate-fade-in">
        <div className="flex flex-col items-end max-w-[88%] sm:max-w-[78%]">
          <div className="rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-4 py-2.5 text-[17px] leading-[1.65] break-words whitespace-pre-wrap shadow-xs">
            {message.content}
          </div>
          <div className="mt-1 flex items-center gap-2 pr-1">
            {message.isVoiceInput && <VoiceInputAttribution />}
            <span className="text-[13px] text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity select-none">
              {message.timestamp}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const isReadingAloud = speakingId === message.id || Boolean(hasPlayedTts);

  // Assistant Message: NO bubble, plain text on page background with round avatar on left
  return (
    <div className="flex items-start gap-3 w-full group py-2.5 animate-fade-in">
      {/* Left Avatar */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 to-indigo-600 text-white font-bold text-xs shadow-sm select-none mt-1"
        aria-hidden="true"
      >
        AI
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Thinking State */}
        {isThinking ? (
          <ThinkingIndicator />
        ) : message.failed ? (
          /* Error State: Friendly text with Retry button */
          <div className="space-y-2.5">
            <p className="text-[17px] leading-[1.65] text-slate-800 dark:text-slate-200">
              Something went wrong on my side. Please try again.
            </p>
            {onRetry && isLatestAssistant && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Retry
              </button>
            )}
          </div>
        ) : isImage && imageUrl ? (
          /* Generated Image Creative with Download */
          <div className="space-y-3">
            <div className="relative inline-block overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Generated marketing creative"
                className="max-w-full h-auto max-h-[480px] object-contain rounded-2xl"
              />
            </div>
            <div>
              <button
                type="button"
                onClick={handleDownloadImage}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                aria-label="Download generated image"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Image
              </button>
            </div>
          </div>
        ) : (
          /* Plain Text Answer with Markdown */
          <div className="text-[17px] leading-[1.65] text-slate-800 dark:text-slate-100 break-words">
            <Markdown content={cleanedText} />
          </div>
        )}

        {/* Action Row & Timestamp (for successful assistant responses) */}
        {!isThinking && !message.failed && (
          <div className="mt-2.5 flex items-center gap-3 text-[13px] text-slate-400 dark:text-slate-500">
            {/* Read Aloud */}
            {!isImage && (
              <button
                type="button"
                onClick={() =>
                  onSpeak(message.id, cleanedText, {
                    assistantMessageId: message.assistantMessageId,
                    sessionId: message.sessionId,
                  })
                }
                disabled={speakingId === message.id}
                aria-label={speakingId === message.id ? "Reading aloud" : "Read aloud"}
                title="Read aloud"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
                <span>{speakingId === message.id ? "Speaking…" : "Read Aloud"}</span>
              </button>
            )}

            {/* Copy */}
            {!isImage && (
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? "Copied" : "Copy text"}
                title={copied ? "Copied to clipboard" : "Copy response"}
                className={cx(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
                  copied && "text-brand-600 dark:text-brand-400 font-semibold"
                )}
              >
                {copied ? (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <span>Copy</span>
                  </>
                )}
              </button>
            )}

            {/* Timestamp (visible on hover) */}
            <span className="opacity-0 group-hover:opacity-100 transition-opacity select-none text-[13px]">
              {message.timestamp}
            </span>
          </div>
        )}

        {/* Model Attribution & AI feature pill labels */}
        {!isThinking && !message.failed && (
          <Attribution
            provider={message.meta?.provider}
            model={message.meta?.model}
            specialist={message.meta?.specialist}
            basetenModelLabel={message.meta?.basetenModelLabel}
            isImage={Boolean(isImage)}
            isReadingAloud={isReadingAloud}
          />
        )}
      </div>
    </div>
  );
}
