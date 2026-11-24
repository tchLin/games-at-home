export const RECORD_SECONDS = 8;
export const SAMPLE_RATE = 24000;
export const MAX_LISTENS = 5;
// PCM16 mono WAV, then base64. Limits are shared with the rules generator.
export const MAX_AUDIO_BASE64 = Math.ceil((44 + RECORD_SECONDS * SAMPLE_RATE * 2) / 3) * 4;
