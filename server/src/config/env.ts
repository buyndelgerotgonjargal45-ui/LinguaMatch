import { z } from "zod";

const boolish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Comma-separated list of exact web origins allowed to call the API and open sockets. */
  CLIENT_ORIGIN: z.string().default("http://localhost:3000"),

  MONGODB_URI: z.string().optional(),
  /** Dev convenience: spin up an ephemeral MongoDB when MONGODB_URI is not set. */
  USE_IN_MEMORY_DB: boolish.default(false),

  JWT_SECRET: z
    .string({ error: "JWT_SECRET is missing. Set it to a long random string (the same value everywhere tokens are verified)." })
    .min(32, "JWT_SECRET must be at least 32 characters"),
  /** Lifetime of the in-memory access token sent as a Bearer header and in the socket handshake. */
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().max(60).default(15),
  /** Lifetime of the httpOnly refresh cookie; each refresh extends it. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  AI_PROVIDER: z.enum(["anthropic"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),

  STUN_URLS: z.string().default("stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"),
  TURN_URL: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),

  /** Max CEFR distance the matcher will ever accept after expanding (1 = A2↔B1 allowed). */
  MATCH_MAX_LEVEL_DISTANCE: z.coerce.number().int().min(0).max(5).default(1),
  /** Seconds a user waits before the matcher accepts partners one level away. */
  MATCH_EXPAND_AFTER_SECONDS: z.coerce.number().int().min(0).default(10),
  /** Number of recent partners to avoid rematching with. */
  MATCH_RECENT_PARTNER_WINDOW: z.coerce.number().int().min(0).default(3),

  /** Distinct reporters within 24h that trigger an automatic temporary suspension. */
  MODERATION_AUTO_SUSPEND_REPORTS: z.coerce.number().int().positive().default(3),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  console.error("Copy .env.example to .env and fill in the required values.");
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

/** Exact origins allowed for CORS and Socket.IO. localhost:3000 is added in development only. */
export const allowedOrigins: ReadonlySet<string> = new Set([
  ...env.CLIENT_ORIGIN.split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean),
  ...(isProd ? [] : ["http://localhost:3000"]),
]);

/** Requests without an Origin header (same-origin GETs, curl, health checks) are not cross-site and are allowed. */
export const isAllowedOrigin = (origin: string | undefined) => !origin || allowedOrigins.has(origin);

export function iceServers() {
  const servers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: env.STUN_URLS.split(",").map((s) => s.trim()).filter(Boolean) },
  ];
  if (env.TURN_URL) {
    servers.push({ urls: env.TURN_URL, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  }
  return servers;
}
