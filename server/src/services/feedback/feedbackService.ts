import type { CefrLevel, FeedbackDTO, FluencyMetrics } from "@linguamatch/shared";
import type { Types } from "mongoose";
import { Conversation, conversationDurationSeconds, type ConversationDoc } from "../../models/Conversation";
import { ConversationFeedback, type ConversationFeedbackDoc } from "../../models/ConversationFeedback";
import { User } from "../../models/User";
import { AIResponseError, getAI, isAIConfigured } from "../ai";
import { pronunciationCapability } from "../speech";
import { computeFluencyMetrics, hasEnoughSpeech } from "./metrics";

const inFlight = new Set<string>();

/**
 * Creates one feedback document per participant and fills each in. Runs in the background
 * after a conversation ends; the feedback page polls until status leaves "pending".
 */
export async function generateConversationFeedback(conversationId: string): Promise<void> {
  if (inFlight.has(conversationId)) return;
  inFlight.add(conversationId);
  try {
    const conversation = await Conversation.findById(conversationId).select("+transcript");
    if (!conversation || conversation.status !== "ended") return;

    const results = await Promise.all(
      conversation.participants.map((p) => generateForParticipant(conversation, p.userId)),
    );

    // Transcripts exist only to produce feedback. Drop them once every report is settled,
    // unless every participant opted in to keeping them.
    if (results.every((status) => status !== "failed")) await maybePurgeTranscript(conversation);
  } finally {
    inFlight.delete(conversationId);
  }
}

async function generateForParticipant(conversation: ConversationDoc, userId: Types.ObjectId) {
  const participant = conversation.participants.find((p) => p.userId.equals(userId))!;
  const feedback = await ConversationFeedback.findOneAndUpdate(
    { conversationId: conversation._id, userId },
    {
      $setOnInsert: {
        conversationId: conversation._id,
        userId,
        targetLanguage: conversation.targetLanguage,
        level: participant.level,
        status: "pending",
      },
    },
    { upsert: true, new: true },
  );
  if (feedback.status === "ready" || feedback.status === "insufficient_data" || feedback.status === "no_consent") {
    return feedback.status;
  }

  const finish = async (status: ConversationFeedbackDoc["status"], statusMessage: string | null) => {
    feedback.status = status;
    feedback.statusMessage = statusMessage;
    await feedback.save();
    return status;
  };

  if (!participant.transcriptionConsent) {
    return finish(
      "no_consent",
      "You hadn't enabled speech transcription, so nothing you said was captured or analyzed. Turn it on in Settings to get feedback next time.",
    );
  }

  const segments = conversation.transcript.filter((s) => s.userId.equals(userId));
  const metrics = computeFluencyMetrics(conversation.targetLanguage, segments);
  feedback.metrics = metrics;

  if (!hasEnoughSpeech(metrics)) {
    return finish(
      "insufficient_data",
      segments.length === 0
        ? "No speech was transcribed for you. Your browser may not support speech recognition, or the microphone was muted."
        : `Only ${metrics.wordCount} ${metrics.unit} were transcribed — not enough for a reliable report. Try a longer conversation.`,
    );
  }

  if (!isAIConfigured()) {
    return finish("failed", "AI feedback is not configured on this server (missing ANTHROPIC_API_KEY).");
  }

  try {
    const analysis = await getAI().analyzeConversation({
      targetLanguage: conversation.targetLanguage,
      nativeLanguage: participant.nativeLanguage ?? null,
      level: participant.level as CefrLevel,
      topics: conversation.topics.map((t) => t.title ?? "").filter(Boolean),
      utterances: segments.map((s) => ({
        text: s.text,
        offsetSeconds: (s.startedAt.getTime() - conversation.startTime.getTime()) / 1000,
        confidence: s.confidence ?? null,
      })),
      metrics,
    });

    const pronunciation = pronunciationCapability();
    const scores = [analysis.grammarScore, analysis.vocabularyScore, analysis.fluencyScore];
    const overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    feedback.set({
      estimatedPerformance: analysis.estimatedPerformance,
      grammarScore: analysis.grammarScore,
      vocabularyScore: analysis.vocabularyScore,
      fluencyScore: analysis.fluencyScore,
      pronunciationScore: null,
      pronunciationNote: pronunciationNote(pronunciation.note, metrics),
      overallScore: overall,
      summary: analysis.summary,
      mistakes: analysis.mistakes,
      corrections: analysis.mistakes.map(({ original, corrected }) => ({ original, corrected })),
      vocabularySuggestions: analysis.vocabularySuggestions,
      fluencyNotes: analysis.fluencyNotes,
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      exercises: analysis.exercises,
    });
    await finish("ready", null);

    await User.updateOne(
      { _id: userId, "targetLanguages.language": conversation.targetLanguage },
      {
        $inc: { "statistics.scoredConversations": 1, "statistics.scoreSum": overall },
        $set: { "targetLanguages.$.estimatedPerformance": analysis.estimatedPerformance },
      },
    );
    return "ready" as const;
  } catch (err) {
    console.error(`[feedback] Analysis failed for conversation ${conversation._id}:`, err);
    const message =
      err instanceof AIResponseError ? err.message : "The AI service was unavailable. You can retry from this page.";
    return finish("failed", message);
  }
}

