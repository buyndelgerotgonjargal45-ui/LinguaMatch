# LinguaMatch

Omegle-style language exchange: get matched with a stranger practicing the same language at your CEFR level, talk over peer-to-peer video, and get an AI report afterwards.

> Meet a real person at your level, talk naturally, and let AI tell you exactly how to improve.

## Quick start

Requirements: Node.js 22 or newer, and Chrome or Edge (for speech-to-text).

```bash
npm install
cp .env.example .env        # then set JWT_SECRET and ANTHROPIC_API_KEY
npm run dev                 # API on :4000, web on :3000
```

- **Database:** with `USE_IN_MEMORY_DB=true` and no `MONGODB_URI`, the server starts a throwaway MongoDB. The first run downloads about 80 MB, and all data is lost when it stops. For real use, set `MONGODB_URI` (local `mongod` or Atlas).
- **AI:** without `ANTHROPIC_API_KEY` the app still runs. Topics, assessment and reports say plainly that AI isn't configured; nothing is faked.
- **Testing a match alone:** open two browser profiles (or one normal and one incognito window), create two accounts with the same target language and level, and click **Start practicing** in both.

```bash
npm test                                   # matchmaking + metrics unit tests
npm start -w server &                      # then, in another shell:
npx tsx server/scripts/smoke.ts            # two-user end-to-end run over Socket.IO
npm run typecheck && npm run build
```

## Deployment (Render + Vercel)

The API (Express + Socket.IO) needs a process that stays running, so it runs on **Render**. The web app runs on **Vercel**. Vercel proxies `/api/*` to Render, so normal API calls and the refresh cookie stay on the web app's own domain. Socket.IO connects straight to Render and authenticates with a token, not a cookie.

### How sign-in works

- **Access token:** lasts 15 minutes and is kept only in browser memory. It's sent as `Authorization: Bearer …` and in the Socket.IO handshake `auth`.
- **Refresh token:** an httpOnly cookie on `linguamatch.vercel.app` (path `/api/auth`), which reaches Render through the proxy. Because it's first-party, it works in Incognito. Each refresh extends it.
- **When the server returns 401:** the web app refreshes once and retries once, and only shows the login page if the refresh is rejected. Network errors and cold starts never sign anyone out.
- **Logging:** the server writes `[auth] http|socket rejected reason=missing|expired|invalid_signature|malformed|wrong_type|wrong_origin|unknown_user`. Tokens are never logged.

### 1. Render (API)

**New → Blueprint**, then pick this repo. `render.yaml` sets up the following (or enter it by hand under **New → Web Service**):

| Setting | Value |
|---|---|
| Runtime | Node, version 22 (`NODE_VERSION=22`) |
| Root directory | `server` |
| Build command | `cd .. && npm ci --workspace server --include-workspace-root=false` |
| Start command | `npm start` |
| Health check path | `/health` |
| Instances | 1. The matchmaking queue is in memory. |

Environment variables on Render:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `CLIENT_ORIGIN` | `https://linguamatch.vercel.app`. For preview URLs, add them comma-separated. |
| `MONGODB_URI` | Your Atlas URI. Include a database name, e.g. `…mongodb.net/linguamatch?…` |
| `JWT_SECRET` | 32+ random characters. The server refuses to start without it. |
| `ACCESS_TOKEN_TTL_MINUTES` | `15` |
| `REFRESH_TOKEN_TTL_DAYS` | `30` |
| `ANTHROPIC_API_KEY` | Optional |
| `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | Optional, recommended |

Don't set `PORT`; Render provides it. In Atlas, allow Render's outbound IPs (or `0.0.0.0/0`) under Network Access.

### 2. Vercel (web)

- **Project → Settings → General → Root Directory:** `web`. Vercel installs the npm workspaces from the repo root by itself.
- **Environment variables (Production, and Preview if you use it):**
  - `API_URL` = `https://<your-service>.onrender.com`
  - `NEXT_PUBLIC_SOCKET_URL` = `https://<your-service>.onrender.com`

  A Vercel build fails if either is missing.
- **Redeploy** after any change to these variables. `NEXT_PUBLIC_SOCKET_URL` and the `/api` proxy target are fixed at build time.

### Cold starts

Render's free plan sleeps after about 15 minutes idle and takes up to a minute to wake. While it wakes, the web app shows "Waking up the server, this can take up to a minute..." and retries with exponential backoff, for both API calls and the socket. It never treats this as an expired session.

### Manual test checklist

Run through this after each deploy:

- [ ] **Normal window:** sign up, onboard, click **Start practicing**. /match shows the waiting count and the timer runs.
- [ ] **Incognito window:** same flow. Reload /match and you stay signed in (the refresh cookie is first-party).
- [ ] **Two windows match:** a normal and an Incognito window with the same language and level get matched into a room. Reloading the room page reconnects to the same room.
- [ ] **Token expiry while waiting:** stay on /match for 20+ minutes (more than the 15-minute access token). No "session expired" message appears. To make it quicker, set `ACCESS_TOKEN_TTL_MINUTES=1` on Render, wait 3 minutes, then switch Wi-Fi off and on to force a reconnect. The socket reconnects and you rejoin the queue.
- [ ] **Real sign-out:** in DevTools → Application → Cookies, delete `lm_refresh`, then reload /match. You land on `/login?next=/match`.
- [ ] **Cold start:** with the Render service asleep (or suspended and resumed), open /match. You see the waking-up message, and it connects on its own within about a minute.
- [ ] **Cancel/leave cleanup:** press **Cancel** or navigate away. Render logs show no further `queue:join` for you, the waiting count in a second window drops, and the timer stops.
- [ ] **Render logs:** `[auth] … reason=…` lines show the reason for any rejection and contain no tokens.

