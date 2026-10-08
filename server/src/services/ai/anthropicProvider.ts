import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  ANALYSIS_SYSTEM,
  ASSESSMENT_EVAL_SYSTEM,
  ASSESSMENT_SYSTEM,
  TOPIC_SYSTEM,
  analysisUserPrompt,
  assessmentEvalUserPrompt,
  assessmentUserPrompt,
  topicUserPrompt,
} from "./prompts";
import {
  AssessmentQuestionsSchema,
  AssessmentResultSchema,
  ConversationAnalysisSchema,
  TopicSchema,
  clampScore,
} from "./schemas";
import { AIResponseError, type AIProvider } from "./types";

type Effort = "low" | "medium" | "high";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * One structured call: static system prompt + per-request user content, parsed and
   * validated against a Zod schema. `fallbacks: "default"` lets the API retry a
   * safety-classifier refusal on a suitable fallback model instead of failing outright.
   */
  private async structured<S extends z.ZodType>(opts: {
    system: string;
    user: string;
    schema: S;
    effort: Effort;
    maxTokens: number;
  }): Promise<z.infer<S>> {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: opts.maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.user }],
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    });

    if (response.stop_reason === "refusal") {
      throw new AIResponseError("The AI declined to process this request.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AIResponseError("The AI response was cut off before it finished.");
    }
    if (response.parsed_output == null) {
      throw new AIResponseError("The AI returned an unexpected response format.");
    }
    return response.parsed_output as z.infer<S>;
  }

  async generateTopic(req: Parameters<AIProvider["generateTopic"]>[0]) {
    // Low effort: both users are waiting on this in the room.
    const out = await this.structured({
      system: TOPIC_SYSTEM,
      user: topicUserPrompt(req),
      schema: TopicSchema,
      effort: "low",
      maxTokens: 4000,
    });
    return {
      title: out.title.trim(),
      description: out.description.trim(),
      questions: out.questions.slice(0, 4).map((q) => q.trim()).filter(Boolean),
      level: req.level,
    };
  }

  async createAssessment(req: Parameters<AIProvider["createAssessment"]>[0]) {
    const out = await this.structured({
      system: ASSESSMENT_SYSTEM,
      user: assessmentUserPrompt(req),
      schema: AssessmentQuestionsSchema,
      effort: "low",
      maxTokens: 6000,
    });
    return out.questions.slice(0, 8).map((q) => ({ id: randomUUID(), ...q }));
  }

  async evaluateAssessment(req: Parameters<AIProvider["evaluateAssessment"]>[0]) {
    return this.structured({
      system: ASSESSMENT_EVAL_SYSTEM,
      user: assessmentEvalUserPrompt(req),
      schema: AssessmentResultSchema,
      effort: "medium",
      maxTokens: 8000,
    });
  }

  async analyzeConversation(req: Parameters<AIProvider["analyzeConversation"]>[0]) {
    const out = await this.structured({
      system: ANALYSIS_SYSTEM,
      user: analysisUserPrompt(req),
      schema: ConversationAnalysisSchema,
      effort: "medium",
      maxTokens: 16000,
    });
    return {
      ...out,
      grammarScore: clampScore(out.grammarScore),
      vocabularyScore: clampScore(out.vocabularyScore),
      fluencyScore: clampScore(out.fluencyScore),
      mistakes: out.mistakes.slice(0, 10),
      exercises: out.exercises.slice(0, 5),
    };
  }
}
