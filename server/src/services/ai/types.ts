import type {
  AssessmentQuestion,
  AssessmentResult,
  CefrLevel,
  Exercise,
  FluencyMetrics,
  Mistake,
  Topic,
  VocabularySuggestion,
} from "@linguamatch/shared";

export interface TopicRequest {
  targetLanguage: string;
  level: CefrLevel;
  /** Titles already used in this room and recently by these users — must not repeat. */
  previousTopics: string[];
  /** Minutes the pair has been talking; later topics can go deeper. */
  minutesElapsed: number;
  interests?: string[];
}

export interface AssessmentRequest {
  targetLanguage: string;
  nativeLanguage: string | null;
  selfReportedLevel: CefrLevel | null;
}

export interface AssessmentEvaluationRequest {
  targetLanguage: string;
  questions: AssessmentQuestion[];
  answers: { questionId: string; answer: string }[];
}

export interface Utterance {
  text: string;
  /** Seconds from conversation start. */
  offsetSeconds: number;
  confidence: number | null;
}

export interface ConversationAnalysisRequest {
  targetLanguage: string;
  nativeLanguage: string | null;
  level: CefrLevel;
  topics: string[];
  /** Only this learner's own utterances. The partner's speech is never sent for someone else's report. */
  utterances: Utterance[];
  /** Deterministic metrics computed from the transcript before calling the model. */
  metrics: FluencyMetrics;
}

export interface ConversationAnalysis {
  estimatedPerformance: string;
  grammarScore: number;
  vocabularyScore: number;
  fluencyScore: number;
  summary: string;
  mistakes: Mistake[];
  vocabularySuggestions: VocabularySuggestion[];
  fluencyNotes: string[];
  strengths: string[];
  weaknesses: string[];
  exercises: Exercise[];
}

/**
 * Provider-agnostic AI interface. Swap the implementation in ./index.ts to change vendors;
 * nothing outside this folder imports a vendor SDK.
 *
 * Speech-to-text is deliberately NOT part of this interface — see services/speech.
 */
export interface AIProvider {
  readonly name: string;
  generateTopic(req: TopicRequest): Promise<Topic>;
  createAssessment(req: AssessmentRequest): Promise<AssessmentQuestion[]>;
  evaluateAssessment(req: AssessmentEvaluationRequest): Promise<AssessmentResult>;
  /** Grammar, vocabulary, sentence-structure and fluency analysis plus feedback and exercises. */
  analyzeConversation(req: ConversationAnalysisRequest): Promise<ConversationAnalysis>;
}

export class AIUnavailableError extends Error {
  constructor(message = "AI features are not configured. Set ANTHROPIC_API_KEY in .env.") {
    super(message);
  }
}

export class AIResponseError extends Error {}
