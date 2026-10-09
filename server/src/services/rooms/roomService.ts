import {
  lowerLevel,
  type CefrLevel,
  type RoomEndReason,
  type SignalPayload,
  type Topic,
  type TranscriptSegmentInput,
} from "@linguamatch/shared";
import { iceServers } from "../../config/env";
import { Conversation, conversationDurationSeconds, type ConversationDoc } from "../../models/Conversation";
import { User } from "../../models/User";
import { conversationRoom, getIO, userRoom, type AppSocket } from "../../socket/io";
import { generateConversationFeedback } from "../feedback/feedbackService";
import type { MatchPair } from "../matchmaking/algorithm";
import { sanitizeSegment } from "../speech";
import { pickRandomTopic } from "../topics/topicBank";

const RECONNECT_GRACE_MS = 20_000;
const JOIN_TIMEOUT_MS = 45_000;
const TOPIC_COOLDOWN_MS = 2_000;
const MIN_SEGMENT_INTERVAL_MS = 250;
const MAX_SEGMENTS_PER_CONVERSATION = 3000;

interface RoomState {
  sockets: Map<string, string>;
  timers: Map<string, NodeJS.Timeout>;
  topicLoading: boolean;
  /** Last topic error, replayed to people who join after it was sent. */
  topicError: string | null;
  lastTopicRequestAt: number;
  segmentCount: number;
  lastSegmentAt: Map<string, number>;
}

const rooms = new Map<string, RoomState>();

function roomState(conversationId: string): RoomState {
  let state = rooms.get(conversationId);
  if (!state) {
    state = {
      sockets: new Map(),
      timers: new Map(),
      topicLoading: false,
      topicError: null,
      lastTopicRequestAt: 0,
      segmentCount: 0,
      lastSegmentAt: new Map(),
    };
    rooms.set(conversationId, state);
  }
  return state;
}

function clearTimer(state: RoomState, key: string) {
  const t = state.timers.get(key);
  if (t) clearTimeout(t);
  state.timers.delete(key);
}

async function loadActiveConversationFor(conversationId: string, userId: string): Promise<ConversationDoc | null> {
  if (!/^[a-f0-9]{24}$/i.test(conversationId)) return null;
  const c = await Conversation.findById(conversationId);
  if (!c || c.status !== "active") return null;
  return c.participants.some((p) => p.userId.toString() === userId) ? c : null;
}

export async function createConversationFromMatch(pair: MatchPair): Promise<string> {
  const users = await User.find({ _id: { $in: [pair.a.userId, pair.b.userId] } });
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const participants = [pair.a, pair.b].map((entry) => {
    const u = byId.get(entry.userId);
    if (!u) throw new Error(`User ${entry.userId} disappeared during matching`);
    return {
      userId: u._id,
      displayName: u.username,
      nativeLanguage: u.nativeLanguage,
      level: entry.level,
      transcriptionConsent: Boolean(u.privacy?.transcriptionConsent),
    };
  });

  const conversation = await Conversation.create({ participants, targetLanguage: pair.a.targetLanguage, status: "active" });
  const id = conversation._id.toString();

  await Promise.all([
    User.updateOne({ _id: pair.a.userId }, { $push: { recentPartners: { $each: [pair.b.userId], $position: 0, $slice: 10 } } }),
    User.updateOne({ _id: pair.b.userId }, { $push: { recentPartners: { $each: [pair.a.userId], $position: 0, $slice: 10 } } }),
  ]);

  const state = roomState(id);
  // If someone never shows up in the room (closed the tab mid-match), don't leave the other hanging.
  state.timers.set(
    "join",
    setTimeout(() => {
      const absent = participants.find((p) => !state.sockets.has(p.userId.toString()));
      void endConversation(id, absent?.userId.toString() ?? null, "partner_left");
    }, JOIN_TIMEOUT_MS),
  );
  void generateTopic(id);
  return id;
}

export async function joinRoom(socket: AppSocket, conversationId: string) {
  const userId = socket.data.userId;
  const conversation = await loadActiveConversationFor(conversationId, userId);
  if (!conversation) {
    socket.emit("room:error", { message: "This conversation has ended or doesn't exist." });
    return;
  }

  const state = roomState(conversationId);
  clearTimer(state, `disconnect:${userId}`);
  state.sockets.set(userId, socket.id);
  await socket.join(conversationRoom(conversationId));

  await Conversation.updateOne(
    { _id: conversationId, "participants.userId": userId, "participants.joinedAt": null },
    { $set: { "participants.$.joinedAt": new Date() } },
  );

  const allPresent = conversation.participants.every((p) => state.sockets.has(p.userId.toString()));
  if (!allPresent) {
    socket.emit("room:waiting-partner");
    return;
  }
  clearTimer(state, "join");

  // (Re)start the call for both sides. On a refresh this also resets the other peer's connection.
  const io = getIO();
  const topic = latestTopic(conversation);
  conversation.participants.forEach((p, index) => {
    const partner = conversation.participants[1 - index]!;
    const sid = state.sockets.get(p.userId.toString());
    if (!sid) return;
    io.to(sid).emit("room:ready", {
      roomId: conversationId,
      role: index === 0 ? "caller" : "callee",
      partner: {
        displayName: partner.displayName,
        nativeLanguage: partner.nativeLanguage ?? null,
        level: partner.level as CefrLevel,
      },
      targetLanguage: conversation.targetLanguage,
      yourLevel: p.level as CefrLevel,
      startedAt: conversation.startTime.toISOString(),
      topic,
      iceServers: iceServers(),
    });
  });
  // The first topic is generated at match time, before anyone is in the room, so replay its state.
  io.to(conversationRoom(conversationId)).emit("topic:update", {
    topic,
    loading: state.topicLoading,
    ...(state.topicError && { error: state.topicError }),
  });
}

