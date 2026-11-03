# AI Powered COO — Provider Configuration & Runtime Model Mapping

**Status:** Finalized Phase 0 baseline  
**Runtime Model Policy:** 100% Meta models at runtime. Third-party providers (Baseten, Fireworks) are permitted strictly as inference infrastructure for approved Meta checkpoints.  
**Prohibited Runtime Models:** OpenAI, Anthropic, Google, DeepSeek, Whisper, and Chatterbox are strictly prohibited.

---

## 1. Provider responsibility matrix

| Capability | Model checkpoint | Inference provider | Allocation & Status | Fallback role |
|---|---|---|---|---|
| **Coding agent** | Meta Muse Spark 1.3 | Meta API / Muse Code | Active developer environment | App implementation |
| **COO Copilot LLM** | Meta Muse Spark | Meta API | Active account access | **Primary** |
| | Muse Spark Open 1026 | Baseten | $100 hackathon credit | **Fallback 1** |
| | Muse Glimmer 30B | Fireworks | $1 hackathon credit | **Fallback 2** |
| **Executive Directives** | Meta Muse Spark 1.3 Contributor | Meta API (w/ Baseten FB) | Active account access | Strategic directives |
| **Log Entry Voice STT** | Meta Muse Voice Transcribe 1.0 | Meta API | Active account access | Audio transcription |
| **Log Entry Structured Extraction** | Muse Spark Contributor | Meta API | Active account access | Text to JSON draft |
| **Copilot Voice Input (STT)** | Meta Muse Voice Transcribe 1.0 | Meta API | Active account access | Spoken question transcription |
| **Copilot Voice Output (TTS)** | Meta MMS TTS (`facebook/mms-tts-eng`) | Separately provisioned inference endpoint | **Deployment Dependency** | English spoken response |

---

## 2. Environment variables and provider credentials

All provider keys and URLs reside in server-side environment variables. Real keys must never be exposed to the client bundle (`NEXT_PUBLIC_*`), printed to logs, or committed to version control.

> **Important:** All endpoint URLs and API keys below are explicit template placeholders. No fabricated or unverified URLs are presented as working endpoints. Real values must be obtained directly from provider dashboards.

### `.env.example` Template
```env
# ==============================================================================
# Supabase Configuration
# ==============================================================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key-placeholder
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-placeholder

# ==============================================================================
# Meta API (Primary Chat + Log Entry STT + Log Entry extraction)
# COO reasoning: Muse Spark Standard (META_MODEL_ID=muse-spark-1.3)
# Log Entry extraction ONLY: Muse Spark Contributor (META_EXTRACTION_MODEL_ID)
# Voice transcription: Muse Voice Transcribe 1.0 (META_ASR_TRANSCRIBE_URL)
# Obtain from: Meta Developer / Muse platform dashboard
# ==============================================================================
META_API_KEY=your-meta-api-key-placeholder
META_BASE_URL=https://api.meta.ai/v1
META_MODEL_ID=muse-spark-1.3
META_ASR_TRANSCRIBE_URL=https://api.meta.ai/v1/asr/transcribe
META_EXTRACTION_MODEL_ID=muse-spark-1.3-contributor

# ==============================================================================
# Baseten (Fallback 1 Chat - $100 Credit)
# Accessible model: Muse Spark Open 1026
# Obtain from: Baseten dashboard (API Keys & Model Deployment section)
# ==============================================================================
BASETEN_API_KEY=your-baseten-api-key-placeholder
BASETEN_MUSE_SPARK_MODEL_ID=your-baseten-model-id-placeholder

# ==============================================================================
# Log Entry structured extraction — Muse Spark Contributor via Meta API.
# The old Modal-based extraction integration has been removed; there is no
# Modal endpoint, key, token, or fallback in the Log Entry path.
# ==============================================================================

# ==============================================================================
# Fireworks (Fallback 2 Chat - $1 Credit)
# Accessible model: Muse Glimmer 30B
# Obtain from: Fireworks AI dashboard (API Keys section)
# ==============================================================================
FIREWORKS_API_KEY=your-fireworks-api-key-placeholder
FIREWORKS_MUSE_GLIMMER_MODEL_ID=accounts/fireworks/models/muse-glimmer-30b

# ==============================================================================
# Meta MMS TTS (Copilot Voice Output - English checkpoint: facebook/mms-tts-eng)
# Status: Unresolved / Deployment Dependency to be provisioned separately.
# Do not assume another host provides this model; provision before Phase 9.
# ==============================================================================
MMS_TTS_ENDPOINT_URL=https://your-mms-tts-inference-endpoint.example.com/tts
MMS_TTS_API_KEY=your-mms-tts-endpoint-api-key-placeholder
```

