import { gemini, geminiModel } from "@/lib/gemini";
import { parseJson } from "@/lib/verda";
import { catalog, rulePath, sanitizePath, TOPICS } from "@/lib/questions";
import { accountFor, accountSummary, cleanMe } from "@/lib/account";
import type { Goal } from "@/lib/simulate";
import { eur } from "@/lib/format";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const me = cleanMe(body?.me);
  if (!me) return Response.json({ error: "incomplete profile" }, { status: 400 });
  const { profile, peer } = accountFor(me, body?.customerId);
  const items = catalog(profile, peer);
  const goal = body?.goal as (Goal & { verdict?: string; monthly?: number }) | undefined;
  const goalLine = goal?.label
    ? `${goal.label}: needs ${eur(goal.target)} in ${goal.months} months; simulation verdict "${goal.verdict ?? "unknown"}"${goal.monthly ? `, plans to set aside ${eur(goal.monthly)}/month` : ""}.`
    : "none stated";

  let path = null;
  let error: string | null = null;
  try {
    const reply = await gemini(
      `Design a personalised learning path for this S-Pankki customer.

SELF-ASSESSMENT (they rated themselves per topic: 1 = new to it, 2 = knows the basics, 3 = confident):
${JSON.stringify({ name: me.name, age: me.age, goals: me.goals, levels: me.levels })}

THEIR PERSONAL GOAL (in their words: "${goal?.text ?? ""}"): ${goalLine}

ACCOUNT SUMMARY (last 12 months):
${JSON.stringify(accountSummary(profile))}

CATALOG of quiz concepts we can ask THIS customer (id, difficulty level 1-3, topic, title, example question):
${JSON.stringify(items.map((c) => [c.concept, c.level, c.topic, c.title, c.example.slice(0, 110)]))}

Rules:
- 5 or 6 units, ordered so their goals come early, but open with a quick, encouraging win.
- If they stated a personal goal, at least one unit must directly build the skills to reach it, and the intro should mention it.
- Each unit: 5–8 concept ids taken ONLY from the catalog, no id used twice across units.
- Match their self-rating: topic rated 1 → mostly level 1–2 concepts; rated 2 → level 2 with a few 1 and 3; rated 3 → level 2–3, skip basics they already know.
- unit.level (1–3) = the difficulty to aim for in that unit.
- "why" must reference their goals or a number from the account summary.
- icon ∈ wallet, utensils, bus, calendar, sprout, users, home, piggy, chart, receipt. topic ∈ ${TOPICS.map((t) => t.id).join(", ")}.

Return ONLY JSON:
{"intro": "<max 45 words, warm, addressed to ${me.name} as 'you'>",
 "units": [{"title": "<max 4 words>", "why": "<max 18 words>", "icon": "...", "topic": "...", "level": 1, "concepts": ["..."]}]}`,
      { system: "You are Penny, the learning designer behind S-Pankki's Duolingo-style money trainer. Plain, friendly English.", maxTokens: 6000 },
    );
    path = sanitizePath(parseJson(reply), me, items);
    if (!path) error = "Gemini returned an unusable path";
  } catch (e) {
    error = (e as Error).message;
  }

  return Response.json({
    profile,
    peer,
    path: path ?? rulePath(me, items),
    model: path ? geminiModel : null,
    ...(error ? { warning: error } : {}),
  });
}
