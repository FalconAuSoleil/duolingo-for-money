"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Flame, Heart, Lock, Target, X, RotateCcw, Sparkles, Star, Trophy, Zap } from "lucide-react";
import type { Level, Mastery, Question } from "@/lib/types";
import { buildUnitLesson, isMastered, LEVELS, NODES_PER_UNIT, type PathUnit } from "@/lib/questions";
import { buildProjectLesson, PROJECT_LESSONS } from "@/lib/project";
import { Mascot } from "./Mascot";
import { Lesson, type LessonResult } from "./Lesson";
import { UnitIcon } from "./UnitIcon";
import type { Account } from "./Onboarding";
import type { TrainerEvent } from "./MoneyTrainer";
import { GoalSimulator, type GoalState } from "./GoalSimulator";
import { finances, fmtMonths, simulate, type SimInput, type SimResult } from "@/lib/simulate";
import { eur } from "@/lib/format";

const UNIT_COLORS = ["bg-g500", "bg-g700", "bg-g900"];
const ZIGZAG = [0, 44, 0, -44];

export type Progress = {
  xp: number;
  done: string[];
  streak: number;
  lastDay: string | null;
  hearts: number;
  mastery: Mastery;
  /** level adjustments per path unit, after the adaptive nudges */
  unitLevels: Record<string, Level>;
  /** accuracy of recent lessons, newest last */
  history: number[];
};
export const EMPTY_PROGRESS: Progress = { xp: 0, done: [], streak: 0, lastDay: null, hearts: 5, mastery: {}, unitLevels: {}, history: [] };

const today = () => new Date().toISOString().slice(0, 10);

