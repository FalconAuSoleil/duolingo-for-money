// Google Gemini via the Generative Language REST API.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

export async function gemini(prompt: string, { system, json = true, maxTokens = 2048 }: { system?: string; json?: boolean; maxTokens?: number } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: maxTokens,
        // thinking tokens count against maxOutputTokens; low keeps answers fast and complete
        thinkingConfig: { thinkingLevel: "low" },
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
    }),
    signal: AbortSignal.timeout(40_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Gemini HTTP ${res.status}`);
  const parts: { text?: string; thought?: boolean }[] = body?.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
}

export const geminiModel = MODEL;
