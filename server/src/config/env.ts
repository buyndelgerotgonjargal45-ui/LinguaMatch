import { z } from "zod";

const boolish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().default("http://localhost:3000"),

  MONGODB_URI: z.string().optional(),
  /** Dev convenience: spin up an ephemeral MongoDB when MONGODB_URI is not set. */
  USE_IN_MEMORY_DB: boolish.default(false),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(7),

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

export function iceServers() {
  const servers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: env.STUN_URLS.split(",").map((s) => s.trim()).filter(Boolean) },
  ];
  if (env.TURN_URL) {
    servers.push({ urls: env.TURN_URL, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  }
  return servers;
}
