import { getTargetLanguage, type FluencyMetrics } from "@linguamatch/shared";

interface Segment {
  text: string;
  startedAt: Date;
  endedAt: Date;
  confidence?: number | null;
}

/**
 * Common hesitation markers per language. Speech recognizers frequently drop fillers like
 * "um"/"uh" from transcripts, so counts are a lower bound — the UI says so.
 */
const FILLERS: Record<string, string[]> = {
  en: ["um", "uh", "er", "erm", "ah", "hmm", "you know", "i mean", "kind of", "sort of"],
  es: ["eh", "este", "pues", "o sea", "bueno", "em"],
  fr: ["euh", "ben", "bah", "genre", "tu vois", "du coup"],
  de: ["äh", "ähm", "halt", "sozusagen", "quasi"],
  it: ["ehm", "cioè", "tipo", "allora", "insomma"],
  pt: ["tipo", "né", "então", "assim", "hum"],
  ja: ["えーと", "えっと", "あのー", "あの", "まあ", "なんか"],
  ko: ["음", "어", "그니까", "그러니까", "저기", "뭐"],
  zh: ["嗯", "那个", "就是", "然后", "这个"],
  ru: ["э", "ну", "типа", "как бы", "вот", "короче"],
};

const PUNCT = /[\p{P}\p{S}]/gu;
const MIN_SEGMENT_SECONDS = 0.5;
const MAX_SEGMENT_SECONDS = 60;

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(PUNCT, " ").split(/\s+/).filter(Boolean);
}

function countPhrase(haystack: string, phrase: string, unspaced: boolean): number {
  if (unspaced) return haystack.split(phrase).length - 1;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (haystack.match(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu")) ?? []).length;
}

export function computeFluencyMetrics(language: string, segments: Segment[]): FluencyMetrics {
  const unspaced = Boolean(getTargetLanguage(language)?.unspaced);
  const unit = unspaced ? "characters" : "words";

  let wordCount = 0;
  let speakingSeconds = 0;
  const tokenFreq = new Map<string, number>();
  const repeats = new Map<string, number>();
  const fillerCounts: Record<string, number> = {};

  // Longest fillers first so "あのー" is not also counted as "あの".
  const fillers = [...(FILLERS[language] ?? [])].sort((a, b) => b.length - a.length);

  for (const seg of segments) {
    const duration = (seg.endedAt.getTime() - seg.startedAt.getTime()) / 1000;
    speakingSeconds += Math.min(Math.max(duration, MIN_SEGMENT_SECONDS), MAX_SEGMENT_SECONDS);

    let lowered = seg.text.toLowerCase();
    for (const filler of fillers) {
      const n = countPhrase(lowered, filler, unspaced);
      if (n > 0) {
        fillerCounts[filler] = (fillerCounts[filler] ?? 0) + n;
        lowered = unspaced ? lowered.split(filler).join(" ") : lowered;
      }
    }

    if (unspaced) {
      wordCount += seg.text.replace(PUNCT, "").replace(/\s+/g, "").length;
      continue;
    }

    const tokens = tokenize(seg.text);
    wordCount += tokens.length;
    tokens.forEach((tok, i) => {
      if (tok.length >= 4) tokenFreq.set(tok, (tokenFreq.get(tok) ?? 0) + 1);
      if (i > 0 && tokens[i - 1] === tok) repeats.set(tok, (repeats.get(tok) ?? 0) + 1);
    });
  }

  const totalFillers = Object.values(fillerCounts).reduce((a, b) => a + b, 0);
  const sortDesc = (m: Map<string, number>, min: number) =>
    [...m.entries()]
      .filter(([, c]) => c >= min)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([word, count]) => ({ word, count }));

  return {
    wordCount,
    unit,
    speakingSeconds: Math.round(speakingSeconds),
    ratePerMinute: speakingSeconds >= 10 ? (wordCount / speakingSeconds) * 60 : null,
    utteranceCount: segments.length,
    averageUtteranceLength: segments.length ? wordCount / segments.length : 0,
    fillerCounts,
    totalFillers,
    repeatedWords: sortDesc(repeats, 1),
    overusedWords: sortDesc(tokenFreq, 3),
    lowConfidenceUtterances: segments
      .filter((s) => s.confidence != null && s.confidence < 0.6)
      .slice(0, 5)
      .map((s) => s.text),
  };
}

/** Below this, a report would be mostly guesswork, so we say so instead of generating one. */
export function hasEnoughSpeech(m: FluencyMetrics): boolean {
  return m.unit === "characters" ? m.wordCount >= 40 : m.wordCount >= 25;
}
