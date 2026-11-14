"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, House, RefreshCw, Sparkles, Target, Wand2, X } from "lucide-react";
import { eur } from "@/lib/format";
import {
  fmtMonths, guessOptions, monthsNeeded, project, simulate, type Finances, type Goal, type SimInput, type SimResult,
} from "@/lib/simulate";
import { Mascot } from "./Mascot";

export type GoalState = Goal & { input: SimInput; verdict: string };

type Plan = { headline: string; steps: string[]; ai: boolean };

function fallbackPlan(r: SimResult, i: SimInput): Plan {
  return {
    headline: `${r.verdict.label}: ${eur(r.required)} a month gets you to ${eur(i.target)} in ${fmtMonths(i.months)}.`,
    steps: r.levers.slice(0, 3).map((l) => `${l.title}. ${l.detail}.`),
    ai: false,
  };
}

/** Interactive what-if simulator for a personal goal. */
export function GoalSimulator({
  name, goal, finances, initial, onChange,
}: {
  name: string;
  goal: Goal;
  finances: Finances;
  initial: SimInput;
  onChange: (input: SimInput, result: SimResult) => void;
}) {
  const [input, setInput] = useState<SimInput>(initial);
  const result = useMemo(() => simulate(goal, finances, input), [goal, finances, input]);
  const key = JSON.stringify(input);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planFor, setPlanFor] = useState<string>(key);

  useEffect(() => {
    onChange(input, result);
  }, [input, result, onChange]);

  async function fetchPlan(): Promise<Plan> {
    try {
      const res = await fetch("/api/goal/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, goal, finances, input,
          result: {
            required: result.required, capacity: result.capacity, verdict: result.verdict.label,
            reachIn: Number.isFinite(result.reachIn) ? result.reachIn : null,
            levers: result.levers.map((l) => `${l.title} (${l.detail})`), home: result.home,
          },
        }),
      });
      const data = res.ok ? await res.json() : null;
      return data?.headline ? { ...data, ai: true } : fallbackPlan(result, input);
    } catch {
      return fallbackPlan(result, input);
    }
  }

  function askPlan() {
    setPlan(null);
    setPlanFor(key);
    fetchPlan().then(setPlan);
  }

  // first plan as soon as the simulation opens
  useEffect(() => {
    fetchPlan().then(setPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<SimInput>) => setInput((i) => ({ ...i, ...patch }));
  const monthlyMax = Math.max(100, Math.ceil(Math.max(result.required * 1.6, result.capacity * 1.6, input.monthly * 1.2) / 50) * 50);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl bg-g900 p-4 text-white">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-g300"><Target size={14} /> Your goal</p>
        <h2 className="font-display mt-1 text-xl font-bold leading-6">{goal.label}</h2>
        <p className="mt-1 text-sm text-white/80">{eur(input.target)} in {fmtMonths(input.months)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${result.verdict.tone}`}>{result.verdict.label}</span>
          <span className="text-sm text-white/85">
            Needs <strong className="text-white">{eur(result.required)}/mo</strong> · you have <strong className="text-white">{eur(result.capacity)}/mo</strong> spare
          </span>
        </div>
      </div>

      <ProjectionChart input={input} />

      {result.home && (
        <div className="rounded-2xl border border-line p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-ink"><House size={16} className="text-g700" /> The home maths</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-ink2">
            <dt>Down payment ({goal.firstHome ? "5%, first home" : "10%"})</dt><dd className="text-right font-semibold text-ink">{eur(result.home.downPayment)}</dd>
            <dt>Transfer tax (1.5%)</dt><dd className="text-right font-semibold text-ink">{eur(result.home.transferTax)}</dd>
            <dt>Loan</dt><dd className="text-right font-semibold text-ink">{eur(result.home.loan)}</dd>
            <dt>Payment if rates hit 6%</dt>
            <dd className={`text-right font-semibold ${result.home.affordable ? "text-g700" : "text-err"}`}>{eur(result.home.stressPayment)}/mo</dd>
          </dl>
          <p className={`mt-2 rounded-xl px-3 py-2 text-xs ${result.home.affordable ? "bg-g100 text-g900" : "bg-errbg text-err"}`}>
            {result.home.affordable
              ? "That stress-test payment stays under ~40% of your salary, a common comfort line."
              : "That stress-test payment is above ~40% of your salary: a cheaper home or a bigger down payment would make it safer."}
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-line p-3" aria-label="Try different scenarios">
        <p className="text-sm font-semibold text-ink">Play with the numbers</p>
        <Slider label="I set aside each month" value={input.monthly} min={0} max={monthlyMax} step={10} format={(v) => `${eur(v)}`} onChange={(v) => set({ monthly: v })} />
        <Slider label="Deadline" value={input.months} min={1} max={Math.max(120, goal.months * 2)} step={1} format={fmtMonths} onChange={(v) => set({ months: v })} />
        <Slider label="Target" value={input.target} min={500} max={Math.max(2000, Math.round(goal.target * 2))} step={100} format={(v) => eur(v)} onChange={(v) => set({ target: v })} />
        <Slider label="Already saved toward it" value={input.start} min={0} max={Math.max(0, Math.round(finances.balance / 100) * 100)} step={100} format={(v) => eur(v)} onChange={(v) => set({ start: v })} />
        <label className="mt-3 flex items-center justify-between gap-3 text-sm text-ink">
          Invest it instead of keeping cash (≈4%/yr, not guaranteed)
          <input type="checkbox" role="switch" checked={input.invest} onChange={(e) => set({ invest: e.target.checked })} className="h-5 w-5 shrink-0 accent-[#007841]" />
        </label>
        <p className="mt-3 rounded-xl bg-weakest px-3 py-2 text-sm text-ink">
          At {eur(input.monthly)}/month you reach {eur(input.target)} in <strong>{fmtMonths(result.reachIn)}</strong>
          {Number.isFinite(result.reachIn) ? (result.reachIn <= input.months ? " ✓ on time" : ` (${fmtMonths(result.reachIn - input.months)} late)`) : ""}.
        </p>
      </section>

      {result.levers.length > 0 && (
        <section aria-label="Ways to get there">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Wand2 size={16} className="text-g700" /> Ways to get there</p>
          <ul className="mt-2 flex flex-col gap-2">
            {result.levers.map((l) => (
              <li key={l.id} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{l.title}</span>
                  <span className="block text-xs text-ink2">{l.detail}</span>
                </span>
                <button onClick={() => set(l.apply)} className="shrink-0 rounded-full border-2 border-g700 px-3 py-1 text-xs font-semibold text-g700 hover:bg-g100">Try it</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-3xl border border-line p-4" aria-live="polite">
        <div className="flex items-center gap-2">
          <Mascot size={30} />
          <h3 className="font-semibold text-ink">Your plan</h3>
          {plan?.ai && <span className="inline-flex items-center gap-1 rounded-full bg-g900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-g300"><Sparkles size={10} /> S-Bank AI</span>}
          {plan && planFor !== key && (
            <button onClick={askPlan} className="ml-auto flex items-center gap-1 text-xs font-semibold text-g700 hover:underline"><RefreshCw size={12} /> Update for my changes</button>
          )}
        </div>
        {plan ? (
          <>
            <p className="mt-2 font-semibold leading-6 text-g900">{plan.headline}</p>
            <ol className="mt-2 flex flex-col gap-2">
              {plan.steps.map((s, k) => (
                <li key={k} className="flex gap-2 text-sm leading-5 text-ink">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-g100 text-[11px] font-bold text-g700">{k + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="mt-3 space-y-2" aria-label="S-Bank AI is writing your plan">
            <div className="h-3 w-4/5 animate-pulse rounded bg-weak" />
            <div className="h-3 w-full animate-pulse rounded bg-weak" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-weak" />
          </div>
        )}
      </section>
    </div>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label htmlFor={id} className="text-ink2">{label}</label>
        <span className="font-semibold tabular-nums text-ink">{format(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={Math.min(value, max)} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[#007841]" />
    </div>
  );
}

function ProjectionChart({ input }: { input: SimInput }) {
  const horizon = Math.max(input.months, 1);
  const pts = project({ ...input, months: horizon });
  const W = 340, H = 150, P = 8;
  const maxV = Math.max(input.target * 1.1, ...pts, 1);
  const x = (m: number) => P + (m / horizon) * (W - 2 * P);
  const y = (v: number) => H - P - (v / maxV) * (H - 2 * P);
  const line = pts.map((v, m) => `${m === 0 ? "M" : "L"}${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(horizon)},${H - P} L${x(0)},${H - P} Z`;
  const hit = pts.findIndex((v) => v >= input.target);
  return (
    <figure className="rounded-2xl border border-line bg-weakest p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Projected savings reach ${eur(pts.at(-1)!)} after ${fmtMonths(horizon)}, target ${eur(input.target)}`}>
        <path d={area} fill="#D2FCD5" />
        <path d={line} fill="none" stroke="#00AA46" strokeWidth="3" strokeLinejoin="round" />
        <line x1={P} x2={W - P} y1={y(input.target)} y2={y(input.target)} stroke="#004628" strokeWidth="1.5" strokeDasharray="5 4" />
        <text x={W - P} y={y(input.target) - 5} textAnchor="end" fontSize="11" fontWeight="700" fill="#004628">Target {eur(input.target)}</text>
        {hit > 0 && <circle cx={x(hit)} cy={y(pts[hit])} r="5" fill="#004628" stroke="#fff" strokeWidth="2" />}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-ink3">
        <span>Today</span>
        <span>{pts.at(-1)! >= input.target ? <span className="font-semibold text-g700"><Check size={11} className="inline" /> {eur(pts.at(-1)!)}</span> : <span className="font-semibold text-err"><X size={11} className="inline" /> {eur(pts.at(-1)!)}</span>} by deadline</span>
      </figcaption>
    </figure>
  );
}

