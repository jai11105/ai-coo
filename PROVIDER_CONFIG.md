# AI Powered COO — Provider Configuration

**Status:** Locked hackathon provider assignments. Confirm exact endpoint/request schema against each provider's current documentation during implementation.

## 1. Provider responsibility matrix

| Product capability | Provider | Model / service | Role |
|---|---|---|---|
| Main coding agent | Meta | Muse Spark 1.3 Contributor via Muse Code | Build the app |
| Copilot live chat | Fireworks | DeepSeek V3.1 — `accounts/fireworks/models/deepseek-v3p1` | Primary text answer |
| Chat fallback 1 | Meta | Muse Spark 1.3 Contributor | First fallback |
| Chat fallback 2 | Baseten | Muse Spark Open 1026 — `meta-models/muse-spark-open-1026` | Second fallback |
| Executive Directives | Baseten | Muse Spark Open 1026 | Three strategic directives |
| Copilot voice input | Meta | Muse Voice Transcribe 1.0 | Speech-to-text |
| Log Entry voice input | Modal | faster-whisper hosted on Modal | Speech-to-text |
| Voice transaction extraction | Baseten | Muse Spark Open 1026 | Transcript to proposed transaction |
| Copilot spoken answer | Separate TTS provider | To be selected/configured | Text-to-speech; mandatory feature |

## 2. Environment variables

Use placeholders in `.env.example`. Real values belong only in local secret storage or deployment environment variables.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

META_API_KEY=
BASETEN_API_KEY=
FIREWORKS_API_KEY=
MODAL_API_KEY=

# Configure only after choosing the TTS provider
TTS_PROVIDER=
TTS_API_KEY=
TTS_MODEL=
```

- `NEXT_PUBLIC_*` values are public by definition. Never put provider keys or service-role keys in them.
- Keep all provider calls in server-only modules.
- `.gitignore` must exclude `.env`, `.env.*`, local credential files and generated secrets, while allowing `.env.example`.
- `.gitignore` prevents Git commits; it does not prevent a coding agent from reading a file. Keep actual secrets outside the agent workspace where possible.

## 3. Provider adapters

Create a provider-neutral interface for:
- `generateText`
- `streamText`
- `transcribeAudio`
- `synthesizeSpeech`

Each adapter must normalize:
- request parameters
- response content
- token usage
- latency
- provider error type
- retryability
- timeout and cancellation

Do not couple business logic directly to vendor SDK response shapes.

## 4. Copilot chat routing

Order:
1. Fireworks DeepSeek V3.1.
2. Meta Muse Spark 1.3 Contributor.
3. Baseten Muse Spark Open 1026.

Fallback triggers:
- connection failure
- provider unavailable
- rate limit
- timeout
- provider-side server error

Do not fallback because the answer is unpopular or disagrees with another model.

Streaming rules:
- Before first token: safe to try next provider.
- After first token: do not splice another model's answer into the partial stream. Mark interrupted and let the user retry/restart.
- Persist which provider/model produced the final answer.
- Use the same verified evidence and conversation context for all providers.

## 5. Baseten Executive Directives

- Generate three structured directives.
- Inputs: compact deterministic analytics and evidence references.
- Trigger: Copilot open when cache is stale, explicit refresh, or meaningful transaction/data refresh.
- Do not regenerate for every chat message.
- Cache by business + evidence/data version + timeframe.
- Each directive must include evidence, reason, recommended action, confidence and limitations.
- Never create a directive without sufficient evidence.

## 6. Baseten transaction extraction

Input: transcript plus server-verified business context (currency, timezone, allowed categories, configured tax jurisdiction).

Output: proposed transaction draft only.
- Type: sale / purchase / expense
- Date
- Description
- Items/quantity/unit/prices where applicable
- Category suggestion
- Tax fields only where configured and supported
- Missing/ambiguous fields
- Clarifying questions

Rules:
- Do not save directly.
- User must review and confirm.
- Shared transaction service recalculates and validates totals.
- Reject or ask clarification for ambiguous currency, quantity, price or transaction type.
- Never treat a standalone purchase as sale COGS.

## 7. Voice pipelines

### 7.1 Log Entry voice

`Browser microphone → authenticated upload → Modal faster-whisper → transcript → Baseten extraction → preview → user confirmation → shared transaction service → Supabase`

- Modal is infrastructure/compute; faster-whisper is the speech recognition engine.
- Do not use Llama as the speech recognition model.
- Temporary audio retention must be minimized and documented.
- Handle Tamil/English and mixed-language quality through real sample tests.

### 7.2 Copilot voice

`Browser microphone → Meta Muse Voice Transcribe 1.0 → recognized question → standard Copilot chat router → answer → TTS provider → audio playback`

- This pipeline does not use Modal.
- STT and TTS are different capabilities.
- Spoken answer is mandatory. Select a TTS provider before completing this milestone.
- Preserve the text answer and provide replay/stop controls.
- Respect user language and voice preferences.

## 8. Token, latency and cost controls

- Send compact relevant evidence, not the full database or all analytics.
- Limit output tokens according to task.
- Keep chat history bounded and summarize older context when needed.
- Cache Executive Directives and stable analytics.
- Avoid duplicate calls caused by component rerenders or repeated refreshes.
- Record token usage, latency, model, provider, status and estimated cost.
- Add request-level rate limits and per-business usage controls.
- Configure provider-side spend controls where available.
- Sponsor credits are for the hackathon period only; do not design the post-hackathon product as if these credits continue indefinitely.

## 9. Reliability and fallback tests

- Primary provider success.
- Primary timeout before first token → fallback 1.
- Primary unavailable → fallback 1 success.
- Primary and fallback 1 fail → fallback 2.
- Stream fails after partial output → interrupted state, no mixed answer.
- Malformed provider response → validation error / fallback where safe.
- Provider rate limit → bounded retry or fallback.
- TTS failure → preserve visible text answer and show audio retry; voice-answer requirement must be completed before product acceptance.
- Transcription failure → allow retry or manual text entry.
- Never expose provider API keys in client bundles, logs or error messages.

## 10. Coding-agent secret boundary

Muse Code may read and edit source code, tests and `.env.example`. It must not read, print, copy, expose or modify actual secret files. If a secret is required for testing, ask the user to configure it securely. Do not hardcode credentials.
