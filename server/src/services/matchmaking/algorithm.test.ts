import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CefrLevel } from "@linguamatch/shared";
import { allowedLevelDistance, findMatches, type MatchOptions, type QueueEntry } from "./algorithm";

const NOW = 1_000_000;
const OPTS: MatchOptions = { maxLevelDistance: 1, expandAfterSeconds: 10, recentPartnerWindow: 3, recentPartnerGraceSeconds: 60 };

function entry(userId: string, level: CefrLevel, waitedSec = 0, extra: Partial<QueueEntry> = {}): QueueEntry {
  return {
    userId,
    socketId: `s-${userId}`,
    nativeLanguage: "mn",
    targetLanguage: "en",
    level,
    joinedAt: NOW - waitedSec * 1000,
    blocked: new Set(),
    recentPartners: [],
    ...extra,
  };
}

const ids = (pairs: ReturnType<typeof findMatches>) => pairs.map((p) => [p.a.userId, p.b.userId].sort().join("-")).sort();

describe("findMatches", () => {
  it("matches same language and exact level", () => {
    assert.deepEqual(ids(findMatches([entry("a", "B1"), entry("b", "B1")], NOW, OPTS)), ["a-b"]);
  });

  it("never matches a user with themselves", () => {
    assert.equal(findMatches([entry("a", "B1"), entry("a", "B1")], NOW, OPTS).length, 0);
  });

  it("does not match different target languages", () => {
    assert.equal(findMatches([entry("a", "B1"), entry("b", "B1", 0, { targetLanguage: "ja" })], NOW, OPTS).length, 0);
  });

  it("ignores native language entirely", () => {
    const pairs = findMatches([entry("a", "B1", 0, { nativeLanguage: "ko" }), entry("b", "B1", 0, { nativeLanguage: "mn" })], NOW, OPTS);
    assert.equal(pairs.length, 1);
  });

  it("waits before accepting an adjacent level, then expands", () => {
    assert.equal(findMatches([entry("a", "B1", 2), entry("b", "B2", 1)], NOW, OPTS).length, 0);
    assert.equal(findMatches([entry("a", "B1", 12), entry("b", "B2", 1)], NOW, OPTS).length, 1);
  });

  it("never exceeds the max level distance", () => {
    assert.equal(findMatches([entry("a", "A2", 600), entry("b", "B2", 600)], NOW, OPTS).length, 0);
    assert.equal(allowedLevelDistance(entry("a", "A2", 600), NOW, OPTS), 1);
  });

  it("prefers an exact level over an adjacent one", () => {
    const pairs = findMatches([entry("a", "B1", 30), entry("b", "B2", 20), entry("c", "B1", 5)], NOW, OPTS);
    assert.deepEqual(ids(pairs), ["a-c"]);
  });

  it("respects blocks in both directions", () => {
    assert.equal(findMatches([entry("a", "B1", 0, { blocked: new Set(["b"]) }), entry("b", "B1")], NOW, OPTS).length, 0);
    assert.equal(findMatches([entry("a", "B1"), entry("b", "B1", 0, { blocked: new Set(["a"]) })], NOW, OPTS).length, 0);
  });

  it("never rematches the most recent partner, even after a long wait", () => {
    const pairs = findMatches([entry("a", "B1", 300, { recentPartners: ["b"] }), entry("b", "B1", 300)], NOW, OPTS);
    assert.equal(pairs.length, 0);
  });

  it("avoids older recent partners until both have waited past the grace period", () => {
    const recent = { recentPartners: ["x", "b"] };
    assert.equal(findMatches([entry("a", "B1", 5, recent), entry("b", "B1", 5)], NOW, OPTS).length, 0);
    assert.equal(findMatches([entry("a", "B1", 61, recent), entry("b", "B1", 61)], NOW, OPTS).length, 1);
  });

  it("pairs everyone it can and removes matched users from consideration", () => {
    const pairs = findMatches([entry("a", "B1", 4), entry("b", "B1", 3), entry("c", "B1", 2), entry("d", "B1", 1)], NOW, OPTS);
    assert.equal(pairs.length, 2);
    assert.deepEqual(ids(pairs), ["a-b", "c-d"]);
  });
});
