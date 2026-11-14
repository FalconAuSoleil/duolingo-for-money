import { complete } from "@/lib/llm";
import { parseJson } from "@/lib/verda";
import { eur } from "@/lib/format";
import type { Finances, Goal } from "@/lib/simulate";

type Body = {
  name: string;
  goal: Goal;
  finances: Finances;
  input: { target: number; months: number; monthly: number; start: number; invest: boolean };
  result: { required: number; capacity: number; verdict: string; reachIn: number | null; levers: string[]; home?: Record<string, number | boolean> };
};

/** S-Bank AI's take on a simulated goal: honest verdict + three concrete steps, using only computed numbers. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b?.goal || !b.result) return Response.json({ error: "missing simulation" }, { status: 400 });
  const facts = {
    goal: b.goal.label,
    target: eur(b.input.target),
    deadline: `${b.input.months} months`,
    startingPot: eur(b.input.start),
    plannedMonthly: eur(b.input.monthly),
    requiredMonthly: eur(b.result.required),
    currentMonthlySurplus: eur(b.result.capacity),
    salary: eur(b.finances.salary),
    eatingOutPerMonth: eur(b.finances.restaurants),
    verdict: b.result.verdict,
    monthsToReachAtPlannedPace: b.result.reachIn ?? "never",
    investing: b.input.invest ? "yes, ~4%/yr assumed" : "no",
    possibleLevers: b.result.levers,
    ...(b.result.home ? { home: b.result.home } : {}),
  };
  try {
    const { text } = await complete(
      "You are S-Bank AI, a warm, honest money coach in the S-Pankki app. Never invent numbers; use only the facts given. No regulated investment advice.",
      `Customer: ${String(b.name).slice(0, 30)}. Their goal was simulated:
${JSON.stringify(facts)}

Write JSON: {"headline": "<honest one-line verdict, max 14 words>",
"steps": ["<step 1>", "<step 2>", "<step 3>"]}
Each step: concrete, uses their numbers, max 22 words. If it's unrealistic, say how to adjust (time, target or budget) kindly.
Return ONLY JSON.`,
    );
    const plan = parseJson<{ headline: string; steps: string[] }>(text);
    if (!plan?.headline || !plan.steps?.length) throw new Error("unusable plan");
    return Response.json({ headline: plan.headline, steps: plan.steps.slice(0, 3) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
