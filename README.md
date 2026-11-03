# AI Powered COO

Decision-first view of business performance: dashboard, ledger, rapid log entry and COO Copilot.

## Copilot AI architecture (Slices 1–7 live)

Every Copilot message goes through `POST /api/copilot/chat` — greetings included.
No hardcoded frontend answers. Flow per message:

1. Auth + tenant context (`lib/ai/server-context.ts`, service-role server-only).
2. Slice 7 tool loop: Muse Spark Standard receives the 15-tool registry
   (`lib/ai/tool-defs.ts`) and requests verified tools; the app validates
   name/args/scope/schema (`lib/ai/tool-exec.ts`), executes existing
   deterministic `lib/ai/tools*.ts` executors (`lib/ai/tool-run.ts`), returns
   provider-compatible `role=tool` results, and loops (max 3 rounds, 4
   calls/turn, 25 s budget; `lib/ai/tool-loop.ts` driver).
3. Muse Spark Standard composes the final answer; Fireworks
   `muse-spark-open` runs the SAME tool loop as reasoning fallback only
   (`callMetaStandardWithTools` / `callFireworksWithTools` in
   `lib/ai/providers.ts`). Baseten runs its own native tool-calling lifecycle
   (`postBasetenWithTools` / `callBasetenSpecialistWithTools` in
   `lib/ai/baseten.ts`: tools + tool_choice auto, shared tool-call parser,
   scope-checked application-side execution over verified evidence, role=tool
   results, max 3 rounds) — never direct Supabase access.
4. Validation + trace (`lib/ai/validate.ts`, `lib/ai/types.ts`).

Key modules: `lib/ai/config.ts`, `evidence.ts`, `intent.ts`, `context.ts`,
`prompts.ts`, `providers.ts`, `orchestrator.ts` + `orchestrate.ts`,
`select-evidence.ts`, `tools*.ts`, `tool-defs.ts`, `tool-exec.ts`,
`tool-run.ts`, `tool-loop.ts`, `image.ts`, `tts.ts`, `server-context.ts`,
`server-data.ts`.

Demo mode (no auth) runs the same pipeline on the `meta_demo` / `sample_business_2`
datasets. Live mode verifies `business_members` and loads Supabase evidence.

## Slice 7 — image + voice (explicit only)

- Image: explicit creative requests only (`POST /api/copilot/image` →
  `{META_BASE_URL}/images/generations`). Never charts/dashboards, never
  auto-generated. Returns a generated asset result; no storage bucket is
  invented (persistence lands in Slice 8).
- Voice input: Copilot mic records, converts to mono PCM16 WAV 16 kHz
  client-side (`lib/audio-wav.ts`), transcribes via
  `POST /api/copilot/voice/transcribe` (Meta Muse Voice Transcribe 1.0,
  `languageBias: ["Tamil", "English"]`), then submits the transcript through
  the EXISTING `/api/copilot/chat` pipeline. Log Entry voice
  (`POST /api/entry/transcribe`) is untouched.
- Voice output: per-answer 🔊 Speak button calls
  `POST /api/copilot/voice/speak`, which speaks ONLY the final validated
  answer in English via self-hosted MMS TTS (`facebook/mms-tts-eng`).
  TTS failure always preserves the text answer. No auto-speak-all.
- `MMS_TTS_MODEL_ID=facebook/mms-tts-eng`. No `MMS_TTS_API_KEY` required.
  `MMS_TTS_ENDPOINT_URL` points at a separately provisioned self-hosted
  Transformers worker (Vercel serverless cannot realistically host MMS);
  unset endpoint degrades honestly with text-only answers.

## Environment

Copy `.env.example` to `.env.local`. New vars: `BASETEN_BASE_URL` (deployment
invoke URL — leave empty until provisioned; never invent one),
`FIREWORKS_BASE_URL`, `FIREWORKS_MODEL_ID`, `MMS_TTS_MODEL_ID`.
`.env.local` is never overwritten by automation.

## Voice attribution

- Transcription: Meta Muse Voice Transcribe 1.0 (Meta API).
- Spoken Copilot answers: Meta MMS TTS (`facebook/mms-tts-eng`), licensed
  CC-BY-NC 4.0. Runtime + license info only — no third-party AI voice services.
