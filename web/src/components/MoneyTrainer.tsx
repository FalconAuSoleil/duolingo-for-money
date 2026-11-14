"use client";

import { useEffect, useRef, useState } from "react";
import { Onboarding, type Account } from "./Onboarding";
import { EMPTY_PROGRESS, Trainer, type Progress } from "./Trainer";

const KEY = "moneytrainer:v2";
export type Saved = { code: string; updatedAt: number; account: Account; progress: Progress };
export type TrainerEvent = Record<string, unknown> & { type: string };

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const c = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `MT-${c.slice(0, 4)}-${c.slice(4)}`;
}

function readLocal(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Saved) : null;
    return s?.code ? s : null;
  } catch {
    return null;
  }
}
function writeLocal(s: Saved | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the server copy still has it */
  }
}

async function post(body: object) {
  const res = await fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
  if (!res.ok) throw new Error(`save failed (${res.status})`);
}

// saving is silent in the UI; a failed write is retried with the next snapshot
const warn = (e: unknown) => console.warn("progress not saved", e);

async function fetchSaved(code: string): Promise<Saved | null> {
  const res = await fetch(`/api/progress?code=${encodeURIComponent(code)}`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()).state as Saved;
}

export function MoneyTrainer() {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [loaded, setLoaded] = useState(false);
  // serialise server writes so an older snapshot never lands after a newer one
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    // localStorage is only readable after hydration; then prefer the newer of local vs. server copy
    const local = readLocal();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(local);
    setLoaded(true);
    if (local) {
      fetchSaved(local.code).then((remote) => {
        if (remote && remote.updatedAt > local.updatedAt) {
          setSaved(remote);
          writeLocal(remote);
        } else if (!remote) {
          // first sync of a save made before the server copy existed
          post({ code: local.code, state: local }).catch(warn);
        }
      });
    }
  }, []);

  function persist(s: Saved, event?: TrainerEvent) {
    queue.current = queue.current.then(() => post({ code: s.code, state: s, event })).catch(warn);
  }

  function update(next: Omit<Saved, "updatedAt">, event?: TrainerEvent) {
    const s = { ...next, updatedAt: Date.now() };
    setSaved(s);
    writeLocal(s);
    persist(s, event);
  }

  function logEvent(event: TrainerEvent) {
    if (!saved) return;
    queue.current = queue.current.then(() => post({ code: saved.code, event })).catch(warn);
  }

  if (!loaded) return <div className="flex-1" />;
  if (!saved) {
    return (
      <Onboarding
        onDone={(account) => update({ code: newCode(), account, progress: EMPTY_PROGRESS }, { type: "profile_created", me: account.me, goal: account.goal ? { text: account.goal.text, label: account.goal.label, ...account.goal.input, verdict: account.goal.verdict } : null, units: account.path.units.map((u) => u.title) })}
      />
    );
  }
  return (
    <Trainer
      account={saved.account}
      progress={{ ...EMPTY_PROGRESS, ...saved.progress }}
      onProgress={(progress, event) => update({ ...saved, progress }, event)}
      onEvent={logEvent}
      onGoal={(goal) => update({ ...saved, account: { ...saved.account, goal } })}
      onReset={() => {
        setSaved(null);
        writeLocal(null);
      }}
    />
  );
}
