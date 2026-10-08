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

## Architecture

```
shared/   Types, CEFR levels, language list, socket event contracts (used by both apps)
server/   Express + Socket.IO + Mongoose
  src/config        env validation (zod)
  src/models        User, MatchQueue, Conversation, ConversationFeedback, Report, Assessment
  src/routes        auth, me (onboarding/settings/profile), conversations (feedback/report/block), assessment
  src/socket        Socket.IO auth + event wiring
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
