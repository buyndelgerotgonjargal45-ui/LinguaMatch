import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeSegment } from "../speech";
import { computeFluencyMetrics, hasEnoughSpeech } from "./metrics";

const seg = (text: string, startSec: number, endSec: number, confidence: number | null = 0.9) => ({
  text,
  startedAt: new Date(startSec * 1000),
  endedAt: new Date(endSec * 1000),
  confidence,
});

describe("computeFluencyMetrics", () => {
  it("counts words, fillers, repetitions and rate for English", () => {
    const m = computeFluencyMetrics("en", [
      seg("um I think I I agree with you you know", 0, 4),
      seg("uh the city is good and the food is good and people are good", 5, 11, 0.4),
    ]);
    assert.equal(m.unit, "words");
    assert.equal(m.wordCount, 24);
    assert.equal(m.fillerCounts.um, 1);
    assert.equal(m.fillerCounts.uh, 1);
    assert.equal(m.fillerCounts["you know"], 1);
    assert.equal(m.totalFillers, 3);
    assert.deepEqual(m.repeatedWords.map((r) => r.word), ["i", "you"]);
    assert.deepEqual(m.overusedWords[0], { word: "good", count: 3 });
    assert.equal(m.speakingSeconds, 10);
    assert.equal(Math.round(m.ratePerMinute!), 144);
    assert.deepEqual(m.lowConfidenceUtterances, ["uh the city is good and the food is good and people are good"]);
  });

  it("does not count fillers inside other words", () => {
    const m = computeFluencyMetrics("en", [seg("the user was eager to umpire", 0, 3)]);
    assert.equal(m.totalFillers, 0);
  });

  it("counts characters for Japanese and avoids double-counting nested fillers", () => {
    const m = computeFluencyMetrics("ja", [seg("あのー、今日は天気がいいですね", 0, 3)]);
    assert.equal(m.unit, "characters");
    assert.equal(m.fillerCounts["あのー"], 1);
    assert.equal(m.fillerCounts["あの"], undefined);
    assert.equal(m.wordCount, 14);
  });

  it("flags too little speech", () => {
    assert.equal(hasEnoughSpeech(computeFluencyMetrics("en", [seg("hello how are you", 0, 2)])), false);
  });
});

describe("sanitizeSegment", () => {
  const start = new Date(1_000_000);
  it("clamps client timestamps into the conversation window", () => {
    const s = sanitizeSegment({ text: "  hi   there ", startedAt: 0, endedAt: 9_999_999_999, confidence: 2 }, start, 1_010_000)!;
    assert.equal(s.text, "hi there");
    assert.equal(s.endedAt.getTime(), 1_010_000);
    assert.equal(s.startedAt.getTime(), 1_000_000);
    assert.equal(s.confidence, null);
  });

  it("drops empty or non-string text", () => {
    assert.equal(sanitizeSegment({ text: "   ", startedAt: 0, endedAt: 0, confidence: null }, start), null);
    assert.equal(sanitizeSegment({ text: 42, startedAt: 0, endedAt: 0, confidence: null }, start), null);
  });
});