---

## 3. Provider access & operational constraints

### 3.1 Meta API (Primary Chat, Directives, STT, and Log Entry extraction)
- **COO reasoning model:** Muse Spark Standard (`META_MODEL_ID=muse-spark-1.3`) — primary Copilot brain. Never replaced by extraction.
- **Log Entry extraction model:** Muse Spark Contributor (`META_EXTRACTION_MODEL_ID=muse-spark-1.3-contributor`) — transcript-to-JSON extraction ONLY.
- **Transcription model:** Meta Muse Voice Transcribe 1.0 via `META_ASR_TRANSCRIBE_URL`.
- **Credentials:** Dedicated `META_API_KEY` and base URL configured in server environment.
- **Role:** Primary workhorse for Copilot chat, Executive Directives generation, Log Entry transcription, Log Entry extraction (Contributor), and Copilot voice input transcription.
- **Latency & Timeout:** Client requests timeout after 8,000ms, triggering Fallback 1 if no stream tokens have been emitted.

### 3.2 Baseten ($100 credit allocation)
- **Accessible model:** Muse Spark Open 1026 (`meta-models/muse-spark-open-1026`).
- **Credentials:** `BASETEN_API_KEY` and model deployment ID from Baseten console.
- **Role:** First failover tier (Fallback 1) for Copilot chat if the Meta API experiences upstream outages, rate limits, or network timeouts.
- **Budgetary runway:** $100 hackathon credit provides ample buffer for chat failovers.

### 3.3 Log Entry extraction (Muse Spark Contributor — no Modal)
- **Model:** Muse Spark Contributor (`META_EXTRACTION_MODEL_ID=muse-spark-1.3-contributor`) via Meta API.
- **Role:** Dedicated structured JSON extraction for voice log entries (converting transcribed text into validated Sale, Purchase, or Expense JSON drafts).
- **Removed:** The old Modal-based extraction integration (endpoint, keys, tokens, fallback) is deleted from the Log Entry path.
- **Strict rule:** **Never send raw audio to the extractor.** Audio is transcribed first by Meta Voice Transcribe 1.0; only the resulting text transcript is delivered to Contributor.

### 3.4 Fireworks ($1 credit allocation)
- **Accessible model:** Muse Glimmer 30B (`accounts/fireworks/models/muse-glimmer-30b`).
- **Credentials:** `FIREWORKS_API_KEY` from Fireworks AI dashboard.
- **Role:** Final failover tier (Fallback 2) for Copilot chat. Due to the limited credit budget ($1), Fireworks is strictly reserved for secondary failover when both Meta API and Baseten fail.

### 3.5 Meta MMS TTS (`facebook/mms-tts-eng`) — Deployment Dependency
- **Status:** **Unresolved deployment dependency; must be provisioned separately**.
- **Model checkpoint:** Official Meta open-weights model `facebook/mms-tts-eng` (English).
- **Role:** Text-to-speech synthesis for COO Copilot spoken answers (mandatory feature).
- **Constraint:** Provision a containerized inference endpoint (e.g., FastAPI on Hugging Face Endpoints, RunPod, or a dedicated instance) prior to Phase 9.

---

## 4. Provider adapter architecture

To prevent vendor lock-in and keep business logic decoupled from vendor-specific payload shapes, all model interactions execute through strongly typed server-side adapters:

```text
                  +--------------------------------+
                  |    Provider Adapter Interface  |
                  +--------------------------------+
                                  |
     +-----------------+----------+----------+-----------------+
     |                 |                     |                 |
     v                 v                     v                 v
[Meta API]        [Baseten]            [Fireworks]
Muse Spark 1.3    Muse Spark 1026      Muse Glimmer 30B
Muse Voice 1.0 + Contributor
```

### Standard Adapter Methods:
1. `streamChat(messages, evidence, options): AsyncIterable<StreamChunk>`
2. `transcribeAudio(audioBuffer, mimeType): Promise<TranscriptionResult>`
3. `extractStructuredTransaction(transcript, context): Promise<TransactionDraft>`
4. `synthesizeSpeech(text, voiceOptions): Promise<AudioBuffer>`

---

## 5. COO Copilot chat routing, timeouts & failover rules

