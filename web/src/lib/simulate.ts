import type { Profile } from "./types";
import { eur } from "./format";

/** A goal as understood from the learner's own words. */
export type Goal = {
  text: string;
  label: string;
  kind: "save" | "home" | "invest" | "other";
  /** euros needed; for a home this is the down payment + transfer tax */
  target: number;
  months: number;
  propertyPrice?: number;
  firstHome?: boolean;
};

export type Finances = {
  salary: number;
  spend: number;
  surplus: number;
  balance: number;
  buffer: number;
  invest: number;
  restaurants: number;
  wants: number;
};

const SPEND = ["Groceries", "Restaurants", "Transportation", "Utilities", "Entertainment", "Health", "Home & Tech", "Housing", "Lifestyle", "Travel"];

export function finances(p: Profile): Finances {
  const n = p.months.length;
  const avg = (cat: string, len = 3) => (p.cat[cat] ?? []).slice(n - len).reduce((a, b) => a + b, 0) / len;
  const salary = avg("Salary");
  const spend = SPEND.reduce((a, c) => a + avg(c), 0);
  return {
    salary,
    spend,
    surplus: salary - spend,
    balance: p.balance,
    // keep 3 months of spending as an untouchable safety buffer
    buffer: spend * 3,
    invest: avg("Invest Deposit", 12),
    restaurants: avg("Restaurants"),
    wants: avg("Entertainment") + avg("Lifestyle"),
  };
}

export type SimInput = { target: number; months: number; monthly: number; start: number; invest: boolean };

export const RETURN = 0.04;

export function project(i: SimInput) {
  const r = i.invest ? RETURN / 12 : 0;
  const points = [i.start];
  let v = i.start;
  for (let m = 1; m <= i.months; m++) {
    v = v * (1 + r) + i.monthly;
    points.push(v);
  }
  return points;
}

/** Monthly amount needed to reach `target` in `months`, given a starting pot. */
export function requiredMonthly(target: number, months: number, start: number, invest: boolean) {
  const r = invest ? RETURN / 12 : 0;
  const grown = start * Math.pow(1 + r, months);
  const gap = target - grown;
  if (gap <= 0) return 0;
  return r === 0 ? gap / months : (gap * r) / (Math.pow(1 + r, months) - 1);
}

/** Months to reach the target at a monthly pace (Infinity if never within 50 years). */
export function monthsNeeded(target: number, monthly: number, start: number, invest: boolean) {
  const r = invest ? RETURN / 12 : 0;
  let v = start;
  for (let m = 0; m <= 600; m++) {
    if (v >= target) return m;
    v = v * (1 + r) + monthly;
  }
  return Infinity;
}

export type Verdict = { key: "realistic" | "tight" | "changes" | "unrealistic"; label: string; tone: string };

export const VERDICTS: Record<Verdict["key"], Verdict> = {
  realistic: { key: "realistic", label: "Realistic", tone: "bg-g500 text-white" },
  tight: { key: "tight", label: "Tight but doable", tone: "bg-g300 text-g900" },
  changes: { key: "changes", label: "Doable with changes", tone: "bg-warnbg text-[#885600]" },
  unrealistic: { key: "unrealistic", label: "Not realistic as is", tone: "bg-errbg text-err" },
};

export type Lever = { id: string; title: string; detail: string; apply: Partial<SimInput> };

export type SimResult = {
  required: number;
  capacity: number;
  final: number;
  verdict: Verdict;
  reachIn: number;
  levers: Lever[];
  home?: { downPayment: number; transferTax: number; loan: number; stressPayment: number; affordable: boolean };
};

/** Room in the budget: today's surplus plus realistic cuts (30% of eating out, 20% of wants). */
export function cutsPotential(f: Finances) {
  return f.restaurants * 0.3 + f.wants * 0.2;
}

