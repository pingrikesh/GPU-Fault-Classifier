import type { ReactNode } from "react";
import { AlertCircle, RefreshCw, WifiOff } from "lucide-react";
import { Card } from "./common";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 dark:bg-white/[0.07] ${className}`} />;
}

export function CardSkeleton({ className = "", lines = 5 }: { className?: string; lines?: number }) {
  return (
    <Card className={`flex min-h-0 flex-col overflow-hidden ${className}`} aria-hidden>
      <div className="shrink-0 border-b border-slate-100 px-5 pb-3 pt-4 dark:border-white/[0.05]">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="mt-2 h-2.5 w-52" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`w-full rounded-lg ${i === lines - 1 ? "min-h-0 flex-1" : "h-9"}`} />
        ))}
      </div>
    </Card>
  );
}

export function KpiSkeletonRow() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="px-5 py-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-2 h-3 w-28" />
        </Card>
      ))}
    </div>
  );
}

/** Full overview layout placeholders so the page does not jump when data arrives. */
export function OverviewSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" role="status" aria-live="polite" aria-label="Loading dashboard">
      <KpiSkeletonRow />
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-64" />
          </div>
          <Skeleton className="h-6 w-72 rounded-full" />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[23fr_17fr]">
          <div className="flex min-h-0 min-w-0 gap-4">
            <CardSkeleton className="h-full min-w-0 flex-[7.5]" lines={6} />
            <div className="grid min-h-0 min-w-0 flex-[15.5] grid-cols-2 grid-rows-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <CardSkeleton key={i} className="h-full min-h-0" lines={4} />
              ))}
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 gap-4">
            <CardSkeleton className="h-full min-h-0 min-w-0 flex-[10]" lines={7} />
            <CardSkeleton className="h-full min-h-0 min-w-0 flex-[7]" lines={6} />
          </div>
        </div>
      </section>
    </div>
  );
}

export function HistorySkeleton() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading history">
      <div className="grid gap-4 md:grid-cols-2">
        <CardSkeleton className="h-80" lines={6} />
        <CardSkeleton className="h-80" lines={6} />
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 pb-3 pt-4 dark:border-white/[0.05]">
          <Skeleton className="h-3.5 w-44" />
          <Skeleton className="mt-2 h-2.5 w-64" />
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel = "Try again",
  className = "",
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-300">
        <AlertCircle size={20} />
      </div>
      <div className="max-w-md">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent-cyan/15 px-3.5 py-1.5 text-xs font-medium text-accent-cyan ring-1 ring-accent-cyan/30 transition-colors hover:bg-accent-cyan/25"
        >
          <RefreshCw size={12} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function StatusBanner({
  tone = "warning",
  icon,
  title,
  message,
  action,
}: {
  tone?: "warning" | "critical";
  icon?: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  const toneClass =
    tone === "critical"
      ? "border-rose-400/30 bg-rose-500/10 text-rose-800 dark:text-rose-200"
      : "border-amber-400/30 bg-amber-500/10 text-amber-900 dark:text-amber-200";
  return (
    <div className={`flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 ${toneClass}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 shrink-0">{icon ?? <WifiOff size={16} />}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{title}</p>
          <p className="text-[11px] opacity-80">{message}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
