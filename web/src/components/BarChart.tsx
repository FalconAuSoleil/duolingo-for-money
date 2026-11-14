import type { Chart } from "@/lib/types";

export function BarChart({ chart, reveal }: { chart: Chart; reveal: boolean }) {
  const max = Math.max(...chart.values, 1);
  return (
    <figure className="rounded-2xl border border-line bg-weakest px-3 pb-2 pt-3" aria-label="Chart of your data">
      <div className="flex h-28 items-end gap-1.5">
        {chart.values.map((v, i) => {
          const hi = i === chart.highlight;
          return (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              {(reveal || !hi) && (
                <span className={`text-[10px] font-semibold tabular-nums ${hi ? "text-g900" : "text-ink2"}`}>
                  {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                </span>
              )}
              {hi && !reveal ? (
                // the answer bar stays a mystery until the user checks
                <div className="flex h-full w-full items-center justify-center rounded-t-md border-2 border-dashed border-g500 bg-g50 text-sm font-bold text-g700">
                  ?
                </div>
              ) : (
                <div
                  className={`w-full rounded-t-md transition-all duration-500 ${hi ? "bg-g500" : "bg-g200"}`}
                  style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5 border-t border-line pt-1">
        {chart.labels.map((l, i) => (
          <span key={i} className={`flex-1 truncate text-center text-[10px] ${i === chart.highlight ? "font-bold text-g900" : "text-ink3"}`}>
            {l}
          </span>
        ))}
      </div>
    </figure>
  );
}
