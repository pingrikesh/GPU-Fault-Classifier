import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ComponentMetrics, Prediction, TaxonomyEntry } from "../types";
import { componentLabel, throttleReasonLabel } from "../lib/format";
import { healthFor } from "../lib/health";
import { Card, CardHeader, LayerBadge, SeverityBadge } from "./common";

interface ChartThreshold {
  value: number;
  label: string;
  color: string;
}

interface ChartFieldConfig {
  key: string;
  label: string;
  color: string;
  unit?: string;
  /** Fixed Y domain so headroom to a threshold reads consistently tick to tick. */
  domain?: [number, number];
  /** Faint reference lines marking known failure/limit thresholds for this metric. */
  thresholds?: ChartThreshold[];
}

const CHART_FIELDS: Record<string, ChartFieldConfig[]> = {
  gpu: [
    {
      key: "tempC",
      label: "Temperature",
      color: "#fb7185",
      unit: "\u00b0C",
      domain: [30, 100],
      thresholds: [{ value: 85, label: "85\u00b0C throttle", color: "#f43f5e" }],
    },
    {
      key: "smUtil",
      label: "SM Utilization",
      color: "#22d3ee",
      unit: "%",
      domain: [0, 100],
      thresholds: [{ value: 10, label: "stall risk", color: "#fbbf24" }],
    },
    {
      key: "powerW",
      label: "Power Draw",
      color: "#fbbf24",
      unit: "W",
      domain: [0, 420],
      thresholds: [{ value: 400, label: "400W cap", color: "#f43f5e" }],
    },
    { key: "eccSbeCount", label: "ECC SBE (cumulative)", color: "#38bdf8" },
    { key: "eccDbeCount", label: "ECC DBE (cumulative)", color: "#f43f5e" },
    { key: "retiredPagesCount", label: "Retired Pages (cumulative)", color: "#f97316" },
  ],
  nvlink: [
    { key: "utilPct", label: "Utilization", color: "#22d3ee", unit: "%" },
    { key: "crcErrRate", label: "CRC Error Rate", color: "#fb7185" },
    { key: "replayRate", label: "Replay Rate", color: "#fbbf24" },
    { key: "activeLaneCount", label: "Active Lanes", color: "#a78bfa" },
    { key: "crcErrorCount", label: "CRC Errors (cumulative)", color: "#f43f5e" },
    { key: "replayCount", label: "Replays (cumulative)", color: "#fb923c" },
    { key: "recoveryCount", label: "Link Recoveries (cumulative)", color: "#34d399" },
  ],
  pcie: [
    { key: "utilPct", label: "Utilization", color: "#22d3ee", unit: "%" },
    { key: "uncorrectableErrRate", label: "Uncorrectable Errors", color: "#fb7185" },
  ],
  network: [
    { key: "latencyUs", label: "Latency", color: "#fbbf24", unit: "\u00b5s" },
    { key: "packetLossPct", label: "Packet Loss", color: "#fb7185", unit: "%" },
    { key: "utilPct", label: "Utilization", color: "#22d3ee", unit: "%" },
  ],
  nccl: [
    { key: "allreduceMs", label: "AllReduce Time", color: "#22d3ee", unit: "ms" },
    { key: "stragglerScore", label: "Straggler Score", color: "#fbbf24" },
  ],
};

interface Props {
  componentKey: string | null;
  componentType: string | null;
  predictions: Record<string, Prediction>;
  taxonomyById: Map<string, TaxonomyEntry>;
  history: Record<string, ComponentMetrics[]>;
  isAuto?: boolean;
  className?: string;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

export function DetailPanel({ componentKey, componentType, predictions, taxonomyById, history, isAuto = false, className = "" }: Props) {
  if (!componentKey || !componentType) {
    return (
      <Card className={`flex min-h-0 flex-col items-center justify-center overflow-hidden ${className}`}>
        <p className="px-6 py-10 text-center text-sm text-slate-500">
          All monitored components are healthy. Select a GPU, NVLink, PCIe, or fabric link on the topology to inspect live
          telemetry.
        </p>
      </Card>
    );
  }

  const health = healthFor(componentKey, predictions, taxonomyById);
  const taxonomy = taxonomyById.get(health.faultId);
  const layer = predictions[componentKey]?.layer ?? taxonomy?.layer;
  const series = history[componentKey] ?? [];
  const fields = CHART_FIELDS[componentType] ?? [];

  const chartData = series.map((m, i) => ({ t: i, ...m }));

  return (
    <Card className={`flex min-h-0 flex-col overflow-hidden ${className}`}>
      <CardHeader
        title={componentLabel(componentKey, componentType)}
        subtitle={`${componentType.toUpperCase()}${isAuto ? " \u00b7 auto-selected \u00b7 most critical" : ""}`}
        right={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {health.isFault && layer && <LayerBadge layer={layer} />}
            <SeverityBadge severity={health.severity} label={health.faultName} />
          </div>
        }
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-5 py-4">
        {health.isFault && (
          <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Classifier confidence{" "}
              <span className="text-slate-800 dark:text-slate-200 font-mono">{(health.confidence * 100).toFixed(1)}%</span>
            </p>
            {taxonomy && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{taxonomy.description}</p>}
          </div>
        )}

        {componentType === "gpu" && series.length > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] px-3 py-2.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Throttle Reason</span>
            {(() => {
              const reason = String(series[series.length - 1]?.throttleReason ?? "none");
              return (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                    reason === "none"
                      ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30"
                      : "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${reason === "none" ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {throttleReasonLabel(reason)}
                </span>
              );
            })()}
          </div>
        )}

        {fields.map((f) => (
          <div key={f.key}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">{f.label}</span>
              <span className="text-sm font-mono text-slate-700 dark:text-slate-200">
                {series.length ? asNumber(series[series.length - 1][f.key])?.toFixed(2) ?? "--" : "--"}
                {f.unit ?? ""}
              </span>
            </div>
            <div className="h-16">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="t" hide />
                  <YAxis
                    domain={f.domain ?? ["auto", "auto"]}
                    width={f.domain ? 30 : 0}
                    hide={!f.domain}
                    tickCount={3}
                    tick={{ fontSize: 9, fill: "var(--chart-axis)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  {f.thresholds?.map((t) => (
                    <ReferenceLine
                      key={t.label}
                      y={t.value}
                      stroke={t.color}
                      strokeWidth={1.25}
                      strokeDasharray="4 3"
                      strokeOpacity={0.6}
                      ifOverflow="extendDomain"
                      label={{ value: t.label, position: "insideTopRight", fontSize: 8.5, fill: t.color, opacity: 0.85 }}
                    />
                  ))}
                  <Tooltip
                    contentStyle={{
                      background: "var(--tooltip-bg)",
                      border: "1px solid var(--tooltip-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={() => ""}
                    formatter={(v) => [typeof v === "number" ? v.toFixed(2) : String(v ?? ""), f.label]}
                  />
                  <Line type="monotone" dataKey={f.key} stroke={f.color} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