/** "Guess first" question before revealing the simulation: makes the result stick. */
export function GoalGuess({ goal, finances, start, onDone }: { goal: Goal; finances: Finances; start: number; onDone: () => void }) {
  const pace = Math.max(0, finances.surplus);
  const truth = monthsNeeded(goal.target, pace, start, false);
  const { options, answer } = guessOptions(truth);
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === answer;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start gap-3">
        <Mascot size={52} mood={picked === null ? "happy" : right ? "cheer" : "sad"} className="shrink-0" />
        <div className="rounded-2xl rounded-tl-sm border-2 border-line px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-g700">Quick guess first</p>
          <h1 className="font-display mt-1 text-[1.25rem] font-bold leading-7 text-ink">
            If you keep today&apos;s pace{pace > 0 ? ` (about ${eur(pace)} spare a month)` : ""}, how long until you have {eur(goal.target)}?
          </h1>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2.5" role="radiogroup" aria-label="Your guess">
        {options.map((o, k) => {
          const showRight = picked !== null && k === answer;
          const showWrong = picked === k && k !== answer;
          return (
            <button
              key={o} role="radio" aria-checked={picked === k} disabled={picked !== null} onClick={() => setPicked(k)}
              className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left font-semibold transition ${showRight ? "border-g500 bg-g100 text-g900" : showWrong ? "border-err bg-errbg text-err" : "border-line bg-white text-ink shadow-[0_3px_0_#e6e6e6] hover:bg-weakest"}`}
            >
              <span className="flex-1">{o}</span>
              {showRight && <Check size={20} strokeWidth={3} />}
              {showWrong && <X size={20} strokeWidth={3} />}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className={`animate-pop mt-4 rounded-2xl p-4 text-sm leading-6 ${right ? "bg-g100 text-g900" : "bg-errbg text-ink"}`}>
          <strong>{right ? "Spot on!" : "Not quite."}</strong>{" "}
          {pace <= 0
            ? "Right now your spending matches or beats your income, so nothing is left over to save: at today's pace you'd never get there. Let's see what would change that."
            : `With ${eur(start)} already set aside and ${eur(pace)} a month, it takes ${fmtMonths(truth)}${goal.months ? `, vs. the ${fmtMonths(goal.months)} you're aiming for` : ""}. Let's see how to make it work.`}
        </div>
      )}
      <div className="mt-auto pt-6">
        <button
          onClick={onDone} disabled={picked === null}
          className="w-full rounded-full bg-g300 py-3.5 text-[17px] font-semibold text-g900 transition hover:bg-[#49F37B] disabled:cursor-not-allowed disabled:bg-line disabled:text-ink3"
        >
          Run the simulation
        </button>
      </div>
    </div>
  );
}
