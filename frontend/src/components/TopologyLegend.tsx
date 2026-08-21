import { Info } from "lucide-react";
import { LAYER_COLOR, LAYER_LEGEND } from "../lib/format";
import { LayerIcon } from "./common";
import { HoverTooltip } from "./Tooltip";

interface LegendItem {
  label: string;
  stroke: string;
  dash?: boolean;
  width?: number;
}

const SEVERITY_ITEMS: LegendItem[] = [
  { label: "Healthy", stroke: "var(--line-idle-stroke)", width: 1.5 },
  { label: "Warning", stroke: "#fbbf24", width: 2.5 },
  { label: "Critical", stroke: "#fb7185", width: 2.5 },
  { label: "Flapping / down", stroke: "#fb7185", width: 2.5, dash: true },
];

export function TopologyLegend() {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      <span className="whitespace-nowrap text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Interlink status
      </span>
      {SEVERITY_ITEMS.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
          <svg width="22" height="10" className="shrink-0" aria-hidden>
            <line
              x1="1"
              y1="5"
              x2="21"
              y2="5"
              stroke={item.stroke}
              strokeWidth={item.width}
              strokeDasharray={item.dash ? "3 2" : undefined}
              strokeLinecap="round"
            />
          </svg>
          {item.label}
        </span>
      ))}
      <span className="hidden h-4 w-px shrink-0 bg-slate-200 sm:block dark:bg-white/10" aria-hidden />
      <span className="whitespace-nowrap text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Fault layer
      </span>
      {LAYER_LEGEND.map(({ layer, label }) => {
        const c = LAYER_COLOR[layer];
        return (
          <span
            key={layer}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${c.bg} ${c.text} ${c.ring}`}
          >
            <LayerIcon layer={layer} size={12} />
            {label}
          </span>
        );
      })}
      <HoverTooltip content="Diagrams show the icon only — hover or select for the full name">
        <span className="inline-flex shrink-0 cursor-default items-center text-slate-400 hover:text-slate-500 dark:text-slate-500 dark:hover:text-slate-400">
          <Info size={13} />
        </span>
      </HoverTooltip>
    </div>
  );
}
