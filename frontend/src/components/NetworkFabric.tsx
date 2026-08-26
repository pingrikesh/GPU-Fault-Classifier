import { useMemo } from "react";
import { Boxes } from "lucide-react";
import type { Prediction, TaxonomyEntry, Topology, Layer } from "../types";
import { healthFor, worstSeverity, SEVERITY_RANK, type HealthInfo } from "../lib/health";
import { componentLabel, SEVERITY_COLOR } from "../lib/format";
import { Card, CardHeader, FaultTooltipContent, LayerBadge, LayerIcon } from "./common";
import { HoverTooltip } from "./Tooltip";
import { ViewBoxFrame } from "./ViewBoxFrame";

// Portrait 3:4 canvas (narrower than tall) so the diagram fills a card
// that's narrower than it is wide, without the square-viewBox letterboxing
// that would otherwise waste space on either side.
const WIDTH = 300;
const HEIGHT = 400;
const SPINE_Y = 48;
const LEAF_Y = 172;
const NODE_Y = 328;
const SWITCH_W = 68;
const SWITCH_H = 36;
const NODE_R = 24;
const ICON_SIZE = 19;
// Purely a frontend illustration: the backend only models one aggregated
// link per node pair, with no concept of physical switches. Grouping nodes
// into leaves of 2 gives a minimal 2-tier fat-tree so congestion reads as
// "local to a leaf" vs "crossing the spine" instead of a flat N\u00b2 mesh.
const LEAF_GROUP_SIZE = 2;

const SEVERITY_STROKE: Record<string, string> = {
  info: "var(--line-idle-stroke)",
  warning: "#fbbf24",
  critical: "#fb7185",
};

interface Props {
  topology: Topology;
  predictions: Record<string, Prediction>;
  taxonomyById: Map<string, TaxonomyEntry>;
  selected: string | null;
  onSelect: (key: string, componentType: string) => void;
  className?: string;
}

interface LinkHealth {
  link: Topology["networkLinks"][number];
  health: HealthInfo;
}

/** A switch or uplink segment carries several real node-pair links at once,
 * so its tooltip lists each faulted pair rather than showing a single
 * fault (the `FaultTooltipContent` shape used elsewhere assumes exactly
 * one underlying component). */
