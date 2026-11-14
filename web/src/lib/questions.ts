import type { Chart, Level, Mastery, PeerBand, Profile, Question, UnitId } from "./types";
import { eur, MCC_LABELS, monthAbbr, monthName, pct, WEEKDAYS } from "./format";

/* ---------------------------------------------------------------- lesson sizes */

export const NODES_PER_UNIT = 3;
export const QUESTIONS_PER_LESSON = 5;

/* ---------------------------------------------------------------- helpers */

export const SPEND_CATS = ["Groceries", "Restaurants", "Transportation", "Utilities", "Entertainment", "Health",
  "Home & Tech", "Housing", "Lifestyle", "Travel"];
const VARIABLE_CATS = SPEND_CATS.filter((c) => c !== "Housing" && c !== "Utilities");

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], r: () => number) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ordinal = (d: number) => {
  const s = d % 100 >= 11 && d % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[d % 10] ?? "th";
  return `${d}${s}`;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

class P {
  constructor(public p: Profile) {}
  get n() {
    return this.p.months.length;
  }
  get last() {
    return this.p.months[this.n - 1];
  }
  month(off = 0) {
    return this.p.months[this.n - 1 - off];
  }
  /** amount for category `off` months before the last month */
  m(cat: string, off = 0) {
    return this.p.cat[cat]?.[this.n - 1 - off] ?? 0;
  }
  c(cat: string, off = 0) {
    return this.p.cnt[cat]?.[this.n - 1 - off] ?? 0;
  }
  /** average over months [from, from+len) counted back from the last month */
  avg(cat: string, len: number, from = 0) {
    let s = 0;
    for (let i = from; i < from + len; i++) s += this.m(cat, i);
    return s / len;
  }
  spend(off = 0, cats = SPEND_CATS) {
    return sum(cats.map((c) => this.m(c, off)));
  }
  spendAvg(len: number, from = 0, cats = SPEND_CATS) {
    let s = 0;
    for (let i = from; i < from + len; i++) s += this.spend(i, cats);
    return s / len;
  }
  mccL3(...codes: string[]) {
    return sum(codes.map((c) => this.p.mcc[c]?.l3 ?? 0));
  }
  mccN3(...codes: string[]) {
    return sum(codes.map((c) => this.p.mcc[c]?.n3 ?? 0));
  }
  /** last `len` month labels + values for a chart */
  series(fn: (off: number) => number, len = 6, unit = "€"): Chart {
    const labels: string[] = [];
    const values: number[] = [];
    for (let off = len - 1; off >= 0; off--) {
      labels.push(monthAbbr(this.month(off)));
      values.push(Math.round(fn(off)));
    }
    return { labels, values, highlight: len - 1, unit };
  }
}

/** Build 4 money options around the true value; returns options + index of the right one. */
export function moneyOptions(value: number, r: () => number, digits = 0) {
  const round = (x: number) => {
    if (digits > 0) return Number(x.toFixed(digits));
    if (x >= 10000) return Math.round(x / 100) * 100;
    if (x >= 1000) return Math.round(x / 10) * 10;
    return Math.round(x);
  };
  const truth = round(value);
  const factors = shuffle([0.45, 0.6, 0.75, 1.3, 1.55, 1.85], r);
  const vals = new Set<number>([truth]);
  for (const f of factors) {
    if (vals.size >= 4) break;
    const v = round(value * f);
    if (v > 0 && ![...vals].some((x) => Math.abs(x - v) < Math.max(1, truth * 0.08))) vals.add(v);
  }
  let k = 2;
  while (vals.size < 4) vals.add(round(value * k++) + vals.size);
  const sorted = [...vals].sort((a, b) => a - b);
  return { options: sorted.map((v) => eur(v, digits)), answer: sorted.indexOf(truth) };
}

function countOptions(value: number, r: () => number) {
  const truth = Math.round(value);
  const vals = new Set<number>([truth]);
  const deltas = shuffle([-0.5, -0.3, 0.35, 0.6, 0.9], r);
  for (const d of deltas) {
    if (vals.size >= 4) break;
    const v = Math.max(0, Math.round(truth * (1 + d)) + (d > 0 ? 1 : -1));
    if (v !== truth) vals.add(v);
  }
  let k = 1;
  while (vals.size < 4) vals.add(truth + 3 * k++);
  const sorted = [...vals].sort((a, b) => a - b);
  return { options: sorted.map(String), answer: sorted.indexOf(truth) };
}

/** Pick the bucket whose [lo, hi) range contains the value. */
export function bucket(value: number, buckets: { label: string; lo: number; hi: number }[]) {
  return { options: buckets.map((b) => b.label), answer: buckets.findIndex((b) => value >= b.lo && value < b.hi) };
}

function categoryOptions(truth: string, pool: string[], r: () => number) {
  const others = shuffle(pool.filter((c) => c !== truth), r).slice(0, 3);
  const opts = shuffle([truth, ...others], r);
  return { options: opts, answer: opts.indexOf(truth) };
}

export const tf = (isTrue: boolean) => ({ options: ["True", "False"], answer: isTrue ? 0 : 1 });

function compare(mine: number, peer: number) {
  const ratio = peer > 0 ? mine / peer : mine > 0 ? 2 : 1;
  const answer = ratio > 1.1 ? 0 : ratio < 0.9 ? 1 : 2;
  return { options: ["More than them", "Less than them", "About the same (±10%)"], answer, ratio };
}

/* ---------------------------------------------------------------- generators */

type Ctx = { P: P; p: Profile; peer: PeerBand; r: () => number };
type Gen = (ctx: Ctx) => Omit<Question, "id" | "unit" | "level" | "concept"> | null;
/** level: 1 = basics, 2 = intermediate, 3 = advanced. concept: what the question teaches (used for mastery). */
type GenDef = { level: Level; concept: string; gen: Gen };
const def = (level: Level, concept: string, gen: Gen): GenDef => ({ level, concept, gen });

const LM = (P: P) => monthName(P.last, true);

const GENERATORS: Record<UnitId, GenDef[]> = {
  arki: [
    def(1, "total-spend", ({ P, r }) => {
      const v = P.spend(0);
      return {
        kind: "choice",
        prompt: `How much did you spend in total in ${monthName(P.last)}?`,
        ...moneyOptions(v, r),
        explain: `You spent ${eur(v)} across all categories in ${LM(P)}. Your 6-month average is ${eur(P.spendAvg(6))}.`,
        chart: P.series((o) => P.spend(o)),
        facts: { totalSpend: Math.round(v), avg6: Math.round(P.spendAvg(6)) },
      };
    }),
    def(1, "top-category", ({ P, r }) => {
      const ranked = VARIABLE_CATS.map((c) => [c, P.m(c)] as const).sort((a, b) => b[1] - a[1]);
      if (ranked[0][1] <= 0) return null;
      const [top, amt] = ranked[0];
      return {
        kind: "choice",
        prompt: `Not counting rent and bills, what was your biggest spending category in ${LM(P)}?`,
        ...categoryOptions(top, ranked.slice(0, 6).map((x) => x[0]), r),
        explain: `${top} took the top spot with ${eur(amt)}, followed by ${ranked[1][0]} (${eur(ranked[1][1])}).`,
        tip: "Knowing your #1 category is the fastest way to find savings: a 10% cut there beats cutting everything else.",
        facts: { top, topAmount: Math.round(amt), second: ranked[1][0], secondAmount: Math.round(ranked[1][1]) },
      };
    }),
    def(1, "eating-out-vs-groceries", ({ P }) => {
      const g = P.m("Groceries");
      const rest = P.m("Restaurants");
      if (g === 0 && rest === 0) return null;
      return {
        kind: "truefalse",
        prompt: `True or false: in ${LM(P)} you spent more eating out than on groceries.`,
        ...tf(rest > g),
        explain: `Restaurants: ${eur(rest)} vs. groceries: ${eur(g)}.`,
        facts: { restaurants: Math.round(rest), groceries: Math.round(g) },
      };
    }),
    def(1, "purchase-frequency", ({ P, r }) => {
      const n = sum(VARIABLE_CATS.map((c) => P.c(c)));
      if (n < 3) return null;
      return {
        kind: "choice",
        prompt: `How many card purchases did you make in ${LM(P)}?`,
        ...countOptions(n, r),
        explain: `${n} purchases, about ${(n / 30).toFixed(1)} per day. Each one is a small decision!`,
        facts: { purchases: n },
      };
    }),
    def(1, "big-purchases", ({ P, p, r }) => {
      const top = p.top[0];
      if (!top) return null;
      const label = MCC_LABELS[top.mcc] ?? top.cat;
      const pool = [...new Set(Object.values(MCC_LABELS))];
      return {
        kind: "choice",
        prompt: `Your single biggest card purchase in ${LM(P)} was ${eur(top.amt)}. Where did you make it?`,
        ...categoryOptions(label, pool, r),
        explain: `It was at a ${label.toLowerCase()} on ${new Date(top.date).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`,
        facts: { amount: top.amt, place: label, date: top.date },
      };
    }),
    def(2, "latte-factor", ({ p, r }) => {
      const s = p.smallBuys3;
      if (s.count < 3) return null;
      return {
        kind: "choice",
        prompt: `Small stuff adds up: what did your ${s.count} purchases under €10 cost in total over the last 3 months?`,
        ...moneyOptions(s.sum, r),
        explain: `${s.count} small purchases added up to ${eur(s.sum)}, roughly ${eur(s.sum * 4)} a year.`,
        tip: "This is the 'latte factor': tiny buys are invisible one by one but add up over a year.",
        facts: { count: s.count, total: s.sum, yearly: Math.round(s.sum * 4) },
      };
    }),
    def(2, "spending-patterns", ({ p, r }) => {
      const best = p.weekday.sum.indexOf(Math.max(...p.weekday.sum));
      if (p.weekday.sum[best] <= 0) return null;
      const opts = categoryOptions(WEEKDAYS[best], WEEKDAYS, r);
      return {
        kind: "choice",
        prompt: "On which day of the week do you spend the most (last 3 months)?",
        ...opts,
        explain: `${WEEKDAYS[best]}s: ${eur(p.weekday.sum[best])} over ${p.weekday.count[best]} purchases in 3 months.`,
        chartAfter: true,
        chart: { labels: WEEKDAYS.map((d) => d.slice(0, 3)), values: p.weekday.sum.map(Math.round), highlight: best, unit: "€" },
        facts: { day: WEEKDAYS[best], amount: Math.round(p.weekday.sum[best]) },
      };
    }),
    def(2, "spending-trend", ({ P }) => {
      const now = P.spend(0, VARIABLE_CATS);
      const avg = P.spendAvg(6, 1, VARIABLE_CATS);
      const d = avg > 0 ? now / avg - 1 : 0;
      return {
        kind: "choice",
        prompt: `Compared with your previous 6-month average, your day-to-day spending in ${LM(P)} was…`,
        ...bucket(d, [
          { label: "More than 15% higher", lo: 0.15, hi: Infinity },
          { label: "Slightly higher (5–15%)", lo: 0.05, hi: 0.15 },
          { label: "About the same (±5%)", lo: -0.05, hi: 0.05 },
          { label: "Lower (by 5% or more)", lo: -Infinity, hi: -0.05 },
        ]),
        explain: `${eur(now)} vs. an average of ${eur(avg)}: ${d >= 0 ? "+" : ""}${pct(d)}.`,
        chart: P.series((o) => P.spend(o, VARIABLE_CATS), 7),
        facts: { thisMonth: Math.round(now), avg6: Math.round(avg), change: pct(d) },
      };
    }),
    def(2, "50-30-20", ({ P }) => {
      const sal = P.avg("Salary", 3);
      if (sal <= 0) return null;
      const needs = ["Housing", "Utilities", "Groceries", "Health", "Transportation"].reduce((a, c) => a + P.avg(c, 3), 0);
      const s = needs / sal;
      return {
        kind: "choice",
        prompt: "The 50/30/20 rule splits income into 50% needs, 30% wants and 20% savings. What share of your salary goes to needs (housing, bills, groceries, health, transport)?",
        ...bucket(s, [
          { label: "Under 40%", lo: -1, hi: 0.4 },
          { label: "40–50%", lo: 0.4, hi: 0.5 },
          { label: "50–65%", lo: 0.5, hi: 0.65 },
          { label: "Over 65%", lo: 0.65, hi: 99 },
        ]),
        explain: `${eur(needs)} of ${eur(sal)}: ${pct(s)}. ${s <= 0.5 ? "You're within the 50% guideline." : "That's above the 50% guideline, so wants and savings get squeezed."}`,
        facts: { needs: Math.round(needs), salary: Math.round(sal), share: pct(s) },
      };
    }),
    def(3, "lifestyle-creep", ({ P }) => {
      const salNow = P.avg("Salary", 6);
      const salThen = P.avg("Salary", 6, 12);
      const spNow = P.spendAvg(6, 0, VARIABLE_CATS);
      const spThen = P.spendAvg(6, 12, VARIABLE_CATS);
      if (salThen <= 0 || spThen <= 0) return null;
      const ds = salNow / salThen - 1;
      const dp = spNow / spThen - 1;
      const signed = (x: number) => `${x >= 0 ? "+" : ""}${pct(x)}`;
      return {
        kind: "truefalse",
        prompt: "True or false: over the past year, your day-to-day spending grew faster than your salary (so-called 'lifestyle creep').",
        ...tf(dp > ds),
        explain: `Salary ${signed(ds)} vs. day-to-day spending ${signed(dp)} (last 6 months vs. the same period a year earlier).`,
        tip: "When you get a raise, decide up front how much of it goes to savings, before your spending quietly adjusts.",
        facts: { salaryChange: signed(ds), spendingChange: signed(dp) },
      };
    }),
  ],

  ruoka: [
    def(1, "eating-out-total", ({ P, r }) => {
      const v = P.m("Restaurants");
      if (v <= 0) return null;
      return {
        kind: "choice",
        prompt: `How much did you spend at restaurants, cafés and fast-food places in ${LM(P)}?`,
        ...moneyOptions(v, r),
        explain: `${eur(v)} in ${LM(P)}, over ${P.c("Restaurants")} visits.`,
        chart: P.series((o) => P.m("Restaurants", o)),
        facts: { restaurants: Math.round(v), visits: P.c("Restaurants") },
      };
    }),
    def(1, "eating-out-frequency", ({ P, r }) => {
      const n = P.c("Restaurants");
      if (n < 2) return null;
      return {
        kind: "choice",
        prompt: `How many times did you eat or drink out in ${LM(P)}?`,
        ...countOptions(n, r),
        explain: `${n} times, with an average bill of ${eur(P.m("Restaurants") / n, 2)}.`,
        facts: { visits: n, avgBill: Number((P.m("Restaurants") / n).toFixed(2)) },
      };
    }),
    def(2, "fast-food-share", ({ P }) => {
      const ff = P.mccL3("5814");
      const all = P.mccL3("5812", "5813", "5814");
      if (all <= 0) return null;
      const s = ff / all;
      return {
        kind: "choice",
        prompt: "What share of your eating-out money went to fast food in the last 3 months?",
        ...bucket(s, [
          { label: "Under 20%", lo: -1, hi: 0.2 },
          { label: "20–40%", lo: 0.2, hi: 0.4 },
          { label: "40–60%", lo: 0.4, hi: 0.6 },
          { label: "Over 60%", lo: 0.6, hi: 2 },
        ]),
        explain: `${pct(s)}: ${eur(ff)} on fast food out of ${eur(all)} eating out (${P.mccN3("5814")} fast-food orders).`,
        facts: { fastFood: Math.round(ff), eatingOut: Math.round(all), share: pct(s) },
      };
    }),
    def(2, "basket-size", ({ P, r }) => {
      const s = P.mccL3("5411", "5422", "5451", "5499");
      const n = P.mccN3("5411", "5422", "5451", "5499");
      if (n < 2) return null;
      const avg = s / n;
      return {
        kind: "choice",
        prompt: "On average, how much do you spend per grocery trip?",
        ...moneyOptions(avg, r, 2),
        explain: `${n} grocery trips in 3 months, ${eur(avg, 2)} per trip on average.`,
        tip: "Fewer, planned trips with a list usually cost less than many small top-up visits.",
        facts: { trips: n, avgTrip: Number(avg.toFixed(2)) },
      };
    }),
    def(2, "annualising", ({ P, r }) => {
      const y = P.avg("Restaurants", 3) * 12;
      if (y <= 0) return null;
      return {
        kind: "choice",
        prompt: "At your current pace, how much would eating out cost you over a full year?",
        ...moneyOptions(y, r),
        explain: `Your 3-month average is ${eur(P.avg("Restaurants", 3))}/month, so about ${eur(y)} a year.`,
        facts: { monthlyAvg: Math.round(P.avg("Restaurants", 3)), yearly: Math.round(y) },
      };
    }),
    def(1, "small-cuts", ({ P, r }) => {
      const save = P.avg("Restaurants", 3) * 12 * 0.3;
      if (save < 30) return null;
      return {
        kind: "choice",
        prompt: "If you cooked at home a bit more and cut eating out by 30%, what would you save in a year?",
        ...moneyOptions(save, r),
        explain: `30% of ${eur(P.avg("Restaurants", 3) * 12)} a year is ${eur(save)}.`,
        tip: "Put that amount into a savings goal on payday and you'd hardly notice it's gone.",
        facts: { yearlySaving: Math.round(save) },
      };
    }),
    def(2, "impulse-buying", ({ p }) => {
      if (p.night.count === 0) return null;
      const threshold = Math.max(1, Math.round(p.night.count * (p.night.count % 2 ? 1.4 : 0.6)));
      const isTrue = p.night.count > threshold;
      return {
        kind: "truefalse",
        prompt: `True or false: you made more than ${threshold} purchases between 10 pm and 5 am in the last 3 months.`,
        ...tf(isTrue),
        explain: `You made ${p.night.count} late-night purchases (${eur(p.night.sum)}), ${p.night.restaurants} of them food or drinks.`,
        tip: "Late-night buys are often impulse buys. A 'sleep on it' rule saves money.",
        facts: { nightPurchases: p.night.count, nightSpend: p.night.sum },
      };
    }),
    def(3, "opportunity-cost", ({ P, peer, r }) => {
      const extra = P.avg("Restaurants", 12) - peer.spend.Restaurants;
      const monthly = extra > 20 ? extra : P.avg("Restaurants", 12) * 0.25;
      if (monthly < 10) return null;
      const i = 0.05 / 12;
      const fv = monthly * ((Math.pow(1 + i, 120) - 1) / i);
      return {
        kind: "choice",
        prompt: extra > 20
          ? `You spend about ${eur(monthly)} a month more on eating out than the median person your age. Invested at 5% a year instead, what would that grow to in 10 years?`
          : `Invested at 5% a year, what would a quarter of your eating-out budget (${eur(monthly)} a month) grow to in 10 years?`,
        ...moneyOptions(fv, r),
        explain: `About ${eur(fv)}. That's the opportunity cost: a habit's real price includes what the money could have become.`,
        facts: { monthly: Math.round(monthly), futureValue: Math.round(fv) },
      };
    }),
  ],

  liikkuminen: [
    def(1, "transport-total", ({ P, r }) => {
      const v = P.m("Transportation");
      if (v <= 0) return null;
      return {
        kind: "choice",
        prompt: `How much did getting around (fuel, parking, transit, taxis) cost you in ${LM(P)}?`,
        ...moneyOptions(v, r),
        explain: `${eur(v)} in ${LM(P)}; your yearly total is around ${eur(P.avg("Transportation", 12) * 12)}.`,
        chart: P.series((o) => P.m("Transportation", o)),
        facts: { transport: Math.round(v), yearly: Math.round(P.avg("Transportation", 12) * 12) },
      };
    }),
    def(1, "transport-mix", ({ P, r }) => {
      const parts: [string, number][] = [
        ["Fuel", P.mccL3("5541", "5542")],
        ["Public transport", P.mccL3("4111")],
        ["Taxis", P.mccL3("4121")],
        ["Parking", P.mccL3("7523")],
      ];
      const sorted = [...parts].sort((a, b) => b[1] - a[1]);
      if (sorted[0][1] <= 0) return null;
      const opts = shuffle(parts.map((x) => x[0]), r);
      return {
        kind: "choice",
        prompt: "Where did most of your transport money go in the last 3 months?",
        options: opts,
        answer: opts.indexOf(sorted[0][0]),
        explain: parts.map(([k, v]) => `${k}: ${eur(v)}`).join(" · "),
        chartAfter: true,
        chart: { labels: parts.map((x) => x[0]), values: parts.map((x) => Math.round(x[1])), highlight: parts.indexOf(sorted[0]), unit: "€" },
        facts: Object.fromEntries(parts.map(([k, v]) => [k, Math.round(v)])),
      };
    }),
    def(1, "taxi", ({ P, r }) => {
      const n = P.mccN3("4121");
      if (n < 1) return null;
      const s = P.mccL3("4121");
      return {
        kind: "choice",
        prompt: "How many taxi rides did you pay for in the last 3 months?",
        ...countOptions(n, r),
        explain: `${n} rides for ${eur(s)} in total, ${eur(s / n, 2)} per ride.`,
        tip: "Compare one taxi ride with the price of a monthly transit pass, and plan rides you can swap.",
        facts: { rides: n, total: Math.round(s), perRide: Number((s / n).toFixed(2)) },
      };
    }),
    def(1, "parking", ({ P, r }) => {
      const s = P.mccL3("7523");
      if (s <= 0) return null;
      return {
        kind: "choice",
        prompt: "How much did you pay for parking in the last 3 months?",
        ...moneyOptions(s, r),
        explain: `${eur(s)} over ${P.mccN3("7523")} parking payment${P.mccN3("7523") === 1 ? "" : "s"}, about ${eur(s * 4)} a year.`,
        facts: { parking: Math.round(s), payments: P.mccN3("7523") },
      };
    }),
    def(2, "year-over-year", ({ P }) => {
      const now = P.m("Transportation");
      const ly = P.m("Transportation", 12);
      if (now <= 0 && ly <= 0) return null;
      return {
        kind: "truefalse",
        prompt: `True or false: your transport costs in ${LM(P)} were higher than in ${monthName(P.month(12))}.`,
        ...tf(now > ly),
        explain: `${monthName(P.last)}: ${eur(now)} vs. ${monthName(P.month(12))}: ${eur(ly)}.`,
        facts: { thisYear: Math.round(now), lastYear: Math.round(ly) },
      };
    }),
    def(2, "fuel-efficiency", ({ P, r }) => {
      const fuel = P.mccL3("5541", "5542");
      if (fuel < 30) return null;
      const save = (fuel / 3) * 12 * 0.15;
      return {
        kind: "choice",
        prompt: "Smoother driving can cut fuel use by around 15%. What would that save you in a year?",
        ...moneyOptions(save, r),
        explain: `You spend about ${eur(fuel / 3)}/month on fuel; 15% of a year's worth is ${eur(save)}.`,
        facts: { fuelMonthly: Math.round(fuel / 3), yearlySaving: Math.round(save) },
      };
    }),
  ],

  palkka: [
    def(1, "payday", ({ p, r }) => {
      if (!p.salaryDay) return null;
      const opts = shuffle([...new Set([p.salaryDay, 1, 5, 10, 15, 20, 25, 28].filter((d) => d <= 31))], r)
        .filter((d) => d !== p.salaryDay).slice(0, 3).concat(p.salaryDay).sort((a, b) => a - b);
      return {
        kind: "choice",
        prompt: "On which day of the month does your salary usually arrive?",
        options: opts.map((d) => `The ${ordinal(d)}`),
        answer: opts.indexOf(p.salaryDay),
        explain: `Your salary lands around the ${ordinal(p.salaryDay)}. Scheduling savings and bills right after payday makes budgeting easier.`,
        tip: "Pay yourself first: an automatic transfer to savings on payday beats saving 'what's left'.",
        facts: { salaryDay: p.salaryDay },
      };
    }),
    def(1, "net-salary", ({ P, r }) => {
      const v = P.avg("Salary", 3);
      if (v <= 0) return null;
      return {
        kind: "choice",
        prompt: "What has your average monthly net salary been over the last 3 months?",
        ...moneyOptions(v, r),
        explain: `${eur(v)} on average. That's your monthly budget ceiling.`,
        chart: P.series((o) => P.m("Salary", o)),
        facts: { salary: Math.round(v) },
      };
    }),
    def(2, "spend-ratio", ({ P }) => {
      const sal = P.avg("Salary", 3);
      if (sal <= 0) return null;
      const s = P.spendAvg(3) / sal;
      return {
        kind: "choice",
        prompt: "What share of your salary do you spend each month (3-month average)?",
        ...bucket(s, [
          { label: "Under 60%", lo: -1, hi: 0.6 },
          { label: "60–80%", lo: 0.6, hi: 0.8 },
          { label: "80–100%", lo: 0.8, hi: 1 },
          { label: "More than 100%", lo: 1, hi: 99 },
        ]),
        explain: `You spend ${eur(P.spendAvg(3))} of a ${eur(sal)} salary: ${pct(s)}.`,
        tip: s > 0.9 ? "Aim to keep at least 10% of every salary untouched; it builds your safety buffer." : "Nice margin! Make sure the leftover goes somewhere on purpose, like savings or funds.",
        facts: { spend: Math.round(P.spendAvg(3)), salary: Math.round(sal), share: pct(s) },
      };
    }),
    def(2, "housing-ratio", ({ P }) => {
      const sal = P.avg("Salary", 3);
      if (sal <= 0) return null;
      const fixed = P.avg("Housing", 3) + P.avg("Utilities", 3);
      const s = fixed / sal;
      return {
        kind: "choice",
        prompt: "How much of your salary goes to housing and utility bills?",
        ...bucket(s, [
          { label: "Under 25%", lo: -1, hi: 0.25 },
          { label: "25–35%", lo: 0.25, hi: 0.35 },
          { label: "35–50%", lo: 0.35, hi: 0.5 },
          { label: "Over 50%", lo: 0.5, hi: 99 },
        ]),
        explain: `${eur(fixed)} a month on housing and bills: ${pct(s)} of your salary.`,
        tip: "A common rule of thumb is to keep housing costs below about a third of your net income.",
        facts: { fixedCosts: Math.round(fixed), salary: Math.round(sal), share: pct(s) },
      };
    }),
    def(2, "cash-flow-low-point", ({ p, r }) => {
      const b = p.daily.balance;
      if (b.length < 10) return null;
      const min = Math.min(...b);
      const at = p.daily.dates[b.indexOf(min)];
      return {
        kind: "choice",
        prompt: "What was the lowest balance on your account in the last 3 months?",
        ...moneyOptions(Math.max(min, 1), r),
        explain: `Your lowest point was ${eur(min)} on ${new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`,
        tip: "Your lowest point shows how big your real safety margin is.",
        facts: { lowest: Math.round(min), date: at },
      };
    }),
    def(1, "balance-trend", ({ P, p }) => {
      const b = p.eomBalance;
      const d = b[b.length - 1] - b[b.length - 13];
      return {
        kind: "truefalse",
        prompt: "True or false: your account balance grew over the last 12 months.",
        ...tf(d > 0),
        explain: `From ${eur(b[b.length - 13])} to ${eur(b[b.length - 1])} (${d >= 0 ? "+" : ""}${eur(d)}).`,
        chart: P.series((o) => b[b.length - 1 - o], 12),
        chartAfter: true,
        facts: { from: Math.round(b[b.length - 13]), to: Math.round(b[b.length - 1]), change: Math.round(d) },
      };
    }),
    def(2, "automation", ({ P, r }) => {
      const sweep = P.avg("Salary Sweep", 12);
      if (sweep <= 0) return null;
      return {
        kind: "choice",
        prompt: "Part of your salary is automatically moved away after payday. How much on average per month?",
        ...moneyOptions(sweep, r),
        explain: `About ${eur(sweep)} a month gets swept automatically. Automation is the easiest way to save.`,
        facts: { sweep: Math.round(sweep) },
      };
    }),
    def(1, "gross-vs-net", ({ P, r }) => {
      const net = P.avg("Salary", 3);
      if (net <= 0) return null;
      const truth = "Net salary (after tax)";
      const opts = shuffle([truth, "Gross salary (before tax)", "Taxable income", "Your employer's total cost"], r);
      return {
        kind: "choice",
        prompt: `The ${eur(net)} that lands in your account each month is your…`,
        options: opts,
        answer: opts.indexOf(truth),
        explain: "It's your net pay: income tax and pension and unemployment contributions are already deducted. The gross salary in your contract is higher.",
        facts: { netSalary: Math.round(net) },
      };
    }),
    def(3, "real-income", ({ P }) => {
      const now = P.avg("Salary", 12);
      const before = P.avg("Salary", 12, 12);
      if (before <= 0) return null;
      const nominal = now / before - 1;
      const real = (1 + nominal) / 1.03 - 1;
      const signed = (x: number) => `${x >= 0 ? "+" : ""}${pct(x, 1)}`;
      return {
        kind: "choice",
        prompt: `Your average salary changed by ${signed(nominal)} compared with the year before. With inflation at about 3%, what was your real (inflation-adjusted) change?`,
        ...bucket(real, [
          { label: "A real raise of 2% or more", lo: 0.02, hi: 9 },
          { label: "A small real raise (0–2%)", lo: 0, hi: 0.02 },
          { label: "A small real pay cut (0 to −2%)", lo: -0.02, hi: 0 },
          { label: "A real pay cut of more than 2%", lo: -9, hi: -0.02 },
        ]),
        explain: `(1 ${nominal >= 0 ? "+" : "−"} ${pct(Math.abs(nominal), 1)}) ÷ 1.03 − 1 ≈ ${signed(real)}. A raise below inflation still means less buying power.`,
        facts: { nominalChange: signed(nominal), realChange: signed(real) },
      };
    }),
  ],

  saasto: [
    def(1, "investing-habit", ({ P, r }) => {
      const v = P.avg("Invest Deposit", 12) * 12;
      if (v <= 0) {
        return {
          kind: "truefalse",
          prompt: "True or false: you made deposits into investments in the last 12 months.",
          ...tf(false),
          explain: "No investment deposits in the last year. Even small monthly amounts in a fund start compounding.",
          tip: "A monthly fund saving plan can start from small amounts. The habit matters more than the size.",
          facts: { investedLast12: 0 },
        };
      }
      return {
        kind: "choice",
        prompt: "How much did you put into investments in the last 12 months?",
        ...moneyOptions(v, r),
        explain: `${eur(v)} invested over 12 months, about ${eur(v / 12)} a month. 👏`,
        chart: P.series((o) => P.m("Invest Deposit", o), 12),
        facts: { investedLast12: Math.round(v) },
      };
    }),
    def(2, "savings-rate", ({ P }) => {
      const sal = P.avg("Salary", 12);
      if (sal <= 0) return null;
      const s = P.avg("Invest Deposit", 12) / sal;
      return {
        kind: "choice",
        prompt: "What's your savings rate: the share of your salary you put into investments?",
        ...bucket(s, [
          { label: "0–5%", lo: -1, hi: 0.05 },
          { label: "5–10%", lo: 0.05, hi: 0.1 },
          { label: "10–20%", lo: 0.1, hi: 0.2 },
          { label: "Over 20%", lo: 0.2, hi: 99 },
        ]),
        explain: `Your savings rate is ${pct(s)} of a ${eur(sal)} monthly salary.`,
        tip: "Many people aim for 10–20%. Raising it by 1 point a year is a painless way to get there.",
        facts: { saveRate: pct(s), salary: Math.round(sal) },
      };
    }),
    def(1, "emergency-fund", ({ P, p }) => {
      const monthly = P.spendAvg(3);
      if (monthly <= 0) return null;
      const months = p.balance / monthly;
      return {
        kind: "choice",
        prompt: "If your income stopped today, how many months could your current balance cover your spending?",
        ...bucket(months, [
          { label: "Less than 1 month", lo: -99, hi: 1 },
          { label: "1–3 months", lo: 1, hi: 3 },
          { label: "3–6 months", lo: 3, hi: 6 },
          { label: "6 months or more", lo: 6, hi: 1e9 },
        ]),
        explain: `${eur(p.balance)} ÷ ${eur(monthly)} a month ≈ ${months.toFixed(1)} months.`,
        tip: "A buffer of about 3 months of expenses is a common target for an emergency fund.",
        facts: { balance: Math.round(p.balance), monthlySpend: Math.round(monthly), months: Number(months.toFixed(1)) },
      };
    }),
    def(2, "compound-interest", ({ P, r }) => {
      const sal = P.avg("Salary", 3);
      if (sal <= 0) return null;
      const m = Math.max(20, Math.round((sal * 0.1) / 10) * 10);
      const i = 0.05 / 12;
      const fv = m * ((Math.pow(1 + i, 120) - 1) / i);
      return {
        kind: "choice",
        prompt: `If you invested ${eur(m)} a month (≈10% of your salary) for 10 years at a 5% average yearly return, roughly how much would you have?`,
        ...moneyOptions(fv, r),
        explain: `About ${eur(fv)}: you put in ${eur(m * 120)} and compounding adds ${eur(fv - m * 120)} on top.`,
        tip: "Returns are never guaranteed, but time in the market is what makes compounding work.",
        facts: { monthly: m, futureValue: Math.round(fv), paidIn: m * 120 },
      };
    }),
    def(1, "trim-wants", ({ P, r }) => {
      const s = (P.avg("Entertainment", 3) + P.avg("Lifestyle", 3)) * 12 * 0.2;
      if (s < 30) return null;
      return {
        kind: "choice",
        prompt: "If you trimmed entertainment and shopping by 20%, how much would you free up in a year?",
        ...moneyOptions(s, r),
        explain: `Entertainment + lifestyle cost you ${eur((P.avg("Entertainment", 3) + P.avg("Lifestyle", 3)) * 12)} a year; 20% is ${eur(s)}.`,
        facts: { yearlySaving: Math.round(s) },
      };
    }),
    def(2, "inflation", ({ p, r }) => {
      const b = Math.max(1000, Math.round(p.balance / 100) * 100);
      const real = b / Math.pow(1.03, 5);
      return {
        kind: "choice",
        prompt: `Your balance is about ${eur(b)}. If it earns 0% while inflation runs at 3% a year, what will it buy in 5 years, in today's money?`,
        ...moneyOptions(real, r),
        explain: `${eur(b)} ÷ 1.03⁵ ≈ ${eur(real)}. Inflation quietly eats ${eur(b - real)} of buying power.`,
        tip: "Money you won't need for years can work harder in savings accounts or funds than in a current account.",
        facts: { balance: b, realValue: Math.round(real) },
      };
    }),
    def(2, "real-return", () => ({
      kind: "choice",
      prompt: "Your savings account pays 2% interest while inflation is 3%. What's your real return?",
      options: ["About +5%", "About +2%", "About −1%", "About −3%"],
      answer: 2,
      explain: "Real return ≈ interest − inflation = 2% − 3% = −1%. Your euros grow, but they buy a little less each year.",
      facts: { interest: "2%", inflation: "3%", realReturn: "-1%" },
    })),
    def(3, "rule-of-72", ({ P, p }) => {
      const inv = P.avg("Invest Deposit", 12) * 12;
      const base = inv > 0 ? Math.round(inv / 100) * 100 : Math.max(1000, Math.round((p.balance * 0.1) / 100) * 100);
      return {
        kind: "choice",
        prompt: `Rule of 72: divide 72 by the yearly return to estimate how long money takes to double. At a 6% average return, when would ${eur(base)} become ${eur(base * 2)}?`,
        options: ["In about 6 years", "In about 12 years", "In about 18 years", "In about 24 years"],
        answer: 1,
        explain: "72 ÷ 6 = 12 years. At 8% it takes about 9 years; at 3%, about 24.",
        facts: { amount: base, rate: "6%", years: 12 },
      };
    }),
    def(3, "fund-fees", ({ P, r }) => {
      const inv = P.avg("Invest Deposit", 12);
      const m = inv > 0 ? Math.round(inv / 10) * 10 : Math.max(50, Math.round((P.avg("Salary", 3) * 0.1) / 10) * 10);
      const fv = (rate: number) => m * ((Math.pow(1 + rate / 12, 240) - 1) / (rate / 12));
      const cheap = fv(0.06 - 0.003);
      const pricey = fv(0.06 - 0.015);
      return {
        kind: "choice",
        prompt: `You invest ${eur(m)} a month for 20 years at a 6% gross return. How much more would you end up with in a fund charging 0.3% a year instead of 1.5%?`,
        ...moneyOptions(cheap - pricey, r),
        explain: `About ${eur(cheap - pricey)} more (${eur(cheap)} vs. ${eur(pricey)}). Fees compound against you, just like returns compound for you.`,
        tip: "Check a fund's ongoing charges before you buy; index funds are usually the cheapest.",
        facts: { monthly: m, cheapFund: Math.round(cheap), expensiveFund: Math.round(pricey) },
      };
    }),
    def(3, "capital-income-tax", ({ P, r }) => {
      const inv = P.avg("Invest Deposit", 12) * 12;
      const gain = Math.round(Math.max(500, inv * 0.08) / 10) * 10;
      return {
        kind: "choice",
        prompt: `Say you sell investments at a ${eur(gain)} profit. In Finland, capital income up to €30,000 a year is taxed at 30%. How much tax do you pay?`,
        ...moneyOptions(gain * 0.3, r),
        explain: `30% × ${eur(gain)} = ${eur(gain * 0.3)}. Above €30,000 a year the rate is 34%, and for long-held assets the deemed acquisition cost rule can lower the taxable gain.`,
        facts: { gain, tax: Math.round(gain * 0.3) },
      };
    }),
    def(3, "cash-drag", ({ P, p, r }) => {
      const idle = p.balance - P.spendAvg(3) * 3;
      if (idle < 2000) return null;
      return {
        kind: "choice",
        prompt: `You hold ${eur(p.balance)}, about ${eur(idle)} more than a 3-month safety buffer. If that extra cash earned 4% a year instead of roughly 0%, what would it make in a year?`,
        ...moneyOptions(idle * 0.04, r),
        explain: `4% × ${eur(idle)} ≈ ${eur(idle * 0.04)} a year. Cash beyond your buffer has an opportunity cost, often called cash drag.`,
        tip: "Keep your buffer easy to reach; money you won't need for years can go to savings accounts or funds.",
        facts: { balance: Math.round(p.balance), idleCash: Math.round(idle), yearly: Math.round(idle * 0.04) },
      };
    }),
  ],

  vertailu: [
    ...(["Restaurants", "Groceries", "Transportation", "Entertainment"] as const).map((cat) =>
      def(1, `peer-${cat.toLowerCase()}`, ({ P, p, peer }) => {
          const mine = P.avg(cat, 12);
          const theirs = peer.spend[cat];
          const c = compare(mine, theirs);
          return {
            kind: "choice",
            prompt: `People aged ${p.band} in our data spend a median ${eur(theirs)} a month on ${cat.toLowerCase()}. Compared with them, you spend…`,
            options: c.options,
            answer: c.answer,
            explain: `You spend ${eur(mine)} a month (12-month average): ${c.ratio >= 1 ? `${pct(c.ratio - 1)} more` : `${pct(1 - c.ratio)} less`} than the median for your age group.`,
            chartAfter: true,
            chart: { labels: ["You", `Age ${p.band}`], values: [Math.round(mine), Math.round(theirs)], highlight: 0, unit: "€" },
            facts: { category: cat, mine: Math.round(mine), peers: Math.round(theirs), peerGroupSize: peer.n },
          };
        }),
    ),
    def(2, "peer-outlier", ({ P, p, peer, r }) => {
      const ratios = VARIABLE_CATS.filter((c) => peer.spend[c] > 5).map((c) => [c, P.avg(c, 12) / peer.spend[c]] as const)
        .sort((a, b) => b[1] - a[1]);
      if (!ratios.length) return null;
      const [cat, ratio] = ratios[0];
      return {
        kind: "choice",
        prompt: `In which category are you furthest ABOVE the median for people aged ${p.band}?`,
        ...categoryOptions(cat, ratios.map((x) => x[0]), r),
        explain: `${cat}: ${eur(P.avg(cat, 12))}/month vs. a median of ${eur(peer.spend[cat])} (${ratio.toFixed(1)}×).`,
        facts: { category: cat, ratio: Number(ratio.toFixed(2)) },
      };
    }),
    def(1, "peer-total", ({ P, p, peer }) => {
      const mine = P.spendAvg(12);
      const c = compare(mine, peer.totalSpend);
      return {
        kind: "choice",
        prompt: `Overall, people aged ${p.band} spend a median ${eur(peer.totalSpend)} a month. You spend…`,
        options: c.options,
        answer: c.answer,
        explain: `Your 12-month average is ${eur(mine)} a month.`,
        chartAfter: true,
        chart: { labels: ["You", `Age ${p.band}`], values: [Math.round(mine), Math.round(peer.totalSpend)], highlight: 0, unit: "€" },
        facts: { mine: Math.round(mine), peers: Math.round(peer.totalSpend) },
      };
    }),
    def(1, "peer-frequency", ({ P, p, peer }) => {
      const mine = P.c("Restaurants", 0);
      const theirs = peer.count.Restaurants;
      const c = compare(mine, theirs);
      return {
        kind: "choice",
        prompt: `People your age (${p.band}) eat out about ${theirs.toFixed(0)} times a month. In ${LM(P)}, you went out…`,
        options: c.options,
        answer: c.answer,
        explain: `You ate or drank out ${mine} times in ${LM(P)}.`,
        facts: { mine, peers: theirs },
      };
    }),
    def(2, "peer-savings-rate", ({ P, p, peer }) => {
      const invests = P.avg("Invest Deposit", 12) > 0;
      return {
        kind: "choice",
        prompt: `What share of people aged ${p.band} in our data put money into investments every month?`,
        ...bucket(peer.investShare, [
          { label: "Under 10%", lo: -1, hi: 0.1 },
          { label: "10–25%", lo: 0.1, hi: 0.25 },
          { label: "25–50%", lo: 0.25, hi: 0.5 },
          { label: "Over 50%", lo: 0.5, hi: 2 },
        ]),
        explain: `${pct(peer.investShare)} of ${peer.n} people your age invest monthly. ${invests ? "You're one of them, nice!" : "You're not (yet) one of them; even a small monthly amount puts you ahead."}`,
        facts: { investShare: pct(peer.investShare), youInvest: invests ? "yes" : "no" },
      };
    }),
    def(3, "median-vs-average", ({ r }) => {
      const truth = "A few very big spenders would pull the average up";
      const opts = shuffle([truth, "The median is always lower than the average", "Averages can't be calculated for money", "The median includes more people"], r);
      return {
        kind: "choice",
        prompt: "Why do we compare you with the median of your age group rather than the average?",
        options: opts,
        answer: opts.indexOf(truth),
        explain: "The median is the person in the middle. A handful of big spenders can drag an average far up, so the median is closer to a typical peer.",
        facts: {},
      };
    }),
  ],

  koti: [
    // personal mortgage application (only customers who applied)
    def(2, "ltv", ({ p }) => {
      const m = p.mortgage;
      if (!m) return null;
      return {
        kind: "choice",
        prompt: `In your home-loan application you asked for ${eur(m.loan)} on a ${eur(m.price)} home. What's the loan-to-value (LTV)?`,
        ...bucket(m.loan / m.price, [
          { label: "Under 75%", lo: -1, hi: 0.75 },
          { label: "75–85%", lo: 0.75, hi: 0.85 },
          { label: "85–90%", lo: 0.85, hi: 0.9 },
          { label: "Over 90%", lo: 0.9, hi: 9 },
        ]),
        explain: `${eur(m.loan)} ÷ ${eur(m.price)} = ${pct(m.loan / m.price, 1)}. In Finland the LTV cap is 90% (95% for first homes).`,
        facts: { loan: m.loan, price: m.price, ltv: pct(m.loan / m.price, 1) },
      };
    }),
    def(2, "affordability", ({ P, p }) => {
      const m = p.mortgage;
      if (!m) return null;
      const sal = P.avg("Salary", 6);
      const c = compare(sal, m.requiredIncome);
      return {
        kind: "choice",
        prompt: `The bank calculated that this loan needs about ${eur(m.requiredIncome)} of monthly income. Your average salary is…`,
        options: ["Above that", "Below that", "Roughly equal (±10%)"],
        answer: c.answer,
        explain: `Your 6-month average salary is ${eur(sal)}, vs. ${eur(m.requiredIncome)} required.`,
        facts: { salary: Math.round(sal), required: Math.round(m.requiredIncome), decision: m.decision },
      };
    }),
    def(2, "collateral", ({ p, r }) => {
      const m = p.mortgage;
      if (!m || m.decision !== "rejected" || !m.reason) return null;
      const labels: Record<string, string> = {
        insufficient_collateral: "Not enough collateral",
        insufficient_income: "Income too low for the loan",
        insufficient_equity: "Too little own money (equity)",
        existing_debt: "Too much existing debt",
      };
      const truth = labels[m.reason] ?? m.reason;
      return {
        kind: "choice",
        prompt: "Your application wasn't approved. Which factor was decisive?",
        ...categoryOptions(truth, Object.values(labels), r),
        explain: `The decision cited: ${truth.toLowerCase()}. Collateral was valued at ${eur(m.collateral)} against a ${eur(m.loan)} loan.`,
        tip: "Extra collateral, like a state guarantee or a family member's guarantee, can often close a collateral gap.",
        facts: { reason: truth, collateral: m.collateral, loan: m.loan },
      };
    }),
    def(1, "equity", ({ p, r }) => {
      const m = p.mortgage;
      if (!m) return null;
      return {
        kind: "choice",
        prompt: `How much of your own money (equity) did you bring to the ${eur(m.price)} purchase?`,
        ...moneyOptions(m.equity, r),
        explain: `${eur(m.equity)}, which is ${pct(m.equity / m.price, 1)} of the price.`,
        facts: { equity: m.equity, share: pct(m.equity / m.price, 1) },
      };
    }),
    // concept questions, personalised with the customer's own savings pace
    def(1, "down-payment", ({ r }) => ({
      kind: "choice",
      prompt: "As a first-time buyer in Finland, you can borrow up to 95% of the price. How much of your own money do you need for a €250,000 home?",
      ...moneyOptions(12500, r),
      explain: "5% of €250,000 = €12,500. For later homes the cap is 90%, so you'd need €25,000.",
      facts: { price: 250000, downPayment: 12500 },
    })),
    def(1, "saving-for-home", ({ P, p }): ReturnType<Gen> => {
      if (p.mortgage) return null;
      const pace = P.avg("Invest Deposit", 12);
      const target = 25000;
      if (pace <= 0) {
        return {
          kind: "truefalse",
          prompt: "True or false: at your current savings pace, you'll have a €25,000 down payment within 5 years.",
          ...tf(false),
          explain: "You aren't setting money aside regularly yet, so the down payment won't grow on its own.",
          tip: "A home-savings plan (ASP) gives first-time buyers in Finland better loan terms. Ask your bank about it.",
          facts: { monthlySavings: 0, target },
        };
      }
      const months = target / pace;
      return {
        kind: "choice",
        prompt: `You invest about ${eur(pace)} a month. If you saved that instead, how long until you've saved a €25,000 down payment?`,
        ...bucket(months, [
          { label: "Under 1 year", lo: 0, hi: 12 },
          { label: "1–3 years", lo: 12, hi: 36 },
          { label: "3–6 years", lo: 36, hi: 72 },
          { label: "More than 6 years", lo: 72, hi: 1e9 },
        ]),
        explain: `€25,000 ÷ ${eur(pace)} ≈ ${Math.ceil(months)} months (${(months / 12).toFixed(1)} years).`,
        tip: "A home-savings plan (ASP) gives first-time buyers in Finland better loan terms.",
        facts: { monthlySavings: Math.round(pace), months: Math.ceil(months) },
      };
    }),
    def(3, "stress-test", ({ r }) => {
      const i = 0.06 / 12;
      const pay = (200000 * i) / (1 - Math.pow(1 + i, -300));
      return {
        kind: "choice",
        prompt: "Finnish banks check you could still pay your loan if interest rose to about 6%. On a €200,000, 25-year loan, what's the monthly payment at 6%?",
        ...moneyOptions(pay, r),
        explain: `About ${eur(pay)} a month. At 3% it would be around ${eur((200000 * 0.0025) / (1 - Math.pow(1.0025, -300)))}.`,
        facts: { loan: 200000, years: 25, rate: "6%", payment: Math.round(pay) },
      };
    }),
    def(2, "transfer-tax", ({ r }) => {
      const opts = shuffle(["1.5%", "3%", "4%", "0%"], r);
      return {
        kind: "choice",
        prompt: "Buying an apartment (housing-company shares) in Finland, what transfer tax do you pay?",
        options: opts,
        answer: opts.indexOf("1.5%"),
        explain: "1.5% of the price for housing-company shares (3% for a property such as a detached house). Budget it on top of the down payment!",
        facts: { transferTaxShares: "1.5%", transferTaxProperty: "3%" },
      };
    }),
    def(2, "asp", ({ r }) => {
      const opts = shuffle(["5%", "10%", "20%", "25%"], r);
      return {
        kind: "choice",
        prompt: "Finland's ASP home-savings scheme gives first-time buyers better loan terms. How much of the home's price do you need to save in your ASP account?",
        options: opts,
        answer: opts.indexOf("10%"),
        explain: "At least 10% of the price. In return you get a state guarantee and an interest subsidy on the ASP loan.",
        facts: { aspShare: "10%" },
      };
    }),
    def(3, "euribor", ({ p, r }) => {
      const loan = p.mortgage?.loan ?? 200000;
      const pay = (rate: number) => (loan * (rate / 12)) / (1 - Math.pow(1 + rate / 12, -300));
      const diff = pay(0.04) - pay(0.03);
      return {
        kind: "choice",
        prompt: `Most Finnish home loans follow the 12-month Euribor. On a ${eur(loan)}, 25-year loan, how much more would you pay per month if your rate rose from 3% to 4%?`,
        ...moneyOptions(diff, r),
        explain: `${eur(pay(0.03))} → ${eur(pay(0.04))}: about ${eur(diff)} more a month, or ${eur(diff * 12)} a year. An interest-rate cap or a fixed rate can limit this risk.`,
        facts: { loan, at3: Math.round(pay(0.03)), at4: Math.round(pay(0.04)) },
      };
    }),
    def(3, "amortization", ({ p, r }) => {
      const loan = p.mortgage?.loan ?? 200000;
      const i = 0.03 / 12;
      const pay = (loan * i) / (1 - Math.pow(1 + i, -300));
      let left = loan;
      let interest = 0;
      for (let k = 0; k < 12; k++) {
        interest += left * i;
        left -= pay - left * i;
      }
      return {
        kind: "choice",
        prompt: `In the first year of a ${eur(loan)}, 25-year loan at 3%, how much of your payments goes to interest rather than paying down the loan?`,
        ...moneyOptions(interest, r),
        explain: `About ${eur(interest)} of the ${eur(pay * 12)} you pay. Early on interest takes a big slice; it shrinks as the loan does.`,
        facts: { loan, yearlyPayments: Math.round(pay * 12), interest: Math.round(interest) },
      };
    }),
  ],
};

/* ---------------------------------------------------------------- levels & concepts */

export const LEVELS: Record<Level, { name: string; blurb: string; dots: string }> = {
  1: { name: "Beginner", blurb: "I'm just starting to keep track of my money", dots: "●○○" },
  2: { name: "Intermediate", blurb: "I budget and save, and want to get smarter about it", dots: "●●○" },
  3: { name: "Advanced", blurb: "I invest and know about compounding, fees and LTV", dots: "●●●" },
};

/** Short "did you know" cards, shown when a concept is new to the user or they got it wrong. */
export const CONCEPTS: Record<string, { title: string; body: string }> = {
  "latte-factor": { title: "The latte factor", body: "Small, frequent purchases feel harmless but add up to hundreds of euros a year." },
  "50-30-20": { title: "The 50/30/20 rule", body: "A simple budget: ~50% of net income for needs, ~30% for wants, ~20% for savings and debt repayment." },
  "lifestyle-creep": { title: "Lifestyle creep", body: "When spending rises every time income does, you never get ahead. Save part of every raise first." },
  "opportunity-cost": { title: "Opportunity cost", body: "The true cost of a choice includes what the money could have earned if used differently." },
  "gross-vs-net": { title: "Gross vs. net salary", body: "Gross is your contract salary. Net is what's left after income tax and social security contributions." },
  "spend-ratio": { title: "Spending ratio", body: "Spending ÷ income. Below 90% means you're building a margin every month." },
  "housing-ratio": { title: "Housing cost ratio", body: "Housing + bills ÷ net income. Keeping it under about a third leaves room to save." },
  automation: { title: "Pay yourself first", body: "Automate a transfer to savings on payday, so saving doesn't depend on willpower." },
  "savings-rate": { title: "Savings rate", body: "The share of income you save or invest. It's the biggest lever on long-term wealth." },
  "emergency-fund": { title: "Emergency fund", body: "Cash for surprises like job loss or repairs. A common target is about 3 months of expenses." },
  "compound-interest": { title: "Compound interest", body: "Returns earn returns. The longer money stays invested, the faster it snowballs." },
  inflation: { title: "Inflation", body: "Rising prices shrink what each euro buys. Money earning 0% loses value every year." },
  "real-return": { title: "Real return", body: "Return after inflation: roughly the interest rate minus inflation." },
  "rule-of-72": { title: "Rule of 72", body: "72 ÷ yearly return ≈ years for money to double. Quick mental math for compounding." },
  "fund-fees": { title: "Fund fees", body: "Ongoing charges are taken every year, whatever the market does. Over decades, 1% can cost tens of thousands." },
  "capital-income-tax": { title: "Capital income tax", body: "In Finland, gains, dividends and interest are taxed at 30% (34% above €30,000 a year)." },
  "cash-drag": { title: "Cash drag", body: "Cash beyond your safety buffer earns little; over time that idle money costs you returns." },
  "median-vs-average": { title: "Median vs. average", body: "The median is the middle value, so a few extreme values don't distort it the way they do an average." },
  "impulse-buying": { title: "Impulse buying", body: "Late-night and emotional purchases are often regretted. A 24-hour pause rule helps." },
  "real-income": { title: "Real income", body: "Your raise minus inflation. If prices rise faster than your pay, you're effectively earning less." },
  annualising: { title: "Think in years", body: "Multiply monthly habits by 12. €40 a month sounds small; €480 a year doesn't." },
  ltv: { title: "Loan-to-value (LTV)", body: "Loan ÷ property value. Finland caps it at 90% (95% for first homes), so you need a down payment." },
  affordability: { title: "Affordability", body: "Banks check your income can carry the loan, even if interest rates rise." },
  collateral: { title: "Collateral", body: "What secures the loan, usually the home itself. Extra guarantees can cover a gap." },
  equity: { title: "Equity", body: "The part of the price you pay with your own money rather than the loan." },
  "down-payment": { title: "Down payment", body: "Your own funds for a home purchase: at least 5% for first homes in Finland, otherwise 10%." },
  "stress-test": { title: "Interest-rate stress test", body: "Lenders test whether you could still pay if your loan rate rose to about 6%." },
  "transfer-tax": { title: "Transfer tax", body: "1.5% for apartments (housing-company shares), 3% for property. Paid on top of the price." },
  asp: { title: "ASP home savings", body: "A Finnish scheme for first-time buyers: save 10% of the price and get a state guarantee and interest subsidy." },
  euribor: { title: "Euribor", body: "The reference rate most Finnish home loans follow. When it moves, your monthly payment moves too." },
  "project-required": { title: "Required monthly saving", body: "(Target − what you already have) ÷ months left. The one number that tells you if a project fits your budget." },
  "project-share": { title: "Leave some slack", body: "A plan that eats all your spare money breaks at the first surprise bill. Aim to keep 20% or more free." },
  "project-horizon": { title: "Match money to time", body: "Money needed within ~3 years belongs in savings; only longer horizons can ride out market dips." },
  amortization: { title: "Amortization", body: "With an annuity loan, early payments are interest-heavy; the principal share grows over time." },
};

export const isMastered = (m?: { r: number; w: number }) => !!m && m.r - m.w >= 2;

/* ---------------------------------------------------------------- lesson builder */

type Candidate = Question & { weight: number };

function candidates(profile: Profile, peer: PeerBand, defs: [GenDef, string][], r: () => number) {
  const ctx: Ctx = { P: new P(profile), p: profile, peer, r };
  const out: Question[] = [];
  for (const [d, id] of defs) {
    const q = d.gen(ctx);
    if (q && q.answer >= 0) out.push({ ...q, id, unit: id.split("-")[0] as UnitId, level: d.level, concept: d.concept });
  }
  return out;
}

/** How well a question's difficulty fits the learner (a little stretch is good, far below is boring). */
function levelFit(qLevel: Level, level: Level) {
  const d = qLevel - level;
  return d === 0 ? 3 : d === 1 ? 0.9 : d === -1 ? 0.6 : d > 1 ? 0.12 : 0.1;
}

/** Prefer what the learner hasn't seen or got wrong; mostly skip what they've mastered. */
function novelty(m?: { r: number; w: number }) {
  if (!m) return 1.6;
  if (isMastered(m)) return 0.15;
  return m.w >= m.r ? 2 : 1;
}

export type LessonOptions = { level: Level; mastery: Mastery; salt?: string };

function pickLesson(profile: Profile, peer: PeerBand, defs: [GenDef, string][], seed: string, node: number, opts: LessonOptions): Question[] {
  const r = rng(seed);
  // the last node of a unit leans one notch harder
  const target = Math.min(3, opts.level + (node === NODES_PER_UNIT - 1 ? 1 : 0)) as Level;
  const pool: Candidate[] = candidates(profile, peer, defs, r).map((q) => ({
    ...q,
    weight: (levelFit(q.level, opts.level) + (target !== opts.level ? levelFit(q.level, target) : 0)) * novelty(opts.mastery[q.concept]),
  }));
  // weighted sampling without replacement (Efraimidis–Spirakis), then a gentle easy→hard ramp
  return pool
    .map((q) => ({ q, key: Math.pow(r(), 1 / q.weight) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, QUESTIONS_PER_LESSON)
    .map(({ q }) => q)
    .sort((a, b) => a.level - b.level);
}

/* ---------------------------------------------------------------- self-assessment topics & custom paths */

export type TopicId = "budgeting" | "cashflow" | "saving" | "investing" | "home" | "taxes";

export const TOPICS: { id: TopicId; title: string; question: string; icon: string }[] = [
  { id: "budgeting", title: "Everyday spending", question: "Budgeting & everyday spending", icon: "wallet" },
  { id: "cashflow", title: "Payday rhythm", question: "Salary, bills & cash flow", icon: "calendar" },
  { id: "saving", title: "Safety buffer", question: "Saving & emergency funds", icon: "piggy" },
  { id: "investing", title: "Growing money", question: "Investing & compound interest", icon: "chart" },
  { id: "home", title: "Home dream", question: "Home loans & mortgages", icon: "home" },
  { id: "taxes", title: "Tax smarts", question: "Taxes & take-home pay", icon: "receipt" },
];

const UNIT_TOPIC: Record<UnitId, TopicId> = {
  arki: "budgeting", ruoka: "budgeting", liikkuminen: "budgeting", vertailu: "budgeting",
  palkka: "cashflow", saasto: "saving", koti: "home",
};
const CONCEPT_TOPIC: Record<string, TopicId> = {
  "gross-vs-net": "taxes", "capital-income-tax": "taxes", "transfer-tax": "taxes", "real-income": "cashflow",
  "compound-interest": "investing", "rule-of-72": "investing", "fund-fees": "investing", "real-return": "investing",
  inflation: "investing", "investing-habit": "investing", "opportunity-cost": "investing", "cash-drag": "investing",
  "peer-savings-rate": "saving", "median-vs-average": "budgeting",
};

type Entry = { def: GenDef; id: string; unit: UnitId; topic: TopicId };
const ENTRIES: Entry[] = (Object.keys(GENERATORS) as UnitId[]).flatMap((u) =>
  GENERATORS[u].map((d, i) => ({ def: d, id: `${u}-${i}`, unit: u, topic: CONCEPT_TOPIC[d.concept] ?? UNIT_TOPIC[u] })),
);
const BY_CONCEPT = new Map(ENTRIES.map((e) => [e.def.concept, e]));

export type CatalogItem = { concept: string; level: Level; topic: TopicId; title: string; example: string };

/** Every concept that has enough data to be asked to this customer. */
export function catalog(profile: Profile, peer: PeerBand): CatalogItem[] {
  return candidates(profile, peer, ENTRIES.map((e) => [e.def, e.id]), rng(`${profile.id}:catalog`)).map((q) => ({
    concept: q.concept,
    level: q.level,
    topic: BY_CONCEPT.get(q.concept)!.topic,
    title: CONCEPTS[q.concept]?.title ?? q.concept.replace(/-/g, " "),
    example: q.prompt,
  }));
}

export type PathUnit = { id: string; title: string; why: string; icon: string; level: Level; topic: TopicId; concepts: string[] };
export type LearningPath = { intro: string; units: PathUnit[]; source: "gemini" | "rules" };
export type SelfAssessment = { name: string; age: number; goals: string[]; levels: Record<TopicId, Level> };

/** Deterministic path used when the LLM is unavailable: goals first, then weakest topics. */
export function rulePath(me: SelfAssessment, items: CatalogItem[]): LearningPath {
  const goalTopics = new Set(me.goals.map((g) => GOAL_TOPIC[g]).filter(Boolean));
  const order = [...TOPICS].sort((a, b) => Number(goalTopics.has(b.id)) - Number(goalTopics.has(a.id)) || me.levels[a.id] - me.levels[b.id]);
  const units: PathUnit[] = [];
  for (const t of order) {
    const lvl = me.levels[t.id];
    const pool = items.filter((c) => c.topic === t.id).sort((a, b) => Math.abs(a.level - lvl) - Math.abs(b.level - lvl));
    if (pool.length < 3) continue;
    units.push({
      id: t.id, title: t.title, icon: t.icon, level: lvl, topic: t.id,
      why: goalTopics.has(t.id) ? "Straight from your goals." : lvl === 1 ? "Building your foundations here." : "Levelling up a topic you know.",
      concepts: pool.slice(0, 8).map((c) => c.concept),
    });
  }
  return { intro: `Here's your path, ${me.name}: we start with what matters most to you and skip what you already know.`, units, source: "rules" };
}

export const GOALS = [
  "Build a safety buffer",
  "Spend less day to day",
  "Start investing",
  "Buy a home",
  "Understand my salary & taxes",
  "Save for something big",
];
const GOAL_TOPIC: Record<string, TopicId> = {
  "Build a safety buffer": "saving",
  "Spend less day to day": "budgeting",
  "Start investing": "investing",
  "Buy a home": "home",
  "Understand my salary & taxes": "taxes",
  "Save for something big": "saving",
};

/** Keep only concepts the customer can actually be asked; top up thin units from the same topic. */
export function sanitizePath(raw: unknown, me: SelfAssessment, items: CatalogItem[]): LearningPath | null {
  const r = raw as { intro?: string; units?: Partial<PathUnit>[] } | null;
  if (!r?.units?.length) return null;
  const known = new Map(items.map((c) => [c.concept, c]));
  const used = new Set<string>();
  const icons = ["wallet", "utensils", "bus", "calendar", "sprout", "users", "home", "piggy", "chart", "receipt"];
  const units: PathUnit[] = [];
  for (const [k, u] of r.units.slice(0, 7).entries()) {
    const concepts = (u.concepts ?? []).filter((c) => known.has(c) && !used.has(c));
    const topic = (TOPICS.find((t) => t.id === u.topic)?.id ?? known.get(concepts[0])?.topic ?? "budgeting") as TopicId;
    const level = ([1, 2, 3].includes(Number(u.level)) ? Number(u.level) : me.levels[topic]) as Level;
    // top thin units up to a full lesson: same topic first, then the closest-level concepts left over
    const spare = items
      .filter((c) => !used.has(c.concept) && !concepts.includes(c.concept))
      .sort((a, b) => Number(b.topic === topic) - Number(a.topic === topic) || Math.abs(a.level - level) - Math.abs(b.level - level));
    for (const c of spare) if (concepts.length < QUESTIONS_PER_LESSON) concepts.push(c.concept);
    if (concepts.length < 3) continue;
    concepts.forEach((c) => used.add(c));
    units.push({
      id: `u${k}`,
      title: String(u.title ?? TOPICS.find((t) => t.id === topic)!.title).slice(0, 40),
      why: String(u.why ?? "").slice(0, 160),
      icon: icons.includes(String(u.icon)) ? String(u.icon) : TOPICS.find((t) => t.id === topic)!.icon,
      level, topic, concepts: concepts.slice(0, 10),
    });
  }
  return units.length >= 3 ? { intro: String(r.intro ?? "").slice(0, 400), units, source: "gemini" } : null;
}

/** A lesson drawn from a path unit's concept list. */
export function buildUnitLesson(profile: Profile, peer: PeerBand, unit: PathUnit, node: number, opts: LessonOptions) {
  const defs = unit.concepts.map((c) => BY_CONCEPT.get(c)).filter((e): e is Entry => !!e).map((e) => [e.def, e.id] as [GenDef, string]);
  return pickLesson(profile, peer, defs, `${profile.id}:${unit.id}:${node}:${opts.salt ?? ""}`, node, { ...opts, level: unit.level });
}

export const ageBand = (a: number) =>
  a <= 25 ? "18-25" : a <= 35 ? "26-35" : a <= 45 ? "36-45" : a <= 55 ? "46-55" : a <= 65 ? "56-65" : "66+";
