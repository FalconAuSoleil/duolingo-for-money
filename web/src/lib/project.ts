import type { Level, Profile, Question } from "./types";
import { eur, pct } from "./format";
import { bucket, moneyOptions, rng, shuffle, tf } from "./questions";
import {
  fmtMonths, guessOptions, monthsNeeded, project, requiredMonthly, simulate, VERDICTS,
  type Finances, type Goal, type SimInput,
} from "./simulate";

/** The three lessons of the "Your project" unit. */
export const PROJECT_LESSONS = ["Is it realistic?", "How to get there", "Revise or commit"];

type Q = Omit<Question, "id" | "unit">;
type Ctx = { goal: Goal; f: Finances; i: SimInput; p: Profile; r: () => number };

/** Four distinct duration options around a true number of months. */
function durationOptions(truth: number, r: () => number) {
  const vals = new Set<number>([truth]);
  for (const k of shuffle([0.5, 0.7, 1.5, 2, 2.5], r)) {
    if (vals.size >= 4) break;
    const v = Math.max(1, Math.round(truth * k));
    if (![...vals].some((x) => Math.abs(x - v) < Math.max(1, truth * 0.15))) vals.add(v);
  }
  let k = 3;
  while (vals.size < 4) vals.add(truth * k++);
  const sorted = [...vals].sort((a, b) => a - b);
  return { options: sorted.map(fmtMonths), answer: sorted.indexOf(truth) };
}

