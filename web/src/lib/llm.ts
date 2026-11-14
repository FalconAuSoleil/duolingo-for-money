import { chat, verdaModel } from "./verda";
import { gemini, geminiModel } from "./gemini";

/** Coach completions: Verda (DeepSeek) first, Gemini as a fallback. */
export async function complete(system: string, prompt: string): Promise<{ text: string; model: string }> {
  try {
    const text = await chat([
      { role: "system", content: system },
      { role: "user", content: prompt },
    ]);
    return { text, model: verdaModel };
  } catch (verdaErr) {
    try {
      return { text: await gemini(prompt, { system, maxTokens: 1200 }), model: geminiModel };
    } catch {
      throw verdaErr;
    }
  }
}
