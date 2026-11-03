// Browser audio → mono PCM16 WAV (16 kHz) for Meta Muse Voice Transcribe.
// No Web Speech API. Converts MediaRecorder WebM/Opus output client-side so
// the server only ever forwards valid RIFF/WAVE WAV to Meta.

/** Decode any recorded blob and re-encode as mono 16-bit PCM WAV at 16 kHz. */
export async function blobToWav16kMono(input: Blob): Promise<Blob> {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Audio conversion is not supported in this browser.");
  const ctx = new Ctx();
  try {
    const buf = await input.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    const targetRate = 16000;
    const frames = Math.max(1, Math.floor(decoded.duration * targetRate));
    const offline = new OfflineAudioContext(1, frames, targetRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    const ch = rendered.getChannelData(0);
    const wav = encodeWavPCM16Mono(ch, targetRate);
    return new Blob([wav], { type: "audio/wav" });
  } finally {
    ctx.close().catch(() => undefined);
  }
}

function encodeWavPCM16Mono(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return buffer;
}