function AggregateTooltipContent({ title, entries, layer }: { title: string; entries: LinkHealth[]; layer?: Layer }) {
  const severity = worstSeverity(entries.map((e) => e.health));
  const color = SEVERITY_COLOR[severity];
  const faulted = entries.filter((e) => e.health.isFault);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color.dot}`} />
        {title}
      </div>
      {faulted.length === 0 ? (
        <div className="text-slate-500 dark:text-slate-400">
          All {entries.length} carried path{entries.length === 1 ? "" : "s"} healthy
        </div>
      ) : (
        <ul className="space-y-0.5 text-slate-500 dark:text-slate-400">
          {faulted.slice(0, 4).map(({ link, health }) => (
            <li key={link.id}>
              Node{link.nodeA}↔Node{link.nodeB}: {health.faultName} ({Math.round(health.confidence * 100)}%)
            </li>
          ))}
          {faulted.length > 4 && <li>+{faulted.length - 4} more</li>}
        </ul>
      )}
      {layer && <LayerBadge layer={layer} compact />}
    </div>
  );
}

export function NetworkFabric({ topology, predictions, taxonomyById, selected, onSelect, className = "" }: Props) {
  const { nNodes, networkLinks } = topology;
  const leafCount = Math.max(1, Math.ceil(nNodes / LEAF_GROUP_SIZE));
  const leafOf = (n: number) => Math.min(leafCount - 1, Math.floor(n / LEAF_GROUP_SIZE));

  const resolveLayer = (key: string, faultId: string): Layer | undefined => {
    if (faultId === "healthy") return undefined;
    return predictions[key]?.layer ?? taxonomyById.get(faultId)?.layer;
  };

  const linkHealth: LinkHealth[] = useMemo(
    () => networkLinks.map((link) => ({ link, health: healthFor(link.id, predictions, taxonomyById) })),
    [networkLinks, predictions, taxonomyById]
  );

  const nodeX = (n: number) => (WIDTH / (nNodes + 1)) * (n + 1);
  // Center each leaf switch above the mean position of the nodes it serves,
  // rather than evenly re-spacing leaves, so the tree reads visually clean.
  const leafX = useMemo(() => {
    const sums = new Array(leafCount).fill(0);
    const counts = new Array(leafCount).fill(0);
    for (let n = 0; n < nNodes; n++) {
      const l = Math.min(leafCount - 1, Math.floor(n / LEAF_GROUP_SIZE));
      sums[l] += (WIDTH / (nNodes + 1)) * (n + 1);
      counts[l] += 1;
    }
    return sums.map((sum, l) => (counts[l] ? sum / counts[l] : (WIDTH / (leafCount + 1)) * (l + 1)));
  }, [nNodes, leafCount]);
  const spineX = WIDTH / 2;

  // A node's uplink carries every pair that touches it, whether the other
  // end sits behind the same leaf or across the spine.
  const linksTouchingNode = (n: number) => linkHealth.filter(({ link }) => link.nodeA === n || link.nodeB === n);
  // A leaf's uplink to the spine only carries pairs that cross to a
  // *different* leaf \u2014 same-leaf traffic never needs the spine at all. This
  // is exactly what lets an operator tell "hot leaf" apart from "hot spine".
  const linksCrossingLeaf = (l: number) =>
    linkHealth.filter(({ link }) => {
      const la = leafOf(link.nodeA);
      const lb = leafOf(link.nodeB);
      return la !== lb && (la === l || lb === l);
    });
  const linksTouchingLeaf = (l: number) =>
    linkHealth.filter(({ link }) => leafOf(link.nodeA) === l || leafOf(link.nodeB) === l);

  const worstOf = (entries: LinkHealth[]) => worstSeverity(entries.map((e) => e.health));

  const worstLayerOf = (entries: LinkHealth[]): Layer | undefined => {
    let best: { layer: Layer; rank: number } | null = null;
    for (const { link, health } of entries) {
      const layer = resolveLayer(link.id, health.faultId);
      if (!layer) continue;
      const rank = health.severity === "critical" ? 2 : 1;
      if (!best || rank > best.rank) best = { layer, rank };
    }
    return best?.layer;
  };

  // Clicking a synthetic switch/uplink segment inspects whichever real
  // node-pair link it's currently most responsible for carrying.
  const pickLink = (entries: LinkHealth[]): string | null => {
    if (entries.length === 0) return null;
    let best = entries[0];
    for (const e of entries) {
      const rank = SEVERITY_RANK[e.health.severity];
      const bestRank = SEVERITY_RANK[best.health.severity];
      if (rank > bestRank || (rank === bestRank && e.health.confidence > best.health.confidence)) best = e;
    }
    return best.link.id;
  };

  const spineHealth = linkHealth.filter(({ link }) => leafOf(link.nodeA) !== leafOf(link.nodeB));
  const spineSeverity = worstOf(spineHealth);

  return (
    <Card className={`flex h-full min-h-0 flex-col ${className}`}>
      <CardHeader
        title="Inter-Node Fabric"
        subtitle="Spine → Leaf → Node"
        info="interNodeFabric"
        right={
          (() => {
            for (let n = 0; n < nNodes; n++) {
              const ncclHealth = healthFor(`n${n}-nccl`, predictions, taxonomyById);
              const layer = resolveLayer(`n${n}-nccl`, ncclHealth.faultId);
              if (layer) return <LayerBadge layer={layer} compact />;
            }
            for (const l of networkLinks) {
              const health = healthFor(l.id, predictions, taxonomyById);
              const layer = resolveLayer(l.id, health.faultId);
              if (layer) return <LayerBadge layer={layer} compact />;
            }
            return null;
          })()
        }
      />
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
        <ViewBoxFrame width={WIDTH} height={HEIGHT}>
          {Array.from({ length: leafCount }, (_, l) => {
            const crossing = linksCrossingLeaf(l);
            const severity = worstOf(crossing);
            const isFault = severity !== "info";
            const isSelected = crossing.some(({ link }) => link.id === selected);
            const layer = worstLayerOf(crossing);
            const targetLink = pickLink(crossing);
            const anyDown = crossing.some(({ health }) => health.faultId === "network_link_down");
            const x1 = spineX;
            const y1 = SPINE_Y + SWITCH_H / 2;
            const x2 = leafX[l];
            const y2 = LEAF_Y - SWITCH_H / 2;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            return (
              <g key={`spine-leaf-${l}`}>
                <HoverTooltip content={<AggregateTooltipContent title={`Spine ↔ Leaf ${l}`} entries={crossing} layer={layer} />}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={SEVERITY_STROKE[severity]}
                    strokeWidth={isSelected ? 5 : isFault ? 3 : 1.25}
                    strokeDasharray={anyDown ? "6 4.5" : undefined}
                    opacity={isSelected ? 1 : isFault ? 0.95 : 0.4}
                    className={`transition-all duration-150 ${targetLink ? "cursor-pointer hover:opacity-100" : "cursor-help"}`}
                    onClick={() => targetLink && onSelect(targetLink, "network")}
                  />
                </HoverTooltip>
                {layer && (
                  <foreignObject
                    x={midX - ICON_SIZE / 2}
                    y={midY - ICON_SIZE / 2}
                    width={ICON_SIZE}
                    height={ICON_SIZE}
                    className="overflow-visible"
                  >
                    <LayerIcon layer={layer} size={ICON_SIZE} />
                  </foreignObject>
                )}
              </g>
            );
          })}

          {Array.from({ length: nNodes }, (_, n) => {
            const touching = linksTouchingNode(n);
            const severity = worstOf(touching);
            const isFault = severity !== "info";
            const isSelected = touching.some(({ link }) => link.id === selected);
            const layer = worstLayerOf(touching);
            const targetLink = pickLink(touching);
            const anyDown = touching.some(({ health }) => health.faultId === "network_link_down");
            const l = leafOf(n);
            const x1 = leafX[l];
            const y1 = LEAF_Y + SWITCH_H / 2;
            const x2 = nodeX(n);
            const y2 = NODE_Y - NODE_R;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            return (
              <g key={`leaf-node-${n}`}>
                <HoverTooltip content={<AggregateTooltipContent title={`Node${n} ↔ Leaf ${l}`} entries={touching} layer={layer} />}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={SEVERITY_STROKE[severity]}
                    strokeWidth={isSelected ? 5 : isFault ? 3 : 1.25}
                    strokeDasharray={anyDown ? "6 4.5" : undefined}
                    opacity={isSelected ? 1 : isFault ? 0.95 : 0.4}
                    className={`transition-all duration-150 ${targetLink ? "cursor-pointer hover:opacity-100" : "cursor-help"}`}
                    onClick={() => targetLink && onSelect(targetLink, "network")}
                  />
                </HoverTooltip>
                {layer && (
                  <foreignObject
                    x={midX - ICON_SIZE / 2}
                    y={midY - ICON_SIZE / 2}
                    width={ICON_SIZE}
                    height={ICON_SIZE}
                    className="overflow-visible"
                  >
                    <LayerIcon layer={layer} size={ICON_SIZE} />
                  </foreignObject>
                )}
              </g>
            );
          })}

          <g>
            <HoverTooltip content={<AggregateTooltipContent title="Spine Switch" entries={spineHealth} />}>
              <rect
                x={spineX - SWITCH_W / 2}
                y={SPINE_Y - SWITCH_H / 2}
                width={SWITCH_W}
                height={SWITCH_H}
                rx={8}
                fill="var(--chip-idle-fill)"
                stroke={SEVERITY_STROKE[spineSeverity]}
                strokeWidth={2}
                className="cursor-help transition-[filter] duration-150 hover:brightness-110"
              />
            </HoverTooltip>
            <foreignObject
              x={spineX - SWITCH_W / 2}
              y={SPINE_Y - SWITCH_H / 2}
              width={SWITCH_W}
              height={SWITCH_H}
              className="pointer-events-none overflow-visible"
            >
              <div className={`flex h-full w-full flex-col items-center justify-center gap-0.5 ${SEVERITY_COLOR[spineSeverity].text}`}>
                <Boxes size={15} />
                <span className="text-[10px] font-semibold leading-tight text-slate-600 dark:text-slate-300">Spine</span>
              </div>
            </foreignObject>
          </g>

          {Array.from({ length: leafCount }, (_, l) => {
            const touching = linksTouchingLeaf(l);
            const severity = worstOf(touching);
            return (
              <g key={`leaf-${l}`}>
                <HoverTooltip content={<AggregateTooltipContent title={`Leaf ${l} Switch`} entries={touching} />}>
                  <rect
                    x={leafX[l] - SWITCH_W / 2}
                    y={LEAF_Y - SWITCH_H / 2}
                    width={SWITCH_W}
                    height={SWITCH_H}
                    rx={8}
                    fill="var(--chip-idle-fill)"
                    stroke={SEVERITY_STROKE[severity]}
                    strokeWidth={2}
                    className="cursor-help transition-[filter] duration-150 hover:brightness-110"
                  />
                </HoverTooltip>
                <foreignObject
                  x={leafX[l] - SWITCH_W / 2}
                  y={LEAF_Y - SWITCH_H / 2}
                  width={SWITCH_W}
                  height={SWITCH_H}
                  className="pointer-events-none overflow-visible"
                >
                  <div className={`flex h-full w-full flex-col items-center justify-center gap-0.5 ${SEVERITY_COLOR[severity].text}`}>
                    <Boxes size={15} />
                    <span className="text-[10px] font-semibold leading-tight text-slate-600 dark:text-slate-300">Leaf {l}</span>
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {Array.from({ length: nNodes }, (_, n) => {
            const x = nodeX(n);
            const ncclHealth = healthFor(`n${n}-nccl`, predictions, taxonomyById);
            const color = ncclHealth.isFault ? (ncclHealth.severity === "critical" ? "#fb7185" : "#fbbf24") : "#22d3ee";
            const ncclLayer = resolveLayer(`n${n}-nccl`, ncclHealth.faultId);
            return (
              <g key={n} onClick={() => onSelect(`n${n}-nccl`, "nccl")} className="cursor-pointer">
                <HoverTooltip content={<FaultTooltipContent title={componentLabel(`n${n}-nccl`, "nccl")} health={ncclHealth} layer={ncclLayer} />}>
                  <circle
                    cx={x}
                    cy={NODE_Y}
                    r={NODE_R}
                    fill="var(--chip-idle-fill)"
                    stroke={color}
                    strokeWidth={2.5}
                    className="transition-all duration-150 hover:brightness-110"
                  />
                </HoverTooltip>
                <text
                  x={x}
                  y={NODE_Y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="16"
                  className="fill-slate-700 dark:fill-slate-100 font-mono select-none pointer-events-none"
                >
                  N{n}
                </text>
                {ncclLayer && (
                  <foreignObject
                    x={x - ICON_SIZE / 2}
                    y={NODE_Y + NODE_R + 5}
                    width={ICON_SIZE}
                    height={ICON_SIZE}
                    className="overflow-visible"
                  >
                    <LayerIcon layer={ncclLayer} size={ICON_SIZE} />
                  </foreignObject>
                )}
              </g>
            );
          })}
        </ViewBoxFrame>
      </div>
    </Card>
  );
}
