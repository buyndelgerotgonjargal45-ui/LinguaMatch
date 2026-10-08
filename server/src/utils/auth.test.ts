import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

// env.ts validates process.env on import, so configure it before loading the modules under test.
const SECRET = "test-secret-that-is-at-least-32-characters-long";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = SECRET;
process.env.CLIENT_ORIGIN = "https://linguamatch.vercel.app, https://preview.example.com/";
const { signAccessToken, signRefreshToken, verifyToken } = await import("./auth");
const { isAllowedOrigin } = await import("../config/env");

test("a fresh access token verifies", () => {
  const { token, expiresAt } = signAccessToken("user1");
  assert.deepEqual(verifyToken(token, "access"), { ok: true, userId: "user1" });
  assert.ok(expiresAt > Date.now());
});

test("refresh and access tokens are not interchangeable", () => {
  assert.deepEqual(verifyToken(signRefreshToken("user1"), "access"), { ok: false, reason: "wrong_type" });
  assert.deepEqual(verifyToken(signAccessToken("user1").token, "refresh"), { ok: false, reason: "wrong_type" });
});

test("failure reasons: missing, expired, invalid signature, malformed", () => {
  assert.deepEqual(verifyToken(undefined, "access"), { ok: false, reason: "missing" });
  const expired = jwt.sign({ sub: "user1", typ: "access", exp: Math.floor(Date.now() / 1000) - 10 }, SECRET);
  assert.deepEqual(verifyToken(expired, "access"), { ok: false, reason: "expired" });
  const foreign = jwt.sign({ sub: "user1", typ: "access" }, "a-different-secret-of-sufficient-length!!");
  assert.deepEqual(verifyToken(foreign, "access"), { ok: false, reason: "invalid_signature" });
  assert.deepEqual(verifyToken("not-a-jwt", "access"), { ok: false, reason: "malformed" });
});

test("origin allowlist: exact comma-separated origins, localhost outside production", () => {
  assert.ok(isAllowedOrigin("https://linguamatch.vercel.app"));
  assert.ok(isAllowedOrigin("https://preview.example.com"));
  assert.ok(isAllowedOrigin("http://localhost:3000"));
  assert.ok(isAllowedOrigin(undefined));
  assert.ok(!isAllowedOrigin("https://evil.example.com"));
  assert.ok(!isAllowedOrigin("https://linguamatch.vercel.app.evil.com"));
});
