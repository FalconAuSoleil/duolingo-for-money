import { gemini } from "@/lib/gemini";
import { parseJson } from "@/lib/verda";
import { parseGoalFallback, type Finances, type Goal } from "@/lib/simulate";
import { eur } from "@/lib/format";

/** Turn a goal written in the learner's own words into numbers we can simulate. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").trim().slice(0, 300);
  if (text.length < 3) return Response.json({ error: "empty goal" }, { status: 400 });
  const f = body?.finances as Finances | undefined;

  try {
    const reply = await gemini(
      `A bank customer in Finland wrote their money goal: "${text}"
Context: net salary about ${eur(f?.salary ?? 0)}/month, spending about ${eur(f?.spend ?? 0)}/month. Today is November 2026.

Extract it as JSON:
{"label": "<the goal in max 7 words, English>",
 "kind": "save" | "home" | "invest" | "other",
 "target": <euros they need to accumulate>,
 "months": <months from now until the deadline; if none given pick a sensible default (12 for small goals, 36 for big ones)>,
 "propertyPrice": <home price in euros, only for kind "home">,
 "firstHome": <true/false, only for kind "home"; assume true unless they say otherwise>}
For a home, "target" = down payment (5% of price if first home, otherwise 10%) + 1.5% transfer tax. If the price is missing, assume €250,000.
Convert other currencies to euros. Return ONLY the JSON.`,
      { maxTokens: 800 },
    );
    const g = parseJson<Partial<Goal>>(reply);
    const target = Math.round(Number(g?.target));
    const months = Math.round(Number(g?.months));
    if (!g || !(target > 0) || !(months > 0)) throw new Error("unusable goal");
    const goal: Goal = {
      text,
      label: String(g.label ?? text).slice(0, 60),
      kind: (["save", "home", "invest", "other"] as const).includes(g.kind as Goal["kind"]) ? (g.kind as Goal["kind"]) : "save",
      target: Math.min(target, 5_000_000),
      months: Math.min(360, Math.max(1, months)),
      ...(g.kind === "home" && Number(g.propertyPrice) > 0 ? { propertyPrice: Math.round(Number(g.propertyPrice)), firstHome: g.firstHome !== false } : {}),
    };
    return Response.json({ goal });
  } catch {
    return Response.json({ goal: parseGoalFallback(text), fallback: true });
  }
}
