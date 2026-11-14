import { peers, profiles, getProfile } from "./data";
import { ageBand, GOALS, TOPICS, type SelfAssessment, type TopicId } from "./questions";
import type { Level, Profile } from "./types";
import { eur, pct } from "./format";

/** Clamp and validate a self-assessment coming from the client. */
export function cleanMe(raw: unknown): SelfAssessment | null {
  const me = raw as SelfAssessment | undefined;
  if (!me?.name || !me.age || !me.levels) return null;
  me.name = String(me.name).slice(0, 30);
  me.age = Math.min(90, Math.max(18, Math.round(me.age)));
  me.goals = (me.goals ?? []).filter((g) => GOALS.includes(g)).slice(0, 3);
  for (const t of TOPICS) me.levels[t.id as TopicId] = ([1, 2, 3].includes(me.levels[t.id]) ? me.levels[t.id] : 1) as Level;
  return me;
}

/** The learner's account: an existing match when we have one, otherwise a fresh match. */
export function accountFor(me: SelfAssessment, customerId?: string) {
  const base = (customerId && getProfile(customerId)) || matchAccount(me);
  const profile: Profile = { ...base, name: me.name, age: me.age, band: ageBand(me.age) };
  return { profile, peer: peers.bands[profile.band] };
}

/**
 * Demo stand-in for "connect my S-Pankki account": pick the dataset customer closest in age
 * (home-loan applicants when buying a home is a goal), then let Gemini design the learning path.
 */
export function matchAccount(me: SelfAssessment): Profile {
  const wantsHome = me.goals.includes("Buy a home");
  const score = (p: Profile) => Math.abs(p.age - me.age) - (wantsHome && p.mortgage ? 8 : 0);
  return [...profiles].sort((a, b) => score(a) - score(b))[0];
}

export function accountSummary(p: Profile) {
  const n = p.months.length;
  const avg = (cat: string, len = 12) => (p.cat[cat] ?? []).slice(n - len).reduce((a, b) => a + b, 0) / len;
  const salary = avg("Salary");
  const spendCats = ["Groceries", "Restaurants", "Transportation", "Utilities", "Entertainment", "Health", "Home & Tech", "Housing", "Lifestyle", "Travel"];
  const spend = spendCats.reduce((a, c) => a + avg(c, 3), 0);
  const saveRate = salary > 0 ? avg("Invest Deposit") / salary : 0;
  return {
    monthlySalary: eur(salary),
    monthlySpend: eur(spend),
    topCategories: spendCats.filter((c) => c !== "Housing").sort((a, b) => avg(b, 3) - avg(a, 3)).slice(0, 3).map((c) => `${c} ${eur(avg(c, 3))}/mo`),
    savingsRate: pct(saveRate),
    investsMonthly: avg("Invest Deposit") > 0,
    bufferMonths: spend > 0 ? Number((p.balance / spend).toFixed(1)) : 0,
    homeLoanApplication: p.mortgage ? `${p.mortgage.decision}, LTV ${pct(p.mortgage.ltv)}` : "none",
  };
}

