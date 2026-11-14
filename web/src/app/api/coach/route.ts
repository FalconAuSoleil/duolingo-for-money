import { parseJson } from "@/lib/verda";
import { complete } from "@/lib/llm";
import { getProfile } from "@/lib/data";

const PERSONA = `You are Penny, the friendly money coach inside the S-Pankki (S-Bank Finland) mobile app.
You help customers learn personal finance through short quiz lessons built from their OWN transaction data.
Tone: warm, encouraging, concise, a little playful, never preachy or judgemental. Plain English, no jargon.
Use only the numbers you are given; never invent figures. Do not give regulated investment advice
or recommend specific securities; general good habits are fine.`;

const LEVEL_GUIDE = {
  1: "BEGINNER. Use everyday words, define any financial term in a few words, focus on one simple habit.",
  2: "INTERMEDIATE. Knows budgeting basics; connect the numbers to savings goals and smarter habits.",
  3: "ADVANCED. Skip the basics; add one nuance, trade-off or pro tip they probably haven't considered (fees, tax, opportunity cost, rate risk).",
} as const;

type ExplainItem = { prompt: string; correctAnswer: string; facts: Record<string, string | number> };
type SummaryItem = { prompt: string; correctAnswer: string; gotItRight: boolean; facts: Record<string, string | number> };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const profile = body?.customerId ? getProfile(body.customerId) : undefined;
  if (!profile) return Response.json({ error: "unknown customer" }, { status: 400 });
  const level = [1, 2, 3].includes(body.level) ? (body.level as 1 | 2 | 3) : 2;
  const known: string[] = Array.isArray(body.known) ? body.known.slice(0, 40) : [];
  const name = typeof body.name === "string" ? body.name.slice(0, 40) : profile.name;
  const age = Number(body.age) || profile.age;
  const who = `Customer: ${name}, age ${age}. Data runs up to ${profile.months.at(-1)}.
Financial literacy level: ${LEVEL_GUIDE[level]}
Concepts they already know (don't re-explain these): ${known.length ? known.join(", ") : "none yet"}.
Their personal goal: ${typeof body.goal === "string" && body.goal ? body.goal.slice(0, 80) + " (connect advice to it when relevant)" : "not stated"}.`;

  try {
    if (body.mode === "explain") {
      const items = (body.items as ExplainItem[]).slice(0, 8);
      const { text: reply, model } = await complete(
        PERSONA,
        `${who}
For each quiz question below, write a personal explanation of the correct answer (max 35 words) that
references the customer's numbers and ends with one tiny, practical next step when it fits.
Address the customer as "you". Return ONLY JSON: {"explanations": ["...", "..."]} in the same order.

${JSON.stringify(items.map((q, i) => ({ n: i + 1, question: q.prompt, correctAnswer: q.correctAnswer, facts: q.facts })))}`,
      );
      const parsed = parseJson<{ explanations: string[] }>(reply);
      if (!parsed?.explanations?.length) throw new Error("unparseable model reply");
      return Response.json({ explanations: parsed.explanations, model });
    }

    if (body.mode === "summary") {
      const items = (body.items as SummaryItem[]).slice(0, 8);
      const { text: reply, model } = await complete(
        PERSONA,
        `${who}
The customer just finished a lesson on "${body.unitTitle}". Results: ${JSON.stringify(items)}
Write: (1) "insight": the single most useful observation about THEIR money from this lesson (max 40 words);
(2) "goal": one concrete, measurable micro-goal for the next 30 days, phrased as a challenge (max 18 words);
(3) "cheer": a short celebratory line (max 8 words, one emoji allowed).
Return ONLY JSON: {"insight": "...", "goal": "...", "cheer": "..."}`,
      );
      const parsed = parseJson<{ insight: string; goal: string; cheer: string }>(reply);
      if (!parsed?.insight) throw new Error("unparseable model reply");
      return Response.json({ ...parsed, model });
    }

    return Response.json({ error: "unknown mode" }, { status: 400 });
  } catch (e) {
    // The client falls back to the deterministic, data-computed explanations.
    return Response.json({ error: (e as Error).message, fallback: true }, { status: 503 });
  }
}
