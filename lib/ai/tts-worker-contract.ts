// Slice 7 — MMS worker contract (self-hosted Transformers).
// POST {MMS_TTS_ENDPOINT_URL} { model, input, language }
// -> audio/* bytes OR { audio_base64, mime_type }.
// Model: facebook/mms-tts-eng (CC-BY-NC 4.0). English only.
export const MMS_TTS_MODEL_ID = "facebook/mms-tts-eng";
