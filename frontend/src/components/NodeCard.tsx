import { useMemo } from "react";
import type { ComponentMetrics, Topology, Prediction, TaxonomyEntry, Layer } from "../types";
import { healthFor, worstSeverity, type HealthInfo } from "../lib/health";
import { componentLabel, SEVERITY_COLOR } from "../lib/format";
import { FaultTooltipContent, LayerBadge, LayerIcon } from "./common";
import { InfoPopover } from "./InfoPopover";
import { HoverTooltip } from "./Tooltip";
import { ViewBoxFrame } from "./ViewBoxFrame";

const SIZE = 240;
const CENTER = SIZE / 2;
// Kept well inside CENTER so the layer-icon badges anchored beyond each GPU
// (up to 38px past its center) always stay within the viewBox instead of
// being clipped at the card edge.
const RADIUS = 76;

const SEVERITY_STROKE: Record<string, string> = {
  info: "var(--line-idle-stroke)",
  warning: "#fbbf24",
  critical: "#fb7185",
};

interface Props {
  node: number;
  topology: Topology;
  predictions: Record<string, Prediction>;
  taxonomyById: Map<string, TaxonomyEntry>;
  metrics: Record<string, ComponentMetrics>;
  selected: string | null;
  onSelect: (key: string, componentType: string) => void;
}

/** Down-training lanes register as a silent degradation: bandwidth halves
 * with zero "error" or "down" signal, so this is read straight off the raw
 * metric rather than gated behind the classifier's fault call. */
function laneDegradation(metrics: Record<string, ComponentMetrics>, linkId: string) {
  const m = metrics[linkId];
  const active = typeof m?.activeLaneCount === "number" ? m.activeLaneCount : undefined;
  const expected = typeof m?.expectedLaneCount === "number" ? m.expectedLaneCount : undefined;
  if (active == null || expected == null || active <= 0 || active >= expected) return null;
  return { active, expected };
}

