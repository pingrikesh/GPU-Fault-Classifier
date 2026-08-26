import { useEffect, useMemo, useRef } from "react";
import type { Prediction, TaxonomyEntry } from "../types";
import { healthFor } from "../lib/health";
import { KpiCard, type KpiTrend } from "./common";

interface Props {
  predictions: Record<string, Prediction>;
  taxonomyById: Map<string, TaxonomyEntry>;
  tick: number;
  status: string;
}

// The simulator advances one tick per second, so a "since last hour" trend
// window is exactly 3600 ticks back.
const TREND_WINDOW_TICKS = 3600;
const MIN_TREND_SPAN_TICKS = 15;

interface StatSample {
  tick: number;
  critical: number;
  warning: number;
}

/** Keeps a rolling ~1h buffer of {critical, warning} counts and reports how
 * much they've changed since the oldest sample still inside that window, so
 * operators can see whether the cluster is trending better or worse. */
function useFaultTrend(tick: number, critical: number, warning: number) {
  const historyRef = useRef<StatSample[]>([]);

  useEffect(() => {
    const arr = historyRef.current;
    if (arr.length === 0 || arr[arr.length - 1].tick !== tick) {
      arr.push({ tick, critical, warning });
      const cutoff = tick - TREND_WINDOW_TICKS - 120;
      while (arr.length > 2 && arr[0].tick < cutoff) arr.shift();
    }
  }, [tick, critical, warning]);

  return useMemo(() => {
    const arr = historyRef.current;
    if (arr.length < 2) return null;

    const targetTick = tick - TREND_WINDOW_TICKS;
    let past = arr[0];
    for (const sample of arr) {
      if (sample.tick <= targetTick) past = sample;
      else break;
    }

    const elapsed = tick - past.tick;
    if (elapsed < MIN_TREND_SPAN_TICKS) return null;

    const windowLabel =
      elapsed >= TREND_WINDOW_TICKS - 30
        ? "since last hour"
        : elapsed >= 60
        ? `since last ${Math.round(elapsed / 60)}m`
        : `since last ${elapsed}s`;

    return {
      critical: critical - past.critical,
      warning: warning - past.warning,
      windowLabel,
    };
  }, [tick, critical, warning]);
}

export function SummaryBar({ predictions, taxonomyById, tick, status }: Props) {
  const stats = useMemo(() => {
    const keys = Object.keys(predictions);
    let critical = 0;
    let warning = 0;
    let healthy = 0;
    for (const key of keys) {
      const h = healthFor(key, predictions, taxonomyById);
      if (!h.isFault) healthy++;
      else if (h.severity === "critical") critical++;
      else warning++;
    }
    const total = keys.length || 1;
    return {
      total: keys.length,
      critical,
      warning,
      healthy,
      healthyPct: (healthy / total) * 100,
    };
  }, [predictions, taxonomyById]);

  const uptimeLabel = `${Math.floor(tick / 60)}m ${tick % 60}s`;
  const trend = useFaultTrend(tick, stats.critical, stats.warning);

  const criticalTrend: KpiTrend | undefined = trend
    ? { delta: trend.critical, windowLabel: trend.windowLabel, goodDirection: "down" }
    : undefined;
  const warningTrend: KpiTrend | undefined = trend
    ? { delta: trend.warning, windowLabel: trend.windowLabel, goodDirection: "down" }
    : undefined;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      <KpiCard
        label="Cluster Health"
        value={`${stats.healthyPct.toFixed(0)}%`}
        hint={`${stats.healthy}/${stats.total} components nominal`}
        tone={stats.healthyPct > 95 ? "good" : stats.healthyPct > 85 ? "warning" : "critical"}
        info="clusterHealth"
      />
      <KpiCard
        label="Critical Faults"
        value={String(stats.critical)}
        hint="Needs immediate attention"
        tone={stats.critical > 0 ? "critical" : "good"}
        trend={criticalTrend}
        info="criticalFaults"
      />
      <KpiCard
        label="Warnings"
        value={String(stats.warning)}
        hint="Degraded performance"
        tone={stats.warning > 0 ? "warning" : "good"}
        trend={warningTrend}
        info="warnings"
      />
      <KpiCard
        label="Monitored Components"
        value={String(stats.total)}
        hint="GPU · NVLink · PCIe · Fabric · NCCL"
        info="monitoredComponents"
      />
      <KpiCard
        label="Simulation Uptime"
        value={uptimeLabel}
        hint={status === "open" ? "Live \u00b7 streaming" : status === "connecting" ? "Connecting\u2026" : "Disconnected"}
        tone={status === "open" ? "good" : "critical"}
        info="simulationUptime"
      />
    </div>
  );
}