const LESSONS: ((c: Ctx) => Q | null)[][] = [
  // 1. Is it realistic?
  [
    ({ i, f }) => ({
      level: 1, concept: "project-covered", kind: "truefalse",
      prompt: `True or false: beyond a 3-month safety buffer (${eur(f.buffer)}), you already have the ${eur(i.target)} this project needs.`,
      ...tf(f.balance - f.buffer >= i.target),
      explain: `Your balance is ${eur(f.balance)}; minus the ${eur(f.buffer)} buffer that leaves ${eur(Math.max(0, f.balance - f.buffer))} you could put toward it.`,
      facts: { balance: Math.round(f.balance), buffer: Math.round(f.buffer), target: i.target },
    }),
    ({ i, r }) => {
      const missing = i.target - i.start;
      if (missing <= 0) return null;
      return {
        level: 1, concept: "project-gap", kind: "choice",
        prompt: `You've set aside ${eur(i.start)} toward your ${eur(i.target)} target. How much is still missing?`,
        ...moneyOptions(missing, r),
        explain: `${eur(i.target)} − ${eur(i.start)} = ${eur(missing)} left to save.`,
        facts: { target: i.target, saved: i.start, missing },
      };
    },
    ({ i, r }) => {
      const req = requiredMonthly(i.target, i.months, i.start, i.invest);
      if (req <= 0) return null;
      return {
        level: 1, concept: "project-required", kind: "choice",
        prompt: `To reach ${eur(i.target)} in ${fmtMonths(i.months)}${i.start ? ` (with ${eur(i.start)} already set aside)` : ""}, how much do you need to put away each month?`,
        ...moneyOptions(req, r),
        explain: `(${eur(i.target)} − ${eur(i.start)}) ÷ ${i.months} months ≈ ${eur(req)} a month${i.invest ? ", a bit less thanks to ~4% returns" : ""}.`,
        facts: { target: i.target, months: i.months, alreadySaved: i.start, requiredMonthly: Math.round(req) },
      };
    },
    ({ f, i }) => {
      const spare = Math.max(0, f.surplus);
      const at = monthsNeeded(i.target, spare, i.start, i.invest);
      return {
        level: 1, concept: "project-on-time", kind: "truefalse",
        prompt: `True or false: putting all of your spare money (about ${eur(spare)} a month) into this project, you'd hit your deadline (${fmtMonths(i.months)} from now).`,
        ...tf(at <= i.months),
        explain: spare <= 0
          ? "Right now spending matches or beats income, so there's nothing spare to put in yet."
          : `At ${eur(spare)} a month it takes ${fmtMonths(at)}, ${at <= i.months ? "inside" : "beyond"} your deadline.`,
        facts: { spareMonthly: Math.round(spare), monthsAtThatPace: Number.isFinite(at) ? at : "never", deadline: i.months },
      };
    },
    ({ f, i }) => {
      const spare = Math.max(0, f.surplus);
      const at = monthsNeeded(i.target, spare, i.start, i.invest);
      return {
        level: 1, concept: "project-pace", kind: "choice",
        prompt: `At today's pace, how long until you have ${eur(i.target)}?`,
        ...guessOptions(at),
        explain: `${eur(i.start)} already saved plus ${eur(spare)} spare a month: ${fmtMonths(at)}.`,
        facts: { spareMonthly: Math.round(spare), months: Number.isFinite(at) ? at : "never" },
      };
    },
    ({ f, i }) => {
      const req = requiredMonthly(i.target, i.months, i.start, i.invest);
      if (req <= 0 || f.surplus <= 0) return null;
      const share = req / f.surplus;
      return {
        level: 2, concept: "project-share", kind: "choice",
        prompt: "Hitting your deadline would take what share of the money you have spare each month?",
        ...bucket(share, [
          { label: "Less than half", lo: -1, hi: 0.5 },
          { label: "50–80%", lo: 0.5, hi: 0.8 },
          { label: "80–100%", lo: 0.8, hi: 1 },
          { label: "More than all of it", lo: 1, hi: 1e9 },
        ]),
        explain: `${eur(req)} of your ${eur(f.surplus)} spare: ${pct(share)}. Above ~80% leaves little room for surprises.`,
        tip: "Leave some slack every month: plans that use 100% of your spare money break at the first unexpected bill.",
        facts: { requiredMonthly: Math.round(req), spareMonthly: Math.round(f.surplus), share: pct(share) },
      };
    },
    ({ goal, f, i, r }) => {
      const v = simulate(goal, f, i).verdict;
      const opts = shuffle(Object.values(VERDICTS).map((x) => x.label), r);
      return {
        level: 2, concept: "project-verdict", kind: "choice",
        prompt: "Putting it all together, how would you rate this project as planned?",
        options: opts,
        answer: opts.indexOf(v.label),
        explain: `It's "${v.label}": it needs ${eur(requiredMonthly(i.target, i.months, i.start, i.invest))} a month and you have ${eur(Math.max(0, f.surplus))} spare (plus ~${eur(f.restaurants * 0.3 + f.wants * 0.2)} you could free up with small cuts).`,
        facts: { verdict: v.label },
      };
    },
  ],
  // 2. How to get there
  [
    ({ f, r }) => {
      if (f.restaurants < 20) return null;
      return {
        level: 1, concept: "project-lever-food", kind: "choice",
        prompt: `You spend about ${eur(f.restaurants)} a month eating out. Cutting that by 30% frees how much a month for your project?`,
        ...moneyOptions(f.restaurants * 0.3, r),
        explain: `30% × ${eur(f.restaurants)} = ${eur(f.restaurants * 0.3)} a month, ${eur(f.restaurants * 0.3 * 12)} a year.`,
        facts: { eatingOut: Math.round(f.restaurants), freed: Math.round(f.restaurants * 0.3) },
      };
    },
    ({ p, r }) => {
      const n = p.months.length;
      const avg = (c: string) => (p.cat[c] ?? []).slice(n - 3).reduce((a, b) => a + b, 0) / 3;
      const levers: [string, number][] = [
        ["Eating out −30%", avg("Restaurants") * 0.3],
        ["Shopping & fun −20%", (avg("Entertainment") + avg("Lifestyle")) * 0.2],
        ["Transport −10%", avg("Transportation") * 0.1],
        ["Groceries −10%", avg("Groceries") * 0.1],
      ];
      const best = [...levers].sort((a, b) => b[1] - a[1])[0];
      if (best[1] < 5) return null;
      const opts = shuffle(levers.map((l) => l[0]), r);
      return {
        level: 1, concept: "project-best-lever", kind: "choice",
        prompt: "Which change would free the most money each month for your project?",
        options: opts,
        answer: opts.indexOf(best[0]),
        explain: levers.map(([k, v]) => `${k}: ${eur(v)}`).join(" · "),
        facts: Object.fromEntries(levers.map(([k, v]) => [k, Math.round(v)])),
      };
    },
    ({ f, i, r }) => {
      const pace = Math.max(0, f.surplus) + f.restaurants * 0.3 + f.wants * 0.2;
      if (pace <= 0) return null;
      const at = monthsNeeded(i.target, pace, i.start, i.invest);
      if (!Number.isFinite(at) || at < 1) return null;
      return {
        level: 2, concept: "project-with-cuts", kind: "choice",
        prompt: `If you add those small cuts to your spare money (about ${eur(pace)} a month in total), how long until you reach ${eur(i.target)}?`,
        ...durationOptions(at, r),
        explain: `${eur(pace)} a month gets you there in ${fmtMonths(at)}${at <= i.months ? `, within your ${fmtMonths(i.months)} deadline` : ""}.`,
        facts: { monthly: Math.round(pace), months: at },
      };
    },
    ({ i, r }): Q | null => {
      if (i.months >= 36) {
        const cash = requiredMonthly(i.target, i.months, i.start, false);
        const inv = requiredMonthly(i.target, i.months, i.start, true);
        if (cash - inv < 5) return null;
        return {
          level: 3, concept: "project-invest", kind: "choice",
          prompt: `Your horizon is ${fmtMonths(i.months)}. Investing at ~4% a year instead of keeping cash, roughly how much less would you need each month?`,
          ...moneyOptions(cash - inv, r),
          explain: `${eur(cash)} in cash vs. ${eur(inv)} invested: about ${eur(cash - inv)} less a month. Returns aren't guaranteed, so long horizons suit investing best.`,
          facts: { cashMonthly: Math.round(cash), investedMonthly: Math.round(inv) },
        };
      }
      return {
        level: 2, concept: "project-horizon", kind: "truefalse",
        prompt: `True or false: for a project only ${fmtMonths(i.months)} away, putting the money in stocks is a smart way to get there faster.`,
        ...tf(false),
        explain: "Under ~2–3 years, markets can easily be down right when you need the money. A savings account keeps short-term project money safe.",
        facts: { horizonMonths: i.months },
      };
    },
    ({ p, r }) => {
      const truth = p.salaryDay ? `Right after payday (around the ${p.salaryDay}th)` : "Right after payday";
      const opts = shuffle([truth, "At the end of the month, with what's left", "Whenever I remember", "After big purchases"], r);
      return {
        level: 1, concept: "automation", kind: "choice",
        prompt: "When is the best moment to move money into your project?",
        options: opts,
        answer: opts.indexOf(truth),
        explain: "Pay your project first: an automatic transfer on payday happens before the money gets spent.",
        tip: "Set up a recurring transfer to a separate savings goal so the project grows without willpower.",
        facts: { salaryDay: p.salaryDay ?? "unknown" },
      };
    },
    ({ p, r }) => {
      const n = p.months.length;
      const buys = ["Groceries", "Restaurants", "Transportation", "Entertainment", "Health", "Home & Tech", "Lifestyle", "Travel"]
        .reduce((a, c) => a + (p.cnt[c]?.[n - 1] ?? 0), 0);
      if (buys < 5) return null;
      return {
        level: 1, concept: "round-ups", kind: "choice",
        prompt: `You made ${buys} card purchases last month. Rounding each one up to the next euro (about €0.50 each) would add roughly how much a month to your project?`,
        ...moneyOptions(buys * 0.5, r),
        explain: `${buys} × ~€0.50 ≈ ${eur(buys * 0.5)} a month, ${eur(buys * 6)} a year, without noticing.`,
        facts: { purchases: buys, monthly: Math.round(buys * 0.5) },
      };
    },
    () => ({
      level: 1, concept: "project-separate", kind: "truefalse",
      prompt: "True or false: keeping project money in a separate savings goal makes it less likely to get spent.",
      ...tf(true),
      explain: "Out of sight, out of reach: money in your everyday account blends into spending; a named goal keeps it safe.",
      facts: {},
    }),
  ],
  // 3. Revise or commit
  [
    ({ f, i, r }) => {
      const spare = Math.max(0, f.surplus);
      if (spare <= 0) return null;
      const reach = project({ ...i, monthly: spare }).at(-1)!;
      return {
        level: 2, concept: "project-reachable", kind: "choice",
        prompt: `Keeping your deadline (${fmtMonths(i.months)}) and using only your spare money, how much could you have by then?`,
        ...moneyOptions(reach, r),
        explain: `${eur(i.start)} + ${eur(spare)} × ${i.months} months ≈ ${eur(reach)}${reach >= i.target ? ", enough for your target" : `, ${eur(i.target - reach)} short of your target`}.`,
        facts: { reachable: Math.round(reach), target: i.target },
      };
    },
    ({ f, i, r }) => {
      const spare = Math.max(0, f.surplus);
      const at = monthsNeeded(i.target, spare, i.start, i.invest);
      if (spare <= 0 || !Number.isFinite(at) || at < 1) return null;
      return {
        level: 2, concept: "project-deadline", kind: "choice",
        prompt: `Without cutting anything, what deadline would make ${eur(i.target)} realistic?`,
        ...durationOptions(at, r),
        explain: `At ${eur(spare)} spare a month you'd reach ${eur(i.target)} in ${fmtMonths(at)}. Moving the deadline is often easier than squeezing the budget.`,
        facts: { months: at, spareMonthly: Math.round(spare) },
      };
    },
    ({ goal, r }) => {
      if (goal.kind !== "home" || !goal.propertyPrice) return null;
      const share = goal.firstHome ? 0.05 : 0.1;
      return {
        level: 2, concept: "down-payment", kind: "choice",
        prompt: `For a ${eur(goal.propertyPrice)} home${goal.firstHome ? " as a first-time buyer" : ""}, what's the minimum down payment in Finland?`,
        ...moneyOptions(goal.propertyPrice * share, r),
        explain: `${pct(share)} of ${eur(goal.propertyPrice)} = ${eur(goal.propertyPrice * share)}, plus ${eur(goal.propertyPrice * 0.015)} transfer tax (1.5%) on top.`,
        facts: { price: goal.propertyPrice, downPayment: Math.round(goal.propertyPrice * share) },
      };
    },
    ({ goal, f, i }) => {
      const home = simulate(goal, f, i).home;
      if (!home) return null;
      return {
        level: 3, concept: "stress-test", kind: "truefalse",
        prompt: `If rates rose to 6%, your loan payment would be about ${eur(home.stressPayment)} a month. True or false: that stays under ~40% of your salary.`,
        ...tf(home.affordable),
        explain: `40% of your ${eur(f.salary)} salary is ${eur(f.salary * 0.4)}. ${home.affordable ? "You'd stay under it." : "You'd be over it: a cheaper home or a bigger down payment makes the loan safer."}`,
        facts: { stressPayment: Math.round(home.stressPayment), salary: Math.round(f.salary) },
      };
    },
    ({ goal, f, r }) => {
      if (goal.kind === "home") return null;
      return {
        level: 1, concept: "emergency-fund", kind: "choice",
        prompt: "Before money goes into your project, how much should stay aside as a safety buffer (about 3 months of spending)?",
        ...moneyOptions(f.buffer, r),
        explain: `3 × ${eur(f.spend)} of monthly spending ≈ ${eur(f.buffer)}. Keep that untouched so a surprise bill doesn't wreck the project.`,
        facts: { monthlySpend: Math.round(f.spend), buffer: Math.round(f.buffer) },
      };
    },
    ({ i, r }) => {
      if (i.months < 12) return null;
      const future = i.target * Math.pow(1.03, i.months / 12);
      return {
        level: 2, concept: "inflation", kind: "choice",
        prompt: `Your project is ${fmtMonths(i.months)} away. If prices rise 3% a year, what will today's ${eur(i.target)} cost by then?`,
        ...moneyOptions(future, r),
        explain: `${eur(i.target)} × 1.03^${(i.months / 12).toFixed(1)} ≈ ${eur(future)}. Long projects need a little extra on top of today's price.`,
        facts: { today: i.target, future: Math.round(future), years: Number((i.months / 12).toFixed(1)) },
      };
    },
    ({ i, r }) => {
      const smaller = requiredMonthly(i.target * 0.75, i.months, i.start, i.invest);
      if (smaller <= 0) return null;
      return {
        level: 2, concept: "project-scale", kind: "choice",
        prompt: `Plan B: a smaller version of the project at 75% of the cost (${eur(i.target * 0.75)}), same deadline. How much a month would that take?`,
        ...moneyOptions(smaller, r),
        explain: `${eur(smaller)} a month instead of ${eur(requiredMonthly(i.target, i.months, i.start, i.invest))}. Scaling the project is a valid way to make it fit.`,
        facts: { smallerTarget: Math.round(i.target * 0.75), monthly: Math.round(smaller) },
      };
    },
    ({ r }) => {
      const truth = "Every few months, or when income or costs change";
      const opts = shuffle([truth, "Never: stick to the original plan", "Every day", "Only at the deadline"], r);
      return {
        level: 1, concept: "project-review", kind: "choice",
        prompt: "How often should you check in on your project plan?",
        options: opts,
        answer: opts.indexOf(truth),
        explain: "Life changes: a quick review every few months lets you adjust the amount or deadline before you fall behind.",
        facts: {},
      };
    },
    () => ({
      level: 1, concept: "project-commit", kind: "truefalse",
      prompt: "True or false: a fixed monthly amount set up on day one beats saving 'whatever is left' at the end of the month.",
      ...tf(true),
      explain: "Fixed, automatic amounts get saved; leftovers usually get spent. Commit a number, then review it every few months.",
      facts: {},
    }),
  ],
];

export function buildProjectLesson(goal: Goal, input: SimInput, f: Finances, p: Profile, node: number, salt = ""): Question[] {
  const r = rng(`${p.id}:project:${node}:${salt}`);
  const ctx: Ctx = { goal, f, i: input, p, r };
  return LESSONS[node]
    .map((gen, k) => [gen(ctx), k] as const)
    .filter((x): x is [Q, number] => !!x[0] && x[0].answer >= 0)
    .slice(0, 5)
    .map(([q, k]) => ({ ...q, level: q.level as Level, id: `project-${node}-${k}`, unit: "project" as const }));
}
