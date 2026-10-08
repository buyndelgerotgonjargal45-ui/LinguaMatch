import { levelDistance, type CefrLevel } from "@linguamatch/shared";

export interface QueueEntry {
  userId: string;
  socketId: string;
  nativeLanguage: string | null;
  targetLanguage: string;
  level: CefrLevel;
  /** Epoch ms when the user entered the queue. */
  joinedAt: number;
  /** Users this person blocked or was blocked by. Never matched. */
  blocked: ReadonlySet<string>;
  /** Most recent partner first. */
  recentPartners: readonly string[];
}

export interface MatchOptions {
  /** Hard cap on CEFR distance, even after expanding. */
  maxLevelDistance: number;
  /** Each step of level tolerance unlocks after this many more seconds of waiting. */
  expandAfterSeconds: number;
  /** How many recent partners to avoid. The single most recent partner is always avoided. */
  recentPartnerWindow: number;
  /** After waiting this long, older recent partners (not the last one) become acceptable. */
  recentPartnerGraceSeconds: number;
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  maxLevelDistance: 1,
  expandAfterSeconds: 10,
  recentPartnerWindow: 3,
  recentPartnerGraceSeconds: 60,
};

export interface MatchPair {
  a: QueueEntry;
  b: QueueEntry;
  levelDistance: number;
}

function waitedSeconds(entry: QueueEntry, now: number): number {
  return Math.max(0, (now - entry.joinedAt) / 1000);
}

/** Level tolerance grows with waiting time: exact first, then ±1 after `expandAfterSeconds`, etc. */
export function allowedLevelDistance(entry: QueueEntry, now: number, opts: MatchOptions): number {
  if (opts.expandAfterSeconds <= 0) return opts.maxLevelDistance;
  const steps = Math.floor(waitedSeconds(entry, now) / opts.expandAfterSeconds);
  return Math.min(steps, opts.maxLevelDistance);
}

function isRecent(entry: QueueEntry, other: QueueEntry, opts: MatchOptions): { last: boolean; recent: boolean } {
  const window = entry.recentPartners.slice(0, Math.max(1, opts.recentPartnerWindow));
  return { last: entry.recentPartners[0] === other.userId, recent: window.includes(other.userId) };
}

/** Returns the level distance if a and b may be paired now, otherwise null. */
export function compatibility(a: QueueEntry, b: QueueEntry, now: number, opts: MatchOptions): number | null {
  if (a.userId === b.userId) return null;
  if (a.targetLanguage !== b.targetLanguage) return null;
  if (a.blocked.has(b.userId) || b.blocked.has(a.userId)) return null;

  const distance = levelDistance(a.level, b.level);
  // The longer-waiting user's expanded tolerance governs, so patience is rewarded.
  const tolerance = Math.max(allowedLevelDistance(a, now, opts), allowedLevelDistance(b, now, opts));
  if (distance > tolerance) return null;

  const ra = isRecent(a, b, opts);
  const rb = isRecent(b, a, opts);
  if (ra.last || rb.last) return null;
  if (ra.recent || rb.recent) {
    const bothPatient =
      waitedSeconds(a, now) >= opts.recentPartnerGraceSeconds && waitedSeconds(b, now) >= opts.recentPartnerGraceSeconds;
    if (!bothPatient) return null;
  }
  return distance;
}

/**
 * Greedy pairing, oldest entry first. For each entry the best partner is the one with the
 * smallest level distance, then not-a-recent-partner, then the longest wait.
 * Native language / nationality is never a factor.
 */
export function findMatches(entries: QueueEntry[], now: number, opts: MatchOptions = DEFAULT_MATCH_OPTIONS): MatchPair[] {
  const byAge = [...entries].sort((x, y) => x.joinedAt - y.joinedAt);
  const taken = new Set<string>();
  const pairs: MatchPair[] = [];

  for (const a of byAge) {
    if (taken.has(a.userId)) continue;
    let best: { entry: QueueEntry; distance: number; recent: boolean } | null = null;

    for (const b of byAge) {
      if (b === a || taken.has(b.userId)) continue;
      const distance = compatibility(a, b, now, opts);
      if (distance === null) continue;
      const recent = isRecent(a, b, opts).recent || isRecent(b, a, opts).recent;
      const better =
        !best ||
        distance < best.distance ||
        (distance === best.distance && !recent && best.recent) ||
        (distance === best.distance && recent === best.recent && b.joinedAt < best.entry.joinedAt);
      if (better) best = { entry: b, distance, recent };
    }

    if (best) {
      taken.add(a.userId);
      taken.add(best.entry.userId);
      pairs.push({ a, b: best.entry, levelDistance: best.distance });
    }
  }
  return pairs;
}
