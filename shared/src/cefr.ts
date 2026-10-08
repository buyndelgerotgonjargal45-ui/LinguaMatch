export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const CEFR_DESCRIPTIONS: Record<CefrLevel, { name: string; description: string }> = {
  A1: {
    name: "Beginner",
    description: "You can introduce yourself and use simple everyday phrases.",
  },
  A2: {
    name: "Elementary",
    description: "You can talk about familiar topics like family, shopping and your routine.",
  },
  B1: {
    name: "Intermediate",
    description: "You can describe experiences, give opinions and handle most travel situations.",
  },
  B2: {
    name: "Upper intermediate",
    description: "You can discuss abstract topics and argue a point with reasonable fluency.",
  },
  C1: {
    name: "Advanced",
    description: "You express yourself fluently on complex subjects with flexible language.",
  },
  C2: {
    name: "Proficient",
    description: "You understand virtually everything and express nuance precisely.",
  },
};

export function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === "string" && (CEFR_LEVELS as readonly string[]).includes(value);
}

export function levelIndex(level: CefrLevel): number {
  return CEFR_LEVELS.indexOf(level);
}

export function levelDistance(a: CefrLevel, b: CefrLevel): number {
  return Math.abs(levelIndex(a) - levelIndex(b));
}

/** Returns the lower of two levels — topics target the less advanced speaker. */
export function lowerLevel(a: CefrLevel, b: CefrLevel): CefrLevel {
  return levelIndex(a) <= levelIndex(b) ? a : b;
}
