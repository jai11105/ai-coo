"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBusiness } from "@/components/business-context";
import { useMockStore } from "@/components/providers";
import { useWorkspace } from "@/components/workspace-context";
import { supabase } from "@/lib/supabase/client";
import { liveToMockTransactions } from "@/lib/live-adapter";
import { fetchChatMessages, fetchLatestChatSession } from "@/lib/supabase/workspace-chat";
import { MOCK_DIRECTIVES } from "@/lib/mock-data";
import type { LiveChatMessage } from "@/lib/supabase/workspace-chat";
import { cx, uid } from "@/lib/utils";

interface CopilotApiEvidence { id: string; label: string; display: string }
interface CopilotApiData {
  answer: string; intent: string; evidence: CopilotApiEvidence[];
  provider: string; model: string; traceId: string;
  latencyMs: number; warnings: string[]; conversationId: string;
  sessionId?: string | null; userMessageId?: string | null;
  assistantMessageId?: string | null; persisted?: boolean;
  specialist?: { used: boolean; status: string; reason: string };
}

/** Per-answer display model identity (Part 10C): subtle metadata rendered
 *  ONLY below a successful answer, from the actual final-answer model. */
interface AnswerMeta { provider: string; model: string; latencyMs: number }
interface ChatBubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence?: string[];
  timestamp: string;
  assistantMessageId?: string | null;
  sessionId?: string | null;
  meta?: AnswerMeta | null;
  failed?: boolean;
}

/** Human-friendly model label — no raw provider internals in the UI.
 * FINAL FIX (Failure 1+5): the badge reflects the ACTUAL final-answer
 * provider. A Fireworks fallback composition is never labeled "Muse Spark
 * Open 1026" (the Baseten specialist); only provider "baseten-specialist"
 * earns the specialist badge, and only provider "meta" earns "Muse Spark
 * 1.3". Degraded/deterministic answers show "Verified records". */
