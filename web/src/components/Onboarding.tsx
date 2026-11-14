"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Landmark, Loader2, ShieldCheck, Sparkles, Target } from "lucide-react";
import { GOALS, LEVELS, TOPICS, type LearningPath, type SelfAssessment, type TopicId } from "@/lib/questions";
import type { Level, PeerBand, Profile } from "@/lib/types";
import { defaultInput, finances as computeFinances, type Finances, type Goal, type SimInput, type SimResult } from "@/lib/simulate";
import { Mascot } from "./Mascot";
import { GoalGuess, GoalSimulator, type GoalState } from "./GoalSimulator";
import { UnitIcon } from "./UnitIcon";

export type Account = { me: SelfAssessment; profile: Profile; peer: PeerBand; path: LearningPath; model: string | null; goal?: GoalState };

const DOSE: { level: Level; label: string }[] = [
  { level: 1, label: "New to me" },
  { level: 2, label: "I know the basics" },
  { level: 3, label: "Confident" },
];

const STEPS = 8;
const GOAL_EXAMPLES = [
  "Buy a €300k apartment in 4 years",
  "Save €8,000 to travel next summer",
  "Build a €10k safety buffer in a year",
  "Invest €200 a month and reach €50k",
];

export function Onboarding({ onDone }: { onDone: (a: Account) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [levels, setLevels] = useState<Partial<Record<TopicId, Level>>>({});
  const [consent, setConsent] = useState(true);
  const [result, setResult] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acct, setAcct] = useState<{ profile: Profile; peer: PeerBand } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [goalText, setGoalText] = useState("");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const sim = useRef<{ input: SimInput; result: SimResult } | null>(null);
  const fin = acct ? computeFinances(acct.profile) : null;
  const onSim = useCallback((input: SimInput, result: SimResult) => {
    sim.current = { input, result };
  }, []);

  const ageNum = Number(age);

  // every step is a fresh screen
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  const allDosed = TOPICS.every((t) => levels[t.id]);

  const me = (): SelfAssessment => ({ name: name.trim(), age: ageNum, goals, levels: levels as Record<TopicId, Level> });

  async function connect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ me: me() }) });
      if (!res.ok) throw new Error();
      const account = await res.json();
      setAcct(account);
      // with a project: understand it, then quiz + simulate; without one, straight to the path
      if (goalText.trim().length >= 3) await analyseGoal(computeFinances(account.profile));
      else await generate(false, account.profile.id);
    } catch {
      setError("Couldn't connect your account. Try again.");
    } finally {
      setConnecting(false);
    }
  }

  async function analyseGoal(f: Finances) {
    setAnalysing(true);
    try {
      const res = await fetch("/api/goal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: goalText, finances: f }) });
      const data = await res.json();
      setGoal(data.goal);
      sim.current = null;
      setStep(6);
    } finally {
      setAnalysing(false);
    }
  }

  async function generate(withGoal = true, customerId = acct?.profile.id) {
    setStep(8);
    setError(null);
    const goalState: GoalState | undefined =
      withGoal && goal && sim.current ? { ...goal, input: sim.current.input, verdict: sim.current.result.verdict.label } : undefined;
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          me: me(),
          customerId,
          goal: goalState && { ...goalState, target: goalState.input.target, months: goalState.input.months, monthly: goalState.input.monthly },
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResult({ me: me(), profile: data.profile, peer: data.peer, path: data.path, model: data.model, goal: goalState });
      setStep(9);
    } catch {
      setError("Couldn't build your path. Check your connection and try again.");
    }
  }

  const back = step > 0 && step < 8 ? () => setStep(step === 6 || step === 7 ? 2 : step - 1) : undefined;

  return (
    <div className="flex flex-1 flex-col">
      {step > 0 && step < 9 && (
        <div className="flex items-center gap-3 px-4 pt-4">
          <button onClick={back} disabled={!back} aria-label="Back" className="rounded-full p-1 text-ink3 hover:bg-weak hover:text-ink disabled:invisible">
            <ArrowLeft size={22} />
          </button>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS} aria-valuenow={step}>
            <div className="h-full rounded-full bg-g500 transition-all duration-500" style={{ width: `${(step / STEPS) * 100}%` }} />
          </div>
        </div>
      )}

      {step === 0 && (
        <Screen>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <Mascot size={120} mood="cheer" className="animate-bob" />
            <h1 className="font-display mt-5 text-[2.125rem] font-bold leading-[2.5rem] text-g900">Learn money with your own numbers</h1>
            <p className="mt-3 max-w-sm text-[17px] leading-6 text-ink2">
              Hi, I&apos;m Penny! Answer a few questions about yourself and I&apos;ll build a learning path around your level, your goals and your S-Pankki account.
            </p>
          </div>
          <Primary onClick={() => setStep(1)}>Build my path</Primary>
          <p className="mt-3 text-center text-xs text-ink3">Takes about a minute · Junction 2026 prototype</p>
        </Screen>
      )}

      {step === 1 && (
        <Screen>
          <Bubble title="First, who am I talking to?" />
          <label className="mt-6 block text-sm font-semibold text-ink" htmlFor="name">Your first name</label>
          <input
            id="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="given-name" maxLength={30}
            className="mt-1.5 w-full rounded-2xl border-2 border-line px-4 py-3.5 text-[17px] outline-none focus:border-g700"
            placeholder="e.g. Aino"
          />
          <label className="mt-4 block text-sm font-semibold text-ink" htmlFor="age">Your age</label>
          <input
            id="age" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric"
            className="mt-1.5 w-full rounded-2xl border-2 border-line px-4 py-3.5 text-[17px] outline-none focus:border-g700"
            placeholder="e.g. 29"
          />
          <p className="mt-2 text-xs text-ink3">We compare you with people your age, so keep it honest.</p>
          <div className="mt-auto pt-6">
            <Primary disabled={!name.trim() || ageNum < 18 || ageNum > 90} onClick={() => setStep(2)}>Continue</Primary>
          </div>
        </Screen>
      )}

      {step === 2 && (
        <Screen>
          <Bubble title={`Nice to meet you, ${name.trim()}! What do you want to get better at?`} sub="Pick up to 3." />
          <div className="mt-5 flex flex-col gap-2.5" role="group" aria-label="Goals">
            {GOALS.map((g) => {
              const on = goals.includes(g);
              return (
                <button
                  key={g}
                  aria-pressed={on}
                  onClick={() => setGoals(on ? goals.filter((x) => x !== g) : goals.length < 3 ? [...goals, g] : goals)}
                  className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left font-semibold transition ${on ? "border-g700 bg-g100 text-g900 shadow-[0_3px_0_#007841]" : "border-line bg-white text-ink shadow-[0_3px_0_#e6e6e6] hover:bg-weakest"}`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? "border-g700 bg-g700 text-white" : "border-line"}`}>
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                  {g}
                </button>
              );
            })}
          </div>
          <div className="mt-6 rounded-3xl border-2 border-dashed border-gline bg-g50 p-4">
            <label htmlFor="goal" className="flex items-center gap-2 font-semibold text-g900">
              <Target size={18} className="text-g700" /> Got a project in mind? <span className="text-sm font-normal text-ink2">(optional)</span>
            </label>
            <p className="mt-1 text-sm text-ink2">I&apos;ll generate questions that show if it&apos;s realistic, and how to reach it or rethink it.</p>
            <textarea
              id="goal" value={goalText} onChange={(e) => setGoalText(e.target.value)} rows={2} maxLength={300}
              placeholder="e.g. Buy a €300k apartment in 4 years"
              className="mt-3 w-full resize-none rounded-2xl border-2 border-line bg-white px-4 py-3 text-[16px] leading-6 outline-none focus:border-g700"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {GOAL_EXAMPLES.map((g) => (
                <button key={g} onClick={() => setGoalText(g)} className="rounded-full border border-gline bg-white px-3 py-1.5 text-[13px] font-medium text-g900 hover:bg-g100">
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-auto pt-6">
            <Primary disabled={!goals.length && goalText.trim().length < 3} onClick={() => setStep(3)}>Continue</Primary>
          </div>
        </Screen>
      )}

      {step === 3 && (
        <Screen>
          <Bubble title="Now rate yourself, honestly." sub="I'll skip what you already know and focus on what's new to you." />
          <div className="mt-5 flex flex-col gap-4">
            {TOPICS.map((t) => (
              <fieldset key={t.id}>
                <legend className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                  <UnitIcon name={t.icon} size={16} className="text-g700" /> {t.question}
                </legend>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {DOSE.map((d) => {
                    const on = levels[t.id] === d.level;
                    return (
                      <button
                        key={d.level}
                        aria-pressed={on}
                        onClick={() => setLevels({ ...levels, [t.id]: d.level })}
                        className={`rounded-xl border-2 px-1.5 py-2 text-[13px] font-semibold leading-4 transition ${on ? "border-g700 bg-g100 text-g900" : "border-line text-ink2 hover:bg-weakest"}`}
                      >
                        <span className="block tracking-widest text-g500" aria-hidden="true">{LEVELS[d.level].dots}</span>
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="pt-6">
            <Primary disabled={!allDosed} onClick={() => setStep(4)}>Continue</Primary>
          </div>
        </Screen>
      )}

      {step === 4 && (
        <Screen>
          <Bubble title="Last step: connect your S-Pankki account" sub="Questions use your real spending, salary and savings. Nothing leaves the bank." />
          <div className="mt-6 rounded-3xl border border-line p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-g100 text-g700"><Landmark size={22} /></span>
              <div>
                <p className="font-semibold text-ink">S-Pankki current account</p>
                <p className="text-sm text-ink2">24 months of transactions</p>
              </div>
            </div>
            <label className="mt-4 flex items-start gap-3 rounded-2xl bg-weakest p-3 text-sm text-ink">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#007841]" />
              Use my transactions to personalise my lessons. I can disconnect at any time.
            </label>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-ink3">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            Demo: your account is simulated by a customer of the same age from the S-Pankki Junction 2026 dataset.
          </p>
          <div className="mt-auto pt-6">
            {error && <p className="mb-2 text-center text-sm text-err" role="alert">{error}</p>}
            <Primary disabled={!consent || connecting || analysing} onClick={connect}>
              {analysing ? "S-Bank AI is reading your project…" : connecting ? "Connecting…" : "Connect my account"}
            </Primary>
          </div>
        </Screen>
      )}

      {step === 6 && goal && fin && (
        <Screen>
          <GoalGuess goal={goal} finances={fin} start={defaultInput(goal, fin).start} onDone={() => setStep(7)} />
        </Screen>
      )}

      {step === 7 && goal && fin && (
        <Screen>
          <GoalSimulator name={name.trim()} goal={goal} finances={fin} initial={defaultInput(goal, fin)} onChange={onSim} />
          <div className="pt-6">
            <Primary onClick={() => generate()}>Build my path around this goal</Primary>
          </div>
        </Screen>
      )}

      {step === 8 && <Generating error={error} onRetry={() => generate(!!goal)} />}

      {step === 9 && result && (
        <Screen>
          <div className="flex items-start gap-3">
            <Mascot size={56} mood="cheer" className="shrink-0" />
            <div className="rounded-2xl rounded-tl-sm border-2 border-line px-4 py-3">
              <h1 className="font-display text-[1.375rem] font-bold leading-7 text-ink">Your path is ready!</h1>
              <p className="mt-1 text-[15px] leading-6 text-ink">{result.path.intro}</p>
            </div>
          </div>
          {result.model && (
            <p className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-g900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-g300">
              <Sparkles size={12} /> Designed for you by S-Bank AI
            </p>
          )}
          <ol className="mt-4 flex flex-col gap-2">
            {result.path.units.map((u, i) => (
              <li key={u.id} className="animate-pop flex items-start gap-3 rounded-2xl border border-line p-3" style={{ animationDelay: `${i * 80}ms` }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-g100 text-g700"><UnitIcon name={u.icon} size={20} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{i + 1}. {u.title}</span>
                    <span className="text-xs tracking-widest text-g500" title={LEVELS[u.level].name}>{LEVELS[u.level].dots}</span>
                  </span>
                  <span className="block text-sm leading-5 text-ink2">{u.why}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-auto pt-6">
            <Primary onClick={() => onDone(result)}>Start learning</Primary>
          </div>
        </Screen>
      )}
    </div>
  );
}

function Generating({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const steps = ["Comparing you with people your age", "Matching questions to your level", "Weaving in your goal", "S-Bank AI is designing your path"];
  const [k, setK] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setK((x) => Math.min(x + 1, steps.length - 1)), 1300);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center">
        <Mascot size={96} mood={error ? "sad" : "happy"} className={error ? "" : "animate-bob"} />
        {error ? (
          <>
            <p className="mt-5 text-center text-ink">{error}</p>
            <div className="mt-6 w-full"><Primary onClick={onRetry}>Try again</Primary></div>
          </>
        ) : (
          <ul className="mt-6 flex w-full flex-col gap-3" aria-live="polite">
            {steps.map((s, i) => (
              <li key={s} className={`flex items-center gap-3 text-[15px] transition-opacity ${i <= k ? "opacity-100" : "opacity-30"}`}>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${i < k ? "bg-g500 text-white" : "bg-g100 text-g700"}`}>
                  {i < k ? <Check size={16} strokeWidth={3} /> : i === k ? <Loader2 size={16} className="animate-spin" /> : null}
                </span>
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col px-4 pb-5 pt-5">{children}</div>;
}

function Bubble({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <Mascot size={52} className="shrink-0" />
      <div className="rounded-2xl rounded-tl-sm border-2 border-line px-4 py-3">
        <h1 className="font-display text-[1.25rem] font-bold leading-7 text-ink">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink2">{sub}</p>}
      </div>
    </div>
  );
}

function Primary({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-full bg-g300 py-3.5 text-[17px] font-semibold text-g900 transition hover:bg-[#49F37B] active:bg-g400 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink3"
    >
      {children}
    </button>
  );
}
