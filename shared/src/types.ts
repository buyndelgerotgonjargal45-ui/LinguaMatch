import type { CefrLevel } from "./cefr";

export interface LanguageProfile {
  language: string;
  level: CefrLevel;
  /** Most recent AI-estimated performance, e.g. "B1+". Never overwrites the level automatically. */
  estimatedPerformance?: string | null;
  levelSource: "self" | "assessment";
}

export interface PrivacySettings {
  /** User agreed to live speech-to-text for feedback. Without it, no transcript is captured for them. */
  transcriptionConsent: boolean;
  /** Keep the text transcript after feedback is generated (default: delete it). */
  retainTranscripts: boolean;
}

export interface UserDTO {
  id: string;
  username: string;
  email: string;
  nativeLanguage: string | null;
  targetLanguages: LanguageProfile[];
  activeTargetLanguage: string | null;
  privacy: PrivacySettings;
  rulesAcceptedAt: string | null;
  onboarded: boolean;
}

/** What a stranger is allowed to see. Deliberately excludes ids, email and history. */
export interface PartnerInfo {
  displayName: string;
  nativeLanguage: string | null;
  level: CefrLevel;
}

export interface Topic {
  title: string;
  description: string;
  questions: string[];
  level: CefrLevel;
}

export type SignalPayload =
  | { type: "offer" | "answer"; sdp: string }
  | { type: "candidate"; candidate: RTCIceCandidateInitLike };

export interface RTCIceCandidateInitLike {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface TranscriptSegmentInput {
  roomId: string;
  text: string;
  /** Epoch ms when the recognizer started hearing this phrase. */
  startedAt: number;
  endedAt: number;
  /** Recognizer confidence 0–1 when the browser reports one. */
  confidence: number | null;
}

export type RoomEndReason = "ended" | "next" | "partner_left" | "disconnected" | "blocked" | "reported";

export interface ClientToServerEvents {
  "queue:join": (payload: { targetLanguage: string }) => void;
  "queue:leave": () => void;
  "room:join": (payload: { roomId: string }) => void;
  "room:leave": (payload: { roomId: string; reason: "ended" | "next" }) => void;
  signal: (payload: { roomId: string; data: SignalPayload }) => void;
  "topic:request": (payload: { roomId: string }) => void;
  "transcript:segment": (payload: TranscriptSegmentInput) => void;
}

export interface ServerToClientEvents {
  "queue:status": (payload: { waiting: number; targetLanguage: string; level: CefrLevel }) => void;
  "queue:matched": (payload: { roomId: string }) => void;
  "queue:error": (payload: { message: string }) => void;
  "room:ready": (payload: {
    roomId: string;
    role: "caller" | "callee";
    partner: PartnerInfo;
    targetLanguage: string;
    yourLevel: CefrLevel;
    startedAt: string;
    topic: Topic | null;
    iceServers: RTCIceServerLike[];
  }) => void;
  "room:waiting-partner": () => void;
  "room:ended": (payload: { conversationId: string; reason: RoomEndReason; byPartner: boolean }) => void;
  "room:error": (payload: { message: string }) => void;
  signal: (payload: { data: SignalPayload }) => void;
  "topic:update": (payload: { topic: Topic | null; loading: boolean; error?: string }) => void;
}

export interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface Mistake {
  category: "grammar" | "vocabulary" | "sentence_structure" | "word_choice";
  original: string;
  corrected: string;
  explanation: string;
}

export interface VocabularySuggestion {
  original: string;
  alternatives: string[];
  note: string;
}

export interface Exercise {
  title: string;
  instructions: string;
  items: string[];
  answerKey: string[];
}

export interface FluencyMetrics {
  wordCount: number;
  /** Characters are counted instead of words for unspaced languages (Japanese, Chinese). */
  unit: "words" | "characters";
  speakingSeconds: number;
  ratePerMinute: number | null;
  utteranceCount: number;
  averageUtteranceLength: number;
  fillerCounts: Record<string, number>;
  totalFillers: number;
  repeatedWords: { word: string; count: number }[];
  overusedWords: { word: string; count: number }[];
  lowConfidenceUtterances: string[];
}

export type FeedbackStatus = "pending" | "ready" | "insufficient_data" | "no_consent" | "failed";

export interface FeedbackDTO {
  id: string;
  conversationId: string;
  status: FeedbackStatus;
  statusMessage: string | null;
  targetLanguage: string;
  level: CefrLevel;
  estimatedPerformance: string | null;
  grammarScore: number | null;
  vocabularyScore: number | null;
  fluencyScore: number | null;
  /** Null when the speech pipeline cannot assess pronunciation reliably. */
  pronunciationScore: number | null;
  pronunciationNote: string | null;
  overallScore: number | null;
  summary: string | null;
  mistakes: Mistake[];
  vocabularySuggestions: VocabularySuggestion[];
  fluencyNotes: string[];
  strengths: string[];
  weaknesses: string[];
  exercises: Exercise[];
  metrics: FluencyMetrics | null;
  conversation: { startTime: string; endTime: string | null; durationSeconds: number; topics: string[] };
  createdAt: string;
}

export interface ProfileStats {
  username: string;
  nativeLanguage: string | null;
  memberSince: string;
  totals: { conversations: number; practiceSeconds: number; averageScore: number | null };
  languages: {
    language: string;
    level: CefrLevel;
    estimatedPerformance: string | null;
    conversations: number;
    practiceSeconds: number;
    trend: {
      metric: "fluency" | "grammar" | "vocabulary" | "overall";
      first: number;
      latest: number;
    }[];
  }[];
  recent: {
    conversationId: string;
    targetLanguage: string;
    endedAt: string | null;
    durationSeconds: number;
    overallScore: number | null;
    status: FeedbackStatus;
  }[];
}

export interface AssessmentQuestion {
  id: string;
  prompt: string;
  /** What the question is probing, e.g. "past tense narration". */
  focus: string;
  targetLevel: CefrLevel;
}

export interface AssessmentResult {
  level: CefrLevel;
  confidence: "low" | "medium" | "high";
  rationale: string;
  strengths: string[];
  areasToImprove: string[];
}

export const REPORT_REASONS = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "sexual", label: "Sexual or explicit content" },
  { value: "hate", label: "Hate speech" },
  { value: "minor", label: "Appears to be a minor" },
  { value: "spam", label: "Spam or advertising" },
  { value: "not_practicing", label: "Not practicing the language" },
  { value: "other", label: "Other" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
