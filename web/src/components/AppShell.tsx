import Link from "next/link";
import { CreditCard, House, Menu, ArrowLeftRight } from "lucide-react";
import { Mascot } from "./Mascot";

/** Mimics the S-mobiili frame so the trainer reads as a tab inside the S-Pankki app. */
export function AppShell({ children, back }: { children: React.ReactNode; back?: string }) {
  const tabs = [
    { label: "Home", icon: House },
    { label: "Payments", icon: ArrowLeftRight },
    { label: "Learn", icon: null, active: true },
    { label: "Cards", icon: CreditCard },
    { label: "More", icon: Menu },
  ];
  return (
    <div className="min-h-dvh bg-weak sm:py-6">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-white sm:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:shadow-[0_8px_40px_rgba(0,70,40,0.12)]">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
          <Link href={back ?? "/"} aria-label="S-Pankki home" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/s-pankki-logo.svg" alt="S-Pankki" width={86} height={37} />
          </Link>
          <span className="flex items-center gap-1.5 rounded-full bg-g100 py-1 pl-1 pr-3 text-xs font-bold text-g900">
            <Mascot size={24} />
            Money Trainer
          </span>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <nav className="sticky bottom-0 z-20 grid grid-cols-5 border-t border-line bg-white px-1 pb-[max(env(safe-area-inset-bottom),0.4rem)] pt-1.5">
          {tabs.map(({ label, icon: Icon, active }) => (
            <span
              key={label}
              aria-current={active ? "page" : undefined}
              aria-disabled={!active}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-1 text-[11px] ${active ? "font-semibold text-g900" : "text-ink3"}`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-g300" : ""}`}>
                {Icon ? <Icon size={19} strokeWidth={active ? 2.4 : 1.8} /> : <Mascot size={22} />}
              </span>
              {label}
            </span>
          ))}
        </nav>
      </div>
    </div>
  );
}