export function Trainer({
  account, progress, onProgress, onEvent, onGoal, onReset,
}: {
  account: Account;
  onGoal: (g: GoalState) => void;
  progress: Progress;
  onProgress: (p: Progress, event?: TrainerEvent) => void;
  onEvent: (e: TrainerEvent) => void;
  onReset: () => void;
}) {
  const { me, profile, peer, path } = account;
  const [active, setActive] = useState<{ unit: PathUnit; node: number } | null>(null);
  const [lastUnit, setLastUnit] = useState<PathUnit | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const fin = useMemo(() => finances(profile), [profile]);
  const latestSim = useRef<{ input: SimInput; result: SimResult } | null>(null);
  const onSim = useCallback((input: SimInput, result: SimResult) => {
    latestSim.current = { input, result };
  }, []);

  // lessons and the path are separate screens: start each one at the top
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [active, simOpen]);

  const levelOf = (u: PathUnit) => progress.unitLevels[u.id] ?? u.level;

  // the learner's own project gets its own unit at the top of the path
  const goal = account.goal;
  const projectUnit: PathUnit | null = goal
    ? { id: "project", title: `Your project: ${goal.label}`, why: `${goal.verdict} · ${eur(goal.input.monthly)}/month toward ${eur(goal.input.target)} in ${fmtMonths(goal.input.months)}`, icon: "target", level: 2, topic: "saving", concepts: [] }
    : null;
  const units = projectUnit ? [projectUnit, ...path.units] : path.units;

  const questions: Question[] = useMemo(
    () =>
      !active
        ? []
        : active.unit.id === "project" && goal
          ? buildProjectLesson(goal, goal.input, fin, profile, active.node, String(progress.done.length))
          : buildUnitLesson(profile, peer, { ...active.unit, level: levelOf(active.unit) }, active.node, { level: levelOf(active.unit), mastery: progress.mastery, salt: String(progress.done.length) }),
    // rebuild only when a lesson starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active],
  );

  // every validated answer is saved straight away, so quitting mid-lesson loses nothing
  function answer(q: Question, chosen: number, correct: boolean) {
    if (!active) return;
    const cur = progress.mastery[q.concept] ?? { r: 0, w: 0 };
    onProgress(
      { ...progress, mastery: { ...progress.mastery, [q.concept]: correct ? { ...cur, r: cur.r + 1 } : { ...cur, w: cur.w + 1 } } },
      {
        type: "answer", unit: active.unit.title, node: active.node, concept: q.concept, level: q.level,
        prompt: q.prompt, chosen: q.options[chosen], correctAnswer: q.options[q.answer], correct,
      },
    );
  }

  function finish(result: LessonResult) {
    if (!active) return;
    const key = `${active.unit.id}:${active.node}`;
    const t = today();
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    onProgress({
      ...progress,
      xp: progress.xp + result.xp,
      done: progress.done.includes(key) ? progress.done : [...progress.done, key],
      streak: progress.lastDay === t ? progress.streak : progress.lastDay === yesterday ? progress.streak + 1 : 1,
      lastDay: t,
      hearts: Math.max(0, result.hearts),
      history: [...progress.history, result.correct / Math.max(1, result.total)].slice(-6),
    }, { type: "lesson_complete", unit: active.unit.title, node: active.node, xp: result.xp, correct: result.correct, total: result.total });
    setLastUnit(active.unit);
  }

  if (active) {
    return (
      <Lesson
        key={`${active.unit.id}-${active.node}`}
        profile={profile}
        name={me.name}
        unit={active.unit}
        level={levelOf(active.unit)}
        mastery={progress.mastery}
        goal={account.goal?.label}
        questions={questions}
        hearts={progress.hearts || 5}
        streak={progress.streak}
        onAnswer={answer}
        onFinish={finish}
        onClose={() => {
          onEvent({ type: "lesson_closed", unit: active.unit.title, node: active.node });
          setActive(null);
        }}
      />
    );
  }

  if (simOpen && account.goal) {
    const g = account.goal;
    return (
      <div className="flex flex-1 flex-col px-4 pb-5 pt-4">
        <button onClick={() => setSimOpen(false)} aria-label="Close simulation" className="mb-3 self-start rounded-full p-1 text-ink3 hover:bg-weak hover:text-ink">
          <X size={24} />
        </button>
        <GoalSimulator name={me.name} goal={g} finances={fin} initial={g.input} onChange={onSim} />
        <button
          onClick={() => {
            if (latestSim.current) {
              const next = { ...g, input: latestSim.current.input, verdict: latestSim.current.result.verdict.label };
              onGoal(next);
              onEvent({ type: "goal_resimulated", goal: g.label, ...latestSim.current.input, verdict: next.verdict });
            }
            setSimOpen(false);
          }}
          className="mt-6 w-full rounded-full bg-g300 py-3.5 text-[17px] font-semibold text-g900 transition hover:bg-[#49F37B]"
        >
          Save this plan
        </button>
      </div>
    );
  }

  const xpLevel = Math.floor(progress.xp / 100) + 1;
  const totalNodes = units.length * NODES_PER_UNIT;
  const mastered = Object.values(progress.mastery).filter(isMastered).length;
  const recent = progress.history.slice(-2);
  const nudgeUnit = lastUnit && lastUnit.id !== "project" ? path.units.find((u) => u.id === lastUnit.id) : null;
  const nudgeLevel = nudgeUnit ? levelOf(nudgeUnit) : null;
  const nudge =
    nudgeUnit && nudgeLevel && recent.length === 2
      ? recent.every((a) => a >= 0.8) && nudgeLevel < 3 ? "up" : recent.every((a) => a <= 0.4) && nudgeLevel > 1 ? "down" : null
      : null;

  function shiftLevel(u: PathUnit, delta: 1 | -1) {
    onProgress({ ...progress, unitLevels: { ...progress.unitLevels, [u.id]: (levelOf(u) + delta) as Level }, history: [] });
    setLastUnit(null);
  }

  return (
    <div className="flex flex-1 flex-col">
      <section className="bg-g900 px-4 pb-5 pt-4 text-white">
        <div className="flex items-center gap-3">
          <Mascot size={56} mood="happy" className="animate-bob" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[1.6875rem] font-bold leading-8">Hi {me.name}!</h1>
            <p className="text-sm text-white/80">XP level {xpLevel} · {progress.done.length}/{totalNodes} lessons · {mastered} concepts mastered</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat icon={<Flame size={18} className="text-[#FFB547]" />} value={progress.streak} label="day streak" />
          <Stat icon={<Zap size={18} className="text-g300" />} value={progress.xp} label="XP" />
          <Stat icon={<Heart size={18} className="text-[#FF8A8A]" fill="#FF8A8A" />} value={progress.hearts || 5} label="hearts" />
        </div>
        {path.intro && (
          <p className="mt-4 flex gap-2 rounded-2xl bg-white/10 p-3 text-sm leading-5 text-white/90">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-g300" />
            {path.intro}
          </p>
        )}
      </section>

      {account.goal && <GoalCard goal={account.goal} result={simulate(account.goal, fin, account.goal.input)} onOpen={() => setSimOpen(true)} />}

      {nudge === "up" && nudgeUnit && (
        <Banner tone="success" action={{ label: `Go ${LEVELS[(nudgeLevel! + 1) as Level].name}`, onClick: () => shiftLevel(nudgeUnit, 1) }}>
          <strong>You&apos;re acing {nudgeUnit.title}!</strong> Ready for harder questions?
        </Banner>
      )}
      {nudge === "down" && nudgeUnit && (
        <Banner tone="warning" action={{ label: "Easier please", onClick: () => shiftLevel(nudgeUnit, -1) }}>
          <strong>{nudgeUnit.title} is tough.</strong> Want to strengthen the basics first?
        </Banner>
      )}

      <div className="flex flex-col gap-8 px-4 py-6">
        {units.map((u, ui) => {
          const doneCount = Array.from({ length: NODES_PER_UNIT }, (_, n) => progress.done.includes(`${u.id}:${n}`)).filter(Boolean).length;
          // units unlock in order: finish the previous unit's first lesson to open the next one
          // (the project unit never blocks the regular path)
          const unitOpen = ui === 0 || (!!projectUnit && ui === 1) || progress.done.includes(`${units[ui - 1].id}:0`);
          const lvl = levelOf(u);
          return (
            <section key={u.id} aria-labelledby={`unit-${u.id}`}>
              <div className={`${unitOpen ? UNIT_COLORS[ui % 3] : "bg-ink3"} flex items-center gap-3 rounded-3xl px-4 py-4 text-white`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                  <UnitIcon name={u.icon} size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/75">
                    Unit {ui + 1} · <span className="tracking-widest">{LEVELS[lvl].dots}</span> {LEVELS[lvl].name}
                  </p>
                  <h2 id={`unit-${u.id}`} className="font-display text-lg font-bold leading-6">{u.title}</h2>
                  <p className="text-[13px] leading-5 text-white/85">{u.why}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">{doneCount}/{NODES_PER_UNIT}</span>
              </div>
              <ol className="mt-5 flex flex-col items-center gap-5">
                {Array.from({ length: NODES_PER_UNIT }, (_, n) => {
                  const done = progress.done.includes(`${u.id}:${n}`);
                  const unlocked = unitOpen && (n === 0 || progress.done.includes(`${u.id}:${n - 1}`));
                  const current = unlocked && !done;
                  const isChest = n === NODES_PER_UNIT - 1;
                  return (
                    <li key={n} style={{ transform: `translateX(${ZIGZAG[(n + ui) % 4]}px)` }} className="relative">
                      {current && (
                        <span className="animate-bob absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xl border-2 border-line bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-g700">
                          {n === 0 && doneCount === 0 ? "Start" : isChest ? "Challenge" : "Next"}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={!unlocked}
                        onClick={() => setActive({ unit: u, node: n })}
                        aria-label={`${u.title}, lesson ${n + 1}${done ? ", completed" : unlocked ? "" : ", locked"}`}
                        className={`flex h-[72px] w-[72px] items-center justify-center rounded-full transition active:translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink ${
                          done
                            ? "bg-g500 text-white shadow-[0_6px_0_#007841]"
                            : current
                              ? "bg-g300 text-g900 shadow-[0_6px_0_#00AA46] ring-4 ring-g100"
                              : "cursor-not-allowed bg-line text-ink3 shadow-[0_6px_0_#cfcfcf]"
                        }`}
                      >
                        {done ? <Check size={32} strokeWidth={3} /> : !unlocked ? <Lock size={26} /> : isChest ? <Trophy size={30} /> : <Star size={30} fill="currentColor" />}
                      </button>
                      {u.id === "project" && (
                        <span className={`absolute top-1/2 w-28 -translate-y-1/2 text-xs font-semibold leading-4 ${ZIGZAG[(n + ui) % 4] < 0 ? "left-full ml-3" : "right-full mr-3 text-right"} ${unlocked ? "text-g900" : "text-ink3"}`}>
                          {PROJECT_LESSONS[n]}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}

        <button onClick={onReset} className="mx-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-ink2 hover:bg-weak">
          <RotateCcw size={15} /> Redo my profile & path
        </button>
      </div>
    </div>
  );
}

function GoalCard({ goal, result, onOpen }: { goal: GoalState; result: SimResult; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="mx-4 mt-4 flex items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left transition hover:border-g500 hover:bg-g50">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-g100 text-g700"><Target size={22} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase tracking-[0.08em] text-g700">Your goal</span>
        <span className="block truncate font-semibold text-ink">{goal.label}</span>
        <span className="block text-xs text-ink2">{eur(goal.input.monthly)}/month · {eur(goal.input.target)} in {fmtMonths(goal.input.months)}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${result.verdict.tone}`}>{result.verdict.label}</span>
        <span className="text-[11px] font-semibold text-g700 underline underline-offset-2">Re-simulate</span>
      </span>
    </button>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2">
      {icon}
      <span>
        <span className="font-display block text-lg font-bold leading-5 tabular-nums">{value}</span>
        <span className="block text-[11px] text-white/75">{label}</span>
      </span>
    </div>
  );
}

function Banner({ tone, children, action }: { tone: "success" | "warning"; children: React.ReactNode; action: { label: string; onClick: () => void } }) {
  return (
    <div role="status" className={`mx-4 mt-4 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ${tone === "success" ? "bg-g100 text-g900" : "bg-warnbg text-[#885600]"}`}>
      <p className="flex-1 leading-5">{children}</p>
      <button onClick={action.onClick} className="shrink-0 rounded-full bg-g700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-g900">
        {action.label}
      </button>
    </div>
  );
}
