import type { Layer, Severity, TaxonomyEntry, ThrottleReason } from "../types";

export const LAYER_COLOR: Record<Layer, { text: string; bg: string; ring: string }> = {
  physical: {
    text: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-500/10 dark:bg-violet-400/10",
    ring: "ring-violet-500/25 dark:ring-violet-400/30",
  },
  data_link: {
    text: "text-sky-700 dark:text-sky-300",
    bg: "bg-sky-500/10 dark:bg-sky-400/10",
    ring: "ring-sky-500/25 dark:ring-sky-400/30",
  },
  network: {
    text: "text-cyan-700 dark:text-cyan-300",
    bg: "bg-cyan-500/10 dark:bg-cyan-400/10",
    ring: "ring-cyan-500/25 dark:ring-cyan-400/30",
  },
  transport: {
    text: "text-indigo-700 dark:text-indigo-300",
    bg: "bg-indigo-500/10 dark:bg-indigo-400/10",
    ring: "ring-indigo-500/25 dark:ring-indigo-400/30",
  },
  nccl: {
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    bg: "bg-fuchsia-500/10 dark:bg-fuchsia-400/10",
    ring: "ring-fuchsia-500/25 dark:ring-fuchsia-400/30",
  },
  gpu_health: {
    text: "text-lime-700 dark:text-lime-300",
    bg: "bg-lime-500/10 dark:bg-lime-400/10",
    ring: "ring-lime-500/25 dark:ring-lime-400/30",
  },
};

export const LAYER_LEGEND: { layer: Layer; label: string }[] = [
  { layer: "physical", label: "Physical" },
  { layer: "data_link", label: "Data Link" },
  { layer: "network", label: "Network" },
  { layer: "transport", label: "Transport" },
  { layer: "nccl", label: "NCCL" },
  { layer: "gpu_health", label: "GPU Health" },
];

export function layerLabel(layer: Layer): string {
  return LAYER_LEGEND.find((item) => item.layer === layer)?.label ?? layer;
}

export const SEVERITY_COLOR: Record<Severity, { text: string; bg: string; ring: string; dot: string }> = {
  info: {
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500/10 dark:bg-emerald-400/10",
    ring: "ring-emerald-500/25 dark:ring-emerald-400/30",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
  warning: {
    text: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-500/10 dark:bg-amber-400/10",
    ring: "ring-amber-500/25 dark:ring-amber-400/30",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  critical: {
    text: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-500/10 dark:bg-rose-400/10",
    ring: "ring-rose-500/30 dark:ring-rose-400/40",
    dot: "bg-rose-500 dark:bg-rose-400",
  },
};

const THROTTLE_REASON_LABELS: Record<ThrottleReason, string> = {
  none: "None",
  thermal: "Thermal",
  power_cap: "Power Cap",
  reliability_voltage: "Reliability Voltage",
  sw_slowdown: "SW Slowdown",
  hw_slowdown: "HW Slowdown",
};

export function throttleReasonLabel(reason: string): string {
  return THROTTLE_REASON_LABELS[reason as ThrottleReason] ?? reason;
}

/** Prefers the taxonomy's curated display name (e.g. "Fabric Link Down")
 * over the raw fault id; falls back to title-casing the id when no
 * taxonomy is supplied or the id is unrecognized. */
export function faultLabel(id: string, taxonomyById?: Map<string, TaxonomyEntry>): string {
  if (id === "healthy") return "Healthy";
  const curated = taxonomyById?.get(id)?.name;
  if (curated) return curated;
  return id
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function componentLabel(key: string, componentType: string): string {
  if (componentType === "gpu") {
    const m = key.match(/^n(\d+)g(\d+)$/);
    if (m) return `Node ${m[1]} · GPU ${m[2]}`;
  }
  if (componentType === "nvlink") {
    const m = key.match(/^n(\d+)-nvl-(\d+)-(\d+)$/);
    if (m) return `Node ${m[1]} · NVLink GPU${m[2]}\u2194GPU${m[3]}`;
  }
  if (componentType === "pcie") {
    const m = key.match(/^n(\d+)-pcie-(\d+)$/);
    if (m) return `Node ${m[1]} · PCIe GPU${m[2]}`;
  }
  if (componentType === "network") {
    const m = key.match(/^net-(\d+)-(\d+)$/);
    if (m) return `Fabric Node${m[1]}\u2194Node${m[2]}`;
  }
  if (componentType === "nccl") {
    const m = key.match(/^n(\d+)-nccl$/);
    if (m) return `Node ${m[1]} · NCCL`;
  }
  return key;
}

export function inferComponentType(key: string): string {
  if (/^n\d+g\d+$/.test(key)) return "gpu";
  if (key.includes("-nvl-")) return "nvlink";
  if (key.includes("-pcie-")) return "pcie";
  if (key.startsWith("net-")) return "network";
  if (key.endsWith("-nccl")) return "nccl";
  return "gpu";
}

export function timeAgo(ts: number): string {
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export function pct(v: number, digits = 0): string {
  return `${v.toFixed(digits)}%`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
