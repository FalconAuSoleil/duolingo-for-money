"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Flame, Heart, Lightbulb, Sparkles, Target, X, Zap } from "lucide-react";
import type { Level, Mastery, Profile, Question } from "@/lib/types";
import { CONCEPTS, LEVELS } from "@/lib/questions";
import { Mascot } from "./Mascot";
import { BarChart } from "./BarChart";

export type LessonResult = { xp: number; correct: number; total: number; hearts: number; results: { concept: string; correct: boolean }[] };
type Summary = { insight: string; goal: string; cheer: string; ai: boolean };

const XP_PER_CORRECT = 10;
const PERFECT_BONUS = 5;

async function coach<T>(body: object): Promise<T | null> {
  try {
    const res = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export function Lesson({
  profile, name, unit, level, mastery, goal, questions, hearts: startHearts, streak, onAnswer, onFinish, onClose,
}: {
  profile: Profile;
  name: string;
  unit: { title: string };
  level: Level;
  mastery: Mastery;
  goal?: string;
  questions: Question[];
  hearts: number;
  streak: number;
  onAnswer: (q: Question, chosen: number, correct: boolean) => void;
  onFinish: (r: LessonResult) => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [hearts, setHearts] = useState(startHearts);
  const [ai, setAi] = useState<string[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [done, setDone] = useState(false);
  const finished = useRef(false);

  const q = questions[i];
  const known = Object.keys(mastery).filter((c) => mastery[c].r > mastery[c].w);

  // Ask the Verda-hosted coach for personalised explanations as soon as the lesson starts.
  useEffect(() => {
    coach<{ explanations: string[] }>({
      mode: "explain",
      customerId: profile.id,
      name,
      age: profile.age,
      goal,
      level,
      known,
      items: questions.map((x) => ({ prompt: x.prompt, correctAnswer: x.options[x.answer], facts: x.facts })),
    }).then((r) => r?.explanations && setAi(r.explanations));
    // known/level are captured once per lesson on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, questions]);

  function check() {
    if (picked === null) return;
    const ok = picked === q.answer;
    setChecked(true);
    setAnswers((a) => [...a, ok]);
    onAnswer(q, picked, ok);
    if (!ok) setHearts((h) => Math.max(0, h - 1));
  }

  function next() {
    if (i + 1 < questions.length) {
      setI(i + 1);
      setPicked(null);
      setChecked(false);
      return;
    }
    setDone(true);
  }

  const correct = answers.filter(Boolean).length;
  const perfect = correct === questions.length;
  const xp = correct * XP_PER_CORRECT + (perfect ? PERFECT_BONUS : 0);

  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    const results = questions.map((x, k) => ({ concept: x.concept, correct: !!answers[k] }));
    onFinish({ xp, correct, total: questions.length, hearts, results });
    const firstMiss = questions.find((_, k) => !answers[k]);
    const fallback: Summary = {
      insight: (firstMiss ?? questions[0]).explain,
      goal: (firstMiss ?? questions.find((x) => x.tip) ?? questions[0]).tip ?? "Check your spending in this category once a week for the next 30 days.",
      cheer: perfect ? "Flawless lesson! 🎉" : "Lesson complete! 💪",
      ai: false,
    };
    coach<Omit<Summary, "ai">>({
      mode: "summary",
      customerId: profile.id,
      name,
      age: profile.age,
      goal,
      level,
      known,
      unitTitle: unit.title,
      items: questions.map((x, k) => ({ prompt: x.prompt, correctAnswer: x.options[x.answer], gotItRight: answers[k], facts: x.facts })),
    }).then((r) => setSummary(r?.insight ? { ...r, ai: true } : fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (!questions.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <Mascot mood="neutral" size={80} />
        <p className="text-ink2">Not enough data for this unit yet. Try another one!</p>
        <button onClick={onClose} className="rounded-full bg-g300 px-6 py-3 font-semibold text-g900">Back</button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-1 flex-col items-center px-5 pb-6 pt-8 text-center">
        <Mascot mood="cheer" size={110} className="animate-pop" />
        <h1 className="font-display mt-3 text-[1.6875rem] font-bold text-g900">{summary?.cheer ?? (perfect ? "Flawless lesson! 🎉" : "Lesson complete!")}</h1>
        <p className="text-sm text-ink2">{unit.title}</p>
        <div className="mt-5 grid w-full grid-cols-3 gap-2">
          <ResultTile label="XP earned" value={`+${xp}`} icon={<Zap size={18} />} tone="bg-g300 text-g900" />
          <ResultTile label="Accuracy" value={`${Math.round((correct / questions.length) * 100)}%`} icon={<Check size={18} />} tone="bg-g100 text-g900" />
          <ResultTile label="Streak" value={`${Math.max(streak, 1)}`} icon={<Flame size={18} />} tone="bg-warnbg text-[#885600]" />
        </div>

        <section className="mt-5 w-full rounded-3xl border border-line bg-white p-4 text-left" aria-live="polite">
          <div className="flex items-center gap-2">
            <Mascot size={32} />
            <h2 className="font-semibold text-ink">Penny&apos;s take</h2>
            {summary?.ai && <AiBadge />}
          </div>
          {summary ? (
            <>
              <p className="mt-2 text-[15px] leading-6 text-ink">{summary.insight}</p>
              <GoalCard goal={summary.goal} />
            </>
          ) : (
            <div className="mt-3 space-y-2" aria-label="Loading coach insight">
              <div className="h-3 w-full animate-pulse rounded bg-weak" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-weak" />
              <div className="h-16 w-full animate-pulse rounded-2xl bg-weak" />
            </div>
          )}
        </section>

        <button onClick={onClose} className="mt-auto w-full rounded-full bg-g300 py-3.5 text-[17px] font-semibold text-g900 transition hover:bg-[#49F37B] active:bg-g400 mt-6">
          Continue
        </button>
      </div>
    );
  }

  const isRight = picked === q.answer;
  const explanation = ai?.[i] ?? q.explain;
  const isNew = !mastery[q.concept] && !!CONCEPTS[q.concept];
  // only teach the concept when it's new at the learner's level, or when they got it wrong
  const concept = CONCEPTS[q.concept] && (!isRight || (isNew && q.level >= level)) ? CONCEPTS[q.concept] : null;

  return (
    <div className="flex flex-1 flex-col">
      {/* top bar */}
      <div className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button onClick={onClose} aria-label="Quit lesson" className="rounded-full p-1 text-ink3 hover:bg-weak hover:text-ink">
          <X size={24} />
        </button>
        <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={i + (checked ? 1 : 0)}>
          <div className="h-full rounded-full bg-g500 transition-all duration-500" style={{ width: `${((i + (checked ? 1 : 0)) / questions.length) * 100}%` }} />
        </div>
        <span className="flex items-center gap-1 font-bold text-err" aria-label={`${hearts} hearts left`}>
          <Heart size={20} fill="currentColor" /> {hearts}
        </span>
      </div>

      {/* question */}
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-g700">
            {unit.title} · {i + 1} of {questions.length}
          </p>
          <span className="rounded-full bg-weak px-2 py-0.5 text-[11px] font-semibold text-ink2" title={`${LEVELS[q.level].name} question`}>
            <span className="tracking-widest text-g500" aria-hidden="true">{LEVELS[q.level].dots}</span> {LEVELS[q.level].name}
          </span>
          {isNew && (
            <span className="rounded-full bg-infobg px-2 py-0.5 text-[11px] font-bold text-[#006E87]">New concept</span>
          )}
        </div>
        <div className="flex items-start gap-3">
          <Mascot size={52} mood={checked ? (isRight ? "cheer" : "sad") : "happy"} className="shrink-0" />
          <h1 key={q.id} className="font-display animate-pop relative rounded-2xl rounded-tl-sm border-2 border-line bg-white px-4 py-3 text-[1.1875rem] font-bold leading-[1.6rem] text-ink">
            {q.prompt}
          </h1>
        </div>

        {q.chart && (checked || !q.chartAfter) && <BarChart chart={q.chart} reveal={checked} />}

        <div className={q.kind === "truefalse" ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2.5"} role="radiogroup" aria-label="Answer options">
          {q.options.map((opt, k) => {
            const sel = picked === k;
            const showRight = checked && k === q.answer;
            const showWrong = checked && sel && k !== q.answer;
            return (
              <button
                key={k}
                role="radio"
                aria-checked={sel}
                disabled={checked}
                onClick={() => setPicked(k)}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 text-left font-semibold transition ${q.kind === "truefalse" ? "justify-center py-6 text-lg" : "py-3.5 text-[16px]"} ${
                  showRight
                    ? "border-g500 bg-g100 text-g900"
                    : showWrong
                      ? "border-err bg-errbg text-err"
                      : sel
                        ? "border-g700 bg-g100 text-g900 shadow-[0_3px_0_#007841]"
                        : "border-line bg-white text-ink shadow-[0_3px_0_#e6e6e6] hover:bg-weakest"
                } ${checked ? "cursor-default" : "active:translate-y-0.5"}`}
              >
                {q.kind === "choice" && (
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-xs ${sel || showRight ? "border-current" : "border-line text-ink3"}`}>
                    {String.fromCharCode(65 + k)}
                  </span>
                )}
                <span className="flex-1">{opt}</span>
                {showRight && <Check size={20} strokeWidth={3} />}
                {showWrong && <X size={20} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* footer / feedback sheet */}
      {!checked ? (
        <div className="sticky bottom-[3.9rem] border-t border-line bg-white px-4 py-4">
          <button
            onClick={check}
            disabled={picked === null}
            className="w-full rounded-full bg-g300 py-3.5 text-[17px] font-semibold text-g900 transition hover:bg-[#49F37B] active:bg-g400 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink3"
          >
            Check
          </button>
        </div>
      ) : (
        <div className={`animate-slideup sticky bottom-[3.9rem] rounded-t-3xl px-4 pb-4 pt-4 ${isRight ? "bg-g100" : "bg-errbg"}`} aria-live="polite">
          <div className="flex items-center gap-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${isRight ? "bg-g500 text-white" : "bg-err text-white"}`}>
              {isRight ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
            </span>
            <h2 className={`font-display text-xl font-bold ${isRight ? "text-g900" : "text-err"}`}>
              {isRight ? "Correct!" : "Not quite"}
            </h2>
            {isRight && <span className="ml-auto text-sm font-bold text-g700">+{XP_PER_CORRECT} XP</span>}
          </div>
          {!isRight && (
            <p className="mt-2 text-sm font-semibold text-err">Correct answer: {q.options[q.answer]}</p>
          )}
          <p className="mt-2 text-[15px] leading-6 text-ink">
            {ai?.[i] && <AiBadge />} {explanation}
          </p>
          {concept && (
            <div className="mt-2 rounded-2xl bg-white p-3 ring-1 ring-line">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#006E87]">
                <BookOpen size={14} /> {concept.title}
              </p>
              <p className="mt-1 text-sm leading-5 text-ink">{concept.body}</p>
            </div>
          )}
          {q.tip && !ai?.[i] && !concept && (
            <p className="mt-2 flex gap-2 rounded-2xl bg-white/70 p-3 text-sm leading-5 text-ink2">
              <Lightbulb size={16} className="mt-0.5 shrink-0 text-warn" /> {q.tip}
            </p>
          )}
          <button
            onClick={next}
            autoFocus
            className={`mt-3 w-full rounded-full py-3.5 text-[17px] font-semibold transition ${isRight ? "bg-g700 text-white hover:bg-g900" : "bg-err text-white hover:bg-[#9F0000]"}`}
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

function AiBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-g900 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-g300">
      <Sparkles size={10} /> S-Bank AI
    </span>
  );
}

function ResultTile({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className={`animate-pop rounded-2xl px-2 py-3 ${tone}`}>
      <span className="flex items-center justify-center gap-1 text-xs font-semibold">{icon}{label}</span>
      <span className="font-display mt-1 block text-2xl font-bold tabular-nums">{value}</span>
    </div>
  );
}

function GoalCard({ goal }: { goal: string }) {
  const [added, setAdded] = useState(false);
  return (
    <div className="mt-3 rounded-2xl bg-g50 p-3 ring-1 ring-gline">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-g700">
        <Target size={14} /> 30-day challenge
      </p>
      <p className="mt-1 text-[15px] font-semibold leading-6 text-g900">{goal}</p>
      <button
        onClick={() => setAdded(true)}
        disabled={added}
        className="mt-2 rounded-full border-2 border-g700 px-4 py-1.5 text-sm font-semibold text-g700 transition hover:bg-g100 disabled:border-g500 disabled:bg-g500 disabled:text-white"
      >
        {added ? "✓ Added to my goals" : "Accept challenge"}
      </button>
    </div>
  );
}