export function handleSocketDisconnect(socket: AppSocket) {
  const userId = socket.data.userId;
  for (const [conversationId, state] of rooms) {
    if (state.sockets.get(userId) !== socket.id) continue;
    state.sockets.delete(userId);
    socket.to(conversationRoom(conversationId)).emit("room:waiting-partner");
    state.timers.set(
      `disconnect:${userId}`,
      setTimeout(() => void endConversation(conversationId, userId, "disconnected"), RECONNECT_GRACE_MS),
    );
  }
}

export async function relaySignal(socket: AppSocket, conversationId: string, data: SignalPayload) {
  const state = rooms.get(conversationId);
  const userId = socket.data.userId;
  if (!state || state.sockets.get(userId) !== socket.id) return;
  for (const [otherId, sid] of state.sockets) {
    if (otherId !== userId) getIO().to(sid).emit("signal", { data });
  }
}

export async function requestTopic(socket: AppSocket, conversationId: string) {
  const state = rooms.get(conversationId);
  if (!state || state.sockets.get(socket.data.userId) !== socket.id) return;
  if (state.topicLoading || Date.now() - state.lastTopicRequestAt < TOPIC_COOLDOWN_MS) return;
  await generateTopic(conversationId);
}

function latestTopic(c: ConversationDoc): Topic | null {
  const t = c.topics.at(-1);
  if (!t?.title) return null;
  return { title: t.title, description: t.description ?? "", questions: t.questions ?? [], level: t.level as CefrLevel };
}

/** Picks a random topic from the topic bank for the pair's level and sends it to the room. */
async function generateTopic(conversationId: string) {
  const state = roomState(conversationId);
  const io = getIO();
  const room = conversationRoom(conversationId);
  state.topicLoading = true;
  state.topicError = null;
  state.lastTopicRequestAt = Date.now();

  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || conversation.status !== "active") return;

    const [a, b] = conversation.participants;
    const level = lowerLevel(a!.level as CefrLevel, b!.level as CefrLevel);
    // Avoid repeating topics from this call and the pair's recent calls.
    const recent = await Conversation.find({
      _id: { $ne: conversation._id },
      "participants.userId": { $in: conversation.participants.map((p) => p.userId) },
    })
      .sort({ startTime: -1 })
      .limit(10)
      .select("topics.title")
      .lean();
    const used = [
      ...conversation.topics.map((t) => t.title ?? ""),
      ...recent.flatMap((c) => c.topics.map((t) => t.title ?? "")),
    ].filter(Boolean);

    const topic = pickRandomTopic(level, used, latestTopic(conversation)?.title);
    const updated = await Conversation.findOneAndUpdate(
      { _id: conversationId, status: "active" },
      { $push: { topics: { ...topic, createdAt: new Date() } } },
    );
    if (updated) io.to(room).emit("topic:update", { topic, loading: false });
  } catch (err) {
    console.error("[topic] Couldn't pick a topic:", err);
    state.topicError = "Couldn't load a topic right now. Try again in a moment.";
    io.to(room).emit("topic:update", { topic: null, loading: false, error: state.topicError });
  } finally {
    state.topicLoading = false;
  }
}

export async function addTranscriptSegment(socket: AppSocket, input: TranscriptSegmentInput) {
  const userId = socket.data.userId;
  const state = rooms.get(input.roomId);
  if (!state || state.sockets.get(userId) !== socket.id) return;
  if (state.segmentCount >= MAX_SEGMENTS_PER_CONVERSATION) return;
  const now = Date.now();
  if (now - (state.lastSegmentAt.get(userId) ?? 0) < MIN_SEGMENT_INTERVAL_MS) return;

  const conversation = await Conversation.findById(input.roomId).select("participants startTime status");
  const participant = conversation?.participants.find((p) => p.userId.toString() === userId);
  // Consent is snapshotted at match time; without it nothing is stored.
  if (!conversation || conversation.status !== "active" || !participant?.transcriptionConsent) return;

  const segment = sanitizeSegment(input, conversation.startTime, now);
  if (!segment) return;
  state.lastSegmentAt.set(userId, now);
  state.segmentCount++;
  await Conversation.updateOne(
    { _id: input.roomId, status: "active" },
    { $push: { transcript: { ...segment, userId: participant.userId } } },
  );
}

/** Ends a conversation exactly once, updates stats, notifies both users and starts feedback. */
export async function endConversation(conversationId: string, byUserId: string | null, reason: RoomEndReason) {
  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId, status: "active" },
    { $set: { status: "ended", endTime: new Date(), endReason: reason, endedBy: byUserId } },
    { new: true },
  );

  const state = rooms.get(conversationId);
  if (state) for (const key of [...state.timers.keys()]) clearTimer(state, key);
  rooms.delete(conversationId);
  if (!conversation) return;

  const duration = conversationDurationSeconds(conversation);
  const bothJoined = conversation.participants.every((p) => p.joinedAt);
  const io = getIO();

  await Promise.all(
    conversation.participants.map(async (p) => {
      const uid = p.userId.toString();
      if (bothJoined) {
        await User.updateOne(
          { _id: p.userId },
          { $inc: { "statistics.conversations": 1, "statistics.practiceSeconds": duration } },
        );
      }
      io.to(userRoom(uid)).emit("room:ended", {
        conversationId,
        reason,
        byPartner: byUserId !== null && byUserId !== uid,
      });
    }),
  );
  io.in(conversationRoom(conversationId)).socketsLeave(conversationRoom(conversationId));

  if (bothJoined) void generateConversationFeedback(conversationId);
}
