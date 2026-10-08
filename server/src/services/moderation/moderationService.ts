import type { ReportReason } from "@linguamatch/shared";
import { Types } from "mongoose";
import { env } from "../../config/env";
import { Conversation } from "../../models/Conversation";
import { Report } from "../../models/Report";
import { User } from "../../models/User";
import { HttpError } from "../../utils/http";
import { endConversation } from "../rooms/roomService";

const SUSPENSION_HOURS = 24;

/**
 * Reports and blocks are addressed by conversation, never by user id, so the client
 * never learns a stranger's account identifier.
 */
async function partnerIn(conversationId: string, userId: string) {
  if (!Types.ObjectId.isValid(conversationId)) throw new HttpError(404, "Conversation not found");
  const conversation = await Conversation.findById(conversationId).select("participants status");
  const me = conversation?.participants.find((p) => p.userId.toString() === userId);
  const partner = conversation?.participants.find((p) => p.userId.toString() !== userId);
  if (!conversation || !me || !partner) throw new HttpError(404, "Conversation not found");
  return { conversation, partnerId: partner.userId };
}

export async function blockPartner(userId: string, conversationId: string) {
  const { conversation, partnerId } = await partnerIn(conversationId, userId);
  await User.updateOne({ _id: userId }, { $addToSet: { blockedUsers: partnerId } });
  if (conversation.status === "active") await endConversation(conversationId, userId, "blocked");
}

export async function reportPartner(userId: string, conversationId: string, reason: ReportReason, details: string) {
  const { conversation, partnerId } = await partnerIn(conversationId, userId);
  try {
    await Report.create({ reporterId: userId, reportedUserId: partnerId, conversationId, reason, details });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new HttpError(409, "You already reported this conversation");
    throw err;
  }
  // Reporting always blocks too: you should never be matched with someone you reported.
  await User.updateOne({ _id: userId }, { $addToSet: { blockedUsers: partnerId } });
  if (conversation.status === "active") await endConversation(conversationId, userId, "reported");
  await applyAutomaticModeration(partnerId);
}

/** Temporarily suspends users who are reported by several different people within a day. */
async function applyAutomaticModeration(userId: Types.ObjectId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const reporters = await Report.distinct("reporterId", { reportedUserId: userId, createdAt: { $gte: since } });
  if (reporters.length < env.MODERATION_AUTO_SUSPEND_REPORTS) return;
  await User.updateOne(
    { _id: userId, "moderation.status": { $ne: "banned" } },
    {
      $set: {
        "moderation.status": "suspended",
        "moderation.suspendedUntil": new Date(Date.now() + SUSPENSION_HOURS * 3600 * 1000),
        "moderation.reason": `Automatically suspended after ${reporters.length} reports in 24 hours, pending review`,
      },
    },
  );
  console.warn(`[moderation] User ${userId} auto-suspended after ${reporters.length} reports`);
}

export async function unblockUser(userId: string, blockedId: string) {
  await User.updateOne({ _id: userId }, { $pull: { blockedUsers: blockedId } });
}
