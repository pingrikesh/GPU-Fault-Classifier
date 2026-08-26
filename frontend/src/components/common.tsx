import type { ComponentType, PropsWithChildren, ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowLeftRight, Cable, HeartPulse, Link2, Minus, Network, Share2 } from "lucide-react";
import { LAYER_COLOR, layerLabel, SEVERITY_COLOR } from "../lib/format";
import type { HealthInfo } from "../lib/health";
import type { Layer, Severity } from "../types";
import type { GlossaryKey } from "../lib/glossary";
import { HoverTooltip } from "./Tooltip";
import { InfoPopover } from "./InfoPopover";

const LAYER_ICON: Record<Layer, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  physical: Cable,
  data_link: Link2,
  network: Network,
  transport: ArrowLeftRight,
  nccl: Share2,
  gpu_health: HeartPulse,
};

/** Compact icon stand-in for a full `LayerBadge`, meant for overlaying
 * directly on topology diagrams where several badges can end up crowded
 * together. Keep `LayerBadge` (full text) for headers and the inspector,
 * where there's room and no overlap risk. */
export function LayerIcon({ layer, size = 16 }: { layer: Layer; size?: number }) {
  const c = LAYER_COLOR[layer];
  const Icon = LAYER_ICON[layer];
  return (
    <HoverTooltip content={<span className="font-medium">{layerLabel(layer)} layer</span>}>
      <span
        className={`inline-flex shrink-0 cursor-default items-center justify-center rounded-full ring-1 ${c.bg} ${c.text} ${c.ring}`}
        style={{ width: size, height: size }}
      >
        <Icon size={Math.round(size * 0.6)} strokeWidth={2.25} />
      </span>
    </HoverTooltip>
  );
}

export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-base-850/70 backdrop-blur-sm shadow-sm dark:shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  info,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  info?: GlossaryKey;
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 pb-3 pt-4 dark:border-white/[0.05]">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">{title}</h3>
          {info && <InfoPopover glossaryKey={info} />}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function SeverityBadge({ severity, label }: { severity: Severity; label: string }) {
  const c = SEVERITY_COLOR[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${c.bg} ${c.text} ${c.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}

/** Rich replacement for the plain-text native `<title>` SVG tooltips used
 * across the topology diagrams: a severity dot + fault name + confidence,
 * with an optional layer pill and a free-form note (e.g. down-trained
 * lanes) appended below. */
export function FaultTooltipContent({
  title,
  health,
  layer,
  note,
}: {
  title: string;
  health: HealthInfo;
  layer?: Layer;
  note?: ReactNode;
}) {
  const color = SEVERITY_COLOR[health.severity];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color.dot}`} />
        {title}
      </div>
      <div className="text-slate-500 dark:text-slate-400">
        {health.faultName} · {Math.round(health.confidence * 100)}% confidence
      </div>
      {layer && <LayerBadge layer={layer} compact />}
      {note && <div className="text-slate-500 dark:text-slate-400">{note}</div>}
    </div>
  );
}

export function LayerBadge({ layer, compact = false }: { layer: Layer; compact?: boolean }) {
  const c = LAYER_COLOR[layer];
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ${c.bg} ${c.text} ${c.ring} ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      {layerLabel(layer)}
    </span>
  );
}

export function FilterChip({
  active,
  onClick,
  label,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "default" | "warning" | "critical";
}) {
  const activeClass =
    tone === "critical"
      ? "bg-rose-500/15 text-rose-700 ring-rose-500/40 dark:bg-rose-400/15 dark:text-rose-300 dark:ring-rose-400/40"
      : tone === "warning"
      ? "bg-amber-500/15 text-amber-700 ring-amber-500/40 dark:bg-amber-400/15 dark:text-amber-300 dark:ring-amber-400/40"
      : "bg-slate-700/10 text-slate-800 ring-slate-400/40 dark:bg-white/10 dark:text-slate-100 dark:ring-white/20";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors ${
        active
          ? activeClass
          : "bg-transparent text-slate-500 ring-slate-200 hover:bg-slate-50 dark:text-slate-400 dark:ring-white/[0.08] dark:hover:bg-white/[0.04]"
      }`}
    >
      {label}
    </button>
  );
}

export function StatusDot({ ok, pulsing = false }: { ok: boolean; pulsing?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulsing && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${ok ? "bg-emerald-400" : "bg-rose-400"} animate-pulseRing`}
        />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-400"}`} />
    </span>
  );
}

export interface KpiTrend {
  /** current - past, over `windowLabel`'s time span. */
  delta: number;
  windowLabel: string;
  /** Which direction of change counts as "improving" for this KPI. */
  goodDirection: "up" | "down";
}

function TrendIndicator({ delta, windowLabel, goodDirection }: KpiTrend) {
  if (delta === 0) {
    return (
      <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
        <Minus size={11} />
        No change {windowLabel}
      </p>
    );
  }
  const improving = goodDirection === "down" ? delta < 0 : delta > 0;
  const Icon = delta > 0 ? ArrowUp : ArrowDown;
  const colorClass = improving
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
  return (
    <p className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${colorClass}`}>
      <Icon size={11} />
      {delta > 0 ? `+${delta}` : delta} {windowLabel}
    </p>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  trend,
  info,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning" | "critical" | "good";
  trend?: KpiTrend;
  info?: GlossaryKey;
}) {
  const toneClass =
    tone === "critical"
      ? "text-rose-600 dark:text-rose-300"
      : tone === "warning"
      ? "text-amber-600 dark:text-amber-300"
      : tone === "good"
      ? "text-emerald-600 dark:text-emerald-300"
      : "text-slate-800 dark:text-slate-100";
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
        {info && <InfoPopover glossaryKey={info} align="end" />}
      </div>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {trend && <TrendIndicator {...trend} />}
    </Card>
  );
}
