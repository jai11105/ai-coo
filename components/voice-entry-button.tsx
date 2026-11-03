"use client";

// Visible microphone button + recording/transcription/extraction.
// Browser captures via MediaRecorder (NOT Web Speech API), converts to mono
// PCM16 WAV 16 kHz client-side, and POSTs to /api/entry/transcribe
// (Meta Muse Voice Transcribe server-side), then transcript to
// /api/entry/extract (Muse Spark Contributor server-side). Nothing auto-saves.

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/utils";
import { blobToWav16kMono } from "@/lib/audio-wav";
import type { VoiceDraft, VoiceStatus } from "@/lib/voice-entry";
import { isVoiceDraft } from "@/lib/voice-entry";

interface Props {
  onTranscript: (transcript: string) => void;
  onDraft: (draft: VoiceDraft) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export function VoiceEntryButton({ onTranscript, onDraft, onError, disabled }: Props) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const mediaRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const statusRef = useRef<VoiceStatus>("idle");
  statusRef.current = status;

  const stopTracks = useCallback(() => {
    mediaRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    mediaRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLevel(0);
  }, []);

  useEffect(() => () => stopTracks(), [stopTracks]);

  const fail = useCallback(
    (message: string) => {
      try {
        if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
      } catch {
        /* ignore */
      }
      recRef.current = null;
      stopTracks();
      setStatus("error");
      setElapsed(0);
      onError(message);
    },
    [onError, stopTracks]
  );

  const pollLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const v = Math.abs(buf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    setLevel(Math.min(1, peak * 1.6));
    rafRef.current = requestAnimationFrame(pollLevel);
  }, []);


  const startRecording = useCallback(async () => {
    if (disabled || statusRef.current === "recording" || statusRef.current === "requesting") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      fail("This browser cannot access the microphone. Please type the entry manually.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      fail("Audio recording is not supported in this browser. Please type the entry manually.");
      return;
    }
    setStatus("requesting");
    onError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRef.current = stream;
      // Record in the browser default format (usually WebM/Opus); conversion
      // to mono PCM16 WAV happens in stopAndProcess via blobToWav16kMono.
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onerror = () => fail("Recording failed. Please try again or type manually.");
      recRef.current = rec;
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          audioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          src.connect(analyser);
          analyserRef.current = analyser;
          rafRef.current = requestAnimationFrame(pollLevel);
        }
      } catch { /* meter best-effort */ }
      rec.start(250);
      setElapsed(0);
      setStatus("recording");
      const started = Date.now();
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - started) / 1000));
      }, 500);
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        fail("Microphone permission was denied. Allow microphone access, then try again.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        fail("No microphone was found on this device. Please type the entry manually.");
      } else {
        fail("Could not start recording. Please try again or type the entry manually.");
      }
    }
  }, [disabled, fail, onError, pollLevel]);
  const stopAndProcess = useCallback(async () => {
    const rec = recRef.current;
    if (!rec || statusRef.current !== "recording") return;
    setStatus("stopped");
    const blob: Blob = await new Promise((resolve) => {
      const chunks = chunksRef.current;
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      try {
        rec.stop();
      } catch {
        resolve(new Blob(chunks, { type: "audio/webm" }));
      }
    });
    recRef.current = null;
    stopTracks();
    setElapsed(0);
    if (!blob || blob.size < 800) {
      fail("The recording was empty. Please record again and speak clearly.");
      return;
    }
    setStatus("transcribing");
    let transcript = "";
    try {
      // Meta file transcription accepts WAV only: convert any MediaRecorder
      // output (WebM/Opus/MP4) to mono PCM16 WAV 16 kHz before uploading.
      // Never send WebM/Opus directly to Meta.
      const wav = await blobToWav16kMono(blob);
      const form = new FormData();
      form.append("audio", wav, "entry.wav");
      const res = await fetch("/api/entry/transcribe", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as {
        data?: { transcript?: string };
        error?: { message?: string };
      } | null;
      if (!res.ok) throw new Error(json?.error?.message || "Transcription failed.");
      transcript = (json?.data?.transcript || "").trim();
      if (!transcript) throw new Error("No speech was recognized. Please record again.");
    } catch (e) {
      fail(e instanceof Error ? e.message : "Transcription failed. Please retry.");
      return;
    }
    onTranscript(transcript);
    setStatus("extracting");
    try {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const res = await fetch("/api/entry/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, today }),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { draft?: unknown };
        error?: { message?: string };
      } | null;
      if (!res.ok) throw new Error(json?.error?.message || "Extraction failed.");
      const draft = json?.data?.draft;
      if (!isVoiceDraft(draft)) throw new Error("Extraction returned an invalid draft.");
      setStatus("ready");
      onDraft({ ...draft, transcript });
    } catch (e) {
      fail(e instanceof Error ? e.message : "Extraction failed. Please retry.");
    }
  }, [fail, onTranscript, onDraft, stopTracks]);

  const busy = status === "requesting" || status === "transcribing" || status === "extracting";
  const recording = status === "recording";
  const label =
    status === "requesting" ? "Requesting mic…"
    : recording ? `Stop Recording (${elapsed}s)`
    : status === "transcribing" ? "Transcribing…"
    : status === "extracting" ? "Extracting…"
    : status === "ready" ? "Voice Entry · New recording"
    : "Voice Entry";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => (recording ? void stopAndProcess() : void startRecording())}
        disabled={disabled || busy}
        aria-pressed={recording}
        aria-label={recording ? "Stop voice recording" : "Start voice entry recording"}
        className={cx(
          "inline-flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-150 sm:w-auto shadow-sm",
          recording
            ? "bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-lg shadow-rose-600/30 ring-4 ring-rose-500/20 animate-pulse"
            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:border-slate-700",
          busy && "opacity-70 cursor-wait"
        )}
      >
        <span aria-hidden="true" className="text-base">{recording ? "⏹" : "🎙️"}</span>
        <span>{label}</span>
      </button>
      {recording && (
        <div className="flex items-center gap-2.5 pt-1" aria-live="polite">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-75"
              style={{ width: `${Math.round(level * 100)}%` }}
            />
          </div>
          <span className="num text-xs font-bold text-rose-600 dark:text-rose-400">
            Listening… {elapsed}s
          </span>
        </div>
      )}
      {(status === "transcribing" || status === "extracting") && (
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400" role="status">
          {status === "transcribing"
            ? "Converting speech to text with Meta Voice Transcribe…"
            : "Extracting transaction details…"}
        </p>
      )}
    </div>
  );
}

