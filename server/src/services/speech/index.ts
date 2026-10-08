/**
 * Speech-to-text layer, separated from AI analysis.
 *
 * Current pipeline ("browser" mode):
 *   Each participant's browser runs the Web Speech API on their OWN microphone only and sends
 *   final text segments over Socket.IO. The server never receives audio, so no recordings exist.
 *   Note: in Chrome/Edge the Web Speech API is implemented by the browser vendor's cloud service,
 *   which the privacy notice discloses.
 *
 * To move STT server-side later (e.g. Whisper, Deepgram, Azure Speech), implement
 * SpeechToTextProvider and have clients stream audio chunks to it instead. The rest of the
 * system only consumes TranscriptSegment text, so feedback generation does not change.
 */

export interface TranscriptSegment {
  userId: string;
  text: string;
  startedAt: Date;
  endedAt: Date;
  confidence: number | null;
}

export interface SpeechToTextProvider {
  readonly name: string;
  /** Whether this provider can produce trustworthy pronunciation assessment. */
  readonly supportsPronunciationAssessment: boolean;
  transcribe(audio: Buffer, opts: { language: string; mimeType: string }): Promise<{ text: string; confidence: number | null }>;
}

export const SPEECH_MODE = "browser" as const;

/**
 * Pronunciation capability of the active pipeline. The browser recognizer exposes only a
 * phrase-level confidence (often absent), which is not a pronunciation measure, so we do
 * not produce a pronunciation score.
 */
export function pronunciationCapability() {
  return {
    supported: false,
    note:
      "Pronunciation is not scored. The browser speech recognizer used for transcripts does not expose phoneme-level data, so any score would be a guess. A dedicated pronunciation-assessment API can be plugged into the speech layer later.",
  };
}

const MAX_SEGMENT_CHARS = 1000;
const MAX_SEGMENT_SECONDS = 120;

/** Validates and normalizes a client-reported segment. Returns null if it should be dropped. */
export function sanitizeSegment(
  input: { text: unknown; startedAt: unknown; endedAt: unknown; confidence: unknown },
  conversationStart: Date,
  now = Date.now(),
): Omit<TranscriptSegment, "userId"> | null {
  if (typeof input.text !== "string") return null;
  const text = input.text.replace(/\s+/g, " ").trim().slice(0, MAX_SEGMENT_CHARS);
  if (!text) return null;

  let endedAt = typeof input.endedAt === "number" ? input.endedAt : now;
  let startedAt = typeof input.startedAt === "number" ? input.startedAt : endedAt;
  // Client clocks can't be trusted: clamp into [conversationStart, now].
  endedAt = Math.min(Math.max(endedAt, conversationStart.getTime()), now);
  startedAt = Math.min(Math.max(startedAt, conversationStart.getTime(), endedAt - MAX_SEGMENT_SECONDS * 1000), endedAt);

  const confidence =
    typeof input.confidence === "number" && input.confidence > 0 && input.confidence <= 1 ? input.confidence : null;

  return { text, startedAt: new Date(startedAt), endedAt: new Date(endedAt), confidence };
}
