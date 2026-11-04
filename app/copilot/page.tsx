"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBusiness } from "@/components/business-context";
import { useMockStore } from "@/components/providers";
import { useWorkspace } from "@/components/workspace-context";
import { supabase } from "@/lib/supabase/client";
import { liveToMockTransactions } from "@/lib/live-adapter";
import { fetchChatMessages, fetchLatestChatSession } from "@/lib/supabase/workspace-chat";
import type { LiveChatMessage } from "@/lib/supabase/workspace-chat";
import { uid } from "@/lib/utils";
import { ChatComposer } from "@/components/copilot/chat-composer";
import { ChatMessage, type ChatMessageItem } from "@/components/copilot/chat-message";
import { SuggestionChips } from "@/components/copilot/suggestion-chips";

interface CopilotApiEvidence {
  id: string;
  label: string;
  display: string;
}

interface CopilotApiData {
  answer: string;
  intent: string;
  evidence: CopilotApiEvidence[];
  provider: string;
  model: string;
  traceId: string;
  latencyMs: number;
  warnings: string[];
  conversationId: string;
  sessionId?: string | null;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  persisted?: boolean;
  specialist?: { used: boolean; status: string; reason: string };
  stageTimings?: { stage: string; model: string; provider?: string }[];
}

export default function CopilotPage() {
  const { transactions: mockTxns } = useMockStore();
  const { userId, activeBusiness, activeBusinessId } = useBusiness();
  const { transactions: liveTxns, categories } = useWorkspace();

  // Live for signed-in workspace; demo/mock sessions keep isolated datasets.
  const isLive = Boolean(userId && activeBusinessId);
  const evidenceTxns = useMemo(() => {
    if (!isLive) return mockTxns;
    const categoryById = new Map(categories.map((c) => [c.id, c.name]));
    return liveToMockTransactions(
      liveTxns,
      categoryById,
      activeBusiness?.currency_code ?? "INR",
      activeBusiness?.timezone ?? "UTC"
    );
  }, [isLive, mockTxns, liveTxns, categories, activeBusiness?.currency_code, activeBusiness?.timezone]);
  void evidenceTxns; // Preserve reference

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);

  // Microphone recording states
  const [micStarting, setMicStarting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Text-To-Speech tracking
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [playedTtsIds, setPlayedTtsIds] = useState<Set<string>>(() => new Set());

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const convRef = useRef(`conv_${uid("c")}`);
  if (!convRef.current) convRef.current = `conv_${uid("c")}`;
  const lastQuestionRef = useRef<string>("");

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isUserScrolledUpRef = useRef(false);

  // Live timer tick during microphone recording
  useEffect(() => {
    if (!recording) {
      setRecordingDuration(0);
      return;
    }
    const timer = setInterval(() => {
      setRecordingDuration((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [recording]);

  // Auto-scroll to newest message unless the user has manually scrolled up
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserScrolledUpRef.current = distanceFromBottom > 80;
  };

  useEffect(() => {
    if (!isUserScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Leaving live mode restores the isolated demo seed; entering live mode
  // clears it immediately so demo chat never leaks into a real business.
  useEffect(() => {
    if (!isLive) {
      setMessages([]);
      setSessionId(null);
      setHistoryLoaded(true);
    } else {
      setMessages([]);
      setHistoryLoaded(false);
    }
  }, [isLive]);

  // Load the persisted live chat session (live workspaces only).
  useEffect(() => {
    let active = true;
    if (!isLive || !userId || !activeBusinessId) {
      setSessionId(null);
      setHistoryLoaded(false);
      return;
    }
    fetchLatestChatSession(activeBusinessId, userId)
      .then(async (s) => {
        if (!active) return;
        if (s) {
          setSessionId(s.id);
          try {
            const rows: LiveChatMessage[] = await fetchChatMessages(s.id);
            if (!active) return;
            if (rows.length > 0) {
              setMessages(
                rows.map((r) => ({
                  id: r.id,
                  role: r.role,
                  content: r.content,
                  timestamp: new Date(r.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                  assistantMessageId: r.role === "assistant" ? r.id : null,
                  sessionId: s.id,
                }))
              );
            }
          } catch {
            /* silent in UI */
          } finally {
            if (active) setHistoryLoaded(true);
          }
        } else if (active) {
          setHistoryLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setHistoryLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [isLive, userId, activeBusinessId]);

  // Send message through /api/copilot/chat
  const sendText = async (text: string, isVoice = false) => {
    if (!text || sending) return;
    lastQuestionRef.current = text;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const isImageAsk =
      /\b(generate|create|make|design)\b[^.]{0,120}\b(image|poster|advertisement|creative|banner|promo|promotional|launch)\b|\b(image|poster|advertisement|creative|banner)\b[^.]{0,80}\b(for|of)\b/i.test(
        text.slice(0, 1000)
      );

    const user: ChatMessageItem = {
      id: uid("u"),
      role: "user",
      content: text,
      timestamp: now,
      isVoiceInput: isVoice,
    };
    setMessages((m) => [...m, user]);
    setDraft("");
    setSending(true);
    if (isImageAsk) setSendingImage(true);

    const thinkingId = uid("a");
    setMessages((m) => [
      ...m,
      {
        id: thinkingId,
        role: "assistant",
        content: isImageAsk ? "Creating your image…" : "Thinking…",
        timestamp: now,
      },
    ]);

    // 90-second timeout via AbortController per spec
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 90_000);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      if (isLive && activeBusinessId) headers["x-business-id"] = activeBusinessId;

      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          conversationId: convRef.current,
          businessId: isLive && activeBusinessId ? activeBusinessId : "demo",
        }),
        signal: ctrl.signal,
      });

      const json = (await res.json().catch(() => null)) as {
        data?: CopilotApiData;
        error?: { message?: string };
      } | null;

      if (!res.ok || !json?.data) {
        throw new Error("Request failed");
      }

      const d = json.data;
      console.info(`[copilot] reply received, persisted: ${Boolean(d.persisted)}`);
      const isImageReply = typeof d.answer === "string" && d.answer.startsWith("![generated creative](");

      // Derive basetenModelLabel strictly from Baseten stage in stageTimings (strip path & leading "muse-")
      const basetenStage = d.stageTimings?.find(
        (s) => s.stage.startsWith("baseten_") || s.provider === "baseten-specialist" || s.provider === "baseten"
      );
      let basetenModelLabel: string | null = null;
      if (basetenStage?.model) {
        basetenModelLabel = basetenStage.model.replace(/^.*[\\/]/, "").replace(/^muse-/i, "");
      } else if (d.specialist?.used) {
        basetenModelLabel = "spark-open-1026";
      }

      // Store ONLY minimal attribution fields in message state:
      // provider, model, specialist.{used, status, reason}, basetenModelLabel
      // NEVER store warnings, traceId, latency, tokens, or developer metrics.
      const reply: ChatMessageItem = {
        id: uid("a"),
        role: "assistant",
        content: d.answer,
        timestamp: now,
        assistantMessageId: d.assistantMessageId ?? null,
        sessionId: d.sessionId ?? null,
        meta: {
          provider: isImageReply ? "meta-image" : d.provider,
          model: isImageReply ? "muse-image-1.0" : d.model,
          specialist: d.specialist
            ? {
                used: d.specialist.used,
                status: d.specialist.status,
                reason: d.specialist.reason,
              }
            : undefined,
          basetenModelLabel,
        },
        failed: false,
      };

      setMessages((m) => m.map((x) => (x.id === thinkingId ? reply : x)));
      if (d.sessionId) setSessionId(d.sessionId);
      convRef.current = d.conversationId || convRef.current;
    } catch {
      // Friendly, non-developer failure state per spec with Retry action
      setMessages((m) =>
        m.map((x) =>
          x.id === thinkingId
            ? {
                ...x,
                content: "Something went wrong on my side. Please try again.",
                meta: null,
                failed: true,
              }
            : x
        )
      );
    } finally {
      clearTimeout(timeoutId);
      setSending(false);
      setSendingImage(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    await sendText(text);
  };

  // Retry last question on failure
  const handleRetry = () => {
    if (lastQuestionRef.current && !sending) {
      void sendText(lastQuestionRef.current);
    }
  };

  // New Chat handler: reset messages and session
  const handleNewChat = () => {
    setMessages([]);
    setDraft("");
    convRef.current = `conv_${uid("c")}`;
    setSessionId(null);
    setPlayedTtsIds(new Set());
    setMicError(null);
  };

  // Retained for API compatibility if invoked directly
  const fetchCreative = async (prompt: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      if (isLive && activeBusinessId) headers["x-business-id"] = activeBusinessId;
      const res = await fetch("/api/copilot/image", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt,
          businessId: isLive && activeBusinessId ? activeBusinessId : "demo",
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { imageUrl?: string; imageBase64?: string };
        error?: { message?: string };
      } | null;
      if (!res.ok || !json?.data) throw new Error("Image generation failed");
      const src =
        json.data.imageUrl ||
        (json.data.imageBase64 ? `data:image/png;base64,${json.data.imageBase64}` : null);
      if (!src) throw new Error("No image returned");
      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMessages((m) => [
        ...m,
        {
          id: uid("a"),
          role: "assistant",
          content: `![generated creative](${src})`,
          timestamp: now,
          meta: { provider: "meta-image", model: "muse-image-1.0" },
        },
      ]);
    } catch {
      /* friendly failure */
    }
  };
  void fetchCreative; // Preserved

  // Audio voice recording toggle with accurate friendly errors
  const toggleVoice = async () => {
    setMicError(null); // Clear previous notice on next mic click

    if (recording) {
      if (!mediaRef.current || mediaRef.current.state === "inactive") {
        setRecording(false);
        setMicStarting(false);
        return;
      }
      mediaRef.current.stop();
      console.info("[voice] recording stopped");
      return;
    }

    // Secure context & mediaDevices availability guard
    if (typeof window !== "undefined" && (!window.isSecureContext || !navigator?.mediaDevices?.getUserMedia)) {
      setMicError("Microphone is not available here. Please open this app over a secure (https) connection.");
      return;
    }

    try {
      setMicStarting(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        void transcribeAndSend(
          new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" })
        );
      };
      rec.start();
      setMicStarting(false);
      setRecording(true);
      console.info("[voice] recording started");
    } catch (e: unknown) {
      setMicStarting(false);
      setRecording(false);
      const errName = (e as { name?: string })?.name || "";
      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        setMicError("Microphone access is blocked. Please allow microphone access in your browser settings and try again.");
      } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
        setMicError("No microphone found on this device.");
      } else if (errName === "NotReadableError" || errName === "TrackStartError") {
        setMicError("Your microphone is being used by another app. Please close it and try again.");
      } else {
        setMicError("Microphone is not enabled on your device. Please check your microphone settings and try again.");
      }
    }
  };

  const transcribeAndSend = async (raw: Blob) => {
    try {
      setTranscribing(true);
      console.info("[voice] uploading audio");
      const { blobToWav16kMono } = await import("@/lib/audio-wav");
      const wav = await blobToWav16kMono(raw);
      const form = new FormData();
      form.append("audio", wav, "copilot.wav");
      const res = await fetch("/api/copilot/voice/transcribe", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as {
        data?: { transcript?: string };
        error?: { message?: string };
      } | null;
      if (!res.ok || !json?.data?.transcript) {
        console.info("[voice] transcription failed");
        setMicError("Could not hear that, please try again.");
        return;
      }
      console.info(`[voice] transcript received (chars: ${json.data.transcript.length})`);
      await sendText(json.data.transcript, true /* isVoice */);
    } catch {
      console.info("[voice] transcription failed");
      setMicError("Could not hear that, please try again.");
    } finally {
      setTranscribing(false);
    }
  };

  // Text-To-Speech Read Aloud
  const speakAnswer = async (
    id: string,
    text: string,
    trusted?: { assistantMessageId?: string | null; sessionId?: string | null }
  ) => {
    try {
      setSpeakingId(id);
      setPlayedTtsIds((prev) => new Set(prev).add(id));
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const body: Record<string, unknown> = session?.access_token
        ? {
            messageId: trusted?.assistantMessageId ?? null,
            sessionId: trusted?.sessionId ?? undefined,
          }
        : { text };

      if (session?.access_token && !body.messageId) {
        return;
      }

      const res = await fetch("/api/copilot/voice/speak", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const json = (await res.json().catch(() => null)) as {
        data?: { audioBase64?: string; mimeType?: string };
        error?: { message?: string };
      } | null;

      if (!res.ok || !json?.data?.audioBase64) return;
      const el = audioRef.current;
      if (!el) return;
      el.src = `data:${json.data.mimeType || "audio/wav"};base64,${json.data.audioBase64}`;
      await el.play();
    } catch {
      /* TTS error handled silently */
    } finally {
      setSpeakingId(null);
    }
  };

  const businessName = isLive && activeBusiness?.name ? activeBusiness.name : "Demo Business";
  const isComposerDisabled = sending || micStarting || recording || transcribing;
  const isMicDisabled = sending || transcribing || micStarting;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto overflow-hidden animate-fade-in">
      {/* 1. Header (sticky, ~64-72px tall, 390px-friendly) */}
      <header className="sticky top-0 z-10 min-h-[64px] sm:min-h-[72px] flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shrink-0 select-none">
        {/* Left: Round gradient logo mark + Title 20-22px + Subtitle & business pill */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div
            className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white font-bold text-xs sm:text-sm shadow-sm"
            aria-hidden="true"
          >
            ✦
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className="text-[20px] sm:text-[22px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
              AI COO
            </h1>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[13px] text-slate-500 dark:text-slate-400 font-normal">
                Your business copilot
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 truncate max-w-[130px] sm:max-w-[200px]">
                {businessName}
              </span>
            </div>
          </div>
        </div>

        {/* Right: New chat button (icon + label on desktop, icon only on narrow screens) */}
        <button
          type="button"
          onClick={handleNewChat}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 sm:px-3.5 py-1.5 sm:py-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none shrink-0"
          aria-label="Start new chat"
          title="Start new chat"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">New chat</span>
        </button>
      </header>

      {/* Message Area: Single centered column */}
      <main
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <SuggestionChips
              onSelect={(q) => void sendText(q)}
              disabled={isComposerDisabled}
            />
          </div>
        ) : (
          messages.map((m, idx) => (
            <ChatMessage
              key={m.id}
              message={m}
              speakingId={speakingId}
              hasPlayedTts={playedTtsIds.has(m.id)}
              onSpeak={speakAnswer}
              onRetry={m.failed ? handleRetry : undefined}
              isLatestAssistant={idx === messages.length - 1}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Composer Pinned to Bottom */}
      <footer className="shrink-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent dark:from-[#070b14] dark:via-[#070b14] dark:to-transparent pt-2">
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={() => void send()}
          onToggleVoice={() => void toggleVoice()}
          recording={recording}
          recordingDuration={recordingDuration}
          transcribing={transcribing}
          micStarting={micStarting}
          micError={micError}
          onDismissMicError={() => setMicError(null)}
          disabled={isComposerDisabled}
          micDisabled={isMicDisabled}
        />
        <audio ref={audioRef} className="hidden" />
      </footer>
    </div>
  );
}