### 5.1 Fallback Execution Chain
```text
Client Message 
      |
      v
Build Server Evidence (Supabase)
      |
      v
Try Meta API (Muse Spark 1.3 Contributor) [Timeout: 8000ms]
      |
      +---> Success: Stream SSE tokens to client
      |
      +---> Error (Timeout / 5xx / 429) BEFORE first token:
            |
            v
      Try Baseten (Muse Spark Open 1026) [Timeout: 8000ms]
            |
            +---> Success: Stream SSE tokens to client
            |
            +---> Error BEFORE first token:
                  |
                  v
            Try Fireworks (Muse Glimmer 30B) [Timeout: 8000ms]
                  |
                  +---> Success: Stream SSE tokens to client
                  +---> Error: Emit structured 502 PROVIDER_UNAVAILABLE error
```

### 5.2 Strict Failover & Streaming Rules
1. **Pre-token failover only:** Upstream provider failover is strictly permissible **only before the first token has been sent to the client**.
2. **Interrupted stream behavior:** If an error, socket disconnect, or provider outage occurs **after one or more tokens have been flushed**, the server **never** attempts to splice tokens from another model into the partial response. Instead:
   - The stream terminates immediately with an SSE error event:  
     `event: error`  
     `data: {"code": "STREAM_INTERRUPTED", "message": "Upstream connection dropped mid-stream. Please retry.", "retryable": true}`
   - The connection closes cleanly.
   - The client UI renders an interrupted notice with an intuitive retry button.
3. **Deterministic evidence parity:** All providers in the fallback chain receive the exact same server-generated evidence snapshot. Models are evaluated purely on analytical reasoning over the identical verified facts.
4. **Retry policy:** Transient network disconnects before stream initiation are retried once with a 500ms backoff before failing over to the next provider. No unbounded retry loops are permitted.
5. **No speculative fallback:** Failovers trigger exclusively on transport errors, timeouts (>8000ms), 5xx server errors, or 429 rate limits—never due to subjective disagreement with a model's analysis.

---

## 6. Voice processing pipelines

### 6.1 Log Entry Voice Flow
```text
[Browser Mic + client WAV conversion]
      | (mono PCM16 WAV 16 kHz)
      v
[POST /api/entry/transcribe]
      | -> Meta API (Meta Muse Voice Transcribe 1.0)
      v
[Transcript Text]
      | -> Meta API (Muse Spark Contributor)
      v
[Structured Draft JSON]
      | -> User Review & Edit UI
      v
[User Explicit Confirmation]
      | -> Shared Transaction Service -> Supabase PostgreSQL
```
- **Rule:** Contributor receives strictly text transcripts; raw audio bytes are never sent to the extractor.
- **Retention:** Audio buffers are held ephemerally in memory during transcription and purged immediately upon completion.

### 6.2 Copilot Voice Q&A Flow
```text
[Browser Mic]
      | (audio/webm, audio/wav, audio/mp4)
      v
[POST /api/copilot/voice/transcribe]
      | -> Meta API (Meta Muse Voice Transcribe 1.0)
      v
[Question Text]
      | -> Copilot Chat Router (Meta API -> Baseten -> Fireworks)
      v
[Text Answer + Verified Evidence]
      | -> Meta MMS TTS (facebook/mms-tts-eng)
      v
[Audio Stream + Synchronized Text Display in Browser]
```

---

## 7. Budget, credit, and latency management

1. **Meta API:** Primary workhorse; prompt tokens are optimized by passing compact, pre-aggregated financial facts rather than raw ledger tables.
2. **Baseten ($100 credit):** Ample runway for failover; monitor concurrency and request timeouts (8000ms threshold).
3. **Contributor extraction:** Transcript-to-JSON prompts use compact JSON schema constraints to minimize token consumption.
4. **Fireworks ($1 credit):** Minimal reserve; capped strictly at Fallback 2 for emergency failover.
5. **Directive Caching:** Executive Directives are cached by business ID and data version; they are regenerated only on meaningful ledger changes or explicit user refresh.

---

## 8. Coding-agent security boundary

The coding agent (Muse Code) is authorized to create and edit application source code, test suites, and `.env.example`.

**Strict security rules:**
- The agent must **never** read, inspect, print, copy, or log active `.env` files or real credential strings.
- All mock tests and development environments must run using simulated adapters or sanitized test credentials provided out-of-band by the developer.
- Any attempt to expose secrets in source code, client bundles, or error messages will cause immediate rejection during quality gate reviews.
