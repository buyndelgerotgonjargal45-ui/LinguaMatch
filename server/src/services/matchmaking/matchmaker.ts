import type { CefrLevel } from "@linguamatch/shared";
import { env } from "../../config/env";
import { MatchQueue } from "../../models/MatchQueue";
import { User, activeLanguageProfile, isOnboarded, isSuspended } from "../../models/User";
import { getIO, userRoom } from "../../socket/io";
import { DEFAULT_MATCH_OPTIONS, findMatches, type MatchOptions, type MatchPair, type QueueEntry } from "./algorithm";

interface LiveEntry extends QueueEntry {
  queueDocId: string;
}

export class QueueError extends Error {}

type MatchHandler = (pair: MatchPair) => Promise<string>;

/**
 * In-memory matchmaking queue for a single server process. Each entry is mirrored to the
 * MatchQueue collection. To scale horizontally, move `entries` into Redis and run `tick`
 * on one leader instance.
 */
export class Matchmaker {
  private entries = new Map<string, LiveEntry>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private onMatch: MatchHandler,
    private opts: MatchOptions = {
      ...DEFAULT_MATCH_OPTIONS,
      maxLevelDistance: env.MATCH_MAX_LEVEL_DISTANCE,
      expandAfterSeconds: env.MATCH_EXPAND_AFTER_SECONDS,
      recentPartnerWindow: env.MATCH_RECENT_PARTNER_WINDOW,
    },
  ) {}

  start(intervalMs = 1000) {
    this.timer ??= setInterval(() => void this.tick(), intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  isWaiting(userId: string) {
    return this.entries.has(userId);
  }

  async join(userId: string, socketId: string, targetLanguage: string): Promise<LiveEntry> {
    const user = await User.findById(userId);
    if (!user) throw new QueueError("Account not found");
    if (!isOnboarded(user)) throw new QueueError("Finish setting up your languages first");
    if (isSuspended(user)) throw new QueueError("Your account is temporarily suspended from matching");

    const profile = activeLanguageProfile(user, targetLanguage);
    if (!profile) throw new QueueError("Add this language to your profile before practicing it");

    // Re-joining (e.g. a second tab) replaces the previous entry.
    await this.leave(userId, "cancelled");

    const blockedBy = await User.find({ blockedUsers: user._id }).select("_id").lean();
    const doc = await MatchQueue.create({
      userId: user._id,
      nativeLanguage: user.nativeLanguage,
      targetLanguage,
      level: profile.level,
      status: "waiting",
    });

    const entry: LiveEntry = {
      queueDocId: doc._id.toString(),
      userId,
      socketId,
      nativeLanguage: user.nativeLanguage ?? null,
      targetLanguage,
      level: profile.level as CefrLevel,
      joinedAt: Date.now(),
      blocked: new Set([...user.blockedUsers.map(String), ...blockedBy.map((b) => String(b._id))]),
      recentPartners: user.recentPartners.map(String),
    };
    this.entries.set(userId, entry);
    this.broadcastStatus(targetLanguage);
    void this.tick();
    return entry;
  }

  async leave(userId: string, status: "cancelled" | "expired" = "cancelled") {
    const entry = this.entries.get(userId);
    if (!entry) return;
    this.entries.delete(userId);
    await MatchQueue.updateOne({ _id: entry.queueDocId, status: "waiting" }, { status, resolvedAt: new Date() });
    this.broadcastStatus(entry.targetLanguage);
  }

  waitingCount(targetLanguage: string): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.targetLanguage === targetLanguage) n++;
    return n;
  }

  private broadcastStatus(targetLanguage: string) {
    const io = getIO();
    const waiting = this.waitingCount(targetLanguage);
    for (const e of this.entries.values()) {
      if (e.targetLanguage !== targetLanguage) continue;
      io.to(userRoom(e.userId)).emit("queue:status", { waiting, targetLanguage, level: e.level });
    }
  }

  async tick() {
    if (this.ticking || this.entries.size < 2) return;
    this.ticking = true;
    try {
      const pairs = findMatches([...this.entries.values()], Date.now(), this.opts);
      for (const pair of pairs) {
        const a = this.entries.get(pair.a.userId);
        const b = this.entries.get(pair.b.userId);
        if (!a || !b) continue;
        this.entries.delete(a.userId);
        this.entries.delete(b.userId);

        try {
          const conversationId = await this.onMatch(pair);
          const resolved = { status: "matched", conversationId, levelDistance: pair.levelDistance, resolvedAt: new Date() };
          await Promise.all([
            MatchQueue.updateOne({ _id: a.queueDocId }, { ...resolved, matchedWith: b.userId }),
            MatchQueue.updateOne({ _id: b.queueDocId }, { ...resolved, matchedWith: a.userId }),
          ]);
          const io = getIO();
          io.to(userRoom(a.userId)).emit("queue:matched", { roomId: conversationId });
          io.to(userRoom(b.userId)).emit("queue:matched", { roomId: conversationId });
        } catch (err) {
          console.error("[match] Failed to create room, requeueing both users:", err);
          this.entries.set(a.userId, a);
          this.entries.set(b.userId, b);
        }
        this.broadcastStatus(a.targetLanguage);
      }
    } finally {
      this.ticking = false;
    }
  }
}