export function simulate(goal: Goal, f: Finances, i: SimInput): SimResult {
  const required = requiredMonthly(i.target, i.months, i.start, i.invest);
  const capacity = Math.max(0, f.surplus);
  const final = project(i).at(-1)!;
  const stretch = capacity + cutsPotential(f);
  const key: Verdict["key"] =
    required <= capacity * 0.8 ? "realistic" : required <= capacity ? "tight" : required <= stretch ? "changes" : "unrealistic";
  const pace = Math.max(i.monthly, 0);
  const reachIn = monthsNeeded(i.target, pace, i.start, i.invest);

  const levers: Lever[] = [];
  const round10 = (x: number) => Math.max(10, Math.round(x / 10) * 10);
  if (f.restaurants > 30) {
    const extra = f.restaurants * 0.3;
    levers.push({ id: "food", title: `Cook more: −30% eating out`, detail: `+${eur(extra)}/month freed from your ${eur(f.restaurants)} restaurant budget`, apply: { monthly: round10(i.monthly + extra) } });
  }
  if (f.wants > 30) {
    const extra = f.wants * 0.2;
    levers.push({ id: "wants", title: `Trim shopping & fun by 20%`, detail: `+${eur(extra)}/month`, apply: { monthly: round10(i.monthly + extra) } });
  }
  if (required > 0 && required <= stretch && Math.abs(round10(required) - i.monthly) >= 10) {
    levers.push({ id: "pace", title: `Save ${eur(required)} a month`, detail: `Exactly what it takes to hit ${eur(i.target)} on time`, apply: { monthly: round10(required) } });
  }
  const atCapacity = monthsNeeded(i.target, capacity, i.start, i.invest);
  if (capacity > 0 && Number.isFinite(atCapacity) && atCapacity > i.months) {
    levers.push({ id: "time", title: `Give it ${fmtMonths(atCapacity)}`, detail: `At your current surplus of ${eur(capacity)}/month`, apply: { months: atCapacity, monthly: round10(capacity) } });
  }
  if (capacity > 0 && required > capacity) {
    const reachable = project({ ...i, monthly: capacity }).at(-1)!;
    levers.push({ id: "target", title: `Aim for ${eur(reachable)} instead`, detail: `What your surplus reaches in ${fmtMonths(i.months)}`, apply: { target: Math.round(reachable / 100) * 100, monthly: round10(capacity) } });
  }
  if (!i.invest && i.months >= 36) {
    levers.push({ id: "invest", title: "Invest it (≈4% a year)", detail: "Long horizons let compounding do some of the work; returns aren't guaranteed", apply: { invest: true } });
  }

  let home: SimResult["home"];
  if (goal.kind === "home" && goal.propertyPrice) {
    const price = goal.propertyPrice;
    const downPayment = price * (goal.firstHome ? 0.05 : 0.1);
    const loan = price - downPayment;
    const r = 0.06 / 12;
    const stressPayment = (loan * r) / (1 - Math.pow(1 + r, -300));
    home = { downPayment, transferTax: price * 0.015, loan, stressPayment, affordable: stressPayment <= f.salary * 0.4 };
  }

  // when the goal is out of reach, changing the goal itself matters more than small budget cuts
  const priority = key === "unrealistic" ? ["target", "time", "invest", "food", "wants"] : ["pace", "food", "wants", "time", "invest", "target"];
  levers.sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id));
  return { required, capacity, final, verdict: VERDICTS[key], reachIn, levers: levers.slice(0, 4), home };
}

export function fmtMonths(m: number) {
  if (!Number.isFinite(m)) return "never at this pace";
  if (m < 12) return `${m} month${m === 1 ? "" : "s"}`;
  const y = m / 12;
  return Number.isInteger(y) ? `${y} year${y === 1 ? "" : "s"}` : `${y.toFixed(1)} years`;
}

/** Sensible starting point: savings above the safety buffer go toward the goal, and the monthly amount
 * is what the goal needs, capped by what today's surplus can actually spare. */
export function defaultInput(goal: Goal, f: Finances): SimInput {
  const start = Math.round(Math.max(0, Math.min(goal.target, f.balance - f.buffer)));
  const needed = Math.ceil(requiredMonthly(goal.target, goal.months, start, false) / 10) * 10;
  const monthly = Math.max(0, Math.min(needed, Math.floor(Math.max(0, f.surplus) / 10) * 10));
  return { target: goal.target, months: goal.months, monthly, start, invest: false };
}

/** Bucketed "how long will it take" options for the guessing question. */
export function guessOptions(monthsAtPace: number) {
  const buckets = [
    { label: "Under a year", lo: 0, hi: 12 },
    { label: "1–3 years", lo: 12, hi: 36 },
    { label: "3–6 years", lo: 36, hi: 72 },
    { label: "6+ years, or never at today's pace", lo: 72, hi: Infinity },
  ];
  const v = Number.isFinite(monthsAtPace) ? monthsAtPace : 1e9;
  return { options: buckets.map((b) => b.label), answer: buckets.findIndex((b) => v >= b.lo && v < b.hi) };
}

/** Last-resort parser when the AI is unavailable: first euro amount and first duration in the text. */
export function parseGoalFallback(text: string): Goal {
  const t = text.toLowerCase().replace(/\s/g, " ");
  const amt = t.match(/(\d+(?:[.,]\d+)?)\s*(k|000|m)?\s*(€|eur|euros?)?/);
  let target = amt ? parseFloat(amt[1].replace(",", ".")) * (amt[2] === "k" ? 1000 : amt[2] === "m" ? 1e6 : 1) : 10000;
  const yrs = t.match(/(\d+)\s*(years?|yrs?|ans?|vuotta)/);
  const mos = t.match(/(\d+)\s*(months?|mois|kuukautta)/);
  const months = yrs ? Number(yrs[1]) * 12 : mos ? Number(mos[1]) : 24;
  const isHome = /home|house|flat|apartment|appart|maison|asunto|koti/.test(t);
  let propertyPrice: number | undefined;
  if (isHome) {
    propertyPrice = target < 50000 ? 250000 : target;
    target = Math.round(propertyPrice * 0.115);
  }
  return { text, label: text.slice(0, 48), kind: isHome ? "home" : "save", target: Math.round(target), months: Math.min(360, Math.max(3, months)), propertyPrice, firstHome: isHome ? true : undefined };
}
