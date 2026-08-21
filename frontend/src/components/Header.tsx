import { Activity, Cpu, Moon, Sun } from "lucide-react";
import { StatusDot } from "./common";
import type { ConnectionStatus } from "../hooks/useTelemetryStream";
import { useTheme } from "../hooks/useTheme";

interface Props {
  status: ConnectionStatus;
  tab: "overview" | "history";
  onTabChange: (tab: "overview" | "history") => void;
}

export function Header({ status, tab, onTabChange }: Props) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-white/[0.06] dark:bg-base-950/80">
      <div className="flex w-full items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-cyan/20 to-accent-violet/20 ring-1 ring-slate-200 dark:ring-white/10">
            <Cpu size={18} className="text-accent-cyan" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">GPU Fault Classifier</h1>
            <p className="text-[11px] leading-tight text-slate-500">Emulated interconnect monitoring & fault intelligence</p>
          </div>
        </div>

        <nav className="hidden items-center gap-1 rounded-full bg-slate-100 p-1 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/[0.06] sm:flex">
          {(["overview", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                tab === t
                  ? "bg-accent-cyan/15 text-accent-cyan ring-1 ring-accent-cyan/30"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {t === "overview" ? "Overview" : "History & Trends"}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Activity size={14} className={status === "open" ? "text-emerald-500 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"} />
            <StatusDot ok={status === "open"} pulsing={status === "open"} />
            <span className="font-mono">{status === "open" ? "LIVE" : status === "connecting" ? "CONNECTING" : "OFFLINE"}</span>
          </div>

          <button
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200 dark:bg-white/[0.05] dark:ring-white/[0.08] text-slate-600 dark:text-slate-300 hover:text-accent-cyan hover:ring-accent-cyan/30 transition-colors"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>
      <nav className="flex gap-1 px-4 pb-3 sm:hidden">
        {(["overview", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${
              tab === t ? "bg-accent-cyan/15 text-accent-cyan" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {t === "overview" ? "Overview" : "History"}
          </button>
        ))}
      </nav>
    </header>
  );
}
