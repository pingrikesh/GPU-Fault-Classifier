import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentMetrics, Topology, Prediction, TaxonomyEntry } from "../types";
import { NodeCard } from "./NodeCard";

const PAGE_SIZE = 4;

interface Props {
  topology: Topology;
  predictions: Record<string, Prediction>;
  taxonomyById: Map<string, TaxonomyEntry>;
  metrics: Record<string, ComponentMetrics>;
  selected: string | null;
  onSelect: (key: string, componentType: string) => void;
  className?: string;
}

/** 2x2 grid of node cards, paged so the layout stays fixed-size as the cluster grows. */
export function NodeGrid({ topology, predictions, taxonomyById, metrics, selected, onSelect, className = "" }: Props) {
  const pageCount = Math.max(1, Math.ceil(topology.nNodes / PAGE_SIZE));
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const nodes = useMemo(
    () => Array.from({ length: topology.nNodes }, (_, n) => n).slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [topology.nNodes, page]
  );

  return (
    <div className={`flex h-full min-h-0 flex-col gap-2 ${className}`}>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3">
        {nodes.map((n) => (
          <NodeCard
            key={n}
            node={n}
            topology={topology}
            predictions={predictions}
            taxonomyById={taxonomyById}
            metrics={metrics}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
      </div>
      {pageCount > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="Previous nodes"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-1 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.05]"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-mono text-[11px] text-slate-500">
            Nodes {page * PAGE_SIZE + 1}–{Math.min(topology.nNodes, page * PAGE_SIZE + PAGE_SIZE)} of {topology.nNodes}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            aria-label="Next nodes"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-1 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.05]"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