export function NodeCard({ node, topology, predictions, taxonomyById, metrics, selected, onSelect }: Props) {
  const gpus = useMemo(() => topology.gpus.filter((g) => g.node === node), [topology, node]);
  const nvlinks = useMemo(() => topology.nvlinks.filter((l) => l.node === node), [topology, node]);

  const positions = useMemo(() => {
    const map = new Map<number, { x: number; y: number }>();
    gpus.forEach((g, i) => {
      const angle = (2 * Math.PI * i) / gpus.length - Math.PI / 2;
      map.set(g.gpu, {
        x: CENTER + RADIUS * Math.cos(angle),
        y: CENTER + RADIUS * Math.sin(angle),
      });
    });
    return map;
  }, [gpus]);

  const gpuHealth = new Map<number, HealthInfo>();
  gpus.forEach((g) => gpuHealth.set(g.gpu, healthFor(g.id, predictions, taxonomyById)));

  const nvlinkHealth = nvlinks.map((l) => ({
    link: l,
    health: healthFor(l.id, predictions, taxonomyById),
  }));

  const pcieHealth = gpus.map((g) => {
    const pcieKey = `n${node}-pcie-${g.gpu}`;
    return { gpu: g.gpu, health: healthFor(pcieKey, predictions, taxonomyById), key: pcieKey };
  });

  const nodeSeverity = worstSeverity([
    ...Array.from(gpuHealth.values()),
    ...nvlinkHealth.map((n) => n.health),
    ...pcieHealth.map((p) => p.health),
  ]);

  const nodeColor = SEVERITY_COLOR[nodeSeverity];

  const resolveLayer = (key: string, health: HealthInfo): Layer | undefined => {
    if (!health.isFault) return undefined;
    return predictions[key]?.layer ?? taxonomyById.get(health.faultId)?.layer;
  };

  const worstFaultLayer = (() => {
    const layers: { layer: Layer; rank: number }[] = [];
    gpus.forEach((g) => {
      const health = gpuHealth.get(g.gpu)!;
      const layer = resolveLayer(g.id, health);
      if (layer) layers.push({ layer, rank: health.severity === "critical" ? 2 : 1 });
    });
    nvlinkHealth.forEach(({ link, health }) => {
      const layer = resolveLayer(link.id, health);
      if (layer) layers.push({ layer, rank: health.severity === "critical" ? 2 : 1 });
    });
    pcieHealth.forEach(({ key, health }) => {
      const layer = resolveLayer(key, health);
      if (layer) layers.push({ layer, rank: health.severity === "critical" ? 2 : 1 });
    });
    layers.sort((a, b) => b.rank - a.rank);
    return layers[0]?.layer;
  })();

  return (
    <div
      className={`flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors dark:bg-base-850/70 dark:shadow-card ${
      nodeSeverity === "critical"
        ? "border-rose-400/40 dark:border-rose-400/30"
        : nodeSeverity === "warning"
        ? "border-amber-400/35 dark:border-amber-400/25"
        : "border-slate-200 dark:border-white/[0.06]"
    }`}>
      <div className="flex shrink-0 items-center justify-between px-3 pb-1.5 pt-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${nodeColor.dot}`} />
          {worstFaultLayer && <LayerBadge layer={worstFaultLayer} compact />}
          <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">Node {node}</h4>
          <InfoPopover glossaryKey="nodeCard" />
        </div>
        <span className="text-[11px] uppercase tracking-wider text-slate-500">{gpus.length}×GPU</span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-1.5 pb-1.5">
        <ViewBoxFrame width={SIZE} height={SIZE}>
        {nvlinkHealth.map(({ link, health }) => {
          const a = positions.get(link.gpuA)!;
          const b = positions.get(link.gpuB)!;
          const degraded = laneDegradation(metrics, link.id);
          const stroke = degraded && !health.isFault ? "#fbbf24" : SEVERITY_STROKE[health.severity];
          const layer = resolveLayer(link.id, health);
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          return (
            <g key={link.id}>
              <HoverTooltip
                content={
                  <FaultTooltipContent
                    title={componentLabel(link.id, "nvlink")}
                    health={health}
                    layer={layer}
                    note={degraded ? `Running ${degraded.active}/${degraded.expected} lanes (down-trained)` : undefined}
                  />
                }
              >
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={stroke}
                  strokeWidth={health.isFault ? 3.75 : degraded ? 2.6 : 1.9}
                  strokeDasharray={health.faultId === "nvlink_flap" ? "6 4.5" : degraded ? "2.5 3" : undefined}
                  opacity={health.isFault ? 0.95 : degraded ? 0.75 : 0.35}
                  className="cursor-pointer transition-all duration-150 hover:opacity-100"
                  onClick={() => onSelect(link.id, "nvlink")}
                />
              </HoverTooltip>
              {layer && (
                <foreignObject x={midX - 9} y={midY - 20} width={18} height={18} className="overflow-visible">
                  <LayerIcon layer={layer} size={16} />
                </foreignObject>
              )}
              {degraded && (
                <foreignObject x={midX - 26} y={midY + 6} width={52} height={16} className="pointer-events-none overflow-visible">
                  <div className="flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white shadow-sm whitespace-nowrap">
                    {degraded.active}/{degraded.expected} lanes
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}

        {gpus.map((g) => {
          const pos = positions.get(g.gpu)!;
          const health = gpuHealth.get(g.gpu)!;
          const pcie = pcieHealth.find((p) => p.gpu === g.gpu)!;
          const color = SEVERITY_COLOR[health.severity];
          const isSelected = selected === g.id;
          const gpuLayer = resolveLayer(g.id, health);
          const pcieLayer = resolveLayer(pcie.key, pcie.health);
          return (
            <g key={g.id}>
              {pcie.health.isFault && (
                <HoverTooltip content={<FaultTooltipContent title={componentLabel(pcie.key, "pcie")} health={pcie.health} layer={pcieLayer} />}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={24}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={1.5}
                    opacity={0.5}
                    strokeDasharray="3 4"
                    className="cursor-help transition-opacity duration-150 hover:opacity-90"
                  />
                </HoverTooltip>
              )}
              <HoverTooltip content={<FaultTooltipContent title={componentLabel(g.id, "gpu")} health={health} layer={gpuLayer} />}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={18}
                  className={`cursor-pointer transition-all duration-150 hover:brightness-110 ${color.text}`}
                  fill={health.isFault ? "currentColor" : "var(--chip-idle-fill)"}
                  fillOpacity={health.isFault ? 0.22 : 1}
                  stroke="currentColor"
                  strokeWidth={isSelected ? 4.5 : 2.25}
                  onClick={() => onSelect(g.id, "gpu")}
                />
              </HoverTooltip>
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="15"
                className={`font-mono select-none pointer-events-none ${
                  health.isFault ? "fill-slate-900 dark:fill-slate-100" : "fill-slate-500 dark:fill-slate-100"
                }`}
              >
                {g.gpu}
              </text>
              {gpuLayer && (
                <foreignObject x={pos.x - 9} y={pos.y + 20} width={18} height={18} className="overflow-visible">
                  <LayerIcon layer={gpuLayer} size={16} />
                </foreignObject>
              )}
              {pcieLayer && (
                <foreignObject x={pos.x - 9} y={pos.y - 38} width={18} height={18} className="overflow-visible">
                  <LayerIcon layer={pcieLayer} size={16} />
                </foreignObject>
              )}
            </g>
          );
        })}
        </ViewBoxFrame>
      </div>
    </div>
  );
}
