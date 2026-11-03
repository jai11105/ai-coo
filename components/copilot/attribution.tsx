"use client";

import React from "react";

export const SHOW_ATTRIBUTION =
  process.env.NEXT_PUBLIC_SHOW_MODEL_ATTRIBUTION !== "false"; // on unless set to "false"

export interface AttributionData {
  provider?: string | null;
  model?: string | null;
  specialist?: {
    used?: boolean;
    status?: string;
    reason?: string;
  } | null;
  basetenModelLabel?: string | null;
}

interface Props extends AttributionData {
  isImage?: boolean;
  isReadingAloud?: boolean;
}

export function Attribution({
  provider,
  model,
  specialist,
  basetenModelLabel,
  isImage,
  isReadingAloud,
}: Props) {
  if (!SHOW_ATTRIBUTION) return null;

  const prov = (provider || "").toLowerCase();
  // Degraded or unknown providers show no AI label at all
  if (prov === "degraded" || prov.includes("deterministic") || (!prov && !isImage)) {
    return null;
  }

  const isFireworks = prov.includes("fireworks") || prov.includes("fallback");
  const isMeta = prov === "meta" || prov.includes("spark");

  // Determine primary provider label & dot color (never red)
  let primaryLabel: string | null = null;
  let dotColor = "bg-emerald-500";

  if (isImage || prov === "meta-image" || model?.includes("muse-image")) {
    primaryLabel = "Image: Muse Image";
    dotColor = "bg-sky-500";
  } else if (isFireworks) {
    primaryLabel = "Muse Spark Open (Fireworks)";
    dotColor = "bg-amber-500";
  } else if (isMeta) {
    primaryLabel = "Muse Spark 1.3";
    dotColor = "bg-emerald-500";
  }

  if (!primaryLabel && !isReadingAloud) {
    return null;
  }

  // Specialist second-line attribution
  const specialistUsed =
    specialist?.used === true &&
    specialist?.status === "used" &&
    !/truncat/i.test(specialist?.reason || "");

  let specialistLine: string | null = null;
  if (specialistUsed && (isMeta || isFireworks)) {
    const rawTag = (basetenModelLabel || "spark-open-1026")
      .replace(/^.*[\\/]/, "")
      .replace(/^muse-/i, "");
    const tag = rawTag || "spark-open-1026";

    specialistLine = isFireworks
      ? `analysis-baseten(${tag}), shown by muse spark open (fireworks fallback)`
      : `analysis-baseten(${tag}), shown by muse spark 1.3`;
  }

  return (
    <div className="mt-2.5 flex flex-col gap-1.5 text-[13px] text-slate-500 dark:text-slate-400 font-normal">
      <div className="flex flex-wrap items-center gap-2">
        {primaryLabel && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 px-2.5 py-0.5 text-[13px] font-medium text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
            {primaryLabel}
          </span>
        )}

        {isReadingAloud && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 dark:bg-violet-950/40 px-2.5 py-0.5 text-[13px] font-medium text-violet-700 dark:text-violet-300 border border-violet-200/70 dark:border-violet-800/60 shadow-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden="true" />
            Reading aloud · MMS TTS
          </span>
        )}
      </div>

      {specialistLine && (
        <span className="text-[12px] sm:text-[13px] text-slate-500 dark:text-slate-400 pl-1 font-mono break-all">
          {specialistLine}
        </span>
      )}
    </div>
  );
}

export function VoiceInputAttribution() {
  if (!SHOW_ATTRIBUTION) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60 shadow-xs select-none">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
        />
      </svg>
      Voice: Muse Voice Transcribe
    </span>
  );
}
