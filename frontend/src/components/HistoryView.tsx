import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import { faultLabel, componentLabel, SEVERITY_COLOR } from "../lib/format";
import type { FaultRow, FaultStats, ModelInfo, TaxonomyEntry } from "../types";
import { Card, CardHeader, LayerBadge, SeverityBadge } from "./common";

interface Props {
  taxonomyById: Map<string, TaxonomyEntry>;
}

const POLL_MS = 5000;
const PAGE_SIZE = 10;

export function HistoryView({ taxonomyById }: Props) {
  const [faults, setFaults] = useState<FaultRow[]>([]);
  const [stats, setStats] = useState<FaultStats | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [faultFilter, setFaultFilter] = useState<string>("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [f, s, m] = await Promise.all([
          api.faults({ status: statusFilter || undefined, faultId: faultFilter || undefined, limit: 100 }),
          api.faultStats(),
          api.modelInfo(),
        ]);
        if (!cancelled) {
          setFaults(f);
          setStats(s);
          setModelInfo(m);
        }
      } catch {
        // backend not reachable yet; will retry on next poll
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [statusFilter, faultFilter]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, faultFilter]);

  const byFaultData = stats
    ? Object.entries(stats.byFaultId).map(([id, n]) => ({ name: faultLabel(id, taxonomyById), count: n }))
    : [];

  const pageCount = Math.max(1, Math.ceil(faults.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageFaults = useMemo(
    () => faults.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE),
    [faults, currentPage]
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Fault Frequency by Type" subtitle="All recorded episodes since backend start" />
          <div className="p-4 h-64">
            {byFaultData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byFaultData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--tooltip-bg)",
                      border: "1px solid var(--tooltip-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" fill="#22d3ee" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-500 flex h-full items-center justify-center">No fault history yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Classifier Accuracy" subtitle="Held-out evaluation per component type" />
          <div className="p-4 space-y-3">
            {modelInfo?.componentTypes ? (
              Object.entries(modelInfo.componentTypes).map(([ctype, report]) => (
                <div key={ctype} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-300 capitalize">{ctype}</span>
                  <div className="flex items-center gap-2 w-40">
                    <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                      <div className="h-full bg-accent-cyan" style={{ width: `${report.accuracy * 100}%` }} />
                    </div>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 w-10 text-right">
                      {(report.accuracy * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Model metadata unavailable.</p>
            )}
            {modelInfo?.overallAccuracy != null && (
              <div className="pt-2 mt-2 border-t border-slate-100 dark:border-white/[0.06] flex justify-between">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Overall</span>
                <span className="text-sm font-mono text-accent-cyan">{(modelInfo.overallAccuracy * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Fault Episode History"
          subtitle="Every detected fault episode, open or resolved"
          right={
            <div className="flex items-center gap-2">
              <select
                value={faultFilter}
                onChange={(e) => setFaultFilter(e.target.value)}
                className="rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent-cyan/40"
              >
                <option value="">All fault types</option>
                {Array.from(taxonomyById.values())
                  .filter((t) => t.id !== "healthy")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent-cyan/40"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-white/[0.06]">
                <th className="px-5 py-2.5 font-medium">Fault</th>
                <th className="px-5 py-2.5 font-medium">Layer</th>
                <th className="px-5 py-2.5 font-medium">Component</th>
                <th className="px-5 py-2.5 font-medium">Severity</th>
                <th className="px-5 py-2.5 font-medium">Confidence</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {pageFaults.map((f) => {
                const layer = f.layer ?? taxonomyById.get(f.faultId)?.layer;
                return (
                <tr key={f.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                  <td className="px-5 py-2.5 text-slate-800 dark:text-slate-200 whitespace-nowrap">{faultLabel(f.faultId, taxonomyById)}</td>
                  <td className="px-5 py-2.5 whitespace-nowrap">{layer ? <LayerBadge layer={layer} /> : "—"}</td>
                  <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{componentLabel(f.componentKey, f.componentType)}</td>
                  <td className="px-5 py-2.5">
                    <SeverityBadge severity={f.severity} label={f.severity} />
                  </td>
                  <td className="px-5 py-2.5 font-mono text-slate-600 dark:text-slate-300">{(f.maxConfidence * 100).toFixed(0)}%</td>
                  <td className="px-5 py-2.5">
                    <span className={`text-xs font-medium ${f.status === "active" ? SEVERITY_COLOR[f.severity].text : "text-slate-500"}`}>
                      {f.status === "active" ? "Active" : "Resolved"}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-slate-500 whitespace-nowrap">{new Date(f.startedAt * 1000).toLocaleTimeString()}</td>
                </tr>
              );
              })}
              {faults.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                    No fault episodes recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {faults.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-white/[0.06]">
            <p className="text-xs text-slate-500">
              Showing <span className="font-mono text-slate-700 dark:text-slate-300">{currentPage * PAGE_SIZE + 1}</span>
              {"\u2013"}
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {Math.min(faults.length, currentPage * PAGE_SIZE + PAGE_SIZE)}
              </span>{" "}
              of <span className="font-mono text-slate-700 dark:text-slate-300">{faults.length}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/[0.08] px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
              >
                <ChevronLeft size={14} />
                Prev
              </button>
              <span className="text-xs text-slate-500 font-mono">
                Page {currentPage + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={currentPage >= pageCount - 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/[0.08] px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
