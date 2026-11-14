// Verda managed inference: OpenAI-compatible Chat Completions.
// https://docs.verda.com/inference/models/
const BASE_URL = process.env.VERDA_BASE_URL ?? "https://inference.verda.com/v1";
const MODEL = process.env.VERDA_MODEL ?? "deepseek-4-1-flash-1017";

export class VerdaError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

export async function chat(messages: { role: "system" | "user"; content: string }[], maxTokens = 900) {
  const key = process.env.VERDA_API_KEY;
  if (!key) throw new VerdaError("VERDA_API_KEY is not set", "missing_key");

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature: 0.6 }),
    signal: AbortSignal.timeout(25_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new VerdaError(body?.error?.message ?? `HTTP ${res.status}`, body?.error?.code);
  const content: string = body?.choices?.[0]?.message?.content ?? "";
  return content;
}

/** Pull the first JSON object out of a model reply (tolerates ```json fences and reasoning preambles). */
export function parseJson<T>(text: string): T | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export const verdaModel = MODEL;