function pronunciationNote(base: string, metrics: FluencyMetrics): string {
  if (!metrics.lowConfidenceUtterances.length) return base;
  return `${base} The recognizer was unsure about ${metrics.lowConfidenceUtterances.length} of your phrases, which sometimes (not always) points to unclear pronunciation.`;
}

async function maybePurgeTranscript(conversation: ConversationDoc) {
  const users = await User.find({ _id: { $in: conversation.participants.map((p) => p.userId) } }).select("privacy");
  const everyoneRetains = users.length > 0 && users.every((u) => u.privacy?.retainTranscripts);
  if (everyoneRetains) return;
  await Conversation.updateOne({ _id: conversation._id }, { $set: { transcript: [], transcriptPurgedAt: new Date() } });
}

/** Safety net: purge transcripts of conversations that ended over a day ago (e.g. failed feedback never retried). */
export async function purgeStaleTranscripts(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const stale = await Conversation.find({ status: "ended", endTime: { $lt: cutoff }, transcriptPurgedAt: null }).select(
    "+transcript participants",
  );
  for (const c of stale) await maybePurgeTranscript(c);
}

export async function toFeedbackDTO(feedback: ConversationFeedbackDoc): Promise<FeedbackDTO> {
  const conversation = await Conversation.findById(feedback.conversationId).select("startTime endTime topics");
  return {
    id: feedback._id.toString(),
    conversationId: feedback.conversationId.toString(),
    status: feedback.status,
    statusMessage: feedback.statusMessage ?? null,
    targetLanguage: feedback.targetLanguage,
    level: feedback.level as CefrLevel,
    estimatedPerformance: feedback.estimatedPerformance ?? null,
    grammarScore: feedback.grammarScore ?? null,
    vocabularyScore: feedback.vocabularyScore ?? null,
    fluencyScore: feedback.fluencyScore ?? null,
    pronunciationScore: feedback.pronunciationScore ?? null,
    pronunciationNote: feedback.pronunciationNote ?? null,
    overallScore: feedback.overallScore ?? null,
    summary: feedback.summary ?? null,
    mistakes: feedback.mistakes.map((m) => ({
      category: (m.category ?? "grammar") as FeedbackDTO["mistakes"][number]["category"],
      original: m.original ?? "",
      corrected: m.corrected ?? "",
      explanation: m.explanation ?? "",
    })),
    vocabularySuggestions: feedback.vocabularySuggestions.map((v) => ({
      original: v.original ?? "",
      alternatives: v.alternatives ?? [],
      note: v.note ?? "",
    })),
    fluencyNotes: feedback.fluencyNotes,
    strengths: feedback.strengths,
    weaknesses: feedback.weaknesses,
    exercises: feedback.exercises.map((e) => ({
      title: e.title ?? "",
      instructions: e.instructions ?? "",
      items: e.items ?? [],
      answerKey: e.answerKey ?? [],
    })),
    metrics: (feedback.metrics as FluencyMetrics | null) ?? null,
    conversation: {
      startTime: conversation?.startTime.toISOString() ?? feedback.createdAt.toISOString(),
      endTime: conversation?.endTime?.toISOString() ?? null,
      durationSeconds: conversation ? conversationDurationSeconds(conversation) : 0,
      topics: conversation?.topics.map((t) => t.title ?? "").filter(Boolean) ?? [],
    },
    createdAt: feedback.createdAt.toISOString(),
  };
}
