import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import type { Severity, TaxonomyEntry } from "../types";
import { componentLabel, faultLabel, SEVERITY_COLOR, timeAgo } from "../lib/format";
import type { LiveFeedItem } from "../hooks/useTelemetryStream";
import { Card, CardHeader, FilterChip, LayerBadge } from "./common";

interface Props {
  feed: LiveFeedItem[];
  taxonomyById: Map<string, TaxonomyEntry>;
  className?: string;
}

type SeverityFilter = "critical" | "warning";

function itemSeverity(item: LiveFeedItem, taxonomyById: Map<string, TaxonomyEntry>): Severity {
  if (item.event === "resolved") return "info";
  return taxonomyById.get(item.faultId)?.severity ?? item.severity ?? "warning";
}

export function FaultFeed({ feed, taxonomyById, className = "" }: Props) {
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [severityFilters, setSeverityFilters] = useState<Set<SeverityFilter>>(new Set());
  const [nodeFilter, setNodeFilter] = useState<number | "all">("all");

  // A key is "active" if the most recent event seen for it (feed is newest-first)
  // is an "opened" event that hasn't since been superseded by a "resolved" one.
  const activeKeys = useMemo(() => {
    const seen = new Set<string>();
    const active = new Set<string>();
    for (const item of feed) {
      if (seen.has(item.componentKey)) continue;
      seen.add(item.componentKey);
      if (item.event === "opened") active.add(item.componentKey);
    }
    return active;
  }, [feed]);

  const nodes = useMemo(() => {
    const set = new Set<number>();
    for (const item of feed) {
      if (item.node != null) set.add(item.node);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [feed]);

  const counts = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let unresolved = 0;
    for (const item of feed) {
      const sev = itemSeverity(item, taxonomyById);
      if (sev === "critical") critical++;
      else if (sev === "warning") warning++;
      if (item.event === "opened" && activeKeys.has(item.componentKey)) unresolved++;
    }
    return { critical, warning, unresolved };
  }, [feed, taxonomyById, activeKeys]);

  const filtered = useMemo(() => {
    return feed.filter((item) => {
      if (unresolvedOnly && !(item.event === "opened" && activeKeys.has(item.componentKey))) return false;
      if (severityFilters.size > 0) {
        const sev = itemSeverity(item, taxonomyById);
        if (sev === "info" || !severityFilters.has(sev)) return false;
      }
      if (nodeFilter !== "all" && item.node !== nodeFilter) return false;
      return true;
    });
  }, [feed, unresolvedOnly, severityFilters, nodeFilter, activeKeys, taxonomyById]);

  const toggleSeverity = (sev: SeverityFilter) => {
    setSeverityFilters((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  };

  const filtersActive = unresolvedOnly || severityFilters.size > 0 || nodeFilter !== "all";
  const resetFilters = () => {
    setUnresolvedOnly(false);
    setSeverityFilters(new Set());
    setNodeFilter("all");
  };

  return (
    <Card className={`flex min-h-0 flex-col overflow-hidden ${className}`}>
      <CardHeader title="Live Fault Feed" subtitle="Real-time classifier detections" />
      {feed.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2 dark:border-white/[0.05]">
          <FilterChip
            active={unresolvedOnly}
            onClick={() => setUnresolvedOnly((v) => !v)}
            label={`Unresolved${counts.unresolved ? ` (${counts.unresolved})` : ""}`}
          />
          <FilterChip
            active={severityFilters.has("critical")}
            onClick={() => toggleSeverity("critical")}
            label={`Critical${counts.critical ? ` (${counts.critical})` : ""}`}
            tone="critical"
          />
          <FilterChip
            active={severityFilters.has("warning")}
            onClick={() => toggleSeverity("warning")}
            label={`Warning${counts.warning ? ` (${counts.warning})` : ""}`}
            tone="warning"
          />
          {nodes.length > 1 && (
            <select
              value={nodeFilter}
              onChange={(e) => setNodeFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              aria-label="Filter by node"
              className="shrink-0 rounded-full border border-slate-200 bg-transparent px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-white/[0.08] dark:bg-transparent dark:text-slate-300"
            >
              <option value="all">All Nodes</option>
              {nodes.map((n) => (
                <option key={n} value={n}>
                  Node {n}
                </option>
              ))}
            </select>
          )}
          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <X size={11} /> Clear
            </button>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3">
        {feed.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-slate-500">No faults detected yet. Cluster nominal.</p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-slate-500">No entries match the current filters.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((item) => {
              const taxonomy = taxonomyById.get(item.faultId);
              const severity = itemSeverity(item, taxonomyById);
              const layer = item.layer ?? taxonomy?.layer;
              const color = SEVERITY_COLOR[severity];
              return (
                <li
                  key={item.key}
                  className={`rounded-xl border px-3 py-2.5 ${color.bg} border-slate-200/70 dark:border-white/[0.06]`}
                >
                  <div className="flex items-start gap-2.5">
                    {item.event === "resolved" ? (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${color.text}`} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className={`truncate text-sm font-medium ${color.text}`}>
                            {item.event === "resolved" ? "Resolved" : taxonomy?.name ?? faultLabel(item.faultId)}
                          </p>
                          {layer && item.event !== "resolved" && <LayerBadge layer={layer} compact />}
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-500">{timeAgo(item.at)}</span>
                      </div>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {componentLabel(item.componentKey, item.componentType ?? "")}
                        {item.confidence != null && item.event === "opened" && (
                          <span className="ml-1.5 font-mono text-slate-500">{(item.confidence * 100).toFixed(0)}%</span>
                        )}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
