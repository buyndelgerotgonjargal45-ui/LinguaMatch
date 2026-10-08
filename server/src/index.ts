import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import { env } from "./config/env";
import { connectDatabase, disconnectDatabase } from "./db/connect";
import { assessmentRouter } from "./routes/assessment";
import { authRouter } from "./routes/auth";
import { conversationsRouter } from "./routes/conversations";
import { usersRouter } from "./routes/users";
import { isAIConfigured } from "./services/ai";
import { purgeStaleTranscripts } from "./services/feedback/feedbackService";
import { SPEECH_MODE, pronunciationCapability } from "./services/speech";
import { createSocketServer } from "./socket";
import { errorHandler } from "./utils/http";

async function main() {
  await connectDatabase();

  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      ai: { configured: isAIConfigured(), provider: env.AI_PROVIDER },
      speech: { mode: SPEECH_MODE, pronunciation: pronunciationCapability() },
    });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/me", usersRouter);
  app.use("/api/conversations", conversationsRouter);
  app.use("/api/assessment", assessmentRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);

  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);

  const sweep = setInterval(() => void purgeStaleTranscripts().catch(console.error), 3600_000);
  void purgeStaleTranscripts().catch(console.error);

  httpServer.listen(env.PORT, () => {
    console.log(`[server] LinguaMatch API listening on http://localhost:${env.PORT}`);
    if (!isAIConfigured()) {
      console.warn("[server] ANTHROPIC_API_KEY is not set — topics, assessment and feedback will report that AI is unavailable.");
    }
  });

  const shutdown = async () => {
    clearInterval(sweep);
    await io.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
