type Mood = "happy" | "neutral" | "sad" | "cheer";

/** Penny: a little green coin, the Money Trainer coach. */
export function Mascot({ mood = "happy", size = 64, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  const mouth = {
    happy: "M22 39 Q32 47 42 39",
    cheer: "M20 37 Q32 52 44 37 Z",
    neutral: "M24 41 L40 41",
    sad: "M23 44 Q32 37 41 44",
  }[mood];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="34" r="27" fill="#007841" />
      <circle cx="32" cy="31" r="27" fill="#00AA46" />
      <circle cx="32" cy="31" r="21" fill="none" stroke="#91FA9B" strokeWidth="2.5" strokeDasharray="3 4" />
      <ellipse cx="24" cy="27" rx="4" ry={mood === "cheer" ? 2.5 : 4.5} fill="#004628" />
      <ellipse cx="40" cy="27" rx="4" ry={mood === "cheer" ? 2.5 : 4.5} fill="#004628" />
      <circle cx="25.5" cy="25.5" r="1.4" fill="#fff" />
      <circle cx="41.5" cy="25.5" r="1.4" fill="#fff" />
      <path d={mouth} stroke="#004628" strokeWidth="3" strokeLinecap="round" fill={mood === "cheer" ? "#004628" : "none"} />
      <circle cx="17" cy="36" r="3" fill="#91FA9B" opacity="0.7" />
      <circle cx="47" cy="36" r="3" fill="#91FA9B" opacity="0.7" />
    </svg>
  );
}
