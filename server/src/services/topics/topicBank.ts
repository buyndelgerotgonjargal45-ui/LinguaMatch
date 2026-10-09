import { CEFR_LEVELS, type CefrLevel, type Topic } from "@linguamatch/shared";

const BAND: Record<CefrLevel, string> = {
  A1: "Simple, everyday",
  A2: "Simple, everyday",
  B1: "Opinions, experiences and lifestyle",
  B2: "Debates and social issues",
  C1: "Abstract, controversial and professional",
  C2: "Abstract, controversial and professional",
};

const topic = (level: CefrLevel, title: string, questions: string[]): Topic => ({
  title,
  description: BAND[level],
  questions,
  level,
});

export const TOPIC_BANK: readonly Topic[] = [
  // A1–A2
  topic("A1", "My morning routine", ["What do you eat for breakfast?", "What time do you leave home?", "Do you like mornings?"]),
  topic("A1", "My best friend", ["What is your friend's name?", "What do you do together?", "Why do you like them?"]),
  topic("A2", "A birthday party", ["How did you celebrate your last birthday?", "What gift did you get?", "Who came?"]),
  topic("A2", "At the restaurant", [
    "What do you usually order?",
    "Do you prefer eating out or at home?",
    "What is your favorite dish to cook?",
  ]),
  // B1
  topic("B1", "The best advice I got", [
    "Who gave you advice you still remember?",
    "Did you follow it?",
    "What advice would you give your younger self?",
  ]),
  topic("B1", "Morning person or night owl?", [
    "When do you work best?",
    "Can people change their habits?",
    "What does your ideal day look like?",
  ]),
  topic("B1", "A skill I want to learn", ["Why this skill?", "What is stopping you?", "How would your life change?"]),
  topic("B1", "Public transport or driving?", [
    "How do you get around?",
    "What are the pros and cons of each?",
    "What would improve your commute?",
  ]),
  topic("B1", "Gifts and traditions", [
    "What tradition is important in your family?",
    "Do you like giving or receiving gifts?",
    "Have traditions changed in your lifetime?",
  ]),
  // B2
  topic("B2", "Should social media have an age limit?", [
    "At what age is it safe?",
    "Who should enforce it, parents or companies?",
    "What are the risks of banning it?",
  ]),
  topic("B2", "Zoos and animal rights", [
    "Are zoos ever justified?",
    "What about animals used for entertainment?",
    "Can conservation excuse captivity?",
  ]),
  topic("B2", "Cash vs. digital payments", [
    "Will cash disappear?",
    "What do we lose with a cashless society?",
    "Who is left behind?",
  ]),
  // C1–C2
  topic("C1", "Is competition healthy?", [
    "Does it bring out the best in people?",
    "Where does it become harmful?",
    "Should schools reward it?",
  ]),
  topic("C1", "Can history be objective?", [
    "Who writes the story of a country?",
    "How do you handle bias in sources?",
    "Should disputed history be taught in schools?",
  ]),
  topic("C2", "The value of boredom", [
    "Has constant stimulation changed how we think?",
    "Is boredom necessary for creativity?",
    "Should we design technology to leave room for it?",
  ]),
];

const levelIndex = (l: CefrLevel) => CEFR_LEVELS.indexOf(l);

/**
 * A random topic for `level`. Prefers the exact level, then widens one level at a time,
 * skipping titles in `avoid` (this conversation's and the pair's recent topics). If every
 * topic has been used, it repeats rather than showing nothing, but never the current one.
 */
export function pickRandomTopic(level: CefrLevel, avoid: readonly string[] = [], current?: string, random = Math.random): Topic {
  const avoided = new Set(avoid);
  const target = levelIndex(level);
  for (let distance = 0; distance < CEFR_LEVELS.length; distance++) {
    const pool = TOPIC_BANK.filter((t) => Math.abs(levelIndex(t.level) - target) <= distance && !avoided.has(t.title));
    if (pool.length > 0) return pool[Math.floor(random() * pool.length)]!;
  }
  const fallback = TOPIC_BANK.filter((t) => t.title !== current);
  return fallback[Math.floor(random() * fallback.length)]!;
}
