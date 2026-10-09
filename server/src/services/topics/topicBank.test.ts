import assert from "node:assert/strict";
import { test } from "node:test";
import { TOPIC_BANK, pickRandomTopic } from "./topicBank";

test("the bank has all 15 topics, each with three questions", () => {
  assert.equal(TOPIC_BANK.length, 15);
  for (const t of TOPIC_BANK) assert.equal(t.questions.length, 3, t.title);
});

test("picks a topic at the pair's exact level when one is available", () => {
  for (let i = 0; i < 50; i++) assert.equal(pickRandomTopic("B2").level, "B2");
});

test("skips topics already used and widens to nearby levels", () => {
  const c2 = pickRandomTopic("C2", ["The value of boredom"]);
  assert.equal(c2.level, "C1");
});

test("never repeats the current topic once everything has been used", () => {
  const all = TOPIC_BANK.map((t) => t.title);
  for (let i = 0; i < 50; i++) assert.notEqual(pickRandomTopic("A1", all, "My morning routine").title, "My morning routine");
});

test("the choice is random across the level's pool", () => {
  const seen = new Set(Array.from({ length: 200 }, () => pickRandomTopic("B1").title));
  assert.equal(seen.size, 5);
});
