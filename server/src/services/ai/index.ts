import { env } from "../../config/env";
import { AnthropicProvider } from "./anthropicProvider";
import { AIUnavailableError, type AIProvider } from "./types";

export * from "./types";

let provider: AIProvider | null = null;

/** Returns the configured AI provider, or throws AIUnavailableError when no key is set. */
export function getAI(): AIProvider {
  if (provider) return provider;
  switch (env.AI_PROVIDER) {
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) throw new AIUnavailableError();
      provider = new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
      return provider;
  }
}

export function isAIConfigured(): boolean {
  return env.AI_PROVIDER === "anthropic" && Boolean(env.ANTHROPIC_API_KEY);
}
