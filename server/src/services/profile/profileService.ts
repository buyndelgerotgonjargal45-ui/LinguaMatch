import type { CefrLevel, FeedbackStatus, ProfileStats } from "@linguamatch/shared";
import { Conversation, conversationDurationSeconds } from "../../models/Conversation";
import { ConversationFeedback } from "../../models/ConversationFeedback";
import type { UserDoc } from "../../models/User";

type TrendMetric = ProfileStats["languages"][number]["trend"][number]["metric"];
const METRIC_FIELDS: [TrendMetric, "fluencyScore" | "grammarScore" | "vocabularyScore" | "overallScore"][] = [
  ["fluency", "fluencyScore"],
  ["grammar", "grammarScore"],
  ["vocabulary", "vocabularyScore"],
  ["overall", "overallScore"],
];

const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

export async function buildProfileStats(user: UserDoc): Promise<ProfileStats> {
  const [conversations, feedback] = await Promise.all([
    Conversation.find({ "participants.userId": user._id, status: "ended" })
      .sort({ startTime: -1 })
      .select("targetLanguage startTime endTime participants.joinedAt")
      .lean(),
    ConversationFeedback.find({ userId: user._id }).sort({ createdAt: 1 }).lean(),
  ]);
  const completed = conversations.filter((c) => c.participants.every((p) => p.joinedAt));
  const feedbackByConversation = new Map(feedback.map((f) => [f.conversationId.toString(), f]));

  const languages = user.targetLanguages.map((t) => {
    const convs = completed.filter((c) => c.targetLanguage === t.language);
    const ready = feedback.filter((f) => f.targetLanguage === t.language && f.status === "ready");
    // Compare the average of the first few reports with the latest few, once there are at least two.
    const window = Math.min(3, Math.floor(ready.length / 2));
    const trend =
      window > 0
        ? METRIC_FIELDS.flatMap(([metric, field]) => {
            const values = ready.map((f) => f[field]).filter((v): v is number => typeof v === "number");
            if (values.length < 2) return [];
            return [{ metric, first: avg(values.slice(0, window)), latest: avg(values.slice(-window)) }];
          })
        : [];
    return {
      language: t.language,
      level: t.level as CefrLevel,
      estimatedPerformance: t.estimatedPerformance ?? null,
      conversations: convs.length,
      practiceSeconds: convs.reduce((sum, c) => sum + conversationDurationSeconds(c), 0),
      trend,
    };
  });

  const stats = user.statistics;
  return {
    username: user.username,
    nativeLanguage: user.nativeLanguage ?? null,
    memberSince: (user.get("createdAt") as Date).toISOString(),
    totals: {
      conversations: stats?.conversations ?? 0,
      practiceSeconds: stats?.practiceSeconds ?? 0,
      averageScore: stats?.scoredConversations ? Math.round(stats.scoreSum / stats.scoredConversations) : null,
    },
    languages,
    recent: completed.slice(0, 10).map((c) => {
      const f = feedbackByConversation.get(c._id.toString());
      return {
        conversationId: c._id.toString(),
        targetLanguage: c.targetLanguage,
        endedAt: c.endTime?.toISOString() ?? null,
        durationSeconds: conversationDurationSeconds(c),
        overallScore: f?.overallScore ?? null,
        status: (f?.status ?? "pending") as FeedbackStatus,
      };
    }),
  };
}