Automated: `npm test` covers token verification reasons and the origin allowlist. `npx tsx server/scripts/smoke.ts <url>` runs register → refresh → socket auth → match → room → feedback against a running server.

## Architecture

```
shared/   Types, CEFR levels, language list, socket event contracts (used by both apps)
server/   Express + Socket.IO + Mongoose
  src/config        env validation (zod)
  src/models        User, MatchQueue, Conversation, ConversationFeedback, Report, Assessment
  src/routes        auth, me (onboarding/settings/profile), conversations (feedback/report/block), assessment
  src/socket        Socket.IO handshake auth (access token) + event wiring
  src/services
    ai/             provider-agnostic interface + Anthropic implementation, prompts, schemas
    speech/         speech-to-text layer (separate from AI analysis), segment sanitizing
    matchmaking/    pure pairing algorithm (unit-tested) + in-memory queue service
    rooms/          room lifecycle, WebRTC signaling relay, topics, transcript ingestion
    feedback/       deterministic fluency metrics + AI analysis → per-user reports
    moderation/     report / block / auto-suspension
    profile/        stats and progress trends
web/      Next.js (App Router) + Tailwind v4 + shadcn/ui
  src/app           /, /login, /signup, /onboarding, /assessment, /match, /room/[roomId],
                    /feedback/[conversationId], /profile, /settings, /rules
  src/hooks         useWebRTC, useSpeechRecognition, useLocalMedia
  src/lib           api client, socket singleton, auth context
```

### Conversation flow

1. A client sends `queue:join`. Every second (and on each join) the matchmaker pairs entries with the same target language. It tries exact CEFR level first, then allows ±1 level after `MATCH_EXPAND_AFTER_SECONDS`, never going past `MATCH_MAX_LEVEL_DISTANCE`. It never pairs blocked users or the user's most recent partner, and avoids other recent partners until both people have waited 60 seconds. Native language is never used.
2. A match creates a `Conversation`, and topic generation starts in the background. Both clients go to `/room/:id` and emit `room:join`. Once both are present, the server sends `room:ready` with a caller or callee role and the ICE servers.
3. WebRTC offer, answer and ICE messages are relayed only to the other participant. Media flows peer to peer.
4. Each browser transcribes **only its own microphone** (Web Speech API) and sends final phrases as `transcript:segment`. Consent is snapshotted at match time.
5. On End, Next, Block, Report, or a disconnect lasting more than 20 seconds, the conversation ends once. Stats update, and a separate report is generated for each participant from that person's own speech only.
6. After reports are settled, transcripts are deleted unless *both* users chose to keep them. An hourly sweep catches anything left over.

### AI layer

Everything goes through `AIProvider` in `server/src/services/ai/types.ts`. To switch providers, implement that interface and add a case in `ai/index.ts`. The Anthropic implementation uses `claude-opus-5-5` (configurable via `ANTHROPIC_MODEL`). It returns structured output validated against Zod schemas and sets `fallbacks: "default"`, so the API can retry a safety-classifier refusal on another model instead of failing. Effort is set per task: `low` for live topics, `medium` for analysis.

Fluency numbers are computed in code, not by the model. These are word or character count, speaking rate, filler words, repetitions and overused words. The model gets those numbers as input for its judgment and its exercises.

## Honest limitations

- **Pronunciation is not scored.** The browser recognizer gives no phoneme-level data, so the report shows "Not assessed" with an explanation. A real pronunciation API (for example Azure Pronunciation Assessment) would plug into `services/speech` behind `SpeechToTextProvider.supportsPronunciationAssessment`.
- **Speech-to-text quality depends on the browser.** Chrome and Edge work, using the browser vendor's cloud service, which the consent text discloses. Firefox has no Web Speech API, and the room tells such users they won't get a report. Recognizers also hide some mistakes and drop filler words, so the AI is told to ignore likely recognition artifacts, and filler counts are labeled as a lower bound.
- **Speaking rate is approximate.** It's based on when the recognizer first and last heard each phrase.
- **NAT traversal:** STUN alone fails on some corporate or mobile networks. Set `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL` for production.
- **Single process:** the matchmaking queue and room state live in memory. To scale out, move them to Redis and add the Socket.IO Redis adapter.
- **Moderation is basic:** reports, blocks, automatic 24-hour suspension after `MODERATION_AUTO_SUSPEND_REPORTS` distinct reporters, rate limits, and an 18+ rules agreement. There is no admin review UI or automated video/text content moderation yet.

## Roadmap (after MVP)

Pronunciation API, admin moderation dashboard, Redis-backed queue, interest-based topics, streaks and gamification, more languages, and email verification and password reset.
# LinguaMatch
