import type { Priority } from "./types";

/**
 * Two-stage urgency classification.
 *
 * Stage 1 is a deterministic keyword scan that always runs and never fails.
 * Stage 2 asks an LLM for a second opinion, under a hard timeout.
 * The final answer is the more severe of the two, so the AI can escalate a
 * report but can never talk the system down from a rule-matched emergency.
 */

const CRITICAL_TERMS = [
  "unconscious",
  "not breathing",
  "cant breathe",
  "can't breathe",
  "cannot breathe",
  "bleeding heavily",
  "heavy bleeding",
  "blood loss",
  "fire",
  "smoke",
  "burning",
  "collapsed",
  "collapse",
  "weapon",
  "knife",
  "gun",
  "stabbed",
  "seizure",
  "fit",
  "chest pain",
  "heart attack",
  "choking",
  "drowning",
  "electrocuted",
  "overdose",
  "suicide",
  "no pulse",
  "severe",

  // Hindi (Devanagari). Students report in the language they panic in.
  "बेहोश",
  "सांस नहीं",
  "साँस नहीं",
  "खून",
  "ख़ून",
  "आग",
  "धुआं",
  "धुआँ",
  "गिर गया",
  "गिर गयी",
  "चाकू",
  "बंदूक",
  "दौरा",
  "सीने में दर्द",
  "दम घुट",
  "डूब",
  "जल गया",
  "मर रहा",
  "मर रही",

  // Romanised Hindi, which is how most people actually type.
  "behosh",
  "saans nahi",
  "sans nahi",
  "khoon",
  "aag",
  "dhuan",
  "gir gaya",
  "chaku",
  "bandook",
  "seene mein dard",
  "dam ghut",
  "mar raha",
  "mar rahi",
];

const URGENT_TERMS = [
  "sprain",
  "sprained",
  "cut",
  "dizzy",
  "dizziness",
  "vomit",
  "vomiting",
  "fever",
  "panic attack",
  "minor injury",
  "fracture",
  "burn",
  "fainted",
  "faint",
  "allergic",
  "asthma",
  "headache",
  "pain",
  "fell",
  "fall",

  // Hindi (Devanagari)
  "चोट",
  "बुखार",
  "उल्टी",
  "चक्कर",
  "दर्द",
  "मोच",
  "घबराहट",
  "सूजन",

  // Romanised Hindi
  "chot",
  "bukhar",
  "ulti",
  "chakkar",
  "dard",
  "moch",
  "ghabrahat",
];

/** Emergency categories that are never merely "normal". */
const TYPE_FLOOR: Record<string, Priority> = {
  fire: "critical",
  medical: "urgent",
  accident: "urgent",
  security: "urgent",
  harassment: "urgent",
};

function normalise(text: string) {
  // Devanagari (U+0900-U+097F) must survive: stripping to a-z alone would
  // silently blank a Hindi report and classify a real emergency as normal.
  return text.toLowerCase().replace(/[^a-z0-9ऀ-ॿ\s']/g, " ");
}

function containsTerm(haystack: string, term: string) {
  // Word-boundary match so "fit" does not fire inside "fitness".
  const pattern = new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
  return pattern.test(haystack);
}

export interface RuleResult {
  priority: Priority;
  matched: string[];
}

export function runRuleEngine(
  emergencyType: string,
  description: string | null,
): RuleResult {
  const text = normalise(`${description ?? ""}`);
  const matched: string[] = [];

  for (const term of CRITICAL_TERMS) {
    if (containsTerm(text, normalise(term))) matched.push(term);
  }
  if (matched.length > 0) return { priority: "critical", matched };

  for (const term of URGENT_TERMS) {
    if (containsTerm(text, normalise(term))) matched.push(term);
  }
  if (matched.length > 0) return { priority: "urgent", matched };

  const floor = TYPE_FLOOR[emergencyType.toLowerCase()];
  if (floor) return { priority: floor, matched: [`type:${emergencyType}`] };

  return { priority: "normal", matched: [] };
}

// ---------------------------------------------------------------------------
// AI second opinion
// ---------------------------------------------------------------------------

export interface AiResult {
  priority: Priority;
  reasoning: string;
}

const AI_TIMEOUT_MS = 4000;

function buildPrompt(input: {
  emergencyType: string;
  description: string | null;
  locationLabel: string;
  campusName: string;
  reportedAt: string;
}) {
  return `You are a campus emergency dispatcher for a college in Faridabad, India.
Classify the urgency of this report.

Emergency type: ${input.emergencyType}
Description: ${input.description || "(none provided)"}
Location: ${input.locationLabel}, ${input.campusName}
Reported at: ${input.reportedAt}

Rules:
- "critical" = immediate risk to life or to the building (unconscious, not breathing, heavy bleeding, fire, weapon, seizure, chest pain).
- "urgent" = needs attention soon but not life-threatening (sprain, fever, minor cut, panic attack).
- "normal" = routine, no injury implied.
The description may be in English, Hindi (Devanagari), or romanised Hinglish —
students report in whatever language they panic in. Read it in any of those.
When the description is vague, judge by the emergency type and err on the side of caution.

Respond with JSON only, no markdown:
{"priority":"critical|urgent|normal","reasoning":"one short sentence"}`;
}

function parseAiJson(raw: string): AiResult | null {
  try {
    // Models sometimes wrap JSON in prose or a code fence.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      priority?: string;
      reasoning?: string;
    };
    const p = parsed.priority?.toLowerCase();
    if (p !== "critical" && p !== "urgent" && p !== "normal") return null;
    return {
      priority: p,
      reasoning: (parsed.reasoning || "").toString().slice(0, 300),
    };
  } catch {
    return null;
  }
}

async function callOpenAI(prompt: string, signal: AbortSignal): Promise<AiResult | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0,
      response_format: { type: "json_object" },
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content ?? "";
  return parseAiJson(content);
}

async function callAnthropic(
  prompt: string,
  signal: AbortSignal,
): Promise<AiResult | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as { content?: { text?: string }[] };
  const content = body.content?.map((c) => c.text ?? "").join("") ?? "";
  return parseAiJson(content);
}

export interface AiOutcome {
  result: AiResult | null;
  error: string | null;
  provider: string;
}

/**
 * Never throws. A dead API key or a slow model must not stop an alert, so the
 * caller simply falls back to the rule engine's verdict.
 */
export async function runAiClassifier(input: {
  emergencyType: string;
  description: string | null;
  locationLabel: string;
  campusName: string;
  reportedAt: string;
}): Promise<AiOutcome> {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  const prompt = buildPrompt(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const result =
      provider === "anthropic"
        ? await callAnthropic(prompt, controller.signal)
        : await callOpenAI(prompt, controller.signal);
    return { result, error: result ? null : "unparseable response", provider };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `timed out after ${AI_TIMEOUT_MS}ms`
          : err.message
        : "unknown error";
    return { result: null, error: message, provider };
  } finally {
    clearTimeout(timer);
  }
}