function displayModelName(provider: string, model: string): string {
  const m = (model || "").toLowerCase();
  const p = (provider || "").toLowerCase();
  if (p.includes("deterministic") || p.includes("degraded")) return "Verified records";
  if (p.includes("baseten")) return "Muse Spark (specialist)";
  if (m.includes("muse-spark-1.3") || m.includes("muse-spark")) {
    if (m.includes("1.3")) return "Muse Spark 1.3";
    return "Muse Spark";
  }
  if (m.includes("muse-image")) return "Muse Image 1.0";
  if (p.includes("meta-image")) return "Muse Image 1.0";
  if (p.includes("fallback") || p.includes("fireworks")) return "Muse Spark (fallback)";
  if (p.includes("deterministic")) return "Verified records";
  return (model || "Copilot").slice(0, 40);
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
    return liveToMockTransactions(liveTxns, categoryById, activeBusiness?.currency_code ?? "INR", activeBusiness?.timezone ?? "UTC");
  }, [isLive, mockTxns, liveTxns, categories, activeBusiness?.currency_code, activeBusiness?.timezone]);

  // Demo messages only; live workspaces start empty then load persisted history.
  // This keeps MOCK_CHAT_SEED isolated from real-business mode.
  // Part 10: clean empty-state — demo seed text is NOT pre-rendered as chat
  // bubbles; the empty state below invites the first question instead.
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatError, setChatError] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [speakError, setSpeakError] = useState("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const convRef = useRef(`conv_${uid("c")}`);
  if (!convRef.current) convRef.current = `conv_${uid("c")}`;

  // Leaving live mode restores the isolated demo seed; entering live mode
  // clears it immediately so demo chat never leaks into a real business.
  useEffect(() => {
    if (!isLive) {
      setMessages([]);
      setSessionId(null);
      setChatError("");
      setHistoryLoaded(true);
    } else {
      setMessages([]);
      setChatError("");
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
                  timestamp: new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  assistantMessageId: r.role === "assistant" ? r.id : null,
                  sessionId: s.id,
                }))
              );
            }
          } catch (e) {
            if (active) setChatError(e instanceof Error ? e.message : "Couldn't load chat history.");
          } finally {
            if (active) setHistoryLoaded(true);
          }
        } else if (active) {
          setHistoryLoaded(true);
        }
      })
      .catch((e) => {
        if (active) {
          setChatError(e instanceof Error ? e.message : "Couldn't load chat history.");
          setHistoryLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [isLive, userId, activeBusinessId]);

  // Every message goes through POST /api/copilot/chat (server AI flow).
  // Greetings included — no hardcoded frontend answers. Demo mode calls the
  // API without auth (server uses demo evidence); live mode sends the JWT +
  // business ID so the server verifies membership and loads live evidence.
  // Slice 7: voice questions transcribe first, then flow through sendText
  // (same chat API, context, follow-ups, tool loop). Image prompts route to
  // /api/copilot/image (explicit creative only) after the text answer lands.
  const sendText = async (text: string) => {
    if (!text || sending) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const isImageAsk = /\b(generate|create|make|design)\b[^.]{0,120}\b(image|poster|advertisement|creative|banner|promo|promotional|launch)\b|\b(image|poster|advertisement|creative|banner)\b[^.]{0,80}\b(for|of)\b/i.test(text.slice(0, 1000));
    const user: ChatBubble = { id: uid("u"), role: "user", content: text, timestamp: now };
    setMessages((m) => [...m, user]);
    setDraft("");
    setSending(true);
    // Part 10B: task-specific loading state — never provider/model names.
    if (isImageAsk) setSendingImage(true);
    setChatError("");
    const thinkingId = uid("a");
    setMessages((m) => [...m, { id: thinkingId, role: "assistant", content: isImageAsk ? "Creating your image…" : "Thinking…", timestamp: now }]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
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
      });
      const json = (await res.json().catch(() => null)) as { data?: CopilotApiData; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) {
        throw new Error(json?.error?.message || `Copilot request failed (HTTP ${res.status}).`);
      }
      const d = json.data;
      const isImageReply = typeof d.answer === "string" && d.answer.startsWith("![generated creative](");
      const reply: ChatBubble = {
        id: uid("a"),
        role: "assistant",
        content: d.answer,
        // Part 10F: business figures stay inside the answer itself — the
        // technical evidence chip row is removed from the customer UI.
        evidence: undefined,
        timestamp: now,
        assistantMessageId: d.assistantMessageId ?? null,
        sessionId: d.sessionId ?? null,
        // Part 10C: per-answer model metadata from the ACTUAL final-answer
        // model — rendered subtly below this answer only, never on failure.
        meta: { provider: d.provider, model: d.model, latencyMs: d.latencyMs },
        failed: false,
      };
      // Image replies carry no text-model metadata (Part 10E).
      if (isImageReply) reply.meta = { provider: "meta-image", model: "muse-image-1.0", latencyMs: d.latencyMs };
      setMessages((m) => m.map((x) => (x.id === thinkingId ? reply : x)));
      // Developer diagnostics stay out of the customer UI (Part 10): intent /
      // provider / latency are no longer rendered as a status line.
      if (d.sessionId) setSessionId(d.sessionId);
      convRef.current = d.conversationId || convRef.current;
      if (d.warnings && d.warnings.length > 0) {
        setChatError(d.warnings.join(" "));
      }
      // Slice 8: persistence is server-side only (single store). The chat
      // route returns session/message ids; the client only records them for
      // trusted TTS + history. No client-side chat insert here (avoids a
      // second conversation store / duplicate rows).
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Copilot request failed.";
      // Part 10D: clean failure state — understandable message, no model
      // metadata, no provider internals.
      setMessages((m) => m.map((x) => (x.id === thinkingId ? { ...x, content: `Sorry — ${msg} Please try again.`, meta: null, failed: true } : x)));
      setChatError(msg);
    } finally {
      setSending(false);
      setSendingImage(false);
    }
    // Route C — direct image routing runs SERVER-side inside /api/copilot/chat
    // (orchestrate detects image intent BEFORE any LLM call and returns the
    // image markdown directly). NO second /api/copilot/image call here: the
    // old client-side fetchCreative double-call (Spark first via chat, then
    // Image via /image) is removed. The image card arrives as the assistant
    // reply content and renders inline via the ![generated creative]() branch.
  };
  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    await sendText(text);
  };
  const fetchCreative = async (prompt: string) => {
    // Retained ONLY for the explicit "Generate image" gallery path (if any).
    // Normal typed/spoken poster requests route server-side via
    // /api/copilot/chat (zero Spark calls) — this helper is NOT called from
    // sendText anymore.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      if (isLive && activeBusinessId) headers["x-business-id"] = activeBusinessId;
      const res = await fetch("/api/copilot/image", {
        method: "POST", headers,
        body: JSON.stringify({ prompt, businessId: isLive && activeBusinessId ? activeBusinessId : "demo" }),
      });
      const json = (await res.json().catch(() => null)) as { data?: { imageUrl?: string; imageBase64?: string }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message || "Image generation failed.");
      const src = json.data.imageUrl || (json.data.imageBase64 ? `data:image/png;base64,${json.data.imageBase64}` : null);
      if (!src) throw new Error("Image service returned no image.");
      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMessages((m) => [...m, { id: uid("a"), role: "assistant", content: `![generated creative](${src})`, timestamp: now, meta: { provider: "meta-image", model: "muse-image-1.0", latencyMs: 0 } }]);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Image generation failed.");
    }
  };
  const toggleVoice = async () => {
    if (recording) {
      mediaRef.current?.stop();
      return;
    }
    try {
      setSpeakError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        void transcribeAndSend(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
      };
      rec.start();
      setRecording(true);
    } catch {
      setSpeakError("Microphone unavailable. Type your question instead.");
    }
  };
  const transcribeAndSend = async (raw: Blob) => {
    try {
      setTranscribing(true);
      const { blobToWav16kMono } = await import("@/lib/audio-wav");
      const wav = await blobToWav16kMono(raw);
      const form = new FormData();
      form.append("audio", wav, "copilot.wav");
      const res = await fetch("/api/copilot/voice/transcribe", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as { data?: { transcript?: string }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data?.transcript) throw new Error(json?.error?.message || "No speech recognized.");
      // Route D: transcript flows through EXACTLY the same intent router as
      // typed messages (sendText → /api/copilot/chat → orchestrate): spoken
      // greeting → Spark; spoken sales → Spark + sales fn; spoken RCA →
      // Baseten; spoken poster → Muse Image directly. The spoken final answer
      // is then offered via MMS TTS (Speak button), never for Log Entry.
      await sendText(json.data.transcript);
    } catch (e) {
      setSpeakError(e instanceof Error ? e.message : "Voice transcription failed.");
    } finally {
      setTranscribing(false);
    }
  };
  const speakAnswer = async (id: string, text: string, trusted?: { assistantMessageId?: string | null; sessionId?: string | null }) => {
    try {
      setSpeakError("");
      setSpeakingId(id);
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      // Slice 8: live sessions speak ONLY via trusted persisted assistant
      // message id (server verifies ownership); demo falls back to text.
      const body: Record<string, unknown> = session?.access_token
        ? { messageId: trusted?.assistantMessageId ?? null, sessionId: trusted?.sessionId ?? undefined }
        : { text };
      if (session?.access_token && !body.messageId) {
        throw new Error("Spoken answers need a saved assistant message — text answer shown.");
      }
      const res = await fetch("/api/copilot/voice/speak", {
        method: "POST", headers,
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { data?: { audioBase64?: string; mimeType?: string }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data?.audioBase64) throw new Error(json?.error?.message || "Spoken answers unavailable — text answer shown.");
      const el = audioRef.current;
      if (!el) throw new Error("Audio player unavailable.");
      el.src = `data:${json.data.mimeType || "audio/wav"};base64,${json.data.audioBase64}`;
      await el.play();
    } catch (e) {
      setSpeakError(e instanceof Error ? e.message : "Spoken answers unavailable.");
    } finally {
      setSpeakingId(null);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-5 animate-fade-in">
      {/* Left Column: Context & Strategic Directives */}
      <div className="space-y-4 lg:col-span-2">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-brand-950 to-slate-900 border border-slate-800/80 p-6 text-white shadow-xl">
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-brand-500/20 blur-2xl" />
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
              AI Executive Assistant
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white">COO Copilot</h1>
            <p className="mt-1.5 text-xs text-slate-300 sm:text-sm leading-relaxed">
              Ask about sales, gross margins, stock, cash flow, or marketing creatives. Answers are computed directly from verified business records.
            </p>
          </div>
        </div>

        {isLive ? (
          <div className="card space-y-2 border-slate-200/80 shadow-card dark:border-slate-800/80">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white">{activeBusiness?.name ?? "Workspace"}</div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Live Connected
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Copilot evaluates your real database transactions, categories, and business settings.
            </p>
            {chatError && (
              <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300" role="alert">
                {chatError}
              </p>
            )}
          </div>
        ) : (
          MOCK_DIRECTIVES.map((d) => (
            <div key={d.id} className="card card-hover space-y-2.5 border-slate-200/80 shadow-card dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-2 py-0.5 text-xs font-black text-white dark:bg-white dark:text-slate-950">
                    #{d.rank}
                  </span>
                  <span className={cx(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    d.impact === "High"
                      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/50"
                      : "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/50"
                  )}>
                    {d.impact} impact
                  </span>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {d.effort} effort
                </span>
              </div>
              <h2 className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">{d.title}</h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{d.summary}</p>
              <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                {d.evidence.map((e) => <li key={e} className="flex items-start gap-1.5"><span>•</span><span>{e}</span></li>)}
              </ul>
              <div className="rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50/70 to-indigo-50/70 p-2.5 text-xs font-semibold text-brand-700 dark:border-brand-900/40 dark:from-brand-950/30 dark:to-indigo-950/30 dark:text-brand-300">
                → {d.action}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Right Column: Interactive Chat Interface */}
      <div className="lg:col-span-3">
        <div className="card flex h-[74vh] flex-col overflow-hidden !p-0 shadow-xl border border-slate-200/80 dark:border-slate-800 lg:sticky lg:top-20 rounded-3xl">
          {/* Chat Window Header */}
          <div className="relative border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-brand-950 px-5 py-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-500/30 font-bold text-xs">
                  AI
                </div>
                <div>
                  <div className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                    COO Executive Copilot
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Grounded in ledger data &amp; deterministic analytics
                  </div>
                </div>
              </div>
              <span className="hidden sm:inline text-[11px] rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-slate-300">
                Meta Muse Engine
              </span>
            </div>
            {chatError && (
              <p className="mt-2 rounded-xl bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-200 border border-rose-500/30" role="alert">
                {chatError}
              </p>
            )}
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5 bg-slate-50/40 dark:bg-slate-950/30">
            {messages.length === 0 && (
              <div className="my-auto flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 text-2xl text-white shadow-lg shadow-brand-500/20">
                  ✦
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-800 dark:text-slate-100">
                  Hi, I&apos;m your COO Copilot
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {isLive && !historyLoaded
                    ? "Loading your conversation history…"
                    : "Ask questions about your business metrics, or click a suggestion below to get started:"}
                </p>
                {(!isLive || historyLoaded) && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2 max-w-md">
                    {["What are my total sales?", "Which products have the best margin?", "Generate a festive offer poster"].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => { setDraft(q); }}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm transition-all hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-brand-400 dark:hover:text-brand-300"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((m) => {
              const isImage = m.content.startsWith("![generated creative](");
              const isPending = m.content === "Thinking…" || m.content === "Creating your image…";
              const isUser = m.role === "user";

              return (
                <div
                  key={m.id}
                  className={cx(
                    "flex flex-col animate-fade-in",
                    isUser ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cx(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                      isUser
                        ? "bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-brand-600/20 rounded-tr-sm"
                        : "border border-slate-200/90 bg-white text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 rounded-tl-sm"
                    )}
                  >
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.content.slice(22, -1)} alt="Generated creative" className="rounded-xl shadow-md max-w-full" />
                    ) : (
                      <div className="leading-relaxed whitespace-pre-wrap">{m.content}</div>
                    )}

                    <div className={cx(
                      "mt-2 flex items-center gap-2.5 text-[11px]",
                      isUser ? "text-white/75" : "text-slate-400 dark:text-slate-500"
                    )}>
                      <span>{m.timestamp}</span>
                      {!isUser && !isImage && !isPending && !m.failed && (
                        <button
                          className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
                          disabled={speakingId === m.id}
                          title="Speak this answer (English, MMS TTS)"
                          onClick={() => void speakAnswer(m.id, m.content, { assistantMessageId: m.assistantMessageId, sessionId: m.sessionId })}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          </svg>
                          {speakingId === m.id ? "Speaking…" : "Read Aloud"}
                        </button>
                      )}
                    </div>
                  </div>

                  {!isUser && !isImage && !isPending && !m.failed && m.meta && (
                    <div className="mt-1 ml-1 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{displayModelName(m.meta.provider, m.meta.model)}</span>
                      <span>·</span>
                      <span>{(m.meta.latencyMs / 1000).toFixed(1)}s</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Composer Input Area */}
          <div className="border-t border-slate-200/90 bg-white/95 p-3.5 sm:p-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
            <div className="flex items-center gap-2">
              <button
                className={cx(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all text-base shadow-sm",
                  recording
                    ? "border-rose-500 bg-rose-50 text-rose-600 animate-pulse ring-2 ring-rose-500/20 dark:bg-rose-950 dark:text-rose-300"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                )}
                disabled={sending || transcribing}
                title={recording ? "Stop recording" : "Record a Copilot voice question (transcribed, then sent via Copilot chat)"}
                onClick={() => void toggleVoice()}
              >
                {recording ? "⏹" : transcribing ? "…" : "🎙️"}
              </button>

              <input
                className="input flex-1 !h-11 text-sm placeholder:text-slate-400"
                placeholder="Ask about margins, stock, cash… or 'generate a poster for…'"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void send()}
                disabled={sending}
              />

              <button
                className="btn-primary !h-11 px-5 text-sm font-semibold shadow-md shadow-brand-500/20 shrink-0"
                onClick={() => void send()}
                disabled={sending || !draft.trim()}
              >
                {sending ? (sendingImage ? "Creating…" : "Thinking…") : "Send"}
              </button>
            </div>

            {(recording || transcribing) && (
              <p className="mt-2 text-xs font-medium text-brand-600 dark:text-brand-400 animate-pulse flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-500" />
                {recording ? "Recording audio… tap ⏹ to transcribe and send to Copilot." : "Transcribing your question with Meta Voice Transcribe…"}
              </p>
            )}

            {speakError && (
              <p className="mt-2 text-xs font-medium text-rose-500 dark:text-rose-400" role="alert">
                {speakError}
              </p>
            )}
            <audio ref={audioRef} className="hidden" />
          </div>
        </div>
      </div>
    </div>
  );
}
